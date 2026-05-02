/** Client cache mirrored from demo seed or Supabase. */
const state = {
  page: 'page-dashboard',
  table: null,
  game: null,
  modalBuyin: null,
  modalClearout: null,
  modalSponsor: null,
  _sponsorSelected: null,
  _pickerCallback: null,
  _pickerExclude: [],
  _paymentSelected: null,
  tables: []
};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ── Local-mode persistence ──────────────────────────────────────────────────

function getDemoUsers() {
  try { return JSON.parse(localStorage.getItem('pl_users') || '{}'); } catch { return {}; }
}

function saveDemoUsers(users) {
  localStorage.setItem('pl_users', JSON.stringify(users));
}

function getDemoTablesRaw() {
  try { return JSON.parse(localStorage.getItem('pl_tables') || '[]'); } catch { return []; }
}

function saveDemoTablesRaw(tables) {
  localStorage.setItem('pl_tables', JSON.stringify(tables));
}

function loadDemoTablesForUser() {
  const all = getDemoTablesRaw();
  state.tables = all.filter(t =>
    Array.isArray(t._membersRows) && t._membersRows.some(m => m.userId === ME_UID)
  );
}

/** Merge state.tables back into the global pl_tables store. */
function persistDemoTables() {
  if (APP_SUPABASE_CONFIGURED && window.sb) return;
  const all = getDemoTablesRaw();
  state.tables.forEach(t => {
    const idx = all.findIndex(x => x.id === t.id);
    if (idx >= 0) all[idx] = t;
    else all.push(t);
  });
  saveDemoTablesRaw(all);
}

function saveLocalSession() {
  if (!(APP_SUPABASE_CONFIGURED && window.sb) && ME_UID) {
    localStorage.setItem('pl_session', JSON.stringify({ uid: ME_UID, name: ME }));
  }
}

function clearLocalSession() {
  localStorage.removeItem('pl_session');
}

function resumeLocalSession() {
  if (APP_SUPABASE_CONFIGURED && window.sb) return false;
  try {
    const s = JSON.parse(localStorage.getItem('pl_session') || 'null');
    if (!s || !s.uid || !s.name) return false;
    // Verify user still exists
    const username = String(s.uid).replace('local:', '');
    const users = getDemoUsers();
    if (!users[username]) return false;
    ME_UID = s.uid;
    ME = s.name;
    loadDemoTablesForUser();
    return true;
  } catch { return false; }
}
