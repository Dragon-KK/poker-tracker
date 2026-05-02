/** Converts a username to the internal Supabase email format. */
function usernameToEmail(username) {
  return username.trim().toLowerCase() + '@pokertrackerapp.internal';
}

function rerenderBoot() {
  refreshMeUi();
  renderNav();
  if (state.page === 'page-dashboard') renderDashboard();
  if (state.page === 'page-tables') renderTables();
  if (state.page === 'page-table-info' && state.table) renderTableInfo();
  if (state.page === 'page-game' && state.table && state.game) renderGame();
  refreshSignOutVisibility();
}

function configureAuthPanels() {
  const offline = document.getElementById('auth-panel-offline');
  const cloud = document.getElementById('auth-panel-cloud');
  const title = document.getElementById('auth-modal-title');
  const supa = !!(typeof APP_SUPABASE_CONFIGURED !== 'undefined' && APP_SUPABASE_CONFIGURED && window.sb);
  if (offline) offline.style.display = supa ? 'none' : 'block';
  if (cloud) cloud.style.display = supa ? 'block' : 'none';
  if (title) title.textContent = 'Welcome';
}

function refreshSignOutVisibility() {
  const authed = document.body.classList.contains('app-authenticated');
  const so = document.getElementById('btn-sign-out');
  if (so) so.style.display = authed ? 'flex' : 'none';
  const ref = document.getElementById('btn-refresh');
  if (ref) ref.style.display = authed ? 'flex' : 'none';
}

// ── Cloud (Supabase) auth tab switcher ───────────────────────────────────────

function switchAuth(tab) {
  const cloud = document.getElementById('auth-panel-cloud');
  if (!cloud || cloud.style.display === 'none') return;
  const signIn = document.getElementById('auth-panel-sign-in');
  const signUp = document.getElementById('auth-panel-sign-up');
  const bIn = document.getElementById('auth-tab-sign-in');
  const bUp = document.getElementById('auth-tab-sign-up');
  if (!signIn || !signUp || !bIn || !bUp) return;
  const isIn = tab === 'sign-in';
  signIn.style.display = isIn ? 'block' : 'none';
  signUp.style.display = isIn ? 'none' : 'block';
  bIn.classList.toggle('auth-tab-active', isIn);
  bUp.classList.toggle('auth-tab-active', !isIn);
}

// ── Local (offline) auth tab switcher ───────────────────────────────────────

function switchLocalAuth(tab) {
  const panelIn = document.getElementById('auth-local-sign-in');
  const panelUp = document.getElementById('auth-local-sign-up');
  const bIn = document.getElementById('auth-tab-local-in');
  const bUp = document.getElementById('auth-tab-local-up');
  if (!panelIn || !panelUp || !bIn || !bUp) return;
  const isIn = tab === 'sign-in';
  panelIn.style.display = isIn ? 'block' : 'none';
  panelUp.style.display = isIn ? 'none' : 'block';
  bIn.classList.toggle('auth-tab-active', isIn);
  bUp.classList.toggle('auth-tab-active', !isIn);
}

// ── Supabase session resume ───────────────────────────────────────────────────

async function resumeSessionFromSupabase() {
  try {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error || !session) return false;
    await loadProfileFromSession(session);
    await hydrateFromSupabase({ keepSelection: false });
    document.body.classList.add('app-authenticated');
    rerenderBoot();
    return true;
  } catch (e) {
    console.error('Session resume failed:', e);
    return false;
  }
}

// ── Local sign-in ─────────────────────────────────────────────────────────────

function submitLocalSignIn() {
  const username = (document.getElementById('local-username-si')?.value || '').trim().toLowerCase();
  const password = document.getElementById('local-password-si')?.value || '';
  if (!username || !password) {
    showError('Enter your username and password.');
    return;
  }
  const users = getDemoUsers();
  const user = users[username];
  if (!user || user.password !== password) {
    showError('Invalid username or password.');
    return;
  }
  ME = user.displayName;
  ME_UID = 'local:' + username;
  loadDemoTablesForUser();
  saveLocalSession();
  document.body.classList.add('app-authenticated');
  closeModal('modal-auth');
  refreshMeUi();
  rerenderBoot();
  nav('page-dashboard');
}

