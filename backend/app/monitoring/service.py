from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.inventory.models import ProductStockSnapshot
from app.monitoring.models import AppErrorLog, Notification
from app.monitoring.schemas import ActivityLogRead, ErrorLogRead, NotificationRead
from app.products.models import Product
from app.shared.core.exceptions import NotFoundError
from app.shared.core.pagination import PageParams, PaginationMeta
from app.sync.models import ChangeLog, ChangeOperation
from app.warehouses.models import Warehouse

MOVEMENT_LABELS = {
    "purchase": "Purchase",
    "sale": "Sale",
    "return": "Return",
    "damage": "Damage",
    "adjustment": "Adjustment",
    "transfer_out": "Transfer out",
    "transfer_in": "Transfer in",
}


def render_activity_message(
    operation: ChangeOperation,
    entity_type: str,
    payload: dict[str, object],
    *,
    product_name: str | None = None,
    warehouse_name: str | None = None,
) -> str:
    """Human-readable description of one change_log entry, e.g.
    "Sale: 3 × Tube 28 2m Torsadi Argent at Main Warehouse". Pure so it is
    testable without a database.
    """
    if entity_type == "product":
        name = str(payload.get("name") or "(unnamed product)")
        verb = {
            ChangeOperation.CREATE: "Created product",
            ChangeOperation.UPDATE: "Updated product",
            ChangeOperation.DELETE: "Deleted product",
        }.get(operation, f"{operation.value} product")
        sku = str(payload.get("sku") or "").strip()
        return f"{verb} '{name}'" + (f" (SKU {sku})" if sku else "")

    if entity_type == "inventory_movement":
        movement_type = str(payload.get("movement_type") or "movement")
        label = MOVEMENT_LABELS.get(movement_type, movement_type.replace("_", " ").title())
        qty = abs(int(str(payload.get("quantity_delta") or 0)))
        pname = product_name or "(deleted product)"
        wname = warehouse_name or "(deleted warehouse)"
        message = f"{label}: {qty} × {pname} at {wname}"
        note = payload.get("note")
        if note:
            message += f" — {note}"
        return message

    return f"{entity_type} {operation.value}"


async def list_activity(
    session: AsyncSession,
    tenant_id: UUID,
    params: PageParams,
    entity_type: str | None = None,
) -> tuple[list[ActivityLogRead], PaginationMeta]:
    base = select(ChangeLog).where(ChangeLog.tenant_id == tenant_id)
    if entity_type is not None:
        base = base.where(ChangeLog.entity_type == entity_type)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(ChangeLog.server_seq.desc()).offset(params.offset).limit(params.page_size)
    )
    rows = list(result.scalars().all())

    product_ids = {
        UUID(str(row.payload["product_id"]))
        for row in rows
        if row.entity_type == "inventory_movement" and row.payload.get("product_id")
    }
    warehouse_ids = {
        UUID(str(row.payload["warehouse_id"]))
        for row in rows
        if row.entity_type == "inventory_movement" and row.payload.get("warehouse_id")
    }

    product_names: dict[UUID, str] = {}
    if product_ids:
        names = await session.execute(
            select(Product.id, Product.name).where(Product.id.in_(product_ids))
        )
        product_names = {pid: name for pid, name in names.all()}
    warehouse_names: dict[UUID, str] = {}
    if warehouse_ids:
        names = await session.execute(
            select(Warehouse.id, Warehouse.name).where(Warehouse.id.in_(warehouse_ids))
        )
        warehouse_names = {wid: name for wid, name in names.all()}

    items = []
    for row in rows:
        pname = None
        wname = None
        if row.entity_type == "inventory_movement":
            pid = row.payload.get("product_id")
            wid = row.payload.get("warehouse_id")
            if pid:
                pname = product_names.get(UUID(str(pid)))
            if wid:
                wname = warehouse_names.get(UUID(str(wid)))
        items.append(
            ActivityLogRead(
                id=row.id,
                entity_type=row.entity_type,
                entity_id=row.entity_id,
                operation=row.operation,
                message=render_activity_message(
                    row.operation,
                    row.entity_type,
                    row.payload,
                    product_name=pname,
                    warehouse_name=wname,
                ),
                details=row.payload,
                created_at=row.created_at,
            )
        )
    return items, PaginationMeta.create(total or 0, params)


async def list_errors(
    session: AsyncSession,
    tenant_id: UUID,
    params: PageParams,
    level: str | None = None,
) -> tuple[list[ErrorLogRead], PaginationMeta]:
    """The current tenant's errors plus system-level ones (no tenant context —
    e.g. failures before the token could be decoded). `tenant_id` is
    deliberately nullable on this table; a plain tenant filter would hide those.
    """
    base = select(AppErrorLog).where(
        or_(AppErrorLog.tenant_id == tenant_id, AppErrorLog.tenant_id.is_(None))
    )
    if level is not None:
        base = base.where(AppErrorLog.level == level)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(AppErrorLog.created_at.desc(), AppErrorLog.id)
        .offset(params.offset)
        .limit(params.page_size)
    )
    errors = [ErrorLogRead.model_validate(row) for row in result.scalars().all()]
    return errors, PaginationMeta.create(total or 0, params)


