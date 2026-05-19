import { Card } from "@/components/ui/card";
import { Construction, LucideIcon } from "lucide-react";

export function Soon({ name, icon: Icon = Construction, description }: { name: string; icon?: LucideIcon; description?: string }) {
  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <Card className="p-12 text-center">
        <Icon className="h-10 w-10 mx-auto text-warning mb-3" />
        <h1 className="text-2xl font-bold">{name}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          {description ?? "Este módulo será construído nas próximas fases do LeadFlow."}
        </p>
      </Card>
    </div>
  );
}
