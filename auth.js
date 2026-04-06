/**
 * auth.js — Autenticación multi-campaña.
 * Usa la tabla public.campaign_members para determinar el rol del usuario.
 * Soporta múltiples membresías: si el usuario pertenece a 2+ campañas,
 * muestra un selector; si solo a 1, auto-selecciona.
 */

/** Trae TODAS las membresías del usuario (todas las campañas) */
async function fetchAllMemberships(userId, accessToken) {
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/campaign_members?user_id=eq.${userId}&select=campaign,role,username`,
    {
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  return await res.json();
}

/** Trae el nombre de la campaña desde la tabla campaigns */
async function fetchCampaignName(slug, accessToken) {
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/campaigns?slug=eq.${slug}&select=nombre`,
    {
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );
  const rows = await res.json();
  return rows.length ? rows[0].nombre : slug;
}

/** Setea la campaña activa en CONFIG y sessionStorage */
function selectCampaign(slug, name, role, username) {
  CONFIG.SLUG = slug;
  CONFIG.CAMPAIGN_NAME = name;
  sessionStorage.setItem('campaign_slug', slug);
  sessionStorage.setItem('campaign_name', name);
  sessionStorage.setItem('role', role);
  sessionStorage.setItem('username', username);
  sessionStorage.setItem('loggedIn', 'true');
}

/** Restaura la sesión al cargar la página */
async function initAuth() {
  // Restaurar CONFIG.SLUG desde sessionStorage si existe
  const savedSlug = sessionStorage.getItem('campaign_slug');
  if (savedSlug) {
    CONFIG.SLUG = savedSlug;
    CONFIG.CAMPAIGN_NAME = sessionStorage.getItem('campaign_name') || savedSlug;
  }

  const { data: { session } } = await sbClient.auth.getSession();
  if (session && session.user) {
    const meta = session.user.user_metadata || {};
    if (meta.mustChangePassword) {
      showChangePasswordScreen();
      return;
    }

    const memberships = await fetchAllMemberships(session.user.id, session.access_token);
    if (!memberships || memberships.length === 0) {
      await sbClient.auth.signOut();
      sessionStorage.clear();
      return;
    }

    // Si ya hay slug guardado, verificar que sigue siendo válido
    if (savedSlug) {
      const current = memberships.find(m => m.campaign === savedSlug);
      if (current) {
        sessionStorage.setItem('role', current.role);
        sessionStorage.setItem('username', current.username || meta.username || '');
        sessionStorage.setItem('loggedIn', 'true');
        return;
      }
      // Slug guardado ya no es válido, limpiar
      sessionStorage.removeItem('campaign_slug');
      sessionStorage.removeItem('campaign_name');
      CONFIG.SLUG = null;
      CONFIG.CAMPAIGN_NAME = null;
    }

    // Auto-seleccionar si solo tiene 1 membresía
    if (memberships.length === 1) {
      const m = memberships[0];
      const name = await fetchCampaignName(m.campaign, session.access_token);
      selectCampaign(m.campaign, name, m.role, m.username || meta.username || '');
      return;
    }

    // 2+ membresías: guardar para mostrar selector
    window._pendingMemberships = memberships;
    window._pendingAccessToken = session.access_token;
  }
}

/**
 * Login con username + password.
 * Retorna: role string, 'must_change', 'no_access', 'select_campaign', o null
 */
async function login(username, password) {
  const email = `${username.toLowerCase()}@dnd.local`;
  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;

  const meta = data.user.user_metadata || {};

  if (meta.mustChangePassword) {
    showChangePasswordScreen();
    return 'must_change';
  }

  const memberships = await fetchAllMemberships(data.user.id, data.session.access_token);
  if (!memberships || memberships.length === 0) {
    await sbClient.auth.signOut();
    return 'no_access';
  }

  if (memberships.length === 1) {
    const m = memberships[0];
    const name = await fetchCampaignName(m.campaign, data.session.access_token);
    selectCampaign(m.campaign, name, m.role, m.username || username);
    if (m.role === 'dm') sessionStorage.setItem('dm_password', password);
    return m.role;
  }

  // 2+ membresías: necesita selector
  window._pendingMemberships = memberships;
  window._pendingAccessToken = data.session.access_token;
  return 'select_campaign';
}

