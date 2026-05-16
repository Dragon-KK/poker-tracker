/** Edit after creating your project: Supabase Dashboard → Settings → API */
export const SUPABASE_URL = 'https://kdkyxbjpwgrxwhxijaaq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_5X2Y4v4Q0PFYdbKibOpxSA__2Lw5nfN';

export function isConfigured() {
  const urlOk =
    typeof SUPABASE_URL === 'string' &&
    /^https:\/\/[^/]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim()) &&
    !SUPABASE_URL.includes('YOUR_PROJECT_REF');

  const keyOk =
    typeof SUPABASE_ANON_KEY === 'string' &&
    SUPABASE_ANON_KEY.length >= 20 &&
    !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

  return !!(urlOk && keyOk);
}
