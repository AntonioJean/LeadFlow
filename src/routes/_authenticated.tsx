import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } as never });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;
  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