/** Cambia la contraseña del usuario logueado y quita el flag mustChangePassword */
async function changePassword(newPassword) {
  const { error } = await sbClient.auth.updateUser({
    password: newPassword,
    data: { mustChangePassword: false },
  });
  if (error) return error.message;

  const { data: { session } } = await sbClient.auth.getSession();
  if (session && session.user) {
    const memberships = await fetchAllMemberships(session.user.id, session.access_token);
    if (memberships && memberships.length === 1) {
      const m = memberships[0];
      const name = await fetchCampaignName(m.campaign, session.access_token);
      selectCampaign(m.campaign, name, m.role, m.username || '');
      if (m.role === 'dm') sessionStorage.setItem('dm_password', newPassword);
    }
  }
  return null;
}

/** Muestra la pantalla de cambio de contraseña obligatorio */
function showChangePasswordScreen() {
  document.getElementById('login-screen').innerHTML = `
    <div class="stone-wall"></div>
    <div class="frame-outer">
      <div class="parchment">
        <div class="login-logo" style="font-size:2rem;margin-bottom:4px">&#9876;</div>
        <div class="login-subtitle" style="margin-bottom:12px">Elige tu contraseña</div>
        <div class="login-divider"></div>
        <p style="color:var(--on-surface-variant);font-size:.85rem;margin-bottom:20px">
          Es tu primer inicio de sesión.<br>Elige una contraseña personal.
        </p>
        <form id="change-pw-form" autocomplete="off">
          <input type="password" id="new-pw-input" placeholder="Nueva contraseña" minlength="6" autofocus>
          <input type="password" id="confirm-pw-input" placeholder="Confirmar contraseña">
          <button type="submit" class="btn-login">Guardar contraseña</button>
        </form>
        <div class="login-error" id="change-pw-error"></div>
      </div>
    </div>
  `;
  document.getElementById('change-pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPw = document.getElementById('new-pw-input').value;
    const confirmPw = document.getElementById('confirm-pw-input').value;
    const errEl = document.getElementById('change-pw-error');

    if (newPw.length < 6) {
      errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    if (newPw !== confirmPw) {
      errEl.textContent = 'Las contraseñas no coinciden.';
      return;
    }

    errEl.textContent = 'Guardando...';
    const err = await changePassword(newPw);
    if (err) {
      errEl.textContent = err;
    } else {
      window.location.reload();
    }
  });
}

function getRole()     { return sessionStorage.getItem('role'); }
function getUsername()  { return sessionStorage.getItem('username'); }
function isLoggedIn()  { return sessionStorage.getItem('loggedIn') === 'true'; }
function isDM()        { return getRole() === 'dm'; }

async function logout() {
  await sbClient.auth.signOut();
  sessionStorage.clear();
  CONFIG.SLUG = null;
  CONFIG.CAMPAIGN_NAME = null;
  window.location.reload();
}

/** Cambia de campaña (vuelve al selector) */
async function switchCampaign() {
  sessionStorage.removeItem('campaign_slug');
  sessionStorage.removeItem('campaign_name');
  sessionStorage.removeItem('role');
  sessionStorage.removeItem('loggedIn');
  CONFIG.SLUG = null;
  CONFIG.CAMPAIGN_NAME = null;

  // Re-fetch membresías y mostrar selector sin reload
  const { data: { session } } = await sbClient.auth.getSession();
  if (session && session.user) {
    const memberships = await fetchAllMemberships(session.user.id, session.access_token);
    if (memberships && memberships.length > 0) {
      window._pendingMemberships = memberships;
      window._pendingAccessToken = session.access_token;
      // Mostrar login-screen y ocultar app
      document.getElementById('app').classList.remove('visible');
      document.getElementById('login-screen').style.display = '';
      showCampaignSelector();
      return;
    }
  }
  window.location.reload();
}
