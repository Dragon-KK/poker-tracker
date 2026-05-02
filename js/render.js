let chartInst = null;

function nav(pageId, tableId, gameId) {
  if (!document.body.classList.contains('app-authenticated')) return;

  let nextTable = state.table;
  let nextGame = state.game;

  if (tableId !== undefined) {
    const tbl = state.tables.find(t => String(t.id) === String(tableId));
    if (!tbl) { showError('Could not open that table.'); return; }
    nextTable = tbl;
    nextGame = gameId !== undefined ? nextGame : null;
  }
  if (gameId !== undefined) {
    const tbl = nextTable;
    if (!tbl) { showError('Pick a table first.'); return; }
    const gm = tbl.games.find(g => String(g.id) === String(gameId));
    if (!gm) { showError('Could not open that game.'); return; }
    nextTable = tbl;
    nextGame = gm;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  state.page = pageId;
  state.table = nextTable;
  state.game = nextGame;

  renderNav();
  if (pageId === 'page-dashboard') renderDashboard();
  if (pageId === 'page-tables') renderTables();
  if (pageId === 'page-table-info') renderTableInfo();
  if (pageId === 'page-game') renderGame();
  saveNavState();
}

function renderNav() {
  const w = document.getElementById('nav-back-wrap');
  const targets = { 'page-tables': 'page-dashboard', 'page-table-info': 'page-tables', 'page-game': 'page-table-info' };
  if (state.page === 'page-dashboard') w.innerHTML = '';
  else w.innerHTML = `<button class="nav-back" onclick="nav('${targets[state.page]}')">← Back</button>`;
}

function renderDashboard() {
  const deltas = allDeltas();
  const total = deltas.reduce((s, d) => s + d.delta, 0);
  const el = document.getElementById('dash-total');
  el.textContent = fmt(total);
  el.className = 'graph-total ' + (total >= 0 ? 'pos' : 'neg');
  document.getElementById('dash-sessions').textContent = deltas.length;
  document.getElementById('dash-tables').textContent = state.tables.length;
  const wins = deltas.filter(d => d.delta > 0).length;
  document.getElementById('dash-winrate').textContent = deltas.length ? Math.round((wins / deltas.length) * 100) + '%' : '—';

  const sorted = [...deltas].reverse();
  let run = 0;
  const cumulative = sorted.map(d => { run += d.delta; return run; });
  const ctx = document.getElementById('pnl-chart').getContext('2d');
  if (chartInst) chartInst.destroy();
  chartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sorted.map(d => d.date.slice(5)),
      datasets: [{
        data: cumulative,
        borderColor: '#4db84d',
        backgroundColor: 'rgba(77,184,77,0.07)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#4db84d',
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `$${c.raw}` } }
      },
      scales: {
        x: { ticks: { color: '#8a9e8a', font: { family: 'DM Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.03)' } },
        y: { ticks: { color: '#8a9e8a', font: { family: 'DM Mono', size: 10 }, callback: v => `$${v}` }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

  document.getElementById('dash-deltas').innerHTML = deltas
    .slice(0, 5)
    .map(d =>
      `<div class="delta-row"><div><div class="delta-date">${escapeHtml(d.date)}</div><div class="delta-name">${escapeHtml(d.name)}</div></div><div class="delta-amt ${d.delta >= 0 ? 'pos' : 'neg'}">${fmt(d.delta)}</div></div>`
    )
    .join('');

  document.getElementById('dash-tables-list').innerHTML = state.tables
    .map(t =>
      `<div class="table-card" role="button" tabindex="0" onclick="nav('page-table-info','${escapeJsSingleQuoted(t.id)}')"><div class="card-name">${escapeHtml(t.name)}${isAuth(t) ? '<span class="tag-auth">auth</span>' : ''}</div><div class="card-meta"><div class="card-badge">${t.members.length} players · ${t.games.length} games</div><div class="pnl ${playerNetForTable(t, ME) >= 0 ? 'pos' : 'neg'}">${fmt(playerNetForTable(t, ME))}</div></div></div>`
    )
    .join('');
}

function renderTables() {
  document.getElementById('tables-list').innerHTML = state.tables
    .map(t =>
      `<div class="table-card" role="button" tabindex="0" onclick="nav('page-table-info','${escapeJsSingleQuoted(t.id)}')"><div class="card-name">${escapeHtml(t.name)}${isAuth(t) ? '<span class="tag-auth">auth</span>' : ''}</div><div class="card-meta"><div class="card-badge">${t.members.map(escapeHtml).join(', ')}</div><div class="pnl ${playerNetForTable(t, ME) >= 0 ? 'pos' : 'neg'}">${fmt(playerNetForTable(t, ME))}</div></div></div>`
    )
    .join('');
}

function renderTableInfo() {
  const t = state.table;
  if (!t) return;
  const authLbl = Array.isArray(t.authMembers) && t.authMembers.length ? t.authMembers.join(', ') : 'none';
  document.getElementById('ti-name').textContent = t.name;
  document.getElementById('ti-sub').textContent = `${t.members.length} players · ${authLbl} are auth`;
  document.getElementById('ti-games-count').textContent = t.games.length;
  const totalPot = t.games.reduce((s, g) => s + gameMoneyIn(g), 0);
  document.getElementById('ti-pot-total').textContent = fmtAbs(totalPot);
  const mn = playerNetForTable(t, ME);
  const mnEl = document.getElementById('ti-mynet');
  mnEl.textContent = fmt(mn);
  mnEl.className = 'stat-val ' + (mn >= 0 ? 'pos' : 'neg');

  // ── Code management section ──────────────────────────────────────────────
  const isCreator = isTableCreator(t);
  let codeHtml;
  if (isCreator) {
    if (t.codeActive) {
      codeHtml = `<div class="code-display">
        <div>
          <div class="code-lbl">Active Join Code</div>
          <div class="code-val">${escapeHtml(t.code || '—')}</div>
        </div>
        <button class="btn-sm" onclick="deactivateTableCode()" style="flex-shrink:0">Deactivate</button>
      </div>`;
    } else {
      codeHtml = `<div class="code-display code-display-inactive">
        <div>
          <div class="code-lbl">Join Code</div>
          <div style="font-size:11px;color:var(--muted);margin-top:3px">No active code — players cannot join</div>
        </div>
        <button class="btn-sm" onclick="generateTableCode()" style="flex-shrink:0">Generate Code</button>
      </div>`;
    }
  } else {
    if (t.codeActive) {
      codeHtml = `<div class="code-display">
        <div>
          <div class="code-lbl">Table Join Code</div>
          <div class="code-val">${escapeHtml(t.code || '—')}</div>
        </div>
        <div style="font-size:10px;color:var(--muted)">Share with players</div>
      </div>`;
    } else {
      codeHtml = `<div class="code-display code-display-inactive">
        <div style="font-size:11px;color:var(--muted)">No active join code — contact the table creator</div>
      </div>`;
    }
  }
  document.getElementById('ti-code-section').innerHTML = codeHtml;

  // ── New game button ────────────────────────────────────────────────────────
  document.getElementById('ti-auth-new-game').innerHTML = isAuth(t)
    ? `<button class="big-btn green" onclick="openNewGameModal()" style="margin-bottom:14px">+ New Game</button>`
    : '';

  // ── Players list ──────────────────────────────────────────────────────────
  const roster = tableMembersList(t);
  document.getElementById('ti-players-list').innerHTML = roster
    .map(m => {
      const name = m.displayName;
      const net = playerNetForTable(t, name);
      const settled = playerSettledForTable(t, name);
      const pending = playerPendingForTable(t, name);
      const isAuthMember = m.isAuth;
      // Creator can demote any auth member who isn't themselves
      const canDemote = isCreator && isAuthMember && m.userId !== (t.createdBy || '');
      // Any auth member can promote non-auth members
      const canPromote = isAuth(t) && !isAuthMember;

      let corner = '';
      if (isAuthMember) {
        const demoteBtn = canDemote
          ? `<button type="button" class="corner-btn demote-btn" onclick="demotePlayer('${escapeJsSingleQuoted(m.userId)}')" title="Demote" aria-label="Demote">✕</button>`
          : '';
        corner = `<span class="corner-badge" title="Authorized">auth</span>${demoteBtn}`;
      } else if (canPromote) {
        corner = `<button type="button" class="corner-btn" onclick="promotePlayer('${escapeJsSingleQuoted(m.userId)}')" title="Promote to auth" aria-label="Promote to auth">★</button>`;
      }

      return `<div class="player-entry">
      <div class="player-corner">${corner}</div>
      <div class="player-entry-head">
        <div class="player-entry-name">${escapeHtml(name)}</div>
      </div>
      <div class="player-money-row">
        <div class="money-pill"><div class="money-pill-val ${net >= 0 ? 'pos' : 'neg'}">${fmt(net)}</div><div class="money-pill-lbl">Net P&L</div></div>
        <div class="money-pill"><div class="money-pill-val ${settled >= 0 ? 'pos' : 'neg'}">${fmt(settled)}</div><div class="money-pill-lbl">Settled</div></div>
        <div class="money-pill"><div class="money-pill-val ${pending === 0 ? '' : pending > 0 ? 'pos' : 'neg'}">${pending === 0 ? '$0' : fmt(pending)}</div><div class="money-pill-lbl">Pending</div></div>
      </div>
    </div>`;
    })
    .join('');

  // ── Games list ─────────────────────────────────────────────────────────────
  const maxPot = Math.max(...t.games.map(g => gameMoneyIn(g)), 1);
  document.getElementById('ti-games-list').innerHTML = t.games
    .map(g => {
      const pot = gameMoneyIn(g);
      const myP = sessionPlayerForMe(g);
      const isLive = gameChipsInPlay(g) > 0;
      const myN = (myP && !isLive) ? playerNet(g, myP) : null;
      return `<div class="game-card" role="button" tabindex="0" onclick="nav('page-game','${escapeJsSingleQuoted(t.id)}','${escapeJsSingleQuoted(g.id)}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <div>
          <div style="display:flex;align-items:center;gap:6px">
            <div style="font-family:var(--font-head);font-size:14px">${escapeHtml(g.name)}</div>
            ${isLive ? '<span class="badge-live">live</span>' : ''}
          </div>
          <div style="font-size:10px;color:var(--muted)">${escapeHtml(g.date)}</div>
        </div>
        <div style="text-align:right"><div class="pnl ${myN !== null && myN >= 0 ? 'pos' : 'neg'}">${myN !== null ? fmt(myN) : '—'}</div><div style="font-size:9px;color:var(--muted)">my net</div></div>
      </div>
      <div style="font-size:10px;color:var(--muted)">${g.players.map(p => escapeHtml(p.name)).join(', ')} · Pot ${fmtAbs(pot)}</div>
      <div class="pot-bar"><div class="pot-fill" style="width:${Math.round((pot / maxPot) * 100)}%"></div></div>
    </div>`;
    })
    .join('');

  // ── Payments list ──────────────────────────────────────────────────────────
  document.getElementById('ti-add-pay-btn').style.display = isAuth(t) ? '' : 'none';
  const pl = document.getElementById('ti-payments-list');
  if (t.payments.length === 0) {
    pl.innerHTML = '<div class="empty-state">No payments yet</div>';
    return;
  }
  pl.innerHTML = t.payments
    .map(p => `<div class="payment-card">
    <div class="pay-row">
      <div style="font-size:12px">${escapeHtml(p.from)} <span style="color:var(--muted)">→</span> ${escapeHtml(p.to)}</div>
      <div class="pay-amt">${fmtAbs(p.amount)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:7px">
      <div><span class="pay-status ${p.status}">${p.status === 'done' ? 'Settled' : 'Pending'}</span><div style="font-size:9px;color:var(--muted);margin-top:3px">${escapeHtml(String(p.ts))}</div></div>
      ${p.status === 'pending' && paymentCanSettle(t, p) ? `<button class="settle-btn" onclick="settlePayment('${escapeJsSingleQuoted(p.id)}')">Mark Settled</button>` : ''}
    </div>
  </div>`)
    .join('');
}

function paymentCanSettle(t, p) {
  if (!p || !p.id) return false;
  if (isAuth(t)) return true;
  return p.from === ME || p.to === ME;
}

function updateGamePot() {
  const g = state.game;
  const moneyIn = gameMoneyIn(g);
  const moneyOut = gameMoneyOut(g);
  const mult = g.chipMult || 1;
  const chipsInPlay = Math.max(0, (moneyIn - moneyOut) * mult);
  document.getElementById('game-money-in').textContent = fmtAbs(moneyIn);
  document.getElementById('game-chips').textContent = Math.round(chipsInPlay);
}

function renderActivityLog() {
  const g = state.game;
  ensureGameActivity(g);
  const el = document.getElementById('game-activity-log');
  if (!g.activity.length) {
    el.innerHTML = '<div class="empty-state" style="padding:14px;font-size:11px">No activity yet</div>';
    return;
  }
  el.innerHTML = g.activity
    .map(a =>
      `<div class="activity-row">
      <div class="activity-time">${escapeHtml(formatActivityTs(a.ts))}</div>
      <div class="activity-main"><span class="activity-action">${escapeHtml(a.action)}</span>${a.detail ? ` · ${escapeHtml(a.detail)}` : ''}</div>
      <div class="activity-actor">${escapeHtml(a.actor)}</div>
    </div>`
    )
    .join('');
}

function renderGame() {
  const t = state.table;
  const g = state.game;
  if (!t || !g) return;
  ensureGameActivity(g);
  document.getElementById('game-title').textContent = g.name;
  document.getElementById('game-date').textContent = g.date;

  const canEdit = isAuth(t);

  const settingsBarEl = document.getElementById('game-settings-bar');
  if (canEdit) {
    settingsBarEl.innerHTML = `<div class="settings-bar">
      <div class="settings-field">
        <div class="settings-lbl">Default Buy-in ($)</div>
        <input class="settings-input" type="number" value="${g.defaultBuyin || 100}" id="setting-buyin" onchange="g_updateSettings()">
      </div>
      <div class="settings-field">
        <div class="settings-lbl">Chip Multiplier</div>
        <input class="settings-input" type="number" value="${g.chipMult || 10}" id="setting-mult" onchange="g_updateSettings()">
      </div>
    </div>`;
  } else {
    settingsBarEl.innerHTML = `<div class="settings-bar"><div class="settings-field"><div class="settings-lbl">Default Buy-in</div><div style="color:var(--text);font-size:13px">${fmtAbs(g.defaultBuyin || 100)}</div></div><div class="settings-field"><div class="settings-lbl">Chip Multiplier</div><div style="color:var(--text);font-size:13px">${g.chipMult || 10}×</div></div></div>`;
  }

  tableMembersList(t).forEach(m => {
    if (!g.players.some(p => p.userId === m.userId)) {
      g.players.push({ userId: m.userId, name: m.displayName, buyins: [], clearouts: [], sponsorships: [] });
    }
  });

  g.players.forEach(p => {
    if (!p.userId && p.name) p.userId = 'name:' + p.name;
  });

  g.players.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const pl = document.getElementById('game-players-list');
  pl.innerHTML = g.players
    .map((p, idx) => {
      const net = playerNet(g, p);
      const selfBuyin = playerSelfBuyins(p);
      const sponsToOthers = playerSponsoredToOthers(g, p);
      const buyinCount = p.buyins.length;
      const sponsReceivedCount = p.sponsorships.length;
      const clearoutDollars = playerClearoutTotal(p);

      const countLabel = buyinCount + (buyinCount === 1 ? ' buy' : ' buys') +
        (sponsReceivedCount > 0 ? ' · ' + sponsReceivedCount + ' spon' : '');
      let tagsHtml = `<span class="ptag ptag-neutral">${escapeHtml(countLabel)}</span>`;
      tagsHtml += `<span class="ptag ptag-gold">self ${fmtAbs(selfBuyin)}</span>`;
      if (sponsToOthers > 0) tagsHtml += `<span class="ptag ptag-gold">→ ${fmtAbs(sponsToOthers)}</span>`;
      tagsHtml += clearoutDollars > 0
        ? `<span class="ptag ptag-green">out ${fmtAbs(clearoutDollars)}</span>`
        : `<span class="ptag ptag-neutral">not out</span>`;

      return `<div class="player-row">
      <div class="player-row-head">
        <div class="player-row-name">${escapeHtml(p.name)}</div>
        <div class="player-row-net ${net >= 0 ? 'pos' : 'neg'}">${playerBuyinTotal(p) > 0 ? fmt(net) : '—'}</div>
      </div>
      <div class="player-tags">${tagsHtml}</div>
      ${canEdit ? `<div class="player-actions">
        <div class="act-btn" onclick="openBuyin(${idx})">+ Buy-in</div>
        <div class="act-btn" onclick="openClearout(${idx})">Clearout</div>
        <div class="act-btn" onclick="openSponsor(${idx})">Sponsor</div>
      </div>` : ''}
    </div>`;
    })
    .join('');


  updateGamePot();
  renderActivityLog();
}

function g_updateSettings() {
  (async () => {
    const b = parseFloat(document.getElementById('setting-buyin').value) || 100;
    const m = parseFloat(document.getElementById('setting-mult').value) || 10;
    state.game.defaultBuyin = b;
    state.game.chipMult = m;

    if (APP_SUPABASE_CONFIGURED && window.sb) {
      const { error } = await sb
        .from('games')
        .update({ default_buyin: b, chip_mult: m })
        .eq('id', state.game.id);
      if (error) showError(error.message);
    } else {
      persistDemoTables();
    }

    renderGame();
    if (APP_SUPABASE_CONFIGURED && window.sb && state.game) await persistGamePeakRemote(state.game);
  })();
}
