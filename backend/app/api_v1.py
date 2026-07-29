from fastapi import APIRouter

from app.auth.router import router as auth_router
from app.inventory.router import router as inventory_router
from app.products.catalog_router import catalog_router
from app.products.router import router as products_router
from app.sync.router import router as sync_router
from app.transfers.router import router as transfers_router
from app.users.router import router as users_router
from app.warehouses.router import router as warehouses_router

api_v1_router = APIRouter(prefix="/v1")
api_v1_router.include_router(auth_router)
api_v1_router.include_router(products_router)
api_v1_router.include_router(catalog_router)
api_v1_router.include_router(inventory_router)
api_v1_router.include_router(warehouses_router)
api_v1_router.include_router(transfers_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(sync_router)
