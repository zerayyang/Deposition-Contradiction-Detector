// Hosting platforms can return HTML or plain text before Express handles a request.
// Never display that body (which may contain provider diagnostics) as app content.
export function apiFailureMessage(status, fallback = 'The analysis service is unavailable. Try again later.') {
  return ({401:'Your session could not be verified. Sign in again.',403:'This account cannot access analysis. Contact the site owner.',404:'The analysis service could not be found. Contact the site owner.',413:'These documents exceed the current website request limit. Your saved documents have not been changed.',429:'The service is busy. Wait before trying again.',502:'The analysis service is temporarily unavailable. Your saved documents have not been changed.',503:'The analysis service is temporarily unavailable. Your saved documents have not been changed.',504:'The website stopped waiting for analysis. Any saved results remain available; review them before starting another paid run.'})[status] ?? fallback;
}
export async function readApiJson(response, fallback) {
  let data;
  try { data = await response.json(); }
  catch { throw new Error(apiFailureMessage(response.status, fallback)); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(apiFailureMessage(response.status, fallback));
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : apiFailureMessage(response.status, fallback));
  return data;
}
