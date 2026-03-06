import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import ImportBudget from "@/pages/ImportBudget";
import Balancete from "@/pages/Balancete";
import BalanceteLinha from "@/pages/BalanceteLinha";
import Lancamentos from "@/pages/Lancamentos";
import Relatorios from "@/pages/Relatorios";
import Settings from "@/pages/Settings";
import { SessionProvider } from "@/context/SessionContext";
import { RequireAuth } from "@/components/app/RequireAuth";
import { AppShell } from "@/components/app/AppShell";

const queryClient = new QueryClient();

const AuthedLayout = ({ children }: { children: React.ReactNode }) => (
  <RequireAuth>
    <AppShell>{children}</AppShell>
  </RequireAuth>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SessionProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />

            <Route path="/dashboard" element={<AuthedLayout><Dashboard /></AuthedLayout>} />
            <Route path="/projects" element={<AuthedLayout><Projects /></AuthedLayout>} />
            <Route path="/import" element={<AuthedLayout><ImportBudget /></AuthedLayout>} />
            <Route path="/balancete" element={<AuthedLayout><Balancete /></AuthedLayout>} />
            <Route path="/balancete/linha/:id" element={<AuthedLayout><BalanceteLinha /></AuthedLayout>} />
            <Route path="/lancamentos" element={<AuthedLayout><Lancamentos /></AuthedLayout>} />
            <Route path="/relatorios" element={<AuthedLayout><Relatorios /></AuthedLayout>} />
            <Route path="/settings" element={<AuthedLayout><Settings /></AuthedLayout>} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </SessionProvider>
  </QueryClientProvider>
);

export default App;