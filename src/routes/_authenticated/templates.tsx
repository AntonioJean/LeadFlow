import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Soon } from "@/components/Soon";

export const Route = createFileRoute("/_authenticated/templates")({
  component: () => <Soon name="Templates" icon={FileText} description="Mensagens prontas para WhatsApp — Fase 3." />,
});
