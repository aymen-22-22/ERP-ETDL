from enum import StrEnum

from sqlalchemy import Boolean, Enum, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database.mixins import TenantScopedAuditMixin
from app.shared.database.session import Base


class WarehouseType(StrEnum):
    DEPOT = "depot"
    STORE = "store"
    TRANSIT = "transit"
    RETURN = "return"


class Warehouse(TenantScopedAuditMixin, Base):
    """A physical stock location. Reference/catalog data like Category/Brand/
    Unit — online-only, no offline sync (creating a new location is a rare,
    admin-driven event, not something that needs to happen mid-transaction
    while offline).
    """

    __tablename__ = "warehouses"
    __table_args__ = (UniqueConstraint("tenant_id", "name", name="uq_warehouses_tenant_name"),)

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str | None] = mapped_column(String(30), default=None)
    warehouse_type: Mapped[WarehouseType] = mapped_column(
        Enum(
            WarehouseType,
            native_enum=False,
            length=20,
            values_callable=lambda enum_cls: [e.value for e in enum_cls],
        ),
        default=WarehouseType.DEPOT,
    )
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_sales: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_purchases: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_transfers: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, default=False)
    image_url: Mapped[str | None] = mapped_column(String(500), default=None)
