import { useEffect } from "react";
import { BrowserRouter } from "react-router";

import { AppRoutes } from "@/routes/AppRoutes";
import { useAuthStore } from "@/store/authStore";

function App() {
  const hydrateFromCache = useAuthStore((state) => state.hydrateFromCache);

  useEffect(() => {
    void hydrateFromCache();
  }, [hydrateFromCache]);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
