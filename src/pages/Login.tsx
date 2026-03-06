import { useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/SessionContext";

export default function Login() {
  const { session } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true });
  }, [session, navigate]);

  return (
    <div className="min-h-screen bg-[hsl(var(--app-bg))]">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-4 py-10 md:grid-cols-2 md:items-center md:px-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[hsl(var(--muted-ink))] backdrop-blur">
            Controle orçamentário por rubrica
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[hsl(var(--ink))] md:text-4xl">
            Entre para gerenciar seu balancete
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-ink))]">
            Importe planilhas, revise a estrutura, lance despesas por mês e acompanhe
            saldos em tempo real.
          </p>

          <div className="mt-6 overflow-hidden rounded-3xl border bg-white p-5 shadow-sm">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">
              Dica
            </div>
            <div className="mt-1 text-sm text-[hsl(var(--ink))]">
              Para o MVP, comece importando um Excel/CSV. OCR (imagem/PDF) entra na
              próxima etapa.
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <div className="text-sm font-semibold text-[hsl(var(--ink))]">
              Acesso
            </div>
            <div className="text-xs text-[hsl(var(--muted-ink))]">
              E-mail e senha (Supabase Auth)
            </div>
          </div>
          <Auth
            supabaseClient={supabase}
            providers={[]}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "hsl(var(--brand))",
                    brandAccent: "hsl(var(--brand-strong))",
                    inputBorder: "hsl(var(--border))",
                    inputBorderHover: "hsl(var(--brand)/0.35)",
                    inputBorderFocus: "hsl(var(--brand))",
                  },
                  radii: {
                    borderRadiusButton: "14px",
                    buttonBorderRadius: "14px",
                    inputBorderRadius: "14px",
                  },
                },
              },
            }}
            theme="light"
          />
        </div>
      </div>
    </div>
  );
}
