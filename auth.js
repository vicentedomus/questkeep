const EMAIL_MAP = {
  'halo-dm':      'dm@dnd-halo.local',
  'halo-players': 'player@dnd-halo.local',
};

/** Restaura la sesión de Supabase al sessionStorage (para getters sincrónicos) */
async function initAuth() {
  const { data: { session } } = await sbClient.auth.getSession();
  if (session && session.user) {
    const role = session.user.user_metadata?.role || 'player';
    sessionStorage.setItem('role', role);
    sessionStorage.setItem('loggedIn', 'true');
  }
}

async function login(password) {
  const email = EMAIL_MAP[password];
  if (!email) return null;
  const { data, error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  const role = data.user.user_metadata?.role || 'player';
  sessionStorage.setItem('role', role);
  sessionStorage.setItem('loggedIn', 'true');
  return role;
}

function getRole()    { return sessionStorage.getItem('role'); }
function isLoggedIn() { return sessionStorage.getItem('loggedIn') === 'true'; }
function isDM()       { return getRole() === 'dm'; }

async function logout() {
  await sbClient.auth.signOut();
  sessionStorage.clear();
  window.location.reload();
}
