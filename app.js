/* =============================================================
   HALO — D&D Campaign Manager
   app.js — Full application logic
   ============================================================= */

// ── DATA STORE ────────────────────────────────────────────
const DATA = {};
let currentModalSection = null;
let currentModalData = null;
let currentModalMode = null; // 'detail' | 'edit'

// ── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
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

  if (isLoggedIn()) bootApp();

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

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

  // Avisar al DM si no tiene token configurado
  if (isDM() && !getGitHubToken()) {
    const notice = document.getElementById('token-notice');
    if (notice) notice.style.display = 'flex';
  }
}

// ── GITHUB TOKEN ──────────────────────────────────────────
function getGitHubToken() {
  return localStorage.getItem('gh_token') || '';
}

function configurarToken() {
  const current = getGitHubToken();
  const token = prompt(
    'GitHub Personal Access Token\n\n' +
    'Necesitas un token con permiso de escritura en el repo dnd-halo.\n' +
    'C\u00f3mo crear uno: github.com/settings/tokens\n\n' +
    (current ? '(Ya tienes uno configurado — pega uno nuevo para reemplazarlo)' : 'Pega tu token aqu\u00ed:')
  );
  if (token && token.trim()) {
    localStorage.setItem('gh_token', token.trim());
    const notice = document.getElementById('token-notice');
    if (notice) notice.style.display = 'none';
    alert('\u2713 Token guardado en este dispositivo.');
  }
}

// ── DATA LOADING ──────────────────────────────────────────────
async function loadData() {
  const files = ['players','quests','ciudades','establecimientos','lugares','npcs','items','notas_dm','notas_jugadores'];
  await Promise.all(files.map(async (f) => {
    try {
      const res = await fetch(`data/${f}.json?t=${Date.now()}`);
      DATA[f] = await res.json();
    } catch(e) {
      DATA[f] = [];
    }
  }));
}

// ── TAB SWITCHING ───────────────────────────────────────────────
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

