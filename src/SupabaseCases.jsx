import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient.js";
import { LOCAL_SESSION, localModeEnabled } from "./lib/localStores.js";
import { chosenPortal, choosePortal, holdAdminPassphrase } from "./lib/portal.js";

function SignIn() {
  const [signup, setSignup] = useState(false);
  const [admin, setAdmin] = useState(() => chosenPortal() === "admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const credentials = { email: email.trim(), password };
      choosePortal(admin ? "admin" : "workspace");
      holdAdminPassphrase(admin && signup ? passphrase : null);
      const { data, error: failure } = signup
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword(credentials);
      if (failure) throw failure;
      setPassword(""); setPassphrase("");
      if (signup && !data.session) { holdAdminPassphrase(null); setMessage(admin ? "Check your email to confirm the account, then sign in on the Admin tab and enter the passphrase." : "Check your email to confirm your account, then sign in here."); }
    } catch (err) { setError(err.message); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <main className="login-page"><div className="login-intro"><div className="brand-mark">D</div><span className="eyebrow">DEPOSITION WORKSPACE</span><h1>Clarity in<br/>every account.</h1><p>Compare testimony. Trace the evidence.<br/>Review every finding in context.</p><div className="login-caption">Your testimony review, together in one workspace.</div></div><section className="login-card">
    <div className="login-tabs" role="tablist" aria-label="Sign in as"><button type="button" role="tab" aria-selected={!admin} className={!admin ? "active" : ""} onClick={() => { setAdmin(false); setError(""); }}>Lawyer</button><button type="button" role="tab" aria-selected={admin} className={admin ? "active" : ""} onClick={() => { setAdmin(true); setSignup(false); setError(""); setMessage(""); }}>Admin</button></div>
    <span className="eyebrow">{admin ? "ADMIN PORTAL" : "WELCOME"}</span>
    <h2>{admin ? (signup ? "Create admin account" : "Admin sign in") : signup ? "Create your account" : "Welcome back"}</h2>
    <p>{admin ? (signup ? "Enter the admin passphrase, then choose the admin email and password." : "Review lawyer corrections and approve lessons.") : signup ? "Create an account to start reviewing testimony." : "Sign in to open your case workspace."}</p>
    <form className="cloud-form" onSubmit={submit}>
      {admin && signup && <label>Admin passphrase<input type="password" autoComplete="off" value={passphrase} onChange={event => setPassphrase(event.target.value)} required /></label>}
      <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label>Password<input type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} required /></label>
      <button disabled={busy}>{busy ? "Please wait…" : admin ? (signup ? "Create admin account" : "Sign in to admin portal") : signup ? "Create account" : "Sign in"}</button>
      {!admin && <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(""); setMessage(""); }}>{signup ? "Already have an account?" : "Create an account"}</button>}
      {admin && <button type="button" disabled={busy} onClick={() => { setSignup(!signup); setError(""); setMessage(""); }}>{signup ? "Already an admin? Sign in" : "Create admin account"}</button>}
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {message && <p role="status">{message}</p>}
  </section></main>;
}

export default function AuthGate({ children, hostname = globalThis.location?.hostname }) {
  // Localhost without Supabase runs in no-account mode; hosted sites always need sign-in.
  const local = localModeEnabled({ supabaseConfigured: Boolean(supabase), hostname });
  const [auth, setAuth] = useState({ loading: true, session: null, error: "" });
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let changed = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (active) setAuth({ loading: false, session, error: "" });
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !changed) setAuth({ loading: false, session: data.session, error: error?.message ?? "" });
    }).catch(error => {
      if (active && !changed) setAuth({ loading: false, session: null, error: error.message });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  if (local) return children(LOCAL_SESSION);
  if (!supabase) return <main className="login-page"><section className="login-card"><h1>Connection needed</h1><p>Add the Supabase URL and publishable key to .env.local, then restart the app.</p></section></main>;
  if (auth.loading) return <main className="session-loading" role="status">Opening your workspace…</main>;
  if (auth.session) return children(auth.session);
  return <><SignIn />{auth.error && <p role="alert" className="auth-error">{auth.error}</p>}</>;
}
