/** Supabase hydrate + mutations (expects global sb + APP_SUPABASE_CONFIGURED from bootstrap). */

var APP_SUPABASE_CONFIGURED =
  typeof window !== 'undefined' && typeof window.APP_SUPABASE_CONFIGURED === 'boolean'
    ? window.APP_SUPABASE_CONFIGURED
    : false;

async function loadProfileFromSession(session) {
  if (!session?.user?.id) return false;
  ME_UID = session.user.id;
  const { data: prof } = await sb.from('profiles').select('*').eq('id', ME_UID).maybeSingle();
  const meta =
    session.user.user_metadata?.display_name != null ?
      String(session.user.user_metadata.display_name || '').trim()
    : '';

  ME =
    (prof?.display_name && String(prof.display_name).trim()) ||
    meta ||
    (session.user.email ? session.user.email.split('@')[0] : '') ||
    'Player';

  if (meta && prof && (!prof.display_name || String(prof.display_name).trim() === '')) {
    await sb.from('profiles').update({ display_name: meta }).eq('id', ME_UID);
    ME = meta;
  }

  refreshMeUi();
  return true;
}

function groupRows(rows) {
  const by = {};
  rows.forEach(r => {
    const k = `${String(r.game_id)}:${String(r.user_id)}`;
    if (!by[k]) by[k] = [];
    const t = new Date(r.logged_at);
    const ts = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
    by[k].push({ amt: Number(r.amount), ts, _sort: new Date(r.logged_at).getTime() });
  });
  Object.values(by).forEach(arr => arr.sort((a, b) => a._sort - b._sort));
  Object.keys(by).forEach(k => { by[k] = by[k].map(({ amt, ts }) => ({ amt, ts })); });
  return by;
}

function groupBuyins(rows) { return groupRows(rows); }

async function hydrateFromSupabase(opts = {}) {
  if (!(APP_SUPABASE_CONFIGURED && window.sb && ME_UID)) return false;
  showLoading();
  try {
  return await _hydrateFromSupabase(opts);
  } finally {
    hideLoading();
  }
}

