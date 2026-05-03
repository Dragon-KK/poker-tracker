// ── Undo stack ────────────────────────────────────────────────────────────────
// Keyed by gameId → array of undo entries (LIFO). Lives only for the browser
// session; survives hydrateFromSupabase re-builds since it's not part of state.
const _undoStack = {};

function _gameUndoStack(gameId) {
  if (!_undoStack[String(gameId)]) _undoStack[String(gameId)] = [];
  return _undoStack[String(gameId)];
}
function _pushUndo(gameId, entry) { _gameUndoStack(gameId).push(entry); }
function peekUndo(gameId) {
  const s = _gameUndoStack(gameId);
  return s.length ? s[s.length - 1] : null;
}

async function refreshData() {
  if (APP_SUPABASE_CONFIGURED && window.sb) {
    await hydrateFromSupabase({ keepSelection: true, tableId: state.table?.id, gameId: state.game?.id });
    rerenderBoot();
  } else {
    loadDemoTablesForUser();
    rerenderBoot();
  }
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ── Generic player picker ─────────────────────────────────────────────────────
// openPlayerPickerModal(callback, excludeUserIds) opens the shared picker modal.
// When the user taps a name, callback(userId, displayName) is called and the modal closes.

function openPlayerPickerModal(callback, excludeUserIds) {
  state._pickerCallback = callback;
  state._pickerExclude = excludeUserIds || [];
  document.getElementById('player-picker-search').value = '';
  renderPlayerPickerList('');
  openModal('modal-player-picker');
}

function renderPlayerPickerList(filter) {
  const t = state.table;
  if (!t) return;
  const members = tableMembersList(t);
  const exclude = state._pickerExclude || [];
  const q = (filter || '').toLowerCase();
  const filtered = members
    .filter(m => !exclude.includes(m.userId))
    .filter(m => !q || m.displayName.toLowerCase().includes(q));
  document.getElementById('player-picker-list').innerHTML = filtered.length
    ? filtered
        .map(
          m =>
            `<div class="player-pick-row" onclick="selectPlayerFromPicker('${escapeJsSingleQuoted(m.userId)}','${escapeJsSingleQuoted(m.displayName)}')">
              <div class="pick-name">${escapeHtml(m.displayName)}</div>
            </div>`
        )
        .join('')
    : '<div class="empty-state" style="padding:16px;font-size:12px">No players found</div>';
}

function filterPlayerPicker() {
  renderPlayerPickerList(document.getElementById('player-picker-search').value);
}

function selectPlayerFromPicker(userId, displayName) {
  if (state._pickerCallback) {
    state._pickerCallback(userId, displayName);
    state._pickerCallback = null;
  }
  closeModal('modal-player-picker');
}

// ── Buy-in ────────────────────────────────────────────────────────────────────

function openBuyin(idx) {
  state.modalBuyin = idx;
  const g = state.game;
  document.getElementById('buyin-label').textContent = 'Player: ' + g.players[idx].name;
  document.getElementById('buyin-amount').value = g.defaultBuyin || 100;
  openModal('modal-add-buyin');
}

function confirmBuyin() {
  (async () => {
    const amt = parseFloat(document.getElementById('buyin-amount').value);
    if (!amt || amt <= 0) return;
    const player = state.game.players[state.modalBuyin];

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const { error: e1 } = await sb.from('buy_ins').insert({
        game_id: state.game.id,
        user_id: player.userId,
        amount: amt
      });
      if (e1) { showError(e1.message); return; }
      await insertActivityRemote(state.game.id, 'Buy-in', `${player.name} · ${fmtAbs(amt)}`);
      _pushUndo(state.game.id, { type: 'buyin', label: `Buy-in · ${player.name} · ${fmtAbs(amt)}`, playerUserId: player.userId });
      await hydrateFromSupabase({ keepSelection: true, tableId: state.table.id, gameId: state.game.id });
      updateGamePot();
      await persistGamePeakRemote(state.game);
      closeModal('modal-add-buyin');
      renderGame();
      return;
    }

    const gameId = state.game.id;
    player.buyins.push({ amt, ts: nowTs() });
    logGameActivity(state.game, 'Buy-in', `${player.name} · ${fmtAbs(amt)}`);
    _pushUndo(gameId, { type: 'buyin', label: `Buy-in · ${player.name} · ${fmtAbs(amt)}`, playerUserId: player.userId });
    persistDemoTables();
    closeModal('modal-add-buyin');
    renderGame();
  })();
}

