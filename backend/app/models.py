"""Imports every ORM model so `Base.metadata` is fully populated.

Models register on the shared metadata only when their module is imported.
Cross-table foreign keys (e.g. refresh_tokens.tenant_id -> tenants.id) are
resolved lazily at mapper-configure/flush time, so if a referenced model's
module was never imported, the FK target table is missing and SQLAlchemy
raises NoReferencedTableError.

Import this module wherever the full schema must be present: the app startup
(app.main) and the Alembic environment. New model modules get one line here.
"""

from app.auth import models as auth_models  # noqa: F401
from app.inventory import models as inventory_models  # noqa: F401
from app.monitoring import models as monitoring_models  # noqa: F401
from app.products import models as product_models  # noqa: F401
from app.sync import models as sync_models  # noqa: F401
from app.tenants import models as tenant_models  # noqa: F401
from app.transfers import models as transfer_models  # noqa: F401
from app.users import models as user_models  # noqa: F401
from app.warehouses import models as warehouse_models  # noqa: F401