// ── Local sign-up ─────────────────────────────────────────────────────────────

function submitLocalSignUp() {
  const displayName = (document.getElementById('local-display-su')?.value || '').trim();
  const username = (document.getElementById('local-username-su')?.value || '').trim().toLowerCase();
  const password = document.getElementById('local-password-su')?.value || '';
  if (!displayName || !username || !password) {
    showError('All fields are required.');
    return;
  }
  if (username.length < 3) {
    showError('Username must be at least 3 characters.');
    return;
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    showError('Username may only contain letters, numbers and underscores.');
    return;
  }
  if (password.length < 4) {
    showError('Password must be at least 4 characters.');
    return;
  }
  const users = getDemoUsers();
  if (users[username]) {
    showError('That username is already taken.');
    return;
  }
  users[username] = { displayName, password };
  saveDemoUsers(users);
  ME = displayName;
  ME_UID = 'local:' + username;
  state.tables = [];
  saveLocalSession();
  document.body.classList.add('app-authenticated');
  closeModal('modal-auth');
  refreshMeUi();
  rerenderBoot();
  nav('page-dashboard');
}

// ── Cloud sign-in (username → internal email) ─────────────────────────────────

async function submitSignIn() {
  try {
    const usernameRaw = (document.getElementById('auth-username')?.value || '').trim();
    const password = document.getElementById('auth-password')?.value || '';
    if (!usernameRaw || !password) {
      showError('Enter your username and password.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(usernameRaw)) {
      showError('Username may only contain letters, numbers and underscores.');
      return;
    }
    const email = usernameToEmail(usernameRaw);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      showError(error.message === 'Invalid login credentials'
        ? 'Invalid username or password.'
        : error.message);
      return;
    }
    await resumeSessionFromSupabase();
    closeModal('modal-auth');
    nav('page-dashboard');
  } catch (e) {
    showError(String(e && e.message ? e.message : e));
  }
}

// ── Cloud sign-up (username → internal email) ─────────────────────────────────

async function submitSignUp() {
  try {
    const displayName = (document.getElementById('auth-display-name')?.value || '').trim();
    const usernameRaw = (document.getElementById('auth-username-su')?.value || '').trim();
    const password = document.getElementById('auth-password-su')?.value || '';
    if (!displayName || !usernameRaw || !password) {
      showError('All fields are required.');
      return;
    }
    if (usernameRaw.length < 3) {
      showError('Username must be at least 3 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(usernameRaw)) {
      showError('Username may only contain letters, numbers and underscores.');
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }
    const email = usernameToEmail(usernameRaw);
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } }
    });
    if (error) {
      showError(
        error.message.includes('already registered')
          ? 'That username is already taken.'
          : error.message
      );
      return;
    }
    if (!data.session) {
      showError('Account created — check your inbox to confirm (or disable email confirmation in Supabase Auth settings), then sign in.');
      switchAuth('sign-in');
      return;
    }
    await loadProfileFromSession(data.session);
    await hydrateFromSupabase({ keepSelection: false });
    document.body.classList.add('app-authenticated');
    closeModal('modal-auth');
    rerenderBoot();
    nav('page-dashboard');
  } catch (e) {
    showError(String(e && e.message ? e.message : e));
  }
}

// ── Sign-out ──────────────────────────────────────────────────────────────────

async function signOutClicked() {
  localStorage.removeItem('pl_nav');
  if (APP_SUPABASE_CONFIGURED && window.sb) {
    await sb.auth.signOut();
  } else {
    clearLocalSession();
  }
  ME_UID = '';
  ME = '';
  state.tables = [];
  state.table = null;
  state.game = null;
  document.body.classList.remove('app-authenticated');
  rerenderBoot();
  configureAuthPanels();
  if (APP_SUPABASE_CONFIGURED && window.sb) {
    switchAuth('sign-in');
  } else {
    switchLocalAuth('sign-in');
  }
  openModal('modal-auth');
}