// ── Clearout (input is chips; stored as money = chips / chipMult) ─────────────

function maxClearoutChips(g) {
  return gameChipsInPlay(g);
}

function openClearout(idx) {
  state.modalClearout = idx;
  const g = state.game;
  const player = g.players[idx];
  document.getElementById('clearout-label').textContent = 'Player: ' + player.name;
  const mult = g.chipMult || 1;
  const maxChips = Math.round(maxClearoutChips(g));
  document.getElementById('clearout-mult-hint').textContent =
    `Chip mult: ${mult}×  ·  Max: ${maxChips} chips  ·  chips ÷ ${mult} = $`;
  const clearoutInput = document.getElementById('clearout-amount');
  clearoutInput.min = '0';
  clearoutInput.max = String(maxChips);
  clearoutInput.value = '';
  openModal('modal-clearout');
}

function confirmClearout() {
  (async () => {
    const chips = parseFloat(document.getElementById('clearout-amount').value);
    if (isNaN(chips) || chips < 0) return;
    const g = state.game;
    const max = maxClearoutChips(g);
    if (chips > max + 0.001) {
      showError(`Cannot clear out ${Math.round(chips)} chips — only ${Math.round(max)} chips are in play.`);
      return;
    }
    const mult = g.chipMult || 1;
    const amt = chips / mult;
    const player = g.players[state.modalClearout];
    const detail = `${player.name} · ${Math.round(chips)} chips → ${fmtAbs(amt)}`;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const { error } = await sb.from('clearouts').insert({
        game_id: g.id,
        user_id: player.userId,
        amount: amt
      });
      if (error) { showError(error.message); return; }
      await insertActivityRemote(g.id, 'Clearout', detail);
      _pushUndo(g.id, { type: 'clearout', label: `Clearout · ${detail}`, playerUserId: player.userId });
      await hydrateFromSupabase({ keepSelection: true, tableId: state.table.id, gameId: g.id });
      updateGamePot();
      closeModal('modal-clearout');
      renderGame();
      return;
    }

    const gameId = g.id;
    player.clearouts.push({ amt, ts: nowTs() });
    logGameActivity(g, 'Clearout', detail);
    _pushUndo(gameId, { type: 'clearout', label: `Clearout · ${detail}`, playerUserId: player.userId });
    persistDemoTables();
    closeModal('modal-clearout');
    renderGame();
  })();
}

// ── Sponsorship ───────────────────────────────────────────────────────────────

function openSponsor(idx) {
  state.modalSponsor = idx;
  state._sponsorSelected = null;
  const display = document.getElementById('sponsor-by-display');
  display.textContent = 'Tap to select sponsor →';
  display.style.color = 'var(--muted)';
  document.getElementById('sponsor-label').textContent = 'Sponsoring: ' + state.game.players[idx].name;
  document.getElementById('sponsor-amount').value = '';
  openModal('modal-sponsorship');
}

function openSponsorPickerModal() {
  // Exclude the sponsored player so they can't sponsor themselves
  const sponsored = state.game.players[state.modalSponsor];
  const excludeIds = sponsored ? [sponsored.userId] : [];
  openPlayerPickerModal((userId, displayName) => {
    state._sponsorSelected = { userId, displayName };
    const display = document.getElementById('sponsor-by-display');
    display.textContent = displayName;
    display.style.color = 'var(--text)';
  }, excludeIds);
}

