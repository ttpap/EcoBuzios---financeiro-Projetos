import { useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/context/SessionContext";
import ecoLogo from "@/assets/ecobuzios-logo.png";

export default function Login() {
  const { session } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true });
  }, [session, navigate]);

  return (
    <div className="min-h-screen bg-[hsl(var(--app-bg))]">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-4 py-10 md:grid-cols-2 md:items-center md:px-6">
        <div className="text-center md:text-left">
          <div className="mx-auto w-fit md:mx-0">
            <img
              src={ecoLogo}
              alt="EcoBúzios"
              className="h-24 w-auto md:h-28"
            />
          </div>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[hsl(var(--muted-ink))] backdrop-blur">
            Gestão financeira por rubrica
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[hsl(var(--ink))] md:text-4xl">
            Acesse para gerir seu projeto
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[hsl(var(--muted-ink))] md:mx-0">
            Planeje o orçamento por rubricas, registre pagamentos reais e acompanhe o saldo por mês com clareza.
          </p>

          <div className="mx-auto mt-6 max-w-md overflow-hidden rounded-3xl border bg-white p-5 shadow-sm md:mx-0">
            <div className="text-xs font-medium text-[hsl(var(--muted-ink))]">Dica rápida</div>
            <div className="mt-1 text-sm text-[hsl(var(--ink))]">
              Comece criando o Balancete PRO e depois lance a Execução mês a mês, anexando as notas fiscais em PDF.
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="mb-4">
            <div className="text-sm font-semibold text-[hsl(var(--ink))]">Acesso</div>
            <div className="text-xs text-[hsl(var(--muted-ink))]">E-mail e senha (Supabase Auth)</div>
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