async function _hydrateFromSupabase(opts = {}) {
  if (!(APP_SUPABASE_CONFIGURED && window.sb && ME_UID)) return false;

  const { data: myRows, error: eMy } = await sb
    .from('table_members')
    .select('table_id,user_id,is_auth,poker_tables(id,name,join_code,code_active,created_by)')
    .eq('user_id', ME_UID);

  if (eMy) {
    showError('Could not load your tables: ' + eMy.message);
    return false;
  }

  const tableMap = {};
  (myRows || []).forEach(r => {
    if (r.poker_tables) tableMap[String(r.table_id)] = r.poker_tables;
  });
  const ids = Object.keys(tableMap);
  if (ids.length === 0) {
    state.tables = [];
    return true;
  }

  const { data: allMembers, error: eMem } = await sb.from('table_members').select('table_id,user_id,is_auth').in('table_id', ids);

  if (eMem) {
    showError('Could not load members: ' + eMem.message);
    return false;
  }

  const userIds = [...new Set((allMembers || []).map(m => String(m.user_id)))];
  const { data: profs } = await sb.from('profiles').select('id,display_name').in('id', userIds);

  const pmap = {};
  (profs || []).forEach(p => {
    pmap[String(p.id)] = (p.display_name && String(p.display_name).trim()) || String(p.id).slice(0, 8);
  });

  const { data: games } = await sb.from('games').select('*').in('table_id', ids).order('created_at', { ascending: false });
  const gameList = games || [];
  const gameIds = gameList.map(g => String(g.id));

  let bis = [], sps = [], gps = [], acts = [], cos = [];
  if (gameIds.length) {
    const [{ data: b }, { data: sp }, { data: gp }, { data: a }, { data: co }] = await Promise.all([
      sb.from('buy_ins').select('*').in('game_id', gameIds),
      sb.from('sponsorships').select('*').in('game_id', gameIds),
      sb.from('game_players').select('*').in('game_id', gameIds),
      sb.from('game_activity').select('*').in('game_id', gameIds),
      sb.from('clearouts').select('*').in('game_id', gameIds)
    ]);
    bis = b || [];
    sps = sp || [];
    gps = gp || [];
    acts = a || [];
    cos = co || [];
  }

  acts.sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
  const buyKey = groupBuyins(bis);
  const clearoutKey = groupRows(cos);

  const { data: pays } = await sb.from('payments').select('*').in('table_id', ids).order('created_at', { ascending: false });

  const hydrated = [];

  for (const tid of ids) {
    const tblRow = tableMap[tid];
    const mrows = (allMembers || []).filter(m => String(m.table_id) === tid);
    const membersMeta = mrows.map(m => ({
      userId: String(m.user_id),
      displayName: pmap[String(m.user_id)] || '?',
      isAuth: !!m.is_auth
    }));

    membersMeta.sort((a, b) => a.displayName.localeCompare(b.displayName));
    const members = membersMeta.map(m => m.displayName);
    const authMembers = membersMeta.filter(m => m.isAuth).map(m => m.displayName);

    const gForTable = gameList.filter(g => String(g.table_id) === tid);
    const builtGames = gForTable.map(g => {
      const gid = String(g.id);
      let rowGps = (gps || []).filter(x => String(x.game_id) === gid);
      const seen = new Set(rowGps.map(x => String(x.user_id)));

      membersMeta.forEach(m => {
        if (!seen.has(m.userId)) {
          rowGps.push({ id: '', game_id: g.id, user_id: m.userId, clearout_amount: null });
          seen.add(m.userId);
        }
      });

      const activity = (acts || [])
        .filter(x => String(x.game_id) === gid)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(ev => ({
          ts: ev.created_at,
          action: ev.action,
          actor: pmap[String(ev.actor_user_id)] || 'Unknown',
          detail: ev.detail || ''
        }));

      rowGps.sort((a, b) =>
        String(pmap[String(a.user_id)] || '?').localeCompare(String(pmap[String(b.user_id)] || '?'))
      );

      const players = rowGps.map(gpRow => {
        const uidStr = String(gpRow.user_id);
        const bk = `${gid}:${uidStr}`;
        const buyArr = buyKey[bk] || [];
        const clearouts = clearoutKey[bk] || [];
        const spon = (sps || [])
          .filter(sp => String(sp.game_id) === gid && String(sp.sponsored_user_id) === uidStr)
          .map(r => {
            const t = new Date(r.logged_at);
            const ts = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`;
            const byName =
              r.sponsor_user_id ? pmap[String(r.sponsor_user_id)] || r.sponsor_name || '?' : r.sponsor_name || '?';
            return { by: byName, amt: Number(r.amount), ts };
          });
        return {
          userId: uidStr,
          name: pmap[uidStr] || '?',
          buyins: buyArr,
          clearouts,
          sponsorships: spon
        };
      });

      return {
        id: g.id,
        name: g.name,
        date: g.session_date,
        defaultBuyin: Number(g.default_buyin),
        chipMult: Number(g.chip_mult),
        peakChips: Number(g.peak_chips || 0),
        activity,
        players
      };
    });

    const payRows = (pays || []).filter(p => String(p.table_id) === tid);
    const payments = payRows.map(p => ({
      id: p.id,
      from_user_id: p.from_user_id,
      to_user_id: p.to_user_id,
      from: pmap[String(p.from_user_id)] || '?',
      to: pmap[String(p.to_user_id)] || '?',
      amount: Number(p.amount),
      ts: p.created_at,
      status: p.status || 'pending'
    }));

    hydrated.push({
      id: tblRow.id,
      name: tblRow.name,
      code: tblRow.join_code,
      codeActive: !!tblRow.code_active,
      createdBy: tblRow.created_by,
      members,
      authMembers,
      _membersRows: membersMeta,
      games: builtGames,
      payments
    });
  }

  state.tables = hydrated.sort((a, b) => a.name.localeCompare(b.name));

  if (opts.keepSelection !== false && (opts.tableId != null || state.table?.id != null)) {
    const wantTid = opts.tableId != null ? opts.tableId : state.table?.id;
    state.table =
      wantTid != null ? state.tables.find(t => String(t.id) === String(wantTid)) || null : state.tables[0] || null;
    const wantGid =
      opts.gameId != null ? opts.gameId : state.game && state.table ? state.game.id : null;
    if (state.table && wantGid != null) {
      state.game = state.table.games.find(g => String(g.id) === String(wantGid)) || null;
    }
  }

  return true;
}

async function ensureRemoteGamePlayers(table, gameRowId) {
  if (!(APP_SUPABASE_CONFIGURED && window.sb && table._membersRows)) return;
  const rows = table._membersRows.map(m => ({ game_id: gameRowId, user_id: m.userId }));
  if (!rows.length) return;
  const { error } = await sb.from('game_players').upsert(rows, { onConflict: 'game_id,user_id' });
  if (error) console.warn('game_players upsert:', error.message);
}

async function persistGamePeakRemote(g) {
  if (!(APP_SUPABASE_CONFIGURED && window.sb)) return;
  await sb.from('games').update({ peak_chips: g.peakChips }).eq('id', g.id);
}

// ── Supabase Realtime ─────────────────────────────────────────────────────────

let _realtimeChannel = null;
let _realtimeDebounce = null;

function subscribeToGameChanges(gameId) {
  if (!APP_SUPABASE_CONFIGURED || !window.sb) return;
  unsubscribeFromGameChanges();
  const filter = `game_id=eq.${gameId}`;
  _realtimeChannel = sb
    .channel(`game-rt-${gameId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'buy_ins',      filter }, _onRemoteGameChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clearouts',    filter }, _onRemoteGameChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sponsorships', filter }, _onRemoteGameChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_activity',filter }, _onRemoteGameChange)
    .subscribe();
}

function unsubscribeFromGameChanges() {
  clearTimeout(_realtimeDebounce);
  if (_realtimeChannel) {
    sb.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

function _onRemoteGameChange() {
  clearTimeout(_realtimeDebounce);
  _realtimeDebounce = setTimeout(async () => {
    if (state.page !== 'page-game' || !state.game || !state.table) return;
    await hydrateFromSupabase({ keepSelection: true, tableId: state.table.id, gameId: state.game.id });
    renderGame();
  }, 400);
}

async function insertActivityRemote(gameId, action, detail) {
  if (!(APP_SUPABASE_CONFIGURED && window.sb && ME_UID)) return null;
  const { data, error } = await sb.from('game_activity').insert({
    game_id: gameId,
    action,
    actor_user_id: ME_UID,
    detail: detail || ''
  }).select('id').single();
  if (error) { console.warn('activity insert:', error.message); return null; }
  return data?.id ?? null;
}
