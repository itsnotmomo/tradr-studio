"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login", { body: { email, password } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-[360px] p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[18px] font-bold leading-tight">Tradr Studio</div>
          <div className="text-[12px] muted">Private. Sign in to continue.</div>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="field" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <div role="alert" className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</div>}
      <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