function confirmSponsorship() {
  (async () => {
    if (!state._sponsorSelected) {
      showError('Please select a sponsor first.');
      return;
    }
    const { userId: sponsorUserId, displayName: by } = state._sponsorSelected;
    const amt = parseFloat(document.getElementById('sponsor-amount').value);
    if (!amt || amt <= 0) { showError('Enter a valid amount.'); return; }
    const sponsored = state.game.players[state.modalSponsor];

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const isNameRef = String(sponsorUserId).startsWith('name:');
      const sponsor_user_id = isNameRef ? null : sponsorUserId;
      const sponsor_name = isNameRef ? by : null;

      const { error: e1 } = await sb.from('buy_ins').insert({
        game_id: state.game.id,
        user_id: sponsored.userId,
        amount: amt
      });
      if (e1) { showError(e1.message); return; }

      const { error: e2 } = await sb.from('sponsorships').insert({
        game_id: state.game.id,
        sponsored_user_id: sponsored.userId,
        sponsor_user_id,
        sponsor_name,
        amount: amt
      });
      if (e2) { showError(e2.message); return; }

      await insertActivityRemote(state.game.id, 'Sponsorship', `${sponsored.name} · ${fmtAbs(amt)} via ${by}`);
      _pushUndo(state.game.id, { type: 'sponsorship', label: `Sponsorship · ${sponsored.name} · ${fmtAbs(amt)} via ${by}`, playerUserId: sponsored.userId });
      await hydrateFromSupabase({ keepSelection: true, tableId: state.table.id, gameId: state.game.id });
      updateGamePot();
      await persistGamePeakRemote(state.game);
      state._sponsorSelected = null;
      closeModal('modal-sponsorship');
      renderGame();
      return;
    }

    const ts = nowTs();
    const gameId = state.game.id;
    sponsored.sponsorships.push({ by, amt, ts });
    sponsored.buyins.push({ amt, ts });
    logGameActivity(state.game, 'Sponsorship', `${sponsored.name} · ${fmtAbs(amt)} via ${by}`);
    _pushUndo(gameId, { type: 'sponsorship', label: `Sponsorship · ${sponsored.name} · ${fmtAbs(amt)} via ${by}`, playerUserId: sponsored.userId });
    state._sponsorSelected = null;
    persistDemoTables();
    closeModal('modal-sponsorship');
    renderGame();
  })();
}

// ── Tables ────────────────────────────────────────────────────────────────────

function createTable() {
  (async () => {
    const name = document.getElementById('new-table-name').value.trim();
    if (!name) return;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const { data: tid, error } = await sb.rpc('rpc_create_table', { p_name: name });
      if (error) { showError(error.message || 'Could not create table'); return; }
      document.getElementById('new-table-name').value = '';
      closeModal('modal-create-table');
      await hydrateFromSupabase({ keepSelection: false });
      if (tid) nav('page-table-info', tid);
      else nav('page-tables');
      return;
    }

    const newTable = {
      id: 'local-' + Date.now(),
      name,
      code: genCode(),
      codeActive: false,
      createdBy: ME_UID,
      members: [ME],
      authMembers: [ME],
      _membersRows: [{ userId: ME_UID, displayName: ME, isAuth: true }],
      games: [],
      payments: []
    };
    state.tables.push(newTable);
    persistDemoTables();
    document.getElementById('new-table-name').value = '';
    closeModal('modal-create-table');
    renderTables();
  })();
}

function joinTable() {
  (async () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) return;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const { data: tid, error } = await sb.rpc('rpc_join_table', { p_code: code });
      if (error) { showError(error.message || 'Could not join table'); return; }
      document.getElementById('join-code').value = '';
      closeModal('modal-join-table');
      await hydrateFromSupabase({ keepSelection: false });
      if (tid) nav('page-table-info', tid);
      else nav('page-tables');
      return;
    }

    // Local mode: search the global localStorage store (shared across accounts on same device)
    const all = getDemoTablesRaw();
    const t = all.find(x => x.code === code && x.codeActive === true);
    if (!t) {
      showError('Table not found or join code is not active.');
      return;
    }
    const alreadyMember = (t._membersRows || []).some(m => m.userId === ME_UID);
    if (alreadyMember) {
      showError('You are already in this table!');
      return;
    }
    if (!t._membersRows) t._membersRows = [];
    t._membersRows.push({ userId: ME_UID, displayName: ME, isAuth: false });
    if (!t.members) t.members = [];
    t.members.push(ME);

    const idx = all.findIndex(x => x.id === t.id);
    if (idx >= 0) all[idx] = t;
    saveDemoTablesRaw(all);
    loadDemoTablesForUser();

    document.getElementById('join-code').value = '';
    closeModal('modal-join-table');
    renderTables();
  })();
}

