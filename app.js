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
  const content = document.getElementById('content');
  if (tab === 'mapa') {
    content.classList.add('map-active');
    renderMapa();
  } else {
    content.classList.remove('map-active');
  }
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

// ── RELATION CHIP (clickeable + hover preview) ───────────────────
function relChip(tab, notionId, nombre, onCard = false) {
  if (!nombre) return '—';
  const safe = escapeHtml(nombre);
  if (!notionId) return safe;
  const cls = onCard ? 'rel-chip' : 'rel-link';
  return `<span class="${cls}" onclick="event.stopPropagation();navegarA('${tab}','${notionId}')" onmouseenter="showPreview('${tab}','${notionId}',event)" onmouseleave="hidePreview()">${safe}</span>`;
}

function showPreview(tab, notionId, event) {
  const arrMap = { npcs: DATA.npcs, ciudades: DATA.ciudades, establecimientos: DATA.establecimientos, personajes: DATA.players, items: DATA.items, quests: DATA.quests };
  const arr = arrMap[tab] || [];
  const rec = arr.find(x => x.notion_id === notionId);
  if (!rec) return;

  let html = `<div class="preview-title">${escapeHtml(rec.nombre)}</div>`;
  if (tab === 'npcs') {
    if (rec.rol)    html += `<div class="preview-row">${rolBadge(rec.rol)} ${estadoBadge(rec.estado)}</div>`;
    if (rec.raza)   html += `<div class="preview-row"><span class="preview-label">Raza:</span>${escapeHtml(rec.raza)}</div>`;
    if (rec.ciudad) html += `<div class="preview-row"><span class="preview-label">Ciudad:</span>${escapeHtml(rec.ciudad.nombre)}</div>`;
  } else if (tab === 'ciudades') {
    if (rec.estado)    html += `<div class="preview-row"><span class="preview-label">Reino:</span>${escapeHtml(rec.estado)}</div>`;
    if (rec.lider)     html += `<div class="preview-row"><span class="preview-label">Líder:</span>${escapeHtml(rec.lider)}</div>`;
    if (rec.poblacion) html += `<div class="preview-row"><span class="preview-label">Pob.:</span>${rec.poblacion.toLocaleString()}</div>`;
  } else if (tab === 'establecimientos') {
    if (rec.tipo)   html += `<div class="preview-row"><span class="badge tipo-badge">${escapeHtml(rec.tipo)}</span></div>`;
    if (rec.ciudad) html += `<div class="preview-row"><span class="preview-label">Ciudad:</span>${escapeHtml(rec.ciudad.nombre)}</div>`;
    if (rec.dueno)  html += `<div class="preview-row"><span class="preview-label">Dueño:</span>${escapeHtml(rec.dueno.nombre)}</div>`;
  } else if (tab === 'personajes') {
    if (rec.clase) html += `<div class="preview-row"><span class="preview-label">Clase:</span>${escapeHtml(rec.clase)}</div>`;
    if (rec.raza)  html += `<div class="preview-row"><span class="preview-label">Raza:</span>${escapeHtml(rec.raza)}</div>`;
  } else if (tab === 'items') {
    if (rec.rareza) html += `<div class="preview-row">${rarezaBadge(rec.rareza)}</div>`;
    if (rec.tipo)   html += `<div class="preview-row"><span class="badge tipo-badge">${escapeHtml(rec.tipo)}</span></div>`;
  }
  if (rec.descripcion) html += `<div class="preview-desc">${escapeHtml(rec.descripcion).substring(0,100)}${rec.descripcion.length > 100 ? '…' : ''}</div>`;

  const el = document.getElementById('card-preview');
  el.innerHTML = html;
  el.style.display = 'block';
  // Posicionar cerca del cursor, evitando salir de pantalla
  const x = Math.min(event.clientX + 14, window.innerWidth - 290);
  const y = Math.min(event.clientY + 14, window.innerHeight - el.offsetHeight - 10);
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
}

