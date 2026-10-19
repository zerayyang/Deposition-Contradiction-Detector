import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient.js";
import { takeAdminPassphrase } from "./lib/portal.js";
import { FeedbackInbox } from "./FeedbackReview.jsx";

// Admin portal: only the corrections to review, with approve / reject. No case workspace.
// Approved corrections become lessons the AI uses next time. An account must unlock admin
// once with the admin passphrase; the database checks it and limits wrong guesses.
const setupMissing = "Admin setup is missing in the database. Run the admin migration in Supabase first.";
const friendly = error => /function|schema cache|does not exist/i.test(error?.message ?? "") ? setupMissing : error?.message ?? "Something went wrong.";

export default function AdminPortal({ session }) {
  const [state, setState] = useState("checking");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function unlock(value) {
    const { data, error: failure } = await supabase.rpc("become_feedback_admin", { p_passphrase: value });
    if (failure) throw failure;
    if (!data) throw new Error("Wrong passphrase.");
    setState("admin");
  }
  useEffect(() => {
    let live = true;
    const held = takeAdminPassphrase();
    (async () => {
      try {
        if (held) { await unlock(held); return; }
        const { data, error: failure } = await supabase.rpc("is_feedback_admin");
        if (failure) throw failure;
        if (live) setState(data ? "admin" : "locked");
      } catch (err) { if (live) { setState("locked"); setError(friendly(err)); } }
    })();
    return () => { live = false; };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await unlock(passphrase); setPassphrase(""); } catch (err) { setError(friendly(err)); } finally { setBusy(false); }
  }
  async function signOut() {
    const { error: failure } = await supabase.auth.signOut();
    if (failure) setError(`Sign out failed: ${failure.message}`);
  }
  return <div className="admin-portal">
    <header className="admin-header">
      <div className="admin-brand"><span className="brand-mark">D</span><div><span className="eyebrow">ADMIN PORTAL</span><h1>Corrections</h1></div></div>
      <div className="admin-actions"><span className="muted">{session.user.email}</span><button className="secondary-button" onClick={signOut}>Sign out</button></div>
    </header>
    {state === "checking" && <p className="muted" role="status">Checking admin access…</p>}
    {state === "locked" && <form className="admin-unlock" onSubmit={submit}>
      <h2>Enter the admin passphrase</h2>
      <p className="muted">This account is not an admin yet. Enter the passphrase once to unlock the portal.</p>
      <label>Admin passphrase<input type="password" autoComplete="off" value={passphrase} onChange={event => setPassphrase(event.target.value)} required /></label>
      <button disabled={busy || !passphrase}>{busy ? "Checking…" : "Unlock admin"}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {state === "admin" && <>
      <ol className="admin-steps"><li><b>Lawyer</b> suggests a label</li><li><b>You</b> approve or reject</li><li><b>Approved</b> lessons guide future analyses</li></ol>
      <FeedbackInbox client={supabase} userId={session.user.id} adminView />
    </>}
  </div>;
}
