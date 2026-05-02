/** Filled after Supabase login; demo mode uses seed data + display name Alex. */
var ME_UID = '';
var ME = 'Alex';

function memberInitials(name) {
  if (!name || !String(name).trim()) return '?';
  const p = String(name).trim().split(/\s+/);
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function refreshMeUi() {
  const el = document.querySelector('.nav-user');
  if (el) el.textContent = memberInitials(ME);
  const w = document.getElementById('dash-welcome-name');
  if (w) w.textContent = ME || 'friend';
}
