const KEY = 'deposition:reduced-effects';
export function readVisualPreference(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(KEY) === 'true'; } catch { return false; }
}
export function saveVisualPreference(enabled, storage) {
  try {
    storage ??= globalThis.localStorage;
    if (!storage) return false;
    storage.setItem(KEY, String(enabled));
    return true;
  } catch { return false; }
}
