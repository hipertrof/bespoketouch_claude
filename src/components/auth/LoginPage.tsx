import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../Button";
import { Logo } from "../Logo";

// Staff/admin login (Supabase Auth email + password). The kiosk guest flow at
// "/" needs no login — this gates the management dashboards only.
export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-3xl bg-white p-8 shadow-soft"
        >
          <h1 className="text-center font-serif text-2xl text-charcoal">Staff sign in</h1>
          <label className="flex flex-col gap-1 text-sm text-slate">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 rounded-2xl border border-sand bg-cream px-4 text-charcoal outline-none focus:border-sage"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-12 rounded-2xl border border-sand bg-cream px-4 text-charcoal outline-none focus:border-sage"
            />
          </label>
          {error && <p className="text-sm text-rose-dark">{error}</p>}
          <Button type="submit" disabled={busy} className="mt-2 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
