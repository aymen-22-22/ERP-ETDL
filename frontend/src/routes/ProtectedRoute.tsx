import { Navigate, Outlet } from "react-router";

import { PageLoader } from "@/components/PageLoader";
import { useAuthStore } from "@/store/authStore";

export function ProtectedRoute() {
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const accessToken = useAuthStore((state) => state.accessToken);

  if (!isHydrated) return <PageLoader />;
  if (!accessToken) return <Navigate to="/login" replace />;
  return <Outlet />;
}
