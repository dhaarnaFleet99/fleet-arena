"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const params = useSearchParams();
  const reason = params.get("reason");
  const supabase = createClient();

  const handle = async () => {
    setLoading(true);
    setError("");
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); setLoading(false); }
      else window.location.href = "/arena";
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + "/arena" },
      });
      if (error) { setError(error.message); setLoading(false); }
      else setSent(true);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: 8, color: "var(--text)", fontFamily: "inherit",
    fontSize: 13, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ width: 360, padding: "36px 32px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          <span style={{ fontWeight: 800, fontSize: 17 }}>fleet arena</span>
        </div>

        {reason === "internal" && (
          <div style={{ marginBottom: 20, padding: "10px 14px", background: "rgba(192,132,252,0.08)", border: "1px solid rgba(192,132,252,0.2)", borderRadius: 8, fontSize: 12, color: "var(--accent2)" }}>
            Internal dashboard requires a @fleet.so account.
          </div>
        )}

        {sent ? (
          <div style={{ fontSize: 13, color: "var(--success)", lineHeight: 1.6 }}>
            ✓ Check your email to confirm your account, then come back to sign in.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 24 }}>
              {mode === "signin" ? "Welcome back." : "Free to use. No card required."}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" onKeyDown={e => e.key === "Enter" && handle()} style={inputStyle} />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Password" onKeyDown={e => e.key === "Enter" && handle()} style={inputStyle} />

              {error && <div style={{ fontSize: 12, color: "var(--danger)" }}>{error}</div>}

              <button onClick={handle} disabled={loading || !email || !password} style={{
                marginTop: 4, width: "100%", padding: "11px",
                background: loading || !email || !password ? "rgba(79,142,247,0.25)" : "var(--accent)",
                color: loading || !email || !password ? "rgba(255,255,255,0.3)" : "#fff",
                border: "none", borderRadius: 8, fontWeight: 700,
                cursor: loading || !email || !password ? "not-allowed" : "pointer",
                fontSize: 13, fontFamily: "inherit",
              }}>
                {loading ? "…" : mode === "signin" ? "Sign in →" : "Create account →"}
              </button>
            </div>

            <div style={{ marginTop: 20, fontSize: 12, color: "var(--muted)", textAlign: "center" }}>
              {mode === "signin" ? (
                <>No account?{" "}
                  <button onClick={() => { setMode("signup"); setError(""); }} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>
                    Sign up
                  </button>
                </>
              ) : (
                <>Have an account?{" "}
                  <button onClick={() => { setMode("signin"); setError(""); }} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>
                    Sign in
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
