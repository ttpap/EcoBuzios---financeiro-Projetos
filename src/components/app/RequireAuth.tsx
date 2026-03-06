import { PropsWithChildren, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSession } from "@/context/SessionContext";

export function RequireAuth({ children }: PropsWithChildren) {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [isLoading, session, navigate, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <div className="rounded-2xl border bg-white px-5 py-4 text-sm text-[hsl(var(--muted-ink))]">
          Carregando…
        </div>
      </div>
    );
  }

  if (!session) return null;
  return <>{children}</>;
}