// ── Join code management ──────────────────────────────────────────────────────

function generateTableCode() {
  (async () => {
    const t = state.table;
    if (!isTableCreator(t)) { showError('Only the table creator can manage join codes.'); return; }

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const { error } = await sb.rpc('rpc_generate_table_code', { p_table_id: t.id });
      if (error) { showError(error.message); return; }
      await hydrateFromSupabase({ keepSelection: true, tableId: t.id });
      renderTableInfo();
      return;
    }

    t.code = genCode();
    t.codeActive = true;
    persistDemoTables();
    renderTableInfo();
  })();
}

function deactivateTableCode() {
  (async () => {
    const t = state.table;
    if (!isTableCreator(t)) { showError('Only the table creator can manage join codes.'); return; }

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const { error } = await sb.rpc('rpc_deactivate_table_code', { p_table_id: t.id });
      if (error) { showError(error.message); return; }
      await hydrateFromSupabase({ keepSelection: true, tableId: t.id });
      renderTableInfo();
      return;
    }

    t.codeActive = false;
    persistDemoTables();
    renderTableInfo();
  })();
}

// ── Games ─────────────────────────────────────────────────────────────────────

function openNewGameModal() {
  const t = state.table;
  const num = t ? t.games.length + 1 : 1;
  document.getElementById('new-game-name').value = `Session #${num}`;
  openModal('modal-new-game');
}

function createGame() {
  (async () => {
    const name = document.getElementById('new-game-name').value.trim();
    if (!name) return;
    const t = state.table;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const iso = new Date().toISOString().slice(0, 10);
      const { data: row, error } = await sb.from('games').insert({
        table_id: t.id,
        name,
        session_date: iso,
        default_buyin: 100,
        chip_mult: 10,
        peak_chips: 0
      }).select('*').single();
      if (error) { showError(error.message); return; }
      document.getElementById('new-game-name').value = '';
      closeModal('modal-new-game');
      await ensureRemoteGamePlayers(t, row.id);
      await hydrateFromSupabase({ keepSelection: true, tableId: t.id, gameId: row.id });
      nav('page-game', t.id, row.id);
      return;
    }

    const newGame = {
      id: 'local-game-' + Date.now(),
      name,
      date: new Date().toISOString().slice(0, 10),
      defaultBuyin: 100,
      chipMult: 10,
      peakChips: 0,
      activity: [],
      players: []
    };
    t.games.unshift(newGame);
    persistDemoTables();
    document.getElementById('new-game-name').value = '';
    closeModal('modal-new-game');
    state.game = newGame;
    nav('page-game', t.id, newGame.id);
  })();
}

// ── Payments ──────────────────────────────────────────────────────────────────

function openPaymentModal() {
  state._paymentSelected = { from: null, to: null };
  const fromD = document.getElementById('pay-from-display');
  const toD = document.getElementById('pay-to-display');
  if (fromD) { fromD.textContent = 'Tap to select player →'; fromD.style.color = 'var(--muted)'; }
  if (toD) { toD.textContent = 'Tap to select player →'; toD.style.color = 'var(--muted)'; }
  document.getElementById('pay-amount').value = '';
  openModal('modal-add-payment');
}

function openPaymentPickerModal(field) {
  // Exclude the already-selected other side to prevent self-payment
  const other = field === 'from'
    ? state._paymentSelected?.to?.userId
    : state._paymentSelected?.from?.userId;
  const excludeIds = other ? [other] : [];
  openPlayerPickerModal((userId, displayName) => {
    if (!state._paymentSelected) state._paymentSelected = {};
    state._paymentSelected[field] = { userId, displayName };
    const display = document.getElementById(`pay-${field}-display`);
    if (display) { display.textContent = displayName; display.style.color = 'var(--text)'; }
  }, excludeIds);
}

