import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";

export default function Index() {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    navigate(session ? "/dashboard" : "/login", { replace: true });
  }, [isLoading, session, navigate]);

  return (
    <div className="min-h-screen grid place-items-center bg-[hsl(var(--app-bg))]">
      <div className="rounded-3xl border bg-white px-5 py-4 text-sm text-[hsl(var(--muted-ink))]">
        Carregando…
      </div>
    </div>
  );
}