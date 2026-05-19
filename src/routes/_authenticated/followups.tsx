import { createFileRoute } from "@tanstack/react-router";
import { CheckSquare } from "lucide-react";
import { Soon } from "@/components/Soon";

export const Route = createFileRoute("/_authenticated/followups")({
  component: () => <Soon name="Follow-ups" icon={CheckSquare} description="Tarefas e lembretes — Fase 3." />,
});
