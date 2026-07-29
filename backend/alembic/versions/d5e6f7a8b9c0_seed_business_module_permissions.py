"""seed business module permissions

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-07-29 00:00:00.000000

Seeds permissions for products, warehouses, inventory, and transfers modules.
Every module's endpoints are guarded by require_permission() which checks
RolePermission, so no write succeeds without the corresponding grant.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PERMISSION_IDS = {
    "products:read": "a324d5e5-e8d4-4990-8c76-dbfc6d6fcbf6",
    "products:write": "213b5667-ccdf-4b7e-8ea2-e8041d43f98a",
    "warehouses:read": "a34411f4-b397-41d2-bfa6-77f36ae1add8",
    "warehouses:write": "7db96b0f-5a3e-4d7e-8205-e6606019f0bc",
    "inventory:read": "af518f7c-4feb-481c-87b5-1694cdee448b",
    "inventory:write": "6b3b453e-c2dc-431f-bedc-0d3ec91bff5a",
    "transfers:read": "8881119b-6f2e-473a-b55d-547543e59ad5",
    "transfers:write": "97afee44-f333-4412-88c3-b08a6a19281f",
    "transfers:approve": "b5db73df-c4a6-4974-8a86-5dc4397ea9d7",
}

ROLE_IDS = {
    "owner": "019f9108-974e-7103-ba73-c5c91a695b43",
    "manager": "019f9108-974e-7103-ba73-c5caef7fca88",
    "cashier": "019f9108-974e-7103-ba73-c5cb31acee43",
    "employee": "019f9108-974e-7103-ba73-c5cc36a0347c",
    "admin": "019f9108-974e-7103-ba73-c5cde346e6fe",
}

ROLE_GRANTS = {
    "owner": [
        "products:read",
        "products:write",
        "warehouses:read",
        "warehouses:write",
        "inventory:read",
        "inventory:write",
        "transfers:read",
        "transfers:write",
        "transfers:approve",
    ],
    "admin": [
        "products:read",
        "products:write",
        "warehouses:read",
        "warehouses:write",
        "inventory:read",
        "inventory:write",
        "transfers:read",
        "transfers:write",
    ],
    "manager": [
        "products:read",
        "warehouses:read",
        "inventory:read",
        "transfers:read",
        "transfers:write",
    ],
    "cashier": [
        "products:read",
        "warehouses:read",
        "inventory:read",
        "transfers:read",
    ],
    "employee": [
        "products:read",
        "warehouses:read",
        "inventory:read",
        "transfers:read",
    ],
}


PERMISSION_DESCRIPTIONS = {
    "products:read": "View products, categories, brands, and units.",
    "products:write": "Create, update, and delete products and catalog data.",
    "warehouses:read": "View warehouses and their details.",
    "warehouses:write": "Create, update, and delete warehouses.",
    "inventory:read": "View inventory stock and movement history.",
    "inventory:write": "Record inventory movements.",
    "transfers:read": "View stock transfers.",
    "transfers:write": "Create and edit stock transfers.",
    "transfers:approve": "Approve and complete stock transfers.",
}


def upgrade() -> None:
    for code, pid in PERMISSION_IDS.items():
        desc = PERMISSION_DESCRIPTIONS[code]
        op.execute(
            f"INSERT INTO permissions (id, code, description) "
            f"VALUES ('{pid}', '{code}', '{desc}') "
            f"ON CONFLICT (code) DO NOTHING"
        )

    for role, codes in ROLE_GRANTS.items():
        rid = ROLE_IDS[role]
        for code in codes:
            op.execute(
                f"INSERT INTO role_permissions (role_id, permission_id) "
                f"SELECT '{rid}'::uuid, id FROM permissions WHERE code = '{code}' "
                f"ON CONFLICT DO NOTHING"
            )


def downgrade() -> None:
    id_list = ", ".join(f"'{pid}'" for pid in PERMISSION_IDS.values())
    op.execute(f"DELETE FROM role_permissions WHERE permission_id IN ({id_list})")
    op.execute(f"DELETE FROM permissions WHERE id IN ({id_list})")
