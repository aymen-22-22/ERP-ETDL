from app.inventory.repository import InventoryRepository
from app.products.repository import ProductRepository
from app.shared.database.mixins import SyncableMixin
from app.sync.repository import SyncableRepository

# Maps a MutationEnvelope.entity_type to the repository that knows how to
# persist it. Every future syncable module adds one line here — that's the
# whole cost of gaining offline-push support. No import cycle: the concrete
# repositories depend on app.sync.repository/models/schemas, never on this
# module or app.sync.service.
SYNC_REGISTRY: dict[str, type[SyncableRepository[SyncableMixin]]] = {
    "product": ProductRepository,
    "inventory_movement": InventoryRepository,
}
