import { useState } from "react";
import { supabase } from "./lib/supabaseClient.js";
import { FeedbackInbox } from "./FeedbackReview.jsx";

// Admin portal: only the corrections assigned for review, with approve / reject. No case workspace.
// Approved corrections become lessons the AI uses next time.
export default function AdminPortal({ session }) {
  const [error, setError] = useState("");
  async function signOut() {
    const { error: failure } = await supabase.auth.signOut();
    if (failure) setError(`Sign out failed: ${failure.message}`);
  }
  return <div className="admin-portal">
    <header className="admin-header">
      <div className="admin-brand"><span className="brand-mark">D</span><div><span className="eyebrow">ADMIN PORTAL</span><h1>Corrections</h1></div></div>
      <div className="admin-actions"><span className="muted">{session.user.email}</span><button className="secondary-button" onClick={signOut}>Sign out</button></div>
    </header>
    <ol className="admin-steps"><li><b>Lawyer</b> suggests a label</li><li><b>You</b> approve or reject</li><li><b>Approved</b> lessons guide future analyses</li></ol>
    {error && <p className="error" role="alert">{error}</p>}
    <FeedbackInbox client={supabase} userId={session.user.id} adminView />
  </div>;
}
