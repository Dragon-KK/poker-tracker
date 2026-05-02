/** Edit after creating your project: Supabase Dashboard → Settings → API */
export const SUPABASE_URL = 'https://kdkyxbjpwgrxwhxijaaq.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtka3l4Ympwd2dyeHdoeGlqYWFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2OTMyMzQsImV4cCI6MjA5MzI2OTIzNH0.nSsmwFfeyXcZharjhc63Cxh4ogY7elmmNrKI2h6FCkU';

export function isConfigured() {
  const urlOk =
    typeof SUPABASE_URL === 'string' &&
    /^https:\/\/[^/]+\.supabase\.co\/?$/i.test(SUPABASE_URL.trim()) &&
    !SUPABASE_URL.includes('YOUR_PROJECT_REF');

  const keyOk =
    typeof SUPABASE_ANON_KEY === 'string' &&
    SUPABASE_ANON_KEY.length >= 120 &&
    !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

  return !!(urlOk && keyOk);
}
