import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Radar, LayoutDashboard, Users, KanbanSquare, MessageSquare,
  CheckSquare, FileText, Settings as SettingsIcon, LogOut, Sparkles, Bot,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const PRIMARY = { to: "/radar", icon: Radar, label: "Radar de Clientes" } as const;
const ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/leads", icon: Users, label: "Leads" },
  { to: "/funil", icon: KanbanSquare, label: "Funil" },
  { to: "/whatsapp", icon: MessageSquare, label: "WhatsApp" },
  { to: "/ia", icon: Bot, label: "Agente IA" },
  { to: "/followups", icon: CheckSquare, label: "Follow-ups" },
  { to: "/templates", icon: FileText, label: "Templates" },
  { to: "/configuracoes", icon: SettingsIcon, label: "Configurações" },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isActive = (to: string) => path === to || path.startsWith(to + "/");

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <Link to="/radar" className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <Radar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-sidebar-foreground leading-tight">LeadFlow</div>
            <div className="text-[11px] text-muted-foreground">Commercial Intelligence</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {/* Radar — destaque */}
        <Link
          to={PRIMARY.to}
          className={cn(
            "group relative flex items-center gap-3 px-3 py-3 rounded-xl mb-4 transition-all",
            "bg-gradient-to-br from-primary/15 to-accent/10 ring-1",
            isActive(PRIMARY.to)
              ? "ring-primary/60 glow-primary"
              : "ring-sidebar-border hover:ring-primary/40",
          )}
        >
          <PRIMARY.icon className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-sidebar-foreground">{PRIMARY.label}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Central de prospecção
            </div>
          </div>
        </Link>

        <div className="px-3 mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">CRM</div>
        <ul className="space-y-0.5">
          {ITEMS.map((it) => (
            <li key={it.to}>
              <Link
                to={it.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive(it.to)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <it.icon className="h-4 w-4" />
                <span>{it.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
            {(user?.email?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-sidebar-foreground">
              {user?.user_metadata?.full_name ?? user?.email}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
            className="p-1.5 rounded hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
