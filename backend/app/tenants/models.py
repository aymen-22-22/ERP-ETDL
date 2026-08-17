from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.database.mixins import AuditMixin
from app.shared.database.session import Base


class Tenant(AuditMixin, Base):
    """A business/store using the platform. Every syncable entity elsewhere
    in the system carries this table's id as its `tenant_id`.
    """

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), default=None)