function hidePreview() {
  const el = document.getElementById('card-preview');
  if (el) el.style.display = 'none';
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

  body.innerHTML = schema.map(field => formFieldHTML(field, data)).join('');

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
  switch(section) {
    case 'npcs': {
      const n = data;
      return [
        row('Rol', rolBadge(n.rol)),
        row('Estado', estadoBadge(n.estado)),
        row('Tipo', n.tipo_npc ? `<span class="badge tipo-badge">${escapeHtml(n.tipo_npc)}</span>` : ''),
        row('Raza', escapeHtml(n.raza)),
        row('Ciudad', n.ciudad ? relChip('ciudades', n.ciudad.notion_id, n.ciudad.nombre) : ''),
        row('Establecimiento', n.establecimiento ? relChip('establecimientos', n.establecimiento.notion_id, n.establecimiento.nombre) : ''),
        textBlock('Descripci\u00f3n', n.descripcion),
        (isDM() && n.quests_relacionadas && n.quests_relacionadas.length) ? `<div class="detail-section"><div class="detail-label">Quests relacionadas</div><ul class="card-list">${n.quests_relacionadas.map(q => `<li>${relChip('quests', q.notion_id, q.nombre)}</li>`).join('')}</ul></div>` : '',
        (isDM() && n.items_magicos && n.items_magicos.length) ? `<div class="detail-section"><div class="detail-label">Items M\u00e1gicos</div><ul class="card-list">${n.items_magicos.map(i => `<li>${relChip('items', i.notion_id, i.nombre)}</li>`).join('')}</ul></div>` : '',
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
        (p.items_magicos && p.items_magicos.length) ? `<div class="detail-section"><div class="detail-label">Items M\u00e1gicos</div><ul class="card-list">${p.items_magicos.map(i => `<li>${relChip('items', i.notion_id, i.nombre)}</li>`).join('')}</ul></div>` : '',
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
      const cEstabs = (DATA.establecimientos || []).filter(e => e.ciudad && e.ciudad.notion_id === c.notion_id);
      const cNpcs   = (DATA.npcs || []).filter(n => n.ciudad && n.ciudad.notion_id === c.notion_id);
      return [
        row('Reino/Estado', escapeHtml(c.estado)),
        row('L\u00edder', escapeHtml(c.lider)),
        c.poblacion ? row('Poblaci\u00f3n', c.poblacion.toLocaleString()) : '',
        textBlock('Descripci\u00f3n', c.descripcion),
        (isDM() && c.descripcion_lider) ? textBlock('Descripci\u00f3n L\u00edder (DM)', c.descripcion_lider) : '',
        cEstabs.length ? `<div class="detail-section"><div class="detail-label">Establecimientos</div><ul class="card-list">${cEstabs.map(e => `<li>${relChip('establecimientos', e.notion_id, e.nombre)}</li>`).join('')}</ul></div>` : '',
        cNpcs.length ? `<div class="detail-section"><div class="detail-label">NPCs</div><ul class="card-list">${cNpcs.map(n => `<li>${relChip('npcs', n.notion_id, n.nombre)}</li>`).join('')}</ul></div>` : '',
      ].join('');
    }
    case 'establecimientos': {
      const e = data;
      return [
        row('Tipo', e.tipo ? `<span class="badge tipo-badge">${escapeHtml(e.tipo)}</span>` : ''),
        row('Ciudad', e.ciudad ? relChip('ciudades', e.ciudad.notion_id, e.ciudad.nombre) : ''),
        row('Due\u00f1o', e.dueno ? relChip('npcs', e.dueno.notion_id, e.dueno.nombre) : ''),
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
        row('Portador', it.personaje ? relChip('personajes', it.personaje.notion_id, it.personaje.nombre) : '<span style="color:var(--text-dim)">Sin portador</span>'),
        row('Fuente', escapeHtml(it.fuente)),
        textBlock('Descripci\u00f3n', it.descripcion),
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

  grid.innerHTML = items.map(c => {
    const cEstabs = (DATA.establecimientos || []).filter(e => e.ciudad && e.ciudad.notion_id === c.notion_id);
    const cNpcs   = (DATA.npcs || []).filter(n => n.ciudad && n.ciudad.notion_id === c.notion_id);
    return `
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
        ${cEstabs.length ? `<div style="margin-top:8px"><div style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:4px">ESTABLECIMIENTOS</div><div style="display:flex;flex-wrap:wrap;gap:4px">${cEstabs.map(e => relChip('establecimientos', e.notion_id, e.nombre, true)).join('')}</div></div>` : ''}
        ${cNpcs.length ? `<div style="margin-top:8px"><div style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:4px">NPCS</div><div style="display:flex;flex-wrap:wrap;gap:4px">${cNpcs.map(n => relChip('npcs', n.notion_id, n.nombre, true)).join('')}</div></div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── RENDER ESTABLECIMIENTOS ───────────────────────────────────────────
function renderEstablecimientosFilters() {
  const bar = document.getElementById('filter-bar-establecimientos');
  if (!bar || bar.querySelector('.filter-select')) return;

  let items = DATA.establecimientos || [];
  if (!isDM()) items = items.filter(e => e.conocido_jugadores);

  const tipos   = [...new Set(items.map(e => e.tipo).filter(Boolean))].sort();
  const ciudades = [...new Set(items.map(e => e.ciudad && e.ciudad.nombre).filter(Boolean))].sort();

  bar.innerHTML = `
    <div class="filter-bar">
      <select class="filter-select" id="filter-estab-tipo" onchange="renderEstablecimientosGrid()">
        <option value="">Todos los tipos</option>
        ${tipos.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-estab-ciudad" onchange="renderEstablecimientosGrid()">
        <option value="">Todas las ciudades</option>
        ${ciudades.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
    </div>`;
}

function renderEstablecimientosGrid() {
  const grid = document.getElementById('grid-establecimientos');
  let items = DATA.establecimientos || [];
  if (!isDM()) items = items.filter(e => e.conocido_jugadores);
  items = filterBySearch(items, 'search-establecimientos', ['nombre','tipo']);

  const fTipo   = document.getElementById('filter-estab-tipo')   ? document.getElementById('filter-estab-tipo').value   : '';
  const fCiudad = document.getElementById('filter-estab-ciudad') ? document.getElementById('filter-estab-ciudad').value : '';

  if (fTipo)   items = items.filter(e => e.tipo === fTipo);
  if (fCiudad) items = items.filter(e => e.ciudad && e.ciudad.nombre === fCiudad);

  if (!items.length) { grid.innerHTML = emptyState('No hay establecimientos con esos filtros.'); return; }

  grid.innerHTML = items.map(e => `
    <div class="card" data-section="establecimientos" data-notion-id="${e.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(e.nombre)}</div>
          <div class="card-meta" style="margin-top:5px">
            <span class="badge tipo-badge">${val(e.tipo)}</span>
            ${e.ciudad ? relChip('ciudades', e.ciudad.notion_id, e.ciudad.nombre, true) : ''}
          </div>
        </div>
      </div>
      <div class="card-body">
        ${e.dueno ? `<div class="card-meta"><span class="meta-item"><span class="meta-label">Due\u00f1o:</span> ${relChip('npcs', e.dueno.notion_id, e.dueno.nombre, true)}</span></div>` : ''}
        ${e.descripcion ? `<div class="card-desc">${escapeHtml(e.descripcion)}</div>` : ''}
      </div>
    </div>`).join('');
}

function renderEstablecimientos() {
  renderEstablecimientosFilters();
  renderEstablecimientosGrid();
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
          ${n.ciudad ? `<span class="meta-item"><span class="meta-label">Ciudad:</span> ${relChip('ciudades', n.ciudad.notion_id, n.ciudad.nombre, true)}</span>` : ''}
          ${n.establecimiento ? `<span class="meta-item"><span class="meta-label">Lugar:</span> ${relChip('establecimientos', n.establecimiento.notion_id, n.establecimiento.nombre, true)}</span>` : ''}
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
function renderItemsFilters() {
  const bar = document.getElementById('filter-bar-items');
  if (!bar || bar.querySelector('.filter-select')) return;

  let items = DATA.items || [];
  if (!isDM()) items = items.filter(i => i.personaje !== null);

  const personajes = [...new Set(items.filter(i => i.personaje).map(i => i.personaje.nombre))].sort();

  bar.innerHTML = `
    <div class="filter-bar">
      <select class="filter-select" id="filter-item-personaje" onchange="renderItemsGrid()">
        <option value="">Todos los portadores</option>
        <option value="__ninguno__">Sin portador</option>
        ${personajes.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
      </select>
    </div>`;
}

function renderItemsGrid() {
  const grid = document.getElementById('grid-items');
  let items = DATA.items || [];
  if (!isDM()) items = items.filter(i => i.personaje !== null);
  items = filterBySearch(items, 'search-items', ['nombre','tipo','rareza']);

  const fPersonaje = document.getElementById('filter-item-personaje') ? document.getElementById('filter-item-personaje').value : '';
  if (fPersonaje === '__ninguno__') items = items.filter(i => !i.personaje);
  else if (fPersonaje) items = items.filter(i => i.personaje && i.personaje.nombre === fPersonaje);

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
          ${it.personaje ? `<span class="meta-item"><span class="meta-label">Portador:</span> ${relChip('personajes', it.personaje.notion_id, it.personaje.nombre, true)}</span>` : '<span class="meta-item" style="color:var(--text-dim)">Sin portador</span>'}
          ${it.requiere_sintonizacion ? `<span class="badge badge-rare" style="font-size:0.58rem">Attunement</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function renderItems() {
  renderItemsFilters();
  renderItemsGrid();
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
    { key:'nombre',  label:'Nombre', type:'text', required:true },
    { key:'tipo',    label:'Tipo',   type:'select', options:['','Taberna','Librer\u00eda','Herrero','Templo','Tienda de Armas','Tienda Objetos M\u00e1gicos','Gremio','Gremio de Ladrones','Otro'] },
    { key:'ciudad',  label:'Ciudad', type:'select-rel', source:'ciudades' },
    { key:'dueno',   label:'Due\u00f1o', type:'select-rel', source:'npcs' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'conocido_jugadores', label:'Conocido por jugadores', type:'checkbox' },
  ],
  lugares: [
    { key:'nombre',  label:'Nombre', type:'text', required:true },
    { key:'tipo',    label:'Tipo',   type:'text' },
    { key:'region',  label:'Regi\u00f3n', type:'text' },
    { key:'estado_exploracion', label:'Estado Exploraci\u00f3n', type:'select', options:['','No explorado','Parcialmente explorado','Explorado'] },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
  ],
  npcs: [
    { key:'nombre',         label:'Nombre',   type:'text', required:true },
    { key:'raza',           label:'Raza',     type:'text' },
    { key:'tipo_npc',       label:'Tipo NPC', type:'select', options:['','Comerciante','Gremio','Religioso','Otro'] },
    { key:'rol',            label:'Rol',      type:'select', options:['Neutral','Aliado','Enemigo'] },
    { key:'estado',         label:'Estado',   type:'select', options:['Vivo','Muerto'] },
    { key:'ciudad',         label:'Ciudad',   type:'select-rel', source:'ciudades' },
    { key:'establecimiento', label:'Establecimiento', type:'select-rel', source:'establecimientos' },
    { key:'descripcion',    label:'Descripci\u00f3n', type:'textarea' },
    { key:'conocido_jugadores', label:'Conocido por jugadores', type:'checkbox' },
  ],
  items: [
    { key:'nombre',  label:'Nombre', type:'text', required:true },
    { key:'tipo',    label:'Tipo',   type:'select', options:['','Armor','Potion','Ring','Rod','Scroll','Staff','Wand','Weapon','Wondrous Item'] },
    { key:'rareza',  label:'Rareza', type:'select', options:['','Common','Uncommon','Rare','Very Rare','Legendary','Artifact'] },
    { key:'personaje', label:'Portador', type:'select-rel', source:'players', filter: r => r.es_pj },
    { key:'fuente',  label:'Fuente', type:'text' },
    { key:'requiere_sintonizacion', label:'Requiere Attunement', type:'checkbox' },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
  ],
  notas_dm: [
    { key:'nombre',  label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',   label:'Fecha (YYYY-MM-DD)', type:'text' },
    { key:'resumen', label:'Resumen', type:'textarea' },
  ],
  notas_jugadores: [
    { key:'nombre',   label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',    label:'Fecha (YYYY-MM-DD)', type:'text' },
    { key:'jugador',  label:'Jugador', type:'select', options:['','Pithor (Caco)','Lupin (Hiram)','Maverick (Enoch)','Doran (Leo)'] },
    { key:'resumen',  label:'Resumen', type:'textarea' },
    { key:'contenido', label:'Notas de sesi\u00f3n', type:'textarea' },
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

// ── FORM FIELD RENDERER ───────────────────────────────────────────────
function formFieldHTML(field, data) {
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
  if (field.type === 'select-rel') {
    const srcArr = (DATA[field.source] || []).filter(field.filter || (() => true));
    const current = data ? data[field.key] : null;
    const currentId = current ? current.notion_id : '';
    const opts = [
      `<option value="">\u2014 Ninguno \u2014</option>`,
      ...srcArr.map(r => `<option value="${r.notion_id}" ${r.notion_id === currentId ? 'selected' : ''}>${escapeHtml(r.nombre)}</option>`)
    ].join('');
    return `<div class="form-group"><label>${field.label}</label><select id="field-${field.key}">${opts}</select></div>`;
  }
  return `<div class="form-group"><label>${field.label}${field.required ? ' *' : ''}</label><input type="${field.type || 'text'}" id="field-${field.key}" value="${escapeHtml(v !== null && v !== undefined ? String(v) : '')}"></div>`;
}

function openModal(section, data) {
  currentModalSection = section;
  currentModalData = data || null;
  currentModalMode = 'edit';
  const label = SECTION_LABELS[section] || section;
  document.getElementById('modal-title').textContent = data ? `Editar ${label}` : `A\u00f1adir ${label}`;

  const schema = FORM_SCHEMAS[section] || [];
  const body = document.getElementById('modal-body');
  body.classList.remove('is-detail');

  body.innerHTML = schema.map(field => formFieldHTML(field, data)).join('');

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
    } else if (field.type === 'select-rel') {
      const selectedId = el.value;
      if (selectedId) {
        const srcArr = (DATA[field.source] || []).filter(field.filter || (() => true));
        const found = srcArr.find(r => r.notion_id === selectedId);
        newData[field.key] = found ? { notion_id: found.notion_id, nombre: found.nombre } : null;
      } else {
        newData[field.key] = null;
      }
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

// ── MAP ───────────────────────────────────────────────────────────
const VB_W0 = 1271, VB_H0 = 872;
let vbX = 0, vbY = 0, vbW = VB_W0, vbH = VB_H0;
let mapDragging = false, mapLastX = 0, mapLastY = 0;
let mapSvgEl = null;
let mapLoaded = false;

const MAP_LAYER_GROUPS = [
  { label: 'Biomas',      ids: ['biomes'],                  on: true  },
  { label: 'Cuadr\u00edcula', ids: ['gridOverlay'],             on: true  },
  { label: 'Ciudades',    ids: ['burgIcons', 'burgLabels'], on: true  },
  { label: 'Reinos',      ids: ['regions'],                 on: false },
  { label: 'Fronteras',   ids: ['borders'],                 on: false },
  { label: 'Culturas',    ids: ['cults'],                   on: false },
  { label: 'Etiquetas',   ids: ['states'],                  on: false },
];

async function renderMapa() {
  if (mapLoaded) return;
  const viewport = document.getElementById('map-viewport');
  if (!viewport) return;
  try {
    const res = await fetch('data/map.svg?t=' + Date.now());
    const text = await res.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(text, 'image/svg+xml');
    const svgEl = document.adoptNode(svgDoc.documentElement);
    viewport.innerHTML = '';
    viewport.appendChild(svgEl);
    mapSvgEl = viewport.querySelector('svg');
    if (!mapSvgEl) return;
    mapSvgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // --- Capas base: siempre visibles (no toggleables) ---
    const landmassEl = mapSvgEl.querySelector('#landmass');
    if (landmassEl) {
      landmassEl.setAttribute('mask', 'url(#land)');
      landmassEl.setAttribute('fill', '#ffffff');
    }
    ['oceanLayers', 'landmass', 'coastline'].forEach(id => {
      const el = mapSvgEl.querySelector('#' + id);
      if (el) el.style.display = '';
    });

    // labels es contenedor de burgLabels — siempre visible
    const labelsEl = mapSvgEl.querySelector('#labels');
    if (labelsEl) labelsEl.style.display = '';

    // --- Capas siempre ocultas (heightmap / recursos externos / debug) ---
    ['landHeights', 'heights', 'terrs', 'texture', 'fogging-cont', 'debug'].forEach(id => {
      const el = mapSvgEl.querySelector('#' + id);
      if (el) el.style.display = 'none';
    });

    // --- Fix fronteras: paths sin fill → default negro ---
    const stateBorders = mapSvgEl.querySelector('#stateBorders');
    if (stateBorders) stateBorders.setAttribute('fill', 'none');

    // --- Inyectar icon-circle (FMG no lo exporta) ---
    const ns = 'http://www.w3.org/2000/svg';
    const defs = mapSvgEl.querySelector('defs');
    if (defs && !mapSvgEl.querySelector('#icon-circle')) {
      const symbol = document.createElementNS(ns, 'symbol');
      symbol.setAttribute('id', 'icon-circle');
      symbol.setAttribute('viewBox', '0 0 12 12');
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', '6');
      circle.setAttribute('cy', '6');
      circle.setAttribute('r', '4');
      symbol.appendChild(circle);
      defs.appendChild(symbol);
    }
    // Asignar width/height a cada <use> en burgIcons (sin estos, renderizan enormes)
    mapSvgEl.querySelectorAll('#burgIcons use').forEach(use => {
      const parent = use.closest('g[font-size]');
      const size = parent ? +parent.getAttribute('font-size') : 2;
      use.setAttribute('width', String(size));
      use.setAttribute('height', String(size));
    });

    // --- Inyectar patrón hexagonal (~47 columnas, medido de referencia FMG) ---
    if (defs && !mapSvgEl.querySelector('#pattern_pointyHex')) {
      const s = 15.6, hx = 13.5, W = 27.01, H = 46.8;
      const pattern = document.createElementNS(ns, 'pattern');
      pattern.setAttribute('id', 'pattern_pointyHex');
      pattern.setAttribute('width', String(W));
      pattern.setAttribute('height', String(H));
      pattern.setAttribute('patternUnits', 'userSpaceOnUse');
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d',
        `M${hx},0 L${W},${s} L${W},${s*2} L${hx},${H} ` +
        `M${hx},0 L0,${s} L0,${s*2} L${hx},${H}`
      );
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#777777');
      path.setAttribute('stroke-width', '0.5');
      pattern.appendChild(path);
      defs.appendChild(pattern);
    }

    renderMapLayerPanel();
    initMapZoomPan(viewport);
    initMapCityLinks();
    mapLoaded = true;
  } catch(e) {
    viewport.innerHTML = `<div style="padding:40px;color:var(--text-dim);font-family:'Cinzel',serif;text-align:center">Error al cargar el mapa: ${e.message}</div>`;
  }
}

function renderMapLayerPanel() {
  const panel = document.getElementById('map-layer-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="map-panel-title">Capas</div>
    ${MAP_LAYER_GROUPS.map((g, i) => `
      <label class="map-layer-row">
        <input type="checkbox" ${g.on ? 'checked' : ''} onchange="toggleMapLayer(${i}, this.checked)">
        <span>${g.label}</span>
      </label>
    `).join('')}
  `;
  MAP_LAYER_GROUPS.forEach((g, i) => toggleMapLayer(i, g.on));
}

function toggleMapLayer(groupIdx, visible) {
  const g = MAP_LAYER_GROUPS[groupIdx];
  if (g) g.on = visible;
  if (!mapSvgEl) return;
  (g ? g.ids : []).forEach(id => {
    const el = mapSvgEl.querySelector('#' + id);
    if (el) el.style.display = visible ? '' : 'none';
  });
}

function applyMapViewBox() {
  if (mapSvgEl) mapSvgEl.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
}

function initMapZoomPan(viewport) {
  // Zoom con rueda — centrado en la posición del cursor
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 0.85 : 1.18;
    const rect = viewport.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left)  / rect.width;
    const ratioY = (e.clientY - rect.top)   / rect.height;
    const svgCX = vbX + ratioX * vbW;
    const svgCY = vbY + ratioY * vbH;
    vbW = Math.max(60, Math.min(VB_W0 * 3, vbW * factor));
    vbH = vbW * (VB_H0 / VB_W0);
    vbX = svgCX - ratioX * vbW;
    vbY = svgCY - ratioY * vbH;
    applyMapViewBox();
  }, { passive: false });

  // Drag con mouse
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mapDragging = true;
    mapLastX = e.clientX;
    mapLastY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!mapDragging) return;
    const rect = viewport.getBoundingClientRect();
    vbX -= (e.clientX - mapLastX) / rect.width  * vbW;
    vbY -= (e.clientY - mapLastY) / rect.height * vbH;
    mapLastX = e.clientX;
    mapLastY = e.clientY;
    applyMapViewBox();
  });
  window.addEventListener('mouseup', () => { mapDragging = false; });

  // Touch básico
  let t0x = 0, t0y = 0;
  viewport.addEventListener('touchstart', (e) => {
    t0x = e.touches[0].clientX; t0y = e.touches[0].clientY;
  }, { passive: true });
  viewport.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    vbX -= (e.touches[0].clientX - t0x) / rect.width  * vbW;
    vbY -= (e.touches[0].clientY - t0y) / rect.height * vbH;
    t0x = e.touches[0].clientX; t0y = e.touches[0].clientY;
    applyMapViewBox();
  }, { passive: false });
}

function mapZoom(factor) {
  const cx = vbX + vbW / 2;
  const cy = vbY + vbH / 2;
  vbW = Math.max(60, Math.min(VB_W0 * 3, vbW * factor));
  vbH = vbW * (VB_H0 / VB_W0);
  vbX = cx - vbW / 2;
  vbY = cy - vbH / 2;
  applyMapViewBox();
}

function mapZoomReset() {
  vbX = 0; vbY = 0; vbW = VB_W0; vbH = VB_H0;
  applyMapViewBox();
}

function initMapCityLinks() {
  const labelLayer = mapSvgEl.querySelector('#burgLabels');
  const iconLayer  = mapSvgEl.querySelector('#burgIcons');
  if (!labelLayer) return;

  const todasCiudades = DATA.ciudades || [];
  const ciudadesVisibles = isDM()
    ? todasCiudades
    : todasCiudades.filter(c => c.conocida_jugadores);

  labelLayer.querySelectorAll('text').forEach(t => {
    const name = t.textContent.trim();
    const ciudad = ciudadesVisibles.find(c => c.nombre.toLowerCase() === name.toLowerCase());

    if (!ciudad) {
      // Jugadores: ocultar ciudades desconocidas
      if (!isDM()) {
        t.style.display = 'none';
        const burgId = t.dataset.id;
        if (burgId && iconLayer) {
          const icon = iconLayer.querySelector(`[data-id="${burgId}"]`);
          if (icon) icon.style.display = 'none';
        }
      }
      return;
    }

    // Ciudad con ficha → clickeable
    t.classList.add('map-city-link');
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail('ciudades', ciudad);
    });
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = ciudad.nombre;
    t.appendChild(title);
  });
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