function addPayment() {
  (async () => {
    const sel = state._paymentSelected || {};
    const fromData = sel.from;
    const toData = sel.to;
    const amount = parseFloat(document.getElementById('pay-amount').value);
    if (!fromData || !toData) { showError('Select both players.'); return; }
    if (!amount || amount <= 0) { showError('Enter a valid amount.'); return; }

    const t = state.table;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const fromId = fromData.userId;
      const toId = toData.userId;
      if (String(fromId).startsWith('name:') || String(toId).startsWith('name:')) {
        showError('Use exact profile names listed on this table.');
        return;
      }
      const { error } = await sb.from('payments').insert({
        table_id: t.id,
        from_user_id: fromId,
        to_user_id: toId,
        amount,
        status: 'pending'
      });
      if (error) { showError(error.message); return; }
      state._paymentSelected = null;
      document.getElementById('pay-amount').value = '';
      closeModal('modal-add-payment');
      await hydrateFromSupabase({ keepSelection: true, tableId: t.id });
      renderTableInfo();
      return;
    }

    t.payments.push({
      id: 'local-pay-' + Date.now(),
      from: fromData.displayName,
      to: toData.displayName,
      amount,
      ts: new Date().toISOString().slice(0, 16).replace('T', ' '),
      status: 'pending'
    });
    state._paymentSelected = null;
    document.getElementById('pay-amount').value = '';
    persistDemoTables();
    closeModal('modal-add-payment');
    renderTableInfo();
  })();
}

function settlePayment(paymentId) {
  (async () => {
    const t = state.table;
    const payRow = (t?.payments || []).find(p => p.id === paymentId);
    if (!payRow || payRow.status !== 'pending') return;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const can =
        isAuth(t) || payRow.from === ME || payRow.to === ME || payRow.from_user_id === ME_UID || payRow.to_user_id === ME_UID;
      if (!can) { showError('Not allowed.'); return; }
      const { error } = await sb.from('payments').update({ status: 'done' }).eq('id', paymentId);
      if (error) { showError(error.message); return; }
      await hydrateFromSupabase({ keepSelection: true, tableId: t.id });
      renderTableInfo();
      return;
    }

    payRow.status = 'done';
    persistDemoTables();
    renderTableInfo();
  })();
}

// ── Promote / Demote ──────────────────────────────────────────────────────────

function promotePlayer(targetUserRef) {
  (async () => {
    const t = state.table;
    const ref = typeof targetUserRef === 'undefined' ? '' : targetUserRef;

    if (!(APP_SUPABASE_CONFIGURED && window.sb)) {
      const name = String(ref).startsWith('name:') ? String(ref).slice(5) : String(ref);
      if (!t.authMembers.includes(name)) t.authMembers.push(name);
      const row = (t._membersRows || []).find(m => m.userId === ref);
      if (row) row.isAuth = true;
      persistDemoTables();
      renderTableInfo();
      return;
    }

    const { error } = await sb.rpc('rpc_promote_member', { p_table_id: t.id, p_user_id: ref });
    if (error) { showError(error.message); return; }
    await hydrateFromSupabase({ keepSelection: true, tableId: t.id });
    renderTableInfo();
  })();
}

function demotePlayer(targetUserRef) {
  (async () => {
    const t = state.table;
    const ref = typeof targetUserRef === 'undefined' ? '' : targetUserRef;

    if (!(APP_SUPABASE_CONFIGURED && window.sb)) {
      const name = String(ref).startsWith('name:') ? String(ref).slice(5) : String(ref);
      if (t.authMembers) {
        const idx = t.authMembers.indexOf(name);
        if (idx >= 0) t.authMembers.splice(idx, 1);
      }
      const row = (t._membersRows || []).find(m => m.userId === ref);
      if (row) row.isAuth = false;
      persistDemoTables();
      renderTableInfo();
      return;
    }

    const { error } = await sb.rpc('rpc_demote_member', { p_table_id: t.id, p_user_id: ref });
    if (error) { showError(error.message); return; }
    await hydrateFromSupabase({ keepSelection: true, tableId: t.id });
    renderTableInfo();
  })();
}

// ── Undo last game action ─────────────────────────────────────────────────────

