/* =============================================================
   HALO — D&D Campaign Manager
   app.js — Full application logic
   ============================================================= */

// ── DATA STORE ──────────────────────────────────────────────
const DATA = {};
let PENDING_CHANGES = JSON.parse(localStorage.getItem('pendingChanges') || '[]');
let currentModalSection = null;
let currentModalData = null;

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('password-input').value.trim();
    const errEl = document.getElementById('login-error');
    if (!pw) return;
    const role = await login(pw);
    if (role) {
      errEl.textContent = '';
      bootApp();
    } else {
      errEl.textContent = 'Contrase\u00f1a incorrecta. Int\u00e9ntalo de nuevo.';
      document.getElementById('password-input').select();
    }
  });

  // If already logged in this session
  if (isLoggedIn()) bootApp();

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
});

async function bootApp() {
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.classList.add('visible');
  if (isDM()) app.classList.add('is-dm');

  await loadData();
  renderAll();
  updatePendingBadge();
}

// ── DATA LOADING ─────────────────────────────────────────────
async function loadData() {
  const files = ['players','quests','ciudades','establecimientos','lugares','npcs','items','notas_dm','notas_jugadores'];
  await Promise.all(files.map(async (f) => {
    try {
      const res = await fetch(`data/${f}.json`);
      DATA[f] = await res.json();
    } catch(e) {
      DATA[f] = [];
    }
  }));
}

// ── TAB SWITCHING ─────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === `section-${tab}`));
}

// ── RENDER ALL ────────────────────────────────────────────────
function renderAll() {
  renderPersonajes();
  renderQuests();
  renderCiudades();
  renderEstablecimientos();
  renderLugares();
  renderNPCs();
  renderItems();
  renderNotas();
}

// ── HELPERS ───────────────────────────────────────────────────
function val(v, fallback='\u2014') {
  if (v === null || v === undefined || v === '') return fallback;
  return v;
}

function filterBySearch(arr, searchId, fields) {
  const el = document.getElementById(searchId);
  if (!el) return arr;
  const q = el.value.trim().toLowerCase();
  if (!q) return arr;
  return arr.filter(item => fields.some(f => (item[f] || '').toString().toLowerCase().includes(q)));
}

function emptyState(msg='No hay registros.') {
  return `<div class="empty-state"><div class="empty-state-icon">&#128196;</div><div class="empty-state-text">${msg}</div></div>`;
}

function rarezaBadge(r) {
  if (!r) return '';
  const map = {
    'Common':'badge-common','Uncommon':'badge-uncommon','Rare':'badge-rare',
    'Very Rare':'badge-very-rare','Legendary':'badge-legendary','Artifact':'badge-artifact'
  };
  const cls = map[r] || 'badge-common';
  return `<span class="badge ${cls}">${r}</span>`;
}

function rolBadge(rol) {
  if (!rol) return '';
  const map = {'Aliado':'role-aliado','Neutral':'role-neutral','Enemigo':'role-enemigo'};
  const cls = map[rol] || 'role-neutral';
  return `<span class="badge ${cls}">${rol}</span>`;
}

function estadoQuestBadge(e) {
  const map = {
    'Activa':'estado-activa','Completada':'estado-completada',
    'Fallida':'estado-fallida','En Pausa':'estado-en-pausa'
  };
  const cls = map[e] || 'estado-activa';
  return `<span class="badge ${cls}">${val(e)}</span>`;
}

function estadoBadge(e) {
  if (!e) return '';
  return `<span class="badge ${e === 'Vivo' ? 'estado-vivo' : 'estado-muerto'}">${e}</span>`;
}

function editBtn(section, data) {
  return isDM() ? `<button class="btn btn-sm btn-icon" onclick='openModal("${section}", ${JSON.stringify(data).replace(/'/g,"&#39;")})'  title="Editar">&#9998;</button>` : '';
}

