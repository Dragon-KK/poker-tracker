document.querySelectorAll('.modal-backdrop').forEach(el => {
  el.addEventListener('click', e => {
    if (el.id === 'modal-auth') return;
    if (e.target === el) el.classList.remove('open');
  });
});

document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.remove('app-authenticated');
  configureAuthPanels();

  if (!(APP_SUPABASE_CONFIGURED && window.sb)) {
    // Local / offline mode
    const resumed = resumeLocalSession();
    if (resumed) {
      document.body.classList.add('app-authenticated');
      refreshSignOutVisibility();
      refreshMeUi();
      rerenderBoot();
      restoreNavState();
    } else {
      switchLocalAuth('sign-in');
      openModal('modal-auth');
      refreshSignOutVisibility();
      refreshMeUi();
    }
    return;
  }

  // Cloud (Supabase) mode
  // onAuthStateChange only handles forced sign-outs (e.g. token revoked server-side).
  // Page-load session restore is handled by resumeSessionFromSupabase() below.
  // Sign-in / sign-up flows handle their own state in auth.js.
  sb.auth.onAuthStateChange(async (event, _session) => {
    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('pl_nav');
      ME_UID = '';
      ME = '';
      state.tables = [];
      state.table = null;
      state.game = null;
      document.body.classList.remove('app-authenticated');
      refreshSignOutVisibility();
      rerenderBoot();
      configureAuthPanels();
      switchAuth('sign-in');
      openModal('modal-auth');
    }
  });

  const ok = await resumeSessionFromSupabase();
  if (!ok) {
    switchAuth('sign-in');
    openModal('modal-auth');
    refreshSignOutVisibility();
    refreshMeUi();
    return;
  }

  refreshSignOutVisibility();
  refreshMeUi();
  restoreNavState();
});