function undoLastGameAction() {
  (async () => {
    const g = state.game;
    if (!g) return;
    const stack = _gameUndoStack(g.id);
    const entry = stack.pop();
    if (!entry) return;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      showLoading();
      try {
        const gid = g.id;
        const uid = entry.playerUserId;

        // Sponsorship: remove the sponsorship row first (FK dependency), then the buyin
        if (entry.type === 'sponsorship') {
          const { data: sp } = await sb.from('sponsorships')
            .select('id').eq('game_id', gid).eq('sponsored_user_id', uid)
            .order('logged_at', { ascending: false }).limit(1).maybeSingle();
          if (sp) {
            const { error } = await sb.from('sponsorships').delete().eq('id', sp.id);
            if (error) { showError(error.message); stack.push(entry); return; }
          }
        }

        if (entry.type === 'buyin' || entry.type === 'sponsorship') {
          const { data: bi } = await sb.from('buy_ins')
            .select('id').eq('game_id', gid).eq('user_id', uid)
            .order('logged_at', { ascending: false }).limit(1).maybeSingle();
          if (bi) {
            const { error } = await sb.from('buy_ins').delete().eq('id', bi.id);
            if (error) { showError(error.message); stack.push(entry); return; }
          }
        }

        if (entry.type === 'clearout') {
          const { data: co } = await sb.from('clearouts')
            .select('id').eq('game_id', gid).eq('user_id', uid)
            .order('logged_at', { ascending: false }).limit(1).maybeSingle();
          if (co) {
            const { error } = await sb.from('clearouts').delete().eq('id', co.id);
            if (error) { showError(error.message); stack.push(entry); return; }
          }
        }

        // Remove the matching activity entry for this user
        const { data: act } = await sb.from('game_activity')
          .select('id').eq('game_id', gid).eq('actor_user_id', ME_UID)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (act) await sb.from('game_activity').delete().eq('id', act.id);
      } finally {
        hideLoading();
      }
      await hydrateFromSupabase({ keepSelection: true, tableId: state.table.id, gameId: g.id });
      if (state.game) await persistGamePeakRemote(state.game);
      renderGame();
      return;
    }

    // Local mode
    const player = g.players.find(p => p.userId === entry.playerUserId);
    if (player) {
      if (entry.type === 'buyin') {
        player.buyins.pop();
      } else if (entry.type === 'clearout') {
        player.clearouts.pop();
      } else if (entry.type === 'sponsorship') {
        player.sponsorships.pop();
        player.buyins.pop();
      }
    }
    if (g.activity && g.activity.length) g.activity.shift();
    persistDemoTables();
    renderGame();
  })();
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvEscape(val) {
  const s = String(val === null || val === undefined ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportGamesCsv() {
  const t = state.table;
  if (!t) return;
  const players = tableMembersList(t).map(m => m.displayName);
  const completedGames = t.games.filter(g => gameMoneyIn(g) > 0 && gameChipsInPlay(g) === 0);
  if (!completedGames.length) { showError('No completed games to export.'); return; }

  const rows = [['Date', 'Game', ...players]];
  completedGames.forEach(g => {
    const cells = players.map(name => {
      const p = g.players.find(x => x.name === name);
      return (p && playerBuyinTotal(p) > 0) ? Math.round(playerNet(g, p)) : '';
    });
    rows.push([g.date, g.name, ...cells]);
  });
  rows.push(['Net P&L', '', ...players.map(name => Math.round(playerNetForTable(t, name)))]);

  downloadCsv(rows.map(r => r.map(csvEscape).join(',')).join('\n'), `${t.name}_games.csv`);
}

function exportSettlementsCsv() {
  const t = state.table;
  if (!t) return;
  const players = tableMembersList(t).map(m => m.displayName);

  const rows = [['Date', 'Description', ...players]];
  t.payments.forEach(p => {
    const cells = players.map(() => '');
    const fi = players.indexOf(p.from);
    const ti = players.indexOf(p.to);
    if (fi >= 0) cells[fi] = Math.round(-p.amount);
    if (ti >= 0) cells[ti] = Math.round(p.amount);
    const date = p.ts ? String(p.ts).slice(0, 10) : '';
    rows.push([date, `${p.from} → ${p.to} (${p.status === 'done' ? 'settled' : 'pending'})`, ...cells]);
  });
  rows.push(['Net Settled', '', ...players.map(name => Math.round(playerSettledForTable(t, name)))]);

  downloadCsv(rows.map(r => r.map(csvEscape).join(',')).join('\n'), `${t.name}_settlements.csv`);
}