// ── RENDER PERSONAJES ─────────────────────────────────────────
function renderPersonajes() {
  const grid = document.getElementById('grid-personajes');
  let items = DATA.players || [];

  // Players see only PJs. DM sees all
  if (!isDM()) items = items.filter(p => p.es_pj);

  if (!items.length) { grid.innerHTML = emptyState('No hay personajes.'); return; }

  grid.innerHTML = items.map(p => {
    const isPJ = p.es_pj;
    const cardClass = isPJ ? 'card card-pj' : 'card card-npc-aliado';
    const subtipo = isPJ ? `${val(p.raza)} ${val(p.clase)}` : `NPC — ${val(p.rol)}`;
    const jugadorStr = p.jugador ? `<span class="meta-item"><span class="meta-label">Jugador:</span> ${p.jugador}</span>` : '';
    const subclaseStr = p.subclase ? `<span class="meta-item"><span class="meta-label">Subclase:</span> ${p.subclase}</span>` : '';

    const stats = (isPJ && (p.nivel || p.ac || p.hp_maximo)) ? `
      <div class="stat-pills">
        ${p.nivel !== null ? `<div class="stat-pill"><span class="stat-pill-label">Nv</span><span class="stat-pill-value">${p.nivel}</span></div>` : ''}
        ${p.ac !== null ? `<div class="stat-pill"><span class="stat-pill-label">AC</span><span class="stat-pill-value">${p.ac}</span></div>` : ''}
        ${p.hp_maximo !== null ? `<div class="stat-pill"><span class="stat-pill-label">HP</span><span class="stat-pill-value">${p.hp_maximo}</span></div>` : ''}
      </div>` : '';

    const itemsList = (p.items_magicos && p.items_magicos.length) ? `
      <div style="margin-top:10px">
        <div style="font-family:'Cinzel',serif;font-size:0.68rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:4px">ITEMS M\u00c1GICOS</div>
        <ul class="card-list">${p.items_magicos.map(i => `<li>${i.nombre}</li>`).join('')}</ul>
      </div>` : '';

    return `
    <div class="${cardClass}">
      <div class="card-header">
        <div>
          <div class="card-title">${p.nombre}</div>
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:3px;font-style:italic">${subtipo}</div>
        </div>
        <div class="card-actions">${editBtn('personajes', p)}</div>
      </div>
      <div class="card-body">
        <div class="card-meta">${jugadorStr}${subclaseStr}</div>
        ${stats}
        ${p.descripcion ? `<div class="card-desc">${p.descripcion}</div>` : ''}
        ${itemsList}
      </div>
    </div>`;
  }).join('');
}

