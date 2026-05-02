/** Safe inside onclick="...'VALUE'..." (single-quoted JS strings). */
function escapeJsSingleQuoted(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

let _loadingCount = 0;
let _loadingTimer = null;
function showLoading() {
  _loadingCount++;
  const el = document.getElementById('loading-overlay');
  if (el) el.classList.remove('hidden');
  clearTimeout(_loadingTimer);
  _loadingTimer = setTimeout(() => {
    _loadingCount = 0;
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden');
  }, 30000);
}
function hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) {
    clearTimeout(_loadingTimer);
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden');
  }
}

function showError(message) {
  const el = document.getElementById('modal-error-text');
  if (el) el.textContent = message;
  const bd = document.getElementById('modal-error');
  if (bd) bd.classList.add('open');
}

function tableMembersList(t) {
  if (t._membersRows && t._membersRows.length)
    return t._membersRows.map(m => ({
      userId: m.userId,
      displayName: m.displayName,
      isAuth: !!m.isAuth
    }));
  return (t.members || []).map(name => ({
    userId: 'name:' + name,
    displayName: name,
    isAuth: !!(t.authMembers && t.authMembers.includes(name))
  }));
}

function isAuth(t) {
  if (t._membersRows && ME_UID) {
    return t._membersRows.some(m => m.userId === ME_UID && m.isAuth);
  }
  return !!(t.authMembers && t.authMembers.includes(ME));
}

function isTableCreator(t) {
  if (!t || !ME_UID) return false;
  if (t.createdBy) return ME_UID === t.createdBy;
  return false;
}

function sessionPlayerForMe(g) {
  if (ME_UID) return g.players.find(p => p.userId === ME_UID);
  return g.players.find(p => p.name === ME);
}

function playerBuyinTotal(p) {
  return p.buyins.reduce((s, b) => s + b.amt, 0);
}

function playerClearoutTotal(p) {
  return (p.clearouts || []).reduce((s, c) => s + c.amt, 0);
}

function playerSponsoredReceived(p) {
  return p.sponsorships.reduce((s, sp) => s + sp.amt, 0);
}

function playerSelfBuyins(p) {
  return playerBuyinTotal(p) - playerSponsoredReceived(p);
}

function playerSponsoredToOthers(g, p) {
  let total = 0;
  g.players.forEach(q => {
    if (q.userId === p.userId) return;
    q.sponsorships.forEach(s => {
      if (s.by === p.name) total += s.amt;
    });
  });
  return total;
}

function playerNet(g, p) {
  return playerClearoutTotal(p) - playerSelfBuyins(p) - playerSponsoredToOthers(g, p);
}

function gameMoneyIn(g) {
  return g.players.reduce((s, p) => s + playerBuyinTotal(p), 0);
}

function gameMoneyOut(g) {
  return g.players.reduce((s, p) => s + playerClearoutTotal(p), 0);
}

function gameChipsInPlay(g) {
  return Math.max(0, (gameMoneyIn(g) - gameMoneyOut(g)) * (g.chipMult || 1));
}

function playerNetForTable(t, name) {
  return t.games.reduce((s, g) => {
    if (gameChipsInPlay(g) > 0) return s;
    const p = g.players.find(x => x.name === name);
    return s + (p ? playerNet(g, p) : 0);
  }, 0);
}

function playerSettledForTable(t, name) {
  let settled = 0;
  t.payments.forEach(pay => {
    if (pay.status === 'done') {
      if (pay.to === name) settled += pay.amount;
      if (pay.from === name) settled -= pay.amount;
    }
  });
  return settled;
}

function playerPendingForTable(t, name) {
  return playerNetForTable(t, name) - playerSettledForTable(t, name);
}

function allDeltas() {
  const d = [];
  state.tables.forEach(t => {
    t.games.forEach(g => {
      if (gameChipsInPlay(g) > 0) return;
      const p = sessionPlayerForMe(g);
      if (p) d.push({ date: g.date, name: t.name + ' · ' + g.name, delta: playerNet(g, p) });
    });
  });
  return d.sort((a, b) => b.date.localeCompare(a.date));
}

function fmt(n) {
  return (n >= 0 ? '+' : '-') + `$${Math.abs(n).toFixed(0)}`;
}

function fmtAbs(n) {
  return `$${Math.abs(n).toFixed(0)}`;
}

function nowTs() {
  const n = new Date();
  return n.getHours().toString().padStart(2, '0') + ':' + n.getMinutes().toString().padStart(2, '0');
}

function ensureGameActivity(g) {
  if (!g.activity) g.activity = [];
}

function logGameActivity(game, action, detail) {
  ensureGameActivity(game);
  game.activity.unshift({
    ts: new Date().toISOString(),
    action,
    actor: ME,
    detail: detail || ''
  });
}

function formatActivityTs(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function saveNavState() {
  try {
    localStorage.setItem('pl_nav', JSON.stringify({
      page: state.page,
      tableId: state.table?.id || null,
      gameId: state.game?.id || null
    }));
  } catch {}
}

function restoreNavState() {
  try {
    const s = JSON.parse(localStorage.getItem('pl_nav') || 'null');
    if (!s || !s.page) { nav('page-dashboard'); return; }
    if (s.page === 'page-dashboard') { nav('page-dashboard'); return; }
    if (s.page === 'page-tables') { nav('page-tables'); return; }
    if (s.tableId) {
      const tbl = state.tables.find(t => String(t.id) === String(s.tableId));
      if (!tbl) { nav('page-dashboard'); return; }
      if (s.page === 'page-game' && s.gameId) {
        const gm = tbl.games.find(g => String(g.id) === String(s.gameId));
        if (gm) { nav('page-game', s.tableId, s.gameId); return; }
      }
      nav('page-table-info', s.tableId);
      return;
    }
  } catch {}
  nav('page-dashboard');
}

function resolveMemberUserIdByName(table, typedName) {
  const needle = String(typedName || '').trim().toLowerCase();
  if (!needle) return null;
  const rows = tableMembersList(table);
  const hit = rows.find(r => r.displayName.toLowerCase() === needle);
  return hit ? hit.userId : null;
}