async def refresh_low_stock_alerts(session: AsyncSession, tenant_id: UUID) -> None:
    """Reconcile low-stock alerts against the current snapshots.

    Creates an unread alert for every (product, warehouse) whose on-hand
    quantity is below its minimum, and marks read any existing unread alert
    whose pair is no longer low (stock was replenished). Idempotent.
    """
    result = await session.execute(
        select(
            ProductStockSnapshot.product_id,
            ProductStockSnapshot.warehouse_id,
            ProductStockSnapshot.quantity_on_hand,
            ProductStockSnapshot.min_quantity,
            Product.name,
            Product.sku,
            Warehouse.name,
        )
        .join(Product, Product.id == ProductStockSnapshot.product_id)
        .join(Warehouse, Warehouse.id == ProductStockSnapshot.warehouse_id)
        .where(
            ProductStockSnapshot.tenant_id == tenant_id,
            ProductStockSnapshot.min_quantity.isnot(None),
            ProductStockSnapshot.quantity_on_hand < ProductStockSnapshot.min_quantity,
            Product.deleted_at.is_(None),
            Warehouse.deleted_at.is_(None),
        )
    )
    low_rows = list(result.all())
    low_keys = {(product_id, warehouse_id) for product_id, warehouse_id, *_ in low_rows}

    existing_result = await session.execute(
        select(Notification).where(
            Notification.tenant_id == tenant_id,
            Notification.kind == "low_stock",
            Notification.read_at.is_(None),
        )
    )
    existing = list(existing_result.scalars().all())
    existing_keys = {
        (UUID(str(n.data.get("product_id"))), UUID(str(n.data.get("warehouse_id"))))
        for n in existing
        if n.data.get("product_id") and n.data.get("warehouse_id")
    }

    now = datetime.now(UTC)
    created = 0
    for product_id, warehouse_id, on_hand, min_qty, product_name, sku, warehouse_name in low_rows:
        if (product_id, warehouse_id) in existing_keys:
            continue
        session.add(
            Notification(
                tenant_id=tenant_id,
                kind="low_stock",
                severity="warning",
                title="Low stock",
                message=(
                    f"{product_name} is running low at {warehouse_name}: "
                    f"{on_hand} left (minimum {min_qty})"
                ),
                entity_type="product",
                entity_id=product_id,
                data={
                    "product_id": str(product_id),
                    "warehouse_id": str(warehouse_id),
                    "product_name": product_name,
                    "sku": sku,
                    "warehouse_name": warehouse_name,
                    "quantity_on_hand": on_hand,
                    "min_quantity": min_qty,
                },
            )
        )
        created += 1

    low_keys_as_strings = {(str(p), str(w)) for p, w in low_keys}
    for notification in existing:
        key = (notification.data.get("product_id"), notification.data.get("warehouse_id"))
        if key and key not in low_keys_as_strings:
            notification.read_at = now

    await session.commit()


async def list_notifications(
    session: AsyncSession,
    tenant_id: UUID,
    params: PageParams,
    unread_only: bool = False,
) -> tuple[list[NotificationRead], PaginationMeta]:
    await refresh_low_stock_alerts(session, tenant_id)
    base = select(Notification).where(Notification.tenant_id == tenant_id)
    if unread_only:
        base = base.where(Notification.read_at.is_(None))
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    result = await session.execute(
        base.order_by(Notification.created_at.desc(), Notification.id)
        .offset(params.offset)
        .limit(params.page_size)
    )
    items = [NotificationRead.model_validate(row) for row in result.scalars().all()]
    return items, PaginationMeta.create(total or 0, params)


async def count_unread_notifications(session: AsyncSession, tenant_id: UUID) -> int:
    await refresh_low_stock_alerts(session, tenant_id)
    count = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.tenant_id == tenant_id, Notification.read_at.is_(None))
    )
    return count or 0


async def mark_notification_read(
    session: AsyncSession, tenant_id: UUID, notification_id: UUID
) -> Notification:
    notification = await session.get(Notification, notification_id)
    if notification is None or notification.tenant_id != tenant_id:
        raise NotFoundError("Notification not found")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await session.commit()
    return notification


async def mark_all_notifications_read(session: AsyncSession, tenant_id: UUID) -> int:
    result = await session.execute(
        select(Notification).where(
            Notification.tenant_id == tenant_id, Notification.read_at.is_(None)
        )
    )
    notifications = list(result.scalars().all())
    now = datetime.now(UTC)
    for notification in notifications:
        notification.read_at = now
    if notifications:
        await session.commit()
    return len(notifications)
