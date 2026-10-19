// Which screen opens after sign-in: the lawyer workspace or the admin portal.
// This is only a screen choice. What an admin may approve is enforced by the database
// (feedback_private.reviewer_assignments), never by this setting.
const KEY = "deposition-portal";
export function chosenPortal(storage = globalThis.sessionStorage) {
  try { return storage?.getItem(KEY) === "admin" ? "admin" : "workspace"; } catch { return "workspace"; }
}
export function choosePortal(portal, storage = globalThis.sessionStorage) {
  try { storage?.setItem(KEY, portal === "admin" ? "admin" : "workspace"); } catch { /* storage unavailable: default to the workspace */ }
}
// A passphrase typed while creating an admin account is held in memory only (never storage)
// until the portal opens and uses it once.
let pending = null;
export function holdAdminPassphrase(value) { pending = value || null; }
export function takeAdminPassphrase() { const value = pending; pending = null; return value; }
