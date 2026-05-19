import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Radar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!loading && user) navigate({ to: "/radar" }); }, [user, loading, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro de autenticação");
    } finally { setBusy(false); }
  }

  async function handleGoogle() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/radar`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar com Google");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-radar-grad flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30 mb-4">
            <Radar className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">LeadFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">Central de inteligência comercial</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{mode === "signin" ? "Entrar" : "Criar conta"}</CardTitle>
            <CardDescription>
              {mode === "signin" ? "Acesse seu Radar de Clientes" : "Comece a prospectar em segundos"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full gap-2" onClick={handleGoogle} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
              {mode === "signin" ? "Entrar com Google" : "Cadastrar com Google"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">ou</span>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? "Não tem conta? " : "Já tem conta? "}
              <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-primary hover:underline">
                {mode === "signin" ? "Criar agora" : "Entrar"}
              </button>
            </p>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">← Voltar</Link>
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
      G
    </span>
  );
}