// ── HELPERS ───────────────────────────────────────────────────────
function val(v, fallback='—') {
  if (v === null || v === undefined || v === '') return fallback;
  return v;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

// ── NAVIGATE TO CARD ─────────────────────────────────────────────
function navegarA(tab, notionId) {
  closeModal();
  switchTab(tab);
  if (!notionId) return;
  setTimeout(() => {
    const card = document.querySelector(`[data-notion-id="${notionId}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('card-highlight');
    setTimeout(() => card.classList.remove('card-highlight'), 2000);
  }, 120);
}

// ── DETAIL MODAL ────────────────────────────────────────────────
function openDetailFromCard(el) {
  const section = el.dataset.section;
  const notionId = el.dataset.notionId;
  let arr;
  if (section === 'notas_dm') arr = DATA.notas_dm || [];
  else if (section === 'notas_jugadores') arr = DATA.notas_jugadores || [];
  else arr = DATA[section] || [];
  const item = arr.find(x => x.notion_id === notionId);
  if (item) openDetail(section, item);
}

function openDetail(section, data) {
  currentModalSection = section;
  currentModalData = data;
  currentModalMode = 'detail';
  const label = SECTION_LABELS[section] || section;
  document.getElementById('modal-title').textContent = escapeHtml(data.nombre || label);

  const body = document.getElementById('modal-body');
  body.innerHTML = buildDetailHTML(section, data);
  body.classList.add('is-detail');

  const footer = document.getElementById('modal-footer');
  footer.innerHTML = `
    <button class="btn" onclick="closeModal()">Cerrar</button>
    ${isDM() ? `<button class="btn btn-success" onclick="switchToEdit()">✎ Editar</button>` : ''}
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function switchToEdit() {
  if (!currentModalSection || !currentModalData) return;
  currentModalMode = 'edit';
  const label = SECTION_LABELS[currentModalSection] || currentModalSection;
  document.getElementById('modal-title').textContent = `Editar ${label}`;

  const body = document.getElementById('modal-body');
  body.classList.remove('is-detail');

  const schema = FORM_SCHEMAS[currentModalSection] || [];
  const data = currentModalData;

  body.innerHTML = schema.map(field => {
    const v = data[field.key] !== undefined ? data[field.key] : (field.type === 'checkbox' ? false : '');
    if (field.type === 'textarea') {
      return `<div class="form-group"><label>${field.label}</label><textarea id="field-${field.key}" rows="4">${escapeHtml(v || '')}</textarea></div>`;
    }
    if (field.type === 'checkbox') {
      return `<div class="form-group"><div class="form-check"><input type="checkbox" id="field-${field.key}" ${v ? 'checked' : ''}><label for="field-${field.key}">${field.label}</label></div></div>`;
    }
    if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${o || '\u2014 Ninguno \u2014'}</option>`).join('');
      return `<div class="form-group"><label>${field.label}</label><select id="field-${field.key}">${opts}</select></div>`;
    }
    return `<div class="form-group"><label>${field.label}${field.required ? ' *' : ''}</label><input type="${field.type || 'text'}" id="field-${field.key}" value="${escapeHtml(v !== null && v !== undefined ? String(v) : '')}"></div>`;
  }).join('');

  const footer = document.getElementById('modal-footer');
  footer.innerHTML = `
    <button class="btn" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-success" onclick="saveModal()">Guardar</button>
  `;
}

function buildDetailHTML(section, data) {
  function row(label, value) {
    if (value === null || value === undefined || value === '' || value === '\u2014') return '';
    return `<div class="detail-row"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`;
  }
  function textBlock(label, text) {
    if (!text) return '';
    return `<div class="detail-section"><div class="detail-label">${label}</div><div class="detail-text">${escapeHtml(text).replace(/\n/g,'<br>')}</div></div>`;
  }
  function relLink(tab, notionId, nombre) {
    if (!nombre) return '\u2014';
    const safe = escapeHtml(nombre);
    if (notionId) return `<span class="rel-link" onclick="event.stopPropagation();navegarA('${tab}','${notionId}')">${safe}</span>`;
    return safe;
  }

  switch(section) {
    case 'npcs': {
      const n = data;
      return [
        row('Rol', rolBadge(n.rol)),
        row('Estado', estadoBadge(n.estado)),
        row('Tipo', n.tipo_npc ? `<span class="badge tipo-badge">${escapeHtml(n.tipo_npc)}</span>` : ''),
        row('Raza', escapeHtml(n.raza)),
        row('Ciudad', n.ciudad ? relLink('ciudades', n.ciudad.notion_id, n.ciudad.nombre) : ''),
        row('Establecimiento', n.establecimiento ? relLink('establecimientos', n.establecimiento.notion_id, n.establecimiento.nombre) : ''),
        textBlock('Descripci\u00f3n', n.descripcion),
        (isDM() && n.quests_relacionadas && n.quests_relacionadas.length) ? `<div class="detail-section"><div class="detail-label">Quests relacionadas</div><ul class="card-list">${n.quests_relacionadas.map(q => `<li>${relLink('quests', q.notion_id, q.nombre)}</li>`).join('')}</ul></div>` : '',
        (isDM() && n.items_magicos && n.items_magicos.length) ? `<div class="detail-section"><div class="detail-label">Items M\u00e1gicos</div><ul class="card-list">${n.items_magicos.map(i => `<li>${relLink('items', i.notion_id, i.nombre)}</li>`).join('')}</ul></div>` : '',
      ].join('');
    }
    case 'personajes': {
      const p = data;
      const jugador = p.jugador ? (typeof p.jugador === 'object' ? p.jugador.nombre : p.jugador) : null;
      return [
        row('Clase', escapeHtml(p.clase)),
        p.subclase ? row('Subclase', escapeHtml(p.subclase)) : '',
        row('Raza', escapeHtml(p.raza)),
        jugador ? row('Jugador', escapeHtml(jugador)) : '',
        (p.nivel !== null && p.nivel !== undefined) ? row('Nivel', p.nivel) : '',
        (p.ac !== null && p.ac !== undefined) ? row('AC', p.ac) : '',
        (p.hp_maximo !== null && p.hp_maximo !== undefined) ? row('HP M\u00e1x', p.hp_maximo) : '',
        textBlock('Descripci\u00f3n', p.descripcion),
        (p.items_magicos && p.items_magicos.length) ? `<div class="detail-section"><div class="detail-label">Items M\u00e1gicos</div><ul class="card-list">${p.items_magicos.map(i => `<li>${relLink('items', i.notion_id, i.nombre)}</li>`).join('')}</ul></div>` : '',
      ].join('');
    }
    case 'quests': {
      const q = data;
      return [
        row('Estado', estadoQuestBadge(q.estado)),
        q.recompensa_gp ? row('Recompensa', `<span class="quest-recompensa">&#9830; ${escapeHtml(q.recompensa_gp)} GP</span>`) : '',
        textBlock('Resumen', q.resumen),
      ].join('');
    }
    case 'ciudades': {
      const c = data;
      return [
        row('Reino/Estado', escapeHtml(c.estado)),
        row('L\u00edder', escapeHtml(c.lider)),
        c.poblacion ? row('Poblaci\u00f3n', c.poblacion.toLocaleString()) : '',
        textBlock('Descripci\u00f3n', c.descripcion),
        (isDM() && c.descripcion_lider) ? textBlock('Descripci\u00f3n L\u00edder (DM)', c.descripcion_lider) : '',
      ].join('');
    }
    case 'establecimientos': {
      const e = data;
      return [
        row('Tipo', e.tipo ? `<span class="badge tipo-badge">${escapeHtml(e.tipo)}</span>` : ''),
        row('Ciudad', e.ciudad ? relLink('ciudades', e.ciudad.notion_id, e.ciudad.nombre) : ''),
        row('Due\u00f1o', e.dueno ? relLink('npcs', e.dueno.notion_id, e.dueno.nombre) : ''),
        textBlock('Descripci\u00f3n', e.descripcion),
      ].join('');
    }
    case 'lugares': {
      const l = data;
      return [
        row('Tipo', l.tipo ? `<span class="badge tipo-badge">${escapeHtml(l.tipo)}</span>` : ''),
        row('Regi\u00f3n', escapeHtml(l.region)),
        row('Exploraci\u00f3n', escapeHtml(l.estado_exploracion)),
        textBlock('Descripci\u00f3n', l.descripcion),
      ].join('');
    }
    case 'items': {
      const it = data;
      return [
        row('Rareza', rarezaBadge(it.rareza)),
        row('Tipo', it.tipo ? `<span class="badge tipo-badge">${escapeHtml(it.tipo)}</span>` : ''),
        row('Attunement', it.requiere_sintonizacion ? '\u2713 S\u00ed' : 'No'),
        row('Portador', it.personaje ? relLink('personajes', it.personaje.notion_id, it.personaje.nombre) : '<span style="color:var(--text-dim)">Sin portador</span>'),
      ].join('');
    }
    case 'notas_dm': {
      const n = data;
      const jugadores = n.jugadores || [];
      return [
        n.fecha ? row('Fecha', escapeHtml(n.fecha)) : '',
        jugadores.length ? row('Jugadores', jugadores.map(j => `<span class="player-chip">${escapeHtml(typeof j === 'string' ? j : j.nombre)}</span>`).join(' ')) : '',
        textBlock('Resumen', n.resumen),
        (isDM() && n.session_prep) ? `<div class="detail-section detail-section-prep"><div class="detail-label-prep">&#9876; Session Prep</div><div class="detail-text detail-text-prep">${escapeHtml(n.session_prep).replace(/\n/g,'<br>')}</div></div>` : '',
      ].join('');
    }
    case 'notas_jugadores': {
      const n = data;
      const jugador = n.jugador ? (typeof n.jugador === 'object' ? n.jugador.nombre : n.jugador) : null;
      return [
        n.fecha ? row('Fecha', escapeHtml(n.fecha)) : '',
        jugador ? row('Jugador', escapeHtml(jugador)) : '',
        textBlock('Resumen', n.resumen),
        n.contenido ? `<div class="detail-section"><div class="detail-label">Notas de sesi\u00f3n</div><div class="detail-text">${escapeHtml(n.contenido).replace(/\n/g,'<br>')}</div></div>` : '',
      ].join('');
    }
    default:
      return `<pre style="font-size:0.75rem;color:var(--text-dim)">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  }
}

// ── RENDER PERSONAJES ───────────────────────────────────────────────
function renderPersonajes() {
  const grid = document.getElementById('grid-personajes');
  let items = DATA.players || [];
  if (!isDM()) items = items.filter(p => p.es_pj);
  if (!items.length) { grid.innerHTML = emptyState('No hay personajes.'); return; }

  grid.innerHTML = items.map(p => {
    const isPJ = p.es_pj;
    const cardClass = isPJ ? 'card card-pj' : 'card card-npc-aliado';
    const subtipo = isPJ ? `${val(p.raza)} ${val(p.clase)}` : `NPC \u2014 ${val(p.rol)}`;
    const jugadorStr = p.jugador ? `<span class="meta-item"><span class="meta-label">Jugador:</span> ${typeof p.jugador === 'object' ? escapeHtml(p.jugador.nombre) : escapeHtml(p.jugador)}</span>` : '';
    const subclaseStr = p.subclase ? `<span class="meta-item"><span class="meta-label">Subclase:</span> ${escapeHtml(p.subclase)}</span>` : '';

    const stats = (isPJ && (p.nivel || p.ac || p.hp_maximo)) ? `
      <div class="stat-pills">
        ${p.nivel !== null ? `<div class="stat-pill"><span class="stat-pill-label">Nv</span><span class="stat-pill-value">${p.nivel}</span></div>` : ''}
        ${p.ac !== null ? `<div class="stat-pill"><span class="stat-pill-label">AC</span><span class="stat-pill-value">${p.ac}</span></div>` : ''}
        ${p.hp_maximo !== null ? `<div class="stat-pill"><span class="stat-pill-label">HP</span><span class="stat-pill-value">${p.hp_maximo}</span></div>` : ''}
      </div>` : '';

    const itemsList = (p.items_magicos && p.items_magicos.length) ? `
      <div style="margin-top:10px">
        <div style="font-family:'Cinzel',serif;font-size:0.68rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:4px">ITEMS M\u00c1GICOS</div>
        <ul class="card-list">${p.items_magicos.map(i => `<li>${escapeHtml(i.nombre)}</li>`).join('')}</ul>
      </div>` : '';

    return `
    <div class="${cardClass}" data-section="personajes" data-notion-id="${p.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(p.nombre)}</div>
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:3px;font-style:italic">${subtipo}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta">${jugadorStr}${subclaseStr}</div>
        ${stats}
        ${p.descripcion ? `<div class="card-desc">${escapeHtml(p.descripcion)}</div>` : ''}
        ${itemsList}
      </div>
    </div>`;
  }).join('');
}

// ── RENDER QUESTS ──────────────────────────────────────────────────
function renderQuests() {
  const grid = document.getElementById('grid-quests');
  let items = DATA.quests || [];
  if (!isDM()) items = items.filter(q => q.visible_jugadores);
  if (!items.length) { grid.innerHTML = emptyState('No hay quests visibles.'); return; }

  grid.innerHTML = items.map(q => {
    const gp = q.recompensa_gp ? `<span class="quest-recompensa">&#9830; ${escapeHtml(q.recompensa_gp)} GP</span>` : '';
    return `
    <div class="card" data-section="quests" data-notion-id="${q.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(q.nombre)}</div>
          <div class="card-meta" style="margin-top:6px">${estadoQuestBadge(q.estado)} ${gp}</div>
        </div>
      </div>
      <div class="card-body">
        ${q.resumen ? `<div class="card-desc" style="border-top:none;padding-top:0">${escapeHtml(q.resumen).substring(0,150)}${q.resumen.length > 150 ? '\u2026' : ''}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── RENDER CIUDADES ─────────────────────────────────────────────────
function renderCiudades() {
  const grid = document.getElementById('grid-ciudades');
  let items = DATA.ciudades || [];
  if (!isDM()) items = items.filter(c => c.conocida_jugadores);
  items = filterBySearch(items, 'search-ciudades', ['nombre','estado','lider']);
  if (!items.length) { grid.innerHTML = emptyState('No hay ciudades.'); return; }

  grid.innerHTML = items.map(c => `
    <div class="card" data-section="ciudades" data-notion-id="${c.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(c.nombre)}</div>
          ${c.estado ? `<div style="font-size:0.75rem;color:var(--text-dim);margin-top:3px">${escapeHtml(c.estado)}</div>` : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          ${c.lider ? `<span class="meta-item"><span class="meta-label">L\u00edder:</span> ${escapeHtml(c.lider)}</span>` : ''}
          ${c.poblacion ? `<span class="meta-item"><span class="meta-label">Pob.:</span> ${c.poblacion.toLocaleString()}</span>` : ''}
        </div>
        ${c.descripcion ? `<div class="card-desc">${escapeHtml(c.descripcion)}</div>` : ''}
      </div>
    </div>`).join('');
}

// ── RENDER ESTABLECIMIENTOS ───────────────────────────────────────────
function renderEstablecimientos() {
  const grid = document.getElementById('grid-establecimientos');
  let items = DATA.establecimientos || [];
  if (!isDM()) items = items.filter(e => e.conocido_jugadores);
  items = filterBySearch(items, 'search-establecimientos', ['nombre','tipo']);
  if (!items.length) { grid.innerHTML = emptyState('No hay establecimientos.'); return; }

  grid.innerHTML = items.map(e => `
    <div class="card" data-section="establecimientos" data-notion-id="${e.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(e.nombre)}</div>
          <div class="card-meta" style="margin-top:5px">
            <span class="badge tipo-badge">${val(e.tipo)}</span>
            ${e.ciudad ? `<span style="font-size:0.75rem;color:var(--text-dim)">${escapeHtml(e.ciudad.nombre)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="card-body">
        ${e.dueno ? `<div class="card-meta"><span class="meta-item"><span class="meta-label">Due\u00f1o:</span> ${escapeHtml(e.dueno.nombre)}</span></div>` : ''}
        ${e.descripcion ? `<div class="card-desc">${escapeHtml(e.descripcion)}</div>` : ''}
      </div>
    </div>`).join('');
}

// ── RENDER LUGARES ──────────────────────────────────────────────────
function renderLugares() {
  const grid = document.getElementById('grid-lugares');
  let items = DATA.lugares || [];
  if (!items.length) { grid.innerHTML = emptyState('No hay lugares registrados.'); return; }

  grid.innerHTML = items.map(l => `
    <div class="card" data-section="lugares" data-notion-id="${l.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(l.nombre)}</div>
          <div class="card-meta" style="margin-top:5px">
            ${l.tipo ? `<span class="badge tipo-badge">${escapeHtml(l.tipo)}</span>` : ''}
            ${l.region ? `<span style="font-size:0.75rem;color:var(--text-dim)">${escapeHtml(l.region)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="card-body">
        ${l.estado_exploracion ? `<div class="card-meta"><span class="meta-item"><span class="meta-label">Exploraci\u00f3n:</span> ${escapeHtml(l.estado_exploracion)}</span></div>` : ''}
        ${l.descripcion ? `<div class="card-desc">${escapeHtml(l.descripcion)}</div>` : ''}
      </div>
    </div>`).join('');
}

// ── RENDER NPCS ─────────────────────────────────────────────────────
function renderNPCFilters() {
  const bar = document.getElementById('filter-bar-npcs');
  if (!bar || bar.querySelector('.filter-select')) return;

  let items = DATA.npcs || [];
  if (!isDM()) items = items.filter(n => n.conocido_jugadores);

  const ciudades = [...new Set(items.map(n => n.ciudad && n.ciudad.nombre).filter(Boolean))].sort();
  const tipos = [...new Set(items.map(n => n.tipo_npc).filter(Boolean))].sort();

  bar.innerHTML = `
    <div class="filter-bar">
      <select class="filter-select" id="filter-npc-ciudad" onchange="renderNPCsGrid()">
        <option value="">Todas las ciudades</option>
        ${ciudades.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-npc-rol" onchange="renderNPCsGrid()">
        <option value="">Todos los roles</option>
        <option value="Aliado">Aliado</option>
        <option value="Neutral">Neutral</option>
        <option value="Enemigo">Enemigo</option>
      </select>
      <select class="filter-select" id="filter-npc-estado" onchange="renderNPCsGrid()">
        <option value="">Todos los estados</option>
        <option value="Vivo">Vivo</option>
        <option value="Muerto">Muerto</option>
      </select>
      <select class="filter-select" id="filter-npc-tipo" onchange="renderNPCsGrid()">
        <option value="">Todos los tipos</option>
        ${tipos.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
      </select>
    </div>`;
}

function renderNPCsGrid() {
  const grid = document.getElementById('grid-npcs');
  let items = DATA.npcs || [];
  if (!isDM()) items = items.filter(n => n.conocido_jugadores);

  const fCiudad = document.getElementById('filter-npc-ciudad') ? document.getElementById('filter-npc-ciudad').value : '';
  const fRol    = document.getElementById('filter-npc-rol')    ? document.getElementById('filter-npc-rol').value    : '';
  const fEstado = document.getElementById('filter-npc-estado') ? document.getElementById('filter-npc-estado').value : '';
  const fTipo   = document.getElementById('filter-npc-tipo')   ? document.getElementById('filter-npc-tipo').value   : '';

  if (fCiudad) items = items.filter(n => n.ciudad && n.ciudad.nombre === fCiudad);
  if (fRol)    items = items.filter(n => n.rol === fRol);
  if (fEstado) items = items.filter(n => n.estado === fEstado);
  if (fTipo)   items = items.filter(n => n.tipo_npc === fTipo);

  if (!items.length) { grid.innerHTML = emptyState('No hay NPCs con esos filtros.'); return; }

  grid.innerHTML = items.map(n => `
    <div class="card" data-section="npcs" data-notion-id="${n.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(n.nombre)}</div>
          <div class="card-meta" style="margin-top:5px">
            ${rolBadge(n.rol)}
            ${estadoBadge(n.estado)}
            ${n.tipo_npc ? `<span class="badge tipo-badge">${escapeHtml(n.tipo_npc)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          ${n.raza ? `<span class="meta-item"><span class="meta-label">Raza:</span> ${escapeHtml(n.raza)}</span>` : ''}
          ${n.ciudad ? `<span class="meta-item"><span class="meta-label">Ciudad:</span> ${escapeHtml(n.ciudad.nombre)}</span>` : ''}
          ${n.establecimiento ? `<span class="meta-item"><span class="meta-label">Lugar:</span> ${escapeHtml(n.establecimiento.nombre)}</span>` : ''}
        </div>
        ${n.descripcion ? `<div class="card-desc">${escapeHtml(n.descripcion).substring(0,120)}${n.descripcion.length > 120 ? '\u2026' : ''}</div>` : ''}
      </div>
    </div>`).join('');
}

function renderNPCs() {
  renderNPCFilters();
  renderNPCsGrid();
}

// ── RENDER ITEMS ───────────────────────────────────────────────────────
function renderItems() {
  const grid = document.getElementById('grid-items');
  let items = DATA.items || [];
  if (!isDM()) items = items.filter(i => i.personaje !== null);
  items = filterBySearch(items, 'search-items', ['nombre','tipo','rareza']);
  if (!items.length) { grid.innerHTML = emptyState('No hay items visibles.'); return; }

  grid.innerHTML = items.map(it => `
    <div class="card" data-section="items" data-notion-id="${it.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(it.nombre)}</div>
          <div class="card-meta" style="margin-top:5px">
            ${rarezaBadge(it.rareza)}
            ${it.tipo ? `<span class="badge tipo-badge">${escapeHtml(it.tipo)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          ${it.personaje ? `<span class="meta-item"><span class="meta-label">Portador:</span> ${escapeHtml(it.personaje.nombre)}</span>` : '<span class="meta-item" style="color:var(--text-dim)">Sin portador</span>'}
          ${it.requiere_sintonizacion ? `<span class="badge badge-rare" style="font-size:0.58rem">Attunement</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

// ── RENDER NOTAS ─────────────────────────────────────────────────────
function renderNotaTypeFilter() {
  const bar = document.getElementById('filter-bar-notas');
  if (!bar || bar.querySelector('.filter-bar')) return;
  if (!isDM()) return;

  bar.innerHTML = `
    <div class="filter-bar">
      <select class="filter-select" id="filter-nota-tipo" onchange="renderNotasGrid()">
        <option value="">Todas las notas</option>
        <option value="dm">Solo DM</option>
        <option value="player">Solo Jugadores</option>
      </select>
    </div>`;
}

function renderNotasGrid() {
  const grid = document.getElementById('grid-notas');
  const filterTipo = document.getElementById('filter-nota-tipo') ? document.getElementById('filter-nota-tipo').value : '';
  let items = [];

  if (isDM()) {
    const dm = (DATA.notas_dm || []).map(n => ({...n, _tipo: 'dm'}));
    const pl = (DATA.notas_jugadores || []).map(n => ({...n, _tipo: 'player'}));
    items = [...dm, ...pl];
    if (filterTipo) items = items.filter(n => n._tipo === filterTipo);
  } else {
    items = (DATA.notas_jugadores || []).map(n => ({...n, _tipo: 'player'}));
  }

  items.sort((a,b) => {
    const da = a.fecha || '0000';
    const db = b.fecha || '0000';
    return db.localeCompare(da);
  });

  if (!items.length) { grid.innerHTML = emptyState('No hay notas de sesi\u00f3n.'); return; }

  grid.innerHTML = items.map(n => {
    const sectionKey = n._tipo === 'dm' ? 'notas_dm' : 'notas_jugadores';
    const tipoLabel = n._tipo === 'dm'
      ? `<span class="nota-tipo nota-tipo-dm">DM</span>`
      : `<span class="nota-tipo nota-tipo-player">Jugador</span>`;

    const jugadores = n.jugadores || (n.jugador ? [n.jugador] : []);
    const jugadoresHtml = jugadores.length
      ? `<div class="nota-players">${jugadores.map(j => `<span class="player-chip">${escapeHtml(typeof j === 'string' ? j : j.nombre)}</span>`).join('')}</div>`
      : '';

    const preview = n.resumen
      ? `<div class="card-desc" style="border-top:none;padding-top:0">${escapeHtml(n.resumen).substring(0,120)}${n.resumen.length > 120 ? '\u2026' : ''}</div>`
      : `<div class="card-desc" style="border-top:none;padding-top:0;opacity:0.5">Sin resumen a\u00fan.</div>`;

    return `
    <div class="card nota-card" data-section="${sectionKey}" data-notion-id="${n.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div class="card-title">${escapeHtml(n.nombre)}</div>
        <div class="nota-meta">
          ${tipoLabel}
          ${n.fecha ? `<span class="nota-date">${escapeHtml(n.fecha)}</span>` : ''}
          ${jugadoresHtml}
        </div>
      </div>
      <div class="card-body">${preview}</div>
    </div>`;
  }).join('');
}

function renderNotas() {
  renderNotaTypeFilter();
  renderNotasGrid();
}

// ── GITHUB SAVE ───────────────────────────────────────────────────
const DATA_KEY_MAP = { personajes: 'players' };
const FILE_MAP = {
  players: 'players.json',     personajes: 'players.json',
  quests: 'quests.json',       ciudades: 'ciudades.json',
  establecimientos: 'establecimientos.json', lugares: 'lugares.json',
  npcs: 'npcs.json',           items: 'items.json',
  notas_dm: 'notas_dm.json',   notas_jugadores: 'notas_jugadores.json',
};

async function saveToGitHub(filename, data) {
  const token = getGitHubToken();
  if (!token) throw new Error('Token de GitHub no configurado. Usa el bot\u00f3n \u2699 en el encabezado.');

  const base = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/contents/data/${filename}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  // Obtener SHA actual del archivo
  const getRes = await fetch(base, { headers });
  if (!getRes.ok) throw new Error(`Error al leer ${filename}: ${getRes.status}`);
  const { sha } = await getRes.json();

  // Subir contenido actualizado
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const putRes = await fetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message: `Update ${filename} via web`, content, sha })
  });
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.message || `GitHub error ${putRes.status}`);
  }
}

// ── MODAL (Edit/Add) ─────────────────────────────────────────────────
const FORM_SCHEMAS = {
  personajes: [
    { key:'nombre',    label:'Nombre',    type:'text', required:true },
    { key:'clase',     label:'Clase',     type:'text' },
    { key:'subclase',  label:'Subclase',  type:'text' },
    { key:'raza',      label:'Raza',      type:'text' },
    { key:'jugador',   label:'Jugador',   type:'select', options:['','Tino','Caco','Leo','Enoch','Hiram'] },
    { key:'nivel',     label:'Nivel',     type:'number' },
    { key:'ac',        label:'AC',        type:'number' },
    { key:'hp_maximo', label:'HP M\u00e1x', type:'number' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'es_pj',     label:'Es PJ',     type:'checkbox' },
  ],
  quests: [
    { key:'nombre',   label:'Nombre',  type:'text', required:true },
    { key:'estado',   label:'Estado',  type:'select', options:['Activa','Completada','Fallida','En Pausa'] },
    { key:'recompensa_gp', label:'Recompensa GP', type:'text' },
    { key:'resumen',  label:'Resumen', type:'textarea' },
    { key:'visible_jugadores', label:'Visible para jugadores', type:'checkbox' },
  ],
  ciudades: [
    { key:'nombre',    label:'Nombre',   type:'text', required:true },
    { key:'estado',    label:'Reino / Estado', type:'text' },
    { key:'lider',     label:'L\u00edder', type:'text' },
    { key:'poblacion', label:'Poblaci\u00f3n', type:'number' },
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
    { key:'nombre',  label:'Nombre', type:'text', required:true },
    { key:'tipo',    label:'Tipo',   type:'text' },
    { key:'region',  label:'Regi\u00f3n', type:'text' },
    { key:'estado_exploracion', label:'Estado Exploraci\u00f3n', type:'text' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
  ],
  npcs: [
    { key:'nombre',   label:'Nombre', type:'text', required:true },
    { key:'raza',     label:'Raza',   type:'text' },
    { key:'tipo_npc', label:'Tipo NPC', type:'text' },
    { key:'rol',      label:'Rol',    type:'select', options:['Neutral','Aliado','Enemigo'] },
    { key:'estado',   label:'Estado', type:'select', options:['Vivo','Muerto'] },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'conocido_jugadores', label:'Conocido por jugadores', type:'checkbox' },
  ],
  items: [
    { key:'nombre',  label:'Nombre', type:'text', required:true },
    { key:'tipo',    label:'Tipo',   type:'text' },
    { key:'rareza',  label:'Rareza', type:'select', options:['','Common','Uncommon','Rare','Very Rare','Legendary','Artifact'] },
    { key:'requiere_sintonizacion', label:'Requiere Attunement', type:'checkbox' },
  ],
  notas_dm: [
    { key:'nombre',  label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',   label:'Fecha (YYYY-MM-DD)', type:'text' },
    { key:'resumen', label:'Resumen', type:'textarea' },
  ],
  notas_jugadores: [
    { key:'nombre',  label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',   label:'Fecha (YYYY-MM-DD)', type:'text' },
    { key:'resumen', label:'Resumen', type:'textarea' },
  ],
  notas: [
    { key:'nombre',  label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',   label:'Fecha (YYYY-MM-DD)', type:'text' },
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
  currentModalData = data || null;
  currentModalMode = 'edit';
  const label = SECTION_LABELS[section] || section;
  document.getElementById('modal-title').textContent = data ? `Editar ${label}` : `A\u00f1adir ${label}`;

  const schema = FORM_SCHEMAS[section] || [];
  const body = document.getElementById('modal-body');
  body.classList.remove('is-detail');

  body.innerHTML = schema.map(field => {
    const v = data ? (data[field.key] !== undefined ? data[field.key] : '') : (field.type === 'checkbox' ? false : '');
    if (field.type === 'textarea') {
      return `<div class="form-group"><label>${field.label}</label><textarea id="field-${field.key}" rows="4">${escapeHtml(v || '')}</textarea></div>`;
    }
    if (field.type === 'checkbox') {
      return `<div class="form-group"><div class="form-check"><input type="checkbox" id="field-${field.key}" ${v ? 'checked' : ''}><label for="field-${field.key}">${field.label}</label></div></div>`;
    }
    if (field.type === 'select') {
      const opts = field.options.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${o || '\u2014 Ninguno \u2014'}</option>`).join('');
      return `<div class="form-group"><label>${field.label}</label><select id="field-${field.key}">${opts}</select></div>`;
    }
    return `<div class="form-group"><label>${field.label}${field.required ? ' *' : ''}</label><input type="${field.type || 'text'}" id="field-${field.key}" value="${escapeHtml(v !== null && v !== undefined ? String(v) : '')}"></div>`;
  }).join('');

  const footer = document.getElementById('modal-footer');
  footer.innerHTML = `
    <button class="btn" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-success" onclick="saveModal()">Guardar</button>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-body').classList.remove('is-detail');
  currentModalSection = null;
  currentModalData = null;
  currentModalMode = null;
}

async function saveModal() {
  if (!currentModalSection) return;

  if (!getGitHubToken()) {
    configurarToken();
    return;
  }

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

  let tableKey = currentModalSection;
  if (tableKey === 'notas') tableKey = 'notas_dm';
  const dataKey = DATA_KEY_MAP[tableKey] || tableKey;
  const filename = FILE_MAP[tableKey] || `${tableKey}.json`;
  const action = (currentModalData && currentModalData.notion_id) ? 'edit' : 'add';

  if (!DATA[dataKey]) DATA[dataKey] = [];
  const snapshot = [...DATA[dataKey]]; // backup para rollback

  if (action === 'add') {
    DATA[dataKey].push(newData);
  } else {
    const idx = DATA[dataKey].findIndex(i => i.notion_id === newData.notion_id);
    if (idx >= 0) DATA[dataKey][idx] = newData;
  }

  const spinner = document.getElementById('spinner');
  spinner.classList.add('open');
  try {
    await saveToGitHub(filename, DATA[dataKey]);
    closeModal();
    renderAll();
  } catch(e) {
    DATA[dataKey] = snapshot; // revertir cambio local
    alert('Error al guardar en GitHub: ' + e.message);
  } finally {
    spinner.classList.remove('open');
  }
}

// ── RELOAD DATA ───────────────────────────────────────────────────
async function recargarDatos() {
  const spinner = document.getElementById('spinner');
  spinner.classList.add('open');
  try {
    await loadData();
    renderAll();
  } catch(e) {
    alert('Error al recargar: ' + e.message);
  } finally {
    spinner.classList.remove('open');
  }
}
