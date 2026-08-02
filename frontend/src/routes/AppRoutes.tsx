import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { AuthLayout } from "@/layouts/AuthLayout";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

import { ProtectedRoute } from "./ProtectedRoute";

// Login/NotFound stay in the initial chunk: login is the entry point for every
// unauthenticated visit, so lazy-loading it would only add a round-trip before
// first paint. Everything behind auth is split per route and fetched on demand,
// which keeps the initial download small as more modules land.
const RegisterPage = lazy(() =>
  import("@/pages/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const DashboardHomePage = lazy(() =>
  import("@/pages/DashboardHomePage").then((m) => ({ default: m.DashboardHomePage })),
);
const ProductsListPage = lazy(() =>
  import("@/pages/ProductsListPage").then((m) => ({ default: m.ProductsListPage })),
);
const ProductFormPage = lazy(() =>
  import("@/pages/ProductFormPage").then((m) => ({ default: m.ProductFormPage })),
);
const ProductDetailPage = lazy(() =>
  import("@/pages/ProductDetailPage").then((m) => ({ default: m.ProductDetailPage })),
);
const WarehouseListPage = lazy(() =>
  import("@/pages/WarehouseListPage").then((m) => ({ default: m.WarehouseListPage })),
);
const WarehouseDetailPage = lazy(() =>
  import("@/pages/WarehouseDetailPage").then((m) => ({ default: m.WarehouseDetailPage })),
);
const TransferListPage = lazy(() =>
  import("@/pages/TransferListPage").then((m) => ({ default: m.TransferListPage })),
);
const TransferFormPage = lazy(() =>
  import("@/pages/TransferFormPage").then((m) => ({ default: m.TransferFormPage })),
);
const TransferDetailPage = lazy(() =>
  import("@/pages/TransferDetailPage").then((m) => ({ default: m.TransferDetailPage })),
);
const ProductTypeChooserPage = lazy(() =>
  import("@/pages/ProductTypeChooserPage").then((m) => ({ default: m.ProductTypeChooserPage })),
);
const KitFormPage = lazy(() =>
  import("@/pages/KitFormPage").then((m) => ({ default: m.KitFormPage })),
);
const VariantGeneratorPage = lazy(() =>
  import("@/pages/VariantGeneratorPage").then((m) => ({ default: m.VariantGeneratorPage })),
);
const CategoriesPage = lazy(() =>
  import("@/pages/CategoriesPage").then((m) => ({ default: m.CategoriesPage })),
);
const SalesPage = lazy(() => import("@/pages/SalesPage").then((m) => ({ default: m.SalesPage })));
const SettingsPage = lazy(() =>
  import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const StyleGuidePage = lazy(() =>
  import("@/pages/StyleGuidePage").then((m) => ({ default: m.StyleGuidePage })),
);

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DashboardHomePage />} />
            <Route path="/products" element={<ProductsListPage />} />
            {/* /products/new asks which kind first; each kind then gets the
                form that actually fits it. */}
            <Route path="/products/new" element={<ProductTypeChooserPage />} />
            <Route path="/products/new/simple" element={<ProductFormPage />} />
            <Route path="/products/new/kit" element={<KitFormPage />} />
            <Route path="/products/generate" element={<VariantGeneratorPage />} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
            <Route path="/products/:productId/edit" element={<ProductFormPage />} />
            <Route path="/warehouses" element={<WarehouseListPage />} />
            <Route path="/warehouses/:warehouseId" element={<WarehouseDetailPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/transfers" element={<TransferListPage />} />
            <Route path="/transfers/new" element={<TransferFormPage />} />
            <Route path="/transfers/:transferId" element={<TransferDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/style" element={<StyleGuidePage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
