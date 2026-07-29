import { useEffect } from "react";
import { useNavigate } from "react-router";

export function ConflictsPage() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/", { replace: true }); }, [navigate]);
  return null;
}
