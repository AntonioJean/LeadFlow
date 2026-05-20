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
  const [authHint, setAuthHint] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/radar" });
  }, [user, loading, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setAuthHint(null);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/radar" });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/radar`,
          data: { full_name: name },
        },
      });

      if (error) throw error;

      if (data.session) {
        toast.success("Conta criada com sucesso!");
        navigate({ to: "/radar" });
      } else {
        toast.success("Conta criada! Verifique seu e-mail para confirmar o acesso.");
        setAuthHint("Se a confirmação por e-mail estiver ativa no Supabase, confirme a conta antes de entrar.");
        setMode("signin");
      }
    } catch (err) {
      const message = getFriendlyAuthError(err);
      setAuthHint(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordReset() {
    if (!email) {
      toast.error("Informe seu e-mail para recuperar a senha.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success("Enviamos um link de recuperação para o seu e-mail.");
    } catch (err) {
      toast.error(getFriendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    if (!email) {
      toast.error("Informe seu e-mail para reenviar a confirmação.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/radar` },
      });
      if (error) throw error;
      toast.success("Reenviamos o e-mail de confirmação.");
    } catch (err) {
      toast.error(getFriendlyAuthError(err));
    } finally {
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
              {mode === "signin" ? "Acesse seu Radar de Clientes" : "Crie seu acesso com e-mail e senha"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {authHint && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {authHint}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Entrar" : "Criar conta"}
              </Button>
            </form>

            {mode === "signin" && (
              <div className="grid gap-2 text-center text-xs text-muted-foreground">
                <button type="button" onClick={handlePasswordReset} className="hover:text-foreground" disabled={busy}>
                  Esqueci minha senha
                </button>
                <button type="button" onClick={handleResendConfirmation} className="hover:text-foreground" disabled={busy}>
                  Reenviar confirmação de e-mail
                </button>
              </div>
            )}

            <p className="text-center text-sm text-muted-foreground">
              {mode === "signin" ? "Não tem conta? " : "Já tem conta? "}
              <button
                type="button"
                onClick={() => {
                  setAuthHint(null);
                  setMode(mode === "signin" ? "signup" : "signin");
                }}
                className="text-primary hover:underline"
              >
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

function getFriendlyAuthError(err: unknown) {
  const rawMessage = err instanceof Error ? err.message : "Erro de autenticação";
  const message = rawMessage.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "Credenciais inválidas. Verifique e-mail/senha ou crie uma conta antes de entrar.";
  }

  if (message.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado. Use o botão para reenviar a confirmação.";
  }

  if (message.includes("user already registered") || message.includes("already registered")) {
    return "Este e-mail já possui cadastro. Entre com sua senha ou use recuperação de senha.";
  }

  if (message.includes("password")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  return rawMessage;
}
