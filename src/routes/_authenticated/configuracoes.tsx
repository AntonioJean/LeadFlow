import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { Soon } from "@/components/Soon";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: () => <Soon name="Configurações" icon={Settings} description="Perfil, equipe e integrações — Fase 6." />,
});