// ── RENDER QUESTS ─────────────────────────────────────────────
function renderQuests() {
  const grid = document.getElementById('grid-quests');
  let items = DATA.quests || [];
  if (!isDM()) items = items.filter(q => q.visible_jugadores);
  if (!items.length) { grid.innerHTML = emptyState('No hay quests visibles.'); return; }

  grid.innerHTML = items.map(q => {
    const gp = q.recompensa_gp ? `<span class="quest-recompensa">&#9830; ${q.recompensa_gp} GP</span>` : '';
    return `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${q.nombre}</div>
          <div class="card-meta" style="margin-top:6px">${estadoQuestBadge(q.estado)} ${gp}</div>
        </div>
        <div class="card-actions">${editBtn('quests', q)}</div>
      </div>
      <div class="card-body">
        ${q.resumen ? `<div class="card-desc" style="border-top:none;padding-top:0">${q.resumen}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── RENDER CIUDADES ───────────────────────────────────────────
function renderCiudades() {
  const grid = document.getElementById('grid-ciudades');
  let items = DATA.ciudades || [];
  if (!isDM()) items = items.filter(c => c.conocida_jugadores);
  items = filterBySearch(items, 'search-ciudades', ['nombre','estado','lider']);
  if (!items.length) { grid.innerHTML = emptyState('No hay ciudades.'); return; }

  grid.innerHTML = items.map(c => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${c.nombre}</div>
          ${c.estado ? `<div style="font-size:0.75rem;color:var(--text-dim);margin-top:3px">${c.estado}</div>` : ''}
        </div>
        <div class="card-actions">${editBtn('ciudades', c)}</div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          ${c.lider ? `<span class="meta-item"><span class="meta-label">L\u00edder:</span> ${c.lider}</span>` : ''}
          ${c.poblacion ? `<span class="meta-item"><span class="meta-label">Pob.:</span> ${c.poblacion.toLocaleString()}</span>` : ''}
        </div>
        ${c.descripcion ? `<div class="card-desc">${c.descripcion}</div>` : ''}
        ${c.descripcion_lider && isDM() ? `<div class="card-desc" style="margin-top:8px"><em>Descripci\u00f3n l\u00edder:</em> ${c.descripcion_lider}</div>` : ''}
      </div>
    </div>`).join('');
}

// ── RENDER ESTABLECIMIENTOS ───────────────────────────────────
function renderEstablecimientos() {
  const grid = document.getElementById('grid-establecimientos');
  let items = DATA.establecimientos || [];
  if (!isDM()) items = items.filter(e => e.conocido_jugadores);
  items = filterBySearch(items, 'search-establecimientos', ['nombre','tipo']);
  if (!items.length) { grid.innerHTML = emptyState('No hay establecimientos.'); return; }

  grid.innerHTML = items.map(e => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${e.nombre}</div>
          <div class="card-meta" style="margin-top:5px">
            <span class="badge tipo-badge">${val(e.tipo)}</span>
            ${e.ciudad ? `<span style="font-size:0.75rem;color:var(--text-dim)">${e.ciudad.nombre}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">${editBtn('establecimientos', e)}</div>
      </div>
      <div class="card-body">
        ${e.dueno ? `<div class="card-meta"><span class="meta-item"><span class="meta-label">Due\u00f1o:</span> ${e.dueno.nombre}</span></div>` : ''}
        ${e.descripcion ? `<div class="card-desc">${e.descripcion}</div>` : ''}
      </div>
    </div>`).join('');
}

// ── RENDER LUGARES ────────────────────────────────────────────
function renderLugares() {
  const grid = document.getElementById('grid-lugares');
  let items = DATA.lugares || [];
  if (!items.length) { grid.innerHTML = emptyState('No hay lugares registrados.'); return; }

  grid.innerHTML = items.map(l => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${l.nombre}</div>
          <div class="card-meta" style="margin-top:5px">
            ${l.tipo ? `<span class="badge tipo-badge">${l.tipo}</span>` : ''}
            ${l.region ? `<span style="font-size:0.75rem;color:var(--text-dim)">${l.region}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">${editBtn('lugares', l)}</div>
      </div>
      <div class="card-body">
        ${l.estado_exploracion ? `<div class="card-meta"><span class="meta-item"><span class="meta-label">Exploraci\u00f3n:</span> ${l.estado_exploracion}</span></div>` : ''}
        ${l.descripcion ? `<div class="card-desc">${l.descripcion}</div>` : ''}
      </div>
    </div>`).join('');
}

// ── RENDER NPCS ───────────────────────────────────────────────
function renderNPCs() {
  const grid = document.getElementById('grid-npcs');
  let items = DATA.npcs || [];
  if (!isDM()) items = items.filter(n => n.conocido_jugadores);
  items = filterBySearch(items, 'search-npcs', ['nombre','tipo_npc','raza']);
  if (!items.length) { grid.innerHTML = emptyState('No hay NPCs visibles.'); return; }

  grid.innerHTML = items.map(n => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${n.nombre}</div>
          <div class="card-meta" style="margin-top:5px">
            ${rolBadge(n.rol)}
            ${estadoBadge(n.estado)}
            ${n.tipo_npc ? `<span class="badge tipo-badge">${n.tipo_npc}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">${editBtn('npcs', n)}</div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          ${n.raza ? `<span class="meta-item"><span class="meta-label">Raza:</span> ${n.raza}</span>` : ''}
          ${n.ciudad ? `<span class="meta-item"><span class="meta-label">Ciudad:</span> ${n.ciudad.nombre}</span>` : ''}
          ${n.establecimiento ? `<span class="meta-item"><span class="meta-label">Lugar:</span> ${n.establecimiento.nombre}</span>` : ''}
        </div>
        ${n.descripcion ? `<div class="card-desc">${n.descripcion}</div>` : ''}
      </div>
    </div>`).join('');
}

// ── RENDER ITEMS ──────────────────────────────────────────────
function renderItems() {
  const grid = document.getElementById('grid-items');
  let items = DATA.items || [];
  if (!isDM()) items = items.filter(i => i.personaje !== null);
  items = filterBySearch(items, 'search-items', ['nombre','tipo','rareza']);
  if (!items.length) { grid.innerHTML = emptyState('No hay items visibles.'); return; }

  grid.innerHTML = items.map(it => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${it.nombre}</div>
          <div class="card-meta" style="margin-top:5px">
            ${rarezaBadge(it.rareza)}
            ${it.tipo ? `<span class="badge tipo-badge">${it.tipo}</span>` : ''}
          </div>
        </div>
        <div class="card-actions">${editBtn('items', it)}</div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          ${it.personaje ? `<span class="meta-item"><span class="meta-label">Portador:</span> ${it.personaje.nombre}</span>` : '<span class="meta-item" style="color:var(--text-dim)">Sin portador</span>'}
          ${it.requiere_sintonizacion ? `<span class="badge badge-rare" style="font-size:0.58rem">Attunement</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

// ── RENDER NOTAS ──────────────────────────────────────────────
function renderNotas() {
  const grid = document.getElementById('grid-notas');
  let items = [];

  if (isDM()) {
    const dm = (DATA.notas_dm || []).map(n => ({...n, _tipo: 'dm'}));
    const pl = (DATA.notas_jugadores || []).map(n => ({...n, _tipo: 'player'}));
    items = [...dm, ...pl];
  } else {
    items = (DATA.notas_jugadores || []).map(n => ({...n, _tipo: 'player'}));
  }

  // Sort by date desc
  items.sort((a,b) => {
    const da = a.fecha || '0000';
    const db = b.fecha || '0000';
    return db.localeCompare(da);
  });

  if (!items.length) { grid.innerHTML = emptyState('No hay notas de sesi\u00f3n.'); return; }

  grid.innerHTML = items.map(n => {
    const tipoLabel = n._tipo === 'dm'
      ? `<span class="nota-tipo nota-tipo-dm">DM</span>`
      : `<span class="nota-tipo nota-tipo-player">Jugador</span>`;

    let jugadoresHtml = '';
    const jugadores = n.jugadores || (n.jugador ? [n.jugador] : []);
    if (jugadores.length) {
      jugadoresHtml = `<div class="nota-players">${jugadores.map(j => {
        const name = typeof j === 'string' ? j : j.nombre;
        return `<span class="player-chip">${name}</span>`;
      }).join('')}</div>`;
    }

    return `
    <div class="card nota-card">
      <div class="card-header">
        <div class="card-title">${n.nombre}</div>
        <div class="card-actions">${editBtn(n._tipo === 'dm' ? 'notas_dm' : 'notas_jugadores', n)}</div>
        <div class="nota-meta">
          ${tipoLabel}
          ${n.fecha ? `<span class="nota-date">${n.fecha}</span>` : ''}
          ${jugadoresHtml}
        </div>
      </div>
      <div class="card-body">
        ${n.resumen ? `<div class="card-desc" style="border-top:none;padding-top:0">${n.resumen}</div>` : '<div class="card-desc" style="border-top:none;padding-top:0;opacity:0.5">Sin resumen a\u00fan.</div>'}
      </div>
    </div>`;
  }).join('');
}

// ── PENDING CHANGES ──────────────────────────────────────────
function updatePendingBadge() {
  const badge = document.getElementById('pending-badge');
  const countEl = document.getElementById('pending-count');
  if (PENDING_CHANGES.length > 0) {
    badge.classList.add('visible');
    countEl.textContent = PENDING_CHANGES.length;
  } else {
    badge.classList.remove('visible');
  }
}

function savePending() {
  localStorage.setItem('pendingChanges', JSON.stringify(PENDING_CHANGES));
  updatePendingBadge();
}

// ── MODAL ────────────────────────────────────────────────────
const FORM_SCHEMAS = {
  personajes: [
    { key:'nombre', label:'Nombre', type:'text', required:true },
    { key:'clase',  label:'Clase',  type:'text' },
    { key:'subclase', label:'Subclase', type:'text' },
    { key:'raza',   label:'Raza',   type:'text' },
    { key:'jugador', label:'Jugador', type:'select', options:['','Tino','Caco','Leo','Enoch','Hiram'] },
    { key:'nivel',  label:'Nivel',  type:'number' },
    { key:'ac',     label:'AC',     type:'number' },
    { key:'hp_maximo', label:'HP M\u00e1x', type:'number' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'es_pj',  label:'Es PJ',  type:'checkbox' },
  ],
  quests: [
    { key:'nombre',  label:'Nombre', type:'text', required:true },
    { key:'estado',  label:'Estado', type:'select', options:['Activa','Completada','Fallida','En Pausa'] },
    { key:'recompensa_gp', label:'Recompensa GP', type:'text' },
    { key:'resumen', label:'Resumen', type:'textarea' },
    { key:'visible_jugadores', label:'Visible para jugadores', type:'checkbox' },
  ],
  ciudades: [
    { key:'nombre',   label:'Nombre', type:'text', required:true },
    { key:'estado',   label:'Reino / Estado', type:'text' },
    { key:'lider',    label:'L\u00edder', type:'text' },
    { key:'poblacion',label:'Poblaci\u00f3n', type:'number' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'descripcion_lider', label:'Descripci\u00f3n L\u00edder', type:'textarea' },
    { key:'conocida_jugadores', label:'Conocida por jugadores', type:'checkbox' },
  ],
  establecimientos: [
    { key:'nombre', label:'Nombre', type:'text', required:true },
    { key:'tipo',   label:'Tipo',   type:'text' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'conocido_jugadores', label:'Conocido por jugadores', type:'checkbox' },
  ],
  lugares: [
    { key:'nombre', label:'Nombre', type:'text', required:true },
    { key:'tipo',   label:'Tipo',   type:'text' },
    { key:'region', label:'Regi\u00f3n', type:'text' },
    { key:'estado_exploracion', label:'Estado Exploraci\u00f3n', type:'text' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
  ],
  npcs: [
    { key:'nombre',   label:'Nombre', type:'text', required:true },
    { key:'raza',     label:'Raza', type:'text' },
    { key:'tipo_npc', label:'Tipo NPC', type:'text' },
    { key:'rol',      label:'Rol', type:'select', options:['Neutral','Aliado','Enemigo'] },
    { key:'estado',   label:'Estado', type:'select', options:['Vivo','Muerto'] },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'conocido_jugadores', label:'Conocido por jugadores', type:'checkbox' },
  ],
  items: [
    { key:'nombre',  label:'Nombre', type:'text', required:true },
    { key:'tipo',    label:'Tipo', type:'text' },
    { key:'rareza',  label:'Rareza', type:'select', options:['','Common','Uncommon','Rare','Very Rare','Legendary','Artifact'] },
    { key:'requiere_sintonizacion', label:'Requiere Attunement', type:'checkbox' },
  ],
  notas_dm: [
    { key:'nombre', label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',  label:'Fecha (YYYY-MM-DD)', type:'text' },
    { key:'resumen', label:'Resumen', type:'textarea' },
  ],
  notas_jugadores: [
    { key:'nombre', label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',  label:'Fecha (YYYY-MM-DD)', type:'text' },
    { key:'resumen', label:'Resumen', type:'textarea' },
  ],
};

const SECTION_LABELS = {
  personajes:'Personaje', quests:'Quest', ciudades:'Ciudad',
  establecimientos:'Establecimiento', lugares:'Lugar', npcs:'NPC',
  items:'Item', notas_dm:'Nota DM', notas_jugadores:'Nota Jugador', notas:'Nota'
};

function openModal(section, data) {
  currentModalSection = section;
  currentModalData = data;
  const label = SECTION_LABELS[section] || section;
  document.getElementById('modal-title').textContent = data ? `Editar ${label}` : `A\u00f1adir ${label}`;

  const schema = FORM_SCHEMAS[section] || [];
  const body = document.getElementById('modal-body');

  body.innerHTML = schema.map(field => {
    const v = data ? (data[field.key] !== undefined ? data[field.key] : '') : (field.type === 'checkbox' ? false : '');

    if (field.type === 'textarea') {
      return `<div class="form-group"><label>${field.label}</label><textarea id="field-${field.key}" rows="4">${v || ''}</textarea></div>`;
    }
    if (field.type === 'checkbox') {
      return `<div class="form-group"><div class="form-check"><input type="checkbox" id="field-${field.key}" ${v ? 'checked' : ''}><label for="field-${field.key}">${field.label}</label></div></div>`;
    }
    if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${o || '\u2014 Ninguno \u2014'}</option>`).join('');
      return `<div class="form-group"><label>${field.label}</label><select id="field-${field.key}">${opts}</select></div>`;
    }
    return `<div class="form-group"><label>${field.label}${field.required ? ' *' : ''}</label><input type="${field.type || 'text'}" id="field-${field.key}" value="${v !== null && v !== undefined ? v : ''}"></div>`;
  }).join('');

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  currentModalSection = null;
  currentModalData = null;
}

function saveModal() {
  if (!currentModalSection) return;
  const schema = FORM_SCHEMAS[currentModalSection] || [];
  const newData = currentModalData ? {...currentModalData} : { notion_id: null };

  for (const field of schema) {
    const el = document.getElementById(`field-${field.key}`);
    if (!el) continue;
    if (field.type === 'checkbox') {
      newData[field.key] = el.checked;
    } else if (field.type === 'number') {
      newData[field.key] = el.value === '' ? null : Number(el.value);
    } else {
      newData[field.key] = el.value;
    }
    if (field.required && !newData[field.key]) {
      el.focus();
      el.style.borderColor = 'var(--red)';
      return;
    }
  }

  // Map 'notas' section to actual key
  let tableKey = currentModalSection;
  if (tableKey === 'notas') tableKey = 'notas_dm';

  const action = currentModalData ? 'edit' : 'add';
  PENDING_CHANGES.push({ action, table: tableKey, data: newData });

  // Update local data
  if (!DATA[tableKey]) DATA[tableKey] = [];
  if (action === 'add') {
    DATA[tableKey].push(newData);
  } else {
    const idx = DATA[tableKey].findIndex(i => i.notion_id === newData.notion_id);
    if (idx >= 0) DATA[tableKey][idx] = newData;
  }

  savePending();
  closeModal();
  renderAll();
}

// ── SYNC ─────────────────────────────────────────────────────
async function importarDesdeNotion() {
  if (!CONFIG.WEBHOOK_IMPORT) {
    alert('Webhook de importaci\u00f3n no configurado.');
    return;
  }
  const spinner = document.getElementById('spinner');
  spinner.classList.add('open');
  try {
    const res = await fetch(CONFIG.WEBHOOK_IMPORT, { method: 'POST' });
    const json = await res.json();
    // Reload data
    await loadData();
    renderAll();
    alert('\u2713 Datos importados correctamente.');
  } catch(e) {
    alert('Error al importar: ' + e.message);
  } finally {
    spinner.classList.remove('open');
  }
}

async function exportarANotion() {
  if (!CONFIG.WEBHOOK_EXPORT) {
    alert('Webhook de exportaci\u00f3n no configurado.');
    return;
  }
  if (PENDING_CHANGES.length === 0) {
    alert('No hay cambios pendientes para exportar.');
    return;
  }
  const spinner = document.getElementById('spinner');
  spinner.classList.add('open');
  try {
    await fetch(CONFIG.WEBHOOK_EXPORT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: PENDING_CHANGES })
    });
    PENDING_CHANGES = [];
    savePending();
    alert('\u2713 Cambios exportados a Notion correctamente.');
  } catch(e) {
    alert('Error al exportar: ' + e.message);
  } finally {
    spinner.classList.remove('open');
  }
}
