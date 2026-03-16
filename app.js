/* =============================================================
   HALO — D&D Campaign Manager
   app.js — Full application logic
   ============================================================= */

// ── DATA STORE ────────────────────────────────────────────
const DATA = {};
let MAP_MARKERS = {}; // {notion_id: {x, y}}
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
}

// ── GITHUB TOKEN ──────────────────────────────────────────
function getGitHubToken() {
  return localStorage.getItem('gh_token') || '';
}

// ── DATA LOADING ──────────────────────────────────────────────
async function loadData() {
  const files = ['players','quests','ciudades','establecimientos','lugares','npcs','items','notas_dm','notas_jugadores'];
  const useNotion = CONFIG.USE_NOTION && CONFIG.WORKER_URL;

  if (useNotion) {
    try {
      await Promise.all(files.map(async (f) => {
        const res = await fetch(`${CONFIG.WORKER_URL}/api/${f}`);
        if (!res.ok) throw new Error(`Worker ${f}: ${res.status}`);
        DATA[f] = await res.json();
      }));
      console.log('✓ Datos cargados desde Notion');
      // Marcadores: localStorage primero, luego JSON remoto como fallback
      try {
        const stored = localStorage.getItem('map_markers');
        if (stored) { MAP_MARKERS = JSON.parse(stored); }
        else { const mr = await fetch(`data/markers.json?t=${Date.now()}`); MAP_MARKERS = await mr.json(); }
      } catch { MAP_MARKERS = {}; }
      return;
    } catch(e) {
      console.warn('⚠ Notion falló, usando JSON locales:', e.message);
    }
  }

  // Fallback: JSON locales
  await Promise.all(files.map(async (f) => {
    try {
      const res = await fetch(`data/${f}.json?t=${Date.now()}`);
      DATA[f] = await res.json();
    } catch(e) {
      DATA[f] = [];
    }
  }));
  console.log('✓ Datos cargados desde JSON locales');

  // Marcadores: localStorage primero, luego JSON local como fallback
  try {
    const stored = localStorage.getItem('map_markers');
    if (stored) { MAP_MARKERS = JSON.parse(stored); }
    else { const res = await fetch(`data/markers.json?t=${Date.now()}`); MAP_MARKERS = await res.json(); }
  } catch { MAP_MARKERS = {}; }
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
  if (mapLoaded) renderMapMarkers();
}

// ── HELPERS ───────────────────────────────────────────────────────
function val(v, fallback='—') {
  if (v === null || v === undefined || v === '') return fallback;
  return v;
}

const EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12.5c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"/></svg>';
const EYE_CLOSED = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.8 0 5 2.2 5 5 0 .7-.1 1.3-.4 1.9l2.9 2.9c1.5-1.3 2.7-3 3.4-4.8-1.7-4.4-6-7.5-11-7.5-1.4 0-2.7.3-4 .7l2.2 2.2c.6-.3 1.2-.4 1.9-.4zM2 4.3l2.3 2.3.4.4C3.1 8.3 1.9 10 1.1 12c1.7 4.4 6 7.5 11 7.5 1.5 0 3-.3 4.4-.8l.4.4 3 3 1.3-1.3L3.3 3 2 4.3zm5.5 5.5l1.6 1.6c0 .2-.1.4-.1.6 0 1.7 1.3 3 3 3 .2 0 .4 0 .6-.1l1.6 1.6c-.7.3-1.4.5-2.2.5-2.8 0-5-2.2-5-5 0-.8.2-1.5.5-2.2z"/></svg>';

function visibilityToggleHtml(entity, notionId, isVisible) {
  if (!isDM()) return '';
  return `<span class="visibility-toggle ${isVisible ? 'is-visible' : ''}" onclick="event.stopPropagation(); toggleVisibility('${entity}', '${notionId}', this)" title="${isVisible ? 'Visible para jugadores' : 'Oculto para jugadores'}">${isVisible ? EYE_OPEN : EYE_CLOSED}</span>`;
}

async function toggleVisibility(entity, notionId, iconEl) {
  const dataKey = entity;
  const arr = DATA[dataKey] || [];
  const item = arr.find(x => x.notion_id === notionId);
  if (!item) return;

  // Determinar el campo correcto
  const field = entity === 'ciudades' ? 'conocida_jugadores' : 'conocido_jugadores';
  const newVal = !item[field];
  item[field] = newVal;

  // Actualizar icono inmediatamente
  iconEl.innerHTML = newVal ? EYE_OPEN : EYE_CLOSED;
  iconEl.classList.toggle('is-visible', newVal);
  iconEl.title = newVal ? 'Visible para jugadores' : 'Oculto para jugadores';

  // Persistir en Notion
  if (CONFIG.USE_NOTION && CONFIG.WORKER_URL) {
    try {
      await fetch(`${CONFIG.WORKER_URL}/api/${dataKey}/${notionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
    } catch(e) { console.warn('Toggle visibility save failed:', e); }
  }
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
  const arrMap = { npcs: DATA.npcs, ciudades: DATA.ciudades, establecimientos: DATA.establecimientos, personajes: DATA.players, items: DATA.items, quests: DATA.quests, lugares: DATA.lugares, notas_dm: DATA.notas_dm };
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
  const canDelete = isDM() && section === 'lugares' && data.notion_id;
  footer.innerHTML = `
    ${canDelete ? `<button class="btn btn-danger" onclick="deleteLugar('${data.notion_id}')" style="margin-right:auto">Eliminar</button>` : ''}
    <button class="btn" onclick="closeModal()">Cerrar</button>
    ${(isDM() || data.creado_por_jugador) ? `<button class="btn btn-success" onclick="switchToEdit()">✎ Editar</button>` : ''}
  `;

  document.getElementById('modal-overlay').classList.add('open');

  // Cargar contenido de página bajo demanda para notas
  if (data.notion_id && CONFIG.WORKER_URL) {
    const targetId = section === 'notas_dm' ? 'session-prep-content' : section === 'notas_jugadores' ? 'nota-page-content' : null;
    if (targetId && (section !== 'notas_dm' || isDM())) {
      fetch(`${CONFIG.WORKER_URL}/api/content/${data.notion_id}`)
        .then(r => r.json())
        .then(res => {
          const el = document.getElementById(targetId);
          if (el) el.innerHTML = res.html || '<em>Sin contenido</em>';
        })
        .catch(() => {
          const el = document.getElementById(targetId);
          if (el) el.innerHTML = '<em>Error al cargar</em>';
        });
    }
  }
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
  initSearchableSelects(body);

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
        (n.quests && n.quests.length) ? row('Quests', n.quests.map(q => relChip('quests', q.notion_id, q.nombre)).join(' ')) : '',
        (n.items_magicos && n.items_magicos.length) ? row('Items', n.items_magicos.map(i => relChip('items', i.notion_id, i.nombre)).join(' ')) : '',
        (n.lugares && n.lugares.length) ? row('Lugares', n.lugares.map(l => relChip('lugares', l.notion_id, l.nombre)).join(' ')) : '',
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
      const qNpcs = q.quest_npcs || [];
      const qLugares = q.lugares || [];
      const qCiudades = q.ciudades || [];
      const qEstabs = q.establecimientos || [];
      const qNotas = q.notas_dm || [];
      return [
        row('Estado', estadoQuestBadge(q.estado)),
        q.recompensa_gp ? row('Recompensa', `<span class="quest-recompensa">&#9830; ${escapeHtml(q.recompensa_gp)} GP</span>`) : '',
        qNpcs.length ? row('NPCs', qNpcs.map(n => relChip('npcs', n.notion_id, n.nombre)).join(' ')) : '',
        qLugares.length ? row('Lugares', qLugares.map(l => relChip('lugares', l.notion_id, l.nombre)).join(' ')) : '',
        qCiudades.length ? row('Ciudades', qCiudades.map(c => relChip('ciudades', c.notion_id, c.nombre)).join(' ')) : '',
        qEstabs.length ? row('Establecimientos', qEstabs.map(e => relChip('establecimientos', e.notion_id, e.nombre)).join(' ')) : '',
        textBlock('Resumen', q.resumen),
        isDM() && qNotas.length ? row('Notas DM', qNotas.map(n => relChip('notas_dm', n.notion_id, n.nombre)).join(' ')) : '',
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
      const npcsL = l.npcs || [];
      const itemsL = l.items_magicos || [];
      const questsL = l.quests || [];
      return [
        row('Tipo', l.tipo ? `<span class="badge tipo-badge">${escapeHtml(l.tipo)}</span>` : ''),
        row('Regi\u00f3n', escapeHtml(l.region)),
        row('Exploraci\u00f3n', escapeHtml(l.estado_exploracion)),
        row('Ciudad', l.ciudad?.nombre ? relChip('ciudades', l.ciudad.notion_id, l.ciudad.nombre) : ''),
        npcsL.length ? row('NPCs', npcsL.map(n => relChip('npcs', n.notion_id, n.nombre)).join(' ')) : '',
        itemsL.length ? row('Items', itemsL.map(i => relChip('items', i.notion_id, i.nombre)).join(' ')) : '',
        questsL.length ? row('Quests', questsL.map(q => relChip('quests', q.notion_id, q.nombre)).join(' ')) : '',
        textBlock('Descripci\u00f3n', l.descripcion),
      ].join('');
    }
    case 'items': {
      const it = data;
      return [
        row('Rareza', rarezaBadge(it.rareza)),
        row('Tipo', it.tipo ? `<span class="badge tipo-badge">${escapeHtml(it.tipo)}</span>` : ''),
        row('Attunement', it.requiere_sintonizacion ? '\u2713 S\u00ed' : 'No'),
        row('Portador', it.personaje?.nombre ? relChip('personajes', it.personaje.notion_id, it.personaje.nombre) : '<span style="color:var(--text-dim)">Sin portador</span>'),
        it.npc_portador?.nombre ? row('NPC Portador', relChip('npcs', it.npc_portador.notion_id, it.npc_portador.nombre)) : '',
        row('Fuente', escapeHtml(it.fuente)),
        textBlock('Descripci\u00f3n', it.descripcion),
      ].join('');
    }
    case 'notas_dm': {
      const n = data;
      const jugadores = n.jugadores_presentes || n.jugadores || [];
      const quests = n.quests || [];
      return [
        n.fecha ? row('Fecha', escapeHtml(n.fecha)) : '',
        jugadores.length ? row('Jugadores', jugadores.map(j => `<span class="player-chip">${escapeHtml(typeof j === 'string' ? j : j.nombre)}</span>`).join(' ')) : '',
        quests.length ? row('Quests', quests.map(q => relChip('quests', q.notion_id, q.nombre)).join(' ')) : '',
        textBlock('Resumen', n.resumen),
        isDM() ? `<div class="detail-section detail-section-prep" id="session-prep-container"><div class="detail-label-prep">&#9876; Session Prep</div><div class="detail-text detail-text-prep" id="session-prep-content"><em>Cargando...</em></div></div>` : '',
      ].join('');
    }
    case 'notas_jugadores': {
      const n = data;
      const jugador = n.jugador || [];
      const items = n.items || [];
      return [
        n.fecha ? row('Fecha', escapeHtml(n.fecha)) : '',
        jugador.length ? row('Jugador', jugador.map(j => `<span class="player-chip">${escapeHtml(typeof j === 'string' ? j : j.nombre)}</span>`).join(' ')) : '',
        items.length ? row('Items', items.map(i => relChip('items', i.notion_id, i.nombre)).join(' ')) : '',
        textBlock('Resumen', n.resumen),
        `<div class="detail-section" id="nota-content-container"><div class="detail-label">Contenido</div><div class="detail-text" id="nota-page-content"><em>Cargando...</em></div></div>`,
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
  if (!isDM()) items = items.filter(q => q.conocido_jugadores);
  if (!items.length) { grid.innerHTML = emptyState('No hay quests visibles.'); return; }

  grid.innerHTML = items.map(q => {
    const gp = q.recompensa_gp ? `<span class="quest-recompensa">&#9830; ${escapeHtml(q.recompensa_gp)} GP</span>` : '';
    return `
    <div class="card" data-section="quests" data-notion-id="${q.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('quests', q.notion_id, q.conocido_jugadores)}
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(q.nombre)}</div>
          <div class="card-meta" style="margin-top:6px">${estadoQuestBadge(q.estado)} ${gp}</div>
        </div>
      </div>
      <div class="card-body">
        ${(q.quest_npcs && q.quest_npcs.length) ? `<div class="card-meta"><span class="meta-label">NPCs:</span> ${q.quest_npcs.map(n => relChip('npcs', n.notion_id, n.nombre, true)).join(' ')}</div>` : ''}
        ${(q.lugares && q.lugares.length) ? `<div class="card-meta"><span class="meta-label">Lugares:</span> ${q.lugares.map(l => relChip('lugares', l.notion_id, l.nombre, true)).join(' ')}</div>` : ''}
        ${(q.ciudades && q.ciudades.length) ? `<div class="card-meta"><span class="meta-label">Ciudades:</span> ${q.ciudades.map(c => relChip('ciudades', c.notion_id, c.nombre, true)).join(' ')}</div>` : ''}
        ${q.resumen ? `<div class="card-desc">${escapeHtml(q.resumen).substring(0,150)}${q.resumen.length > 150 ? '\u2026' : ''}</div>` : ''}
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
      ${visibilityToggleHtml('ciudades', c.notion_id, c.conocida_jugadores)}
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
      ${visibilityToggleHtml('establecimientos', e.notion_id, e.conocido_jugadores)}
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
  if (!isDM()) items = items.filter(l => l.conocido_jugadores || l.creado_por_jugador);
  if (!items.length) { grid.innerHTML = emptyState('No hay lugares registrados.'); return; }

  grid.innerHTML = items.map(l => `
    <div class="card" data-section="lugares" data-notion-id="${l.notion_id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('lugares', l.notion_id, l.conocido_jugadores)}
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
        ${l.ciudad?.nombre ? `<div class="card-meta"><span class="meta-item"><span class="meta-label">Ciudad:</span> ${escapeHtml(l.ciudad.nombre)}</span></div>` : ''}
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
      ${visibilityToggleHtml('npcs', n.notion_id, n.conocido_jugadores)}
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
      ${visibilityToggleHtml('items', it.notion_id, it.conocido_jugadores)}
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

async function deleteLugar(notionId) {
  if (!confirm('¿Eliminar este lugar? Se archivará en Notion.')) return;
  const spinner = document.getElementById('spinner');
  spinner.classList.add('open');
  try {
    if (CONFIG.USE_NOTION && CONFIG.WORKER_URL) {
      const res = await fetch(`${CONFIG.WORKER_URL}/api/lugares/${notionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
    }
    DATA.lugares = (DATA.lugares || []).filter(l => l.notion_id !== notionId);
    if (MAP_MARKERS[notionId]) {
      delete MAP_MARKERS[notionId];
      localStorage.setItem('map_markers', JSON.stringify(MAP_MARKERS));
      try { await saveToGitHub('markers.json', MAP_MARKERS); } catch(e) { console.warn('markers.json save failed:', e); }
    }
    closeModal();
    renderAll();
  } catch(e) {
    alert('Error al eliminar: ' + e.message);
  } finally {
    spinner.classList.remove('open');
  }
}

async function saveMarkerPosition(notionId, x, y) {
  MAP_MARKERS[notionId] = { x, y };
  localStorage.setItem('map_markers', JSON.stringify(MAP_MARKERS));
  try { await saveToGitHub('markers.json', MAP_MARKERS); } catch(e) { console.warn('GitHub markers sync failed:', e); }
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
    { key:'quest_npcs', label:'NPCs relacionados', type:'select-rel-multi', source:'npcs' },
    { key:'lugares', label:'Lugares relacionados', type:'select-rel-multi', source:'lugares' },
    { key:'ciudades', label:'Ciudades relacionadas', type:'select-rel-multi', source:'ciudades' },
    { key:'establecimientos', label:'Establecimientos relacionados', type:'select-rel-multi', source:'establecimientos' },
    { key:'notas_dm', label:'Notas DM relacionadas', type:'select-rel-multi', source:'notas_dm' },
    { key:'conocido_jugadores', label:'Conocido por jugadores', type:'checkbox' },
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
    { key:'tipo',    label:'Tipo',   type:'select', options:['','Pueblo','Aldea','Dungeon','Bosque','Ruinas','Fortaleza','Templo','Cueva','Puerto','Torre','Otro'] },
    { key:'region',  label:'Regi\u00f3n', type:'select', options:['','Valora','Khunulba','Shimberia','Elarithva','Mythalos','Gnomalia','Khaz-Alun','Naiolonde','Mirnax','Bhiaxi','Genghis Clan','Krigh','Whitbury','Dustcairn','Selumanora','Shatrekvan'] },
    { key:'estado_exploracion', label:'Estado Exploraci\u00f3n', type:'select', options:['','Sin explorar','Parcialmente explorado','Explorado'] },
    { key:'descripcion', label:'Descripci\u00f3n', type:'textarea' },
    { key:'ciudad',  label:'Ciudad cercana', type:'select-rel', source:'ciudades' },
    { key:'npcs',    label:'NPCs relacionados', type:'select-rel-multi', source:'npcs' },
    { key:'items_magicos', label:'Items relacionados', type:'select-rel-multi', source:'items' },
    { key:'quests',  label:'Quests relacionadas', type:'select-rel-multi', source:'quests' },
    { key:'conocido_jugadores', label:'Conocido por jugadores', type:'checkbox' },
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
    const items = field.options.map(o => ({ value: o, label: o || '— Ninguno —' }));
    const selLabel = items.find(i => i.value === v)?.label || '— Ninguno —';
    return `<div class="form-group"><label>${field.label}</label>
      <div class="ss-wrap" data-field="${field.key}">
        <input type="hidden" id="field-${field.key}" value="${escapeHtml(v || '')}">
        <input type="text" class="ss-input" placeholder="Buscar..." value="${escapeHtml(selLabel !== '— Ninguno —' ? selLabel : '')}" autocomplete="off">
        <div class="ss-dropdown">${items.map(i => `<div class="ss-option" data-value="${escapeHtml(i.value)}">${escapeHtml(i.label)}</div>`).join('')}</div>
      </div></div>`;
  }
  if (field.type === 'select-rel') {
    let srcArr = (DATA[field.source] || []).filter(field.filter || (() => true));
    if (!isDM()) {
      srcArr = srcArr.filter(r => r.conocida_jugadores || r.conocido_jugadores || r.creado_por_jugador);
    }
    const current = data ? data[field.key] : null;
    const currentId = current ? current.notion_id : '';
    const items = [{ value: '', label: '— Ninguno —' }, ...srcArr.map(r => ({ value: r.notion_id, label: r.nombre }))];
    const selLabel = items.find(i => i.value === currentId)?.label || '';
    return `<div class="form-group"><label>${field.label}</label>
      <div class="ss-wrap" data-field="${field.key}">
        <input type="hidden" id="field-${field.key}" value="${escapeHtml(currentId)}">
        <input type="text" class="ss-input" placeholder="Buscar..." value="${escapeHtml(selLabel !== '— Ninguno —' ? selLabel : '')}" autocomplete="off">
        <div class="ss-dropdown">${items.map(i => `<div class="ss-option" data-value="${escapeHtml(i.value)}">${escapeHtml(i.label)}</div>`).join('')}</div>
      </div></div>`;
  }
  if (field.type === 'select-rel-multi') {
    let srcArr = (DATA[field.source] || []).filter(field.filter || (() => true));
    if (!isDM()) {
      srcArr = srcArr.filter(r => r.conocida_jugadores || r.conocido_jugadores || r.creado_por_jugador);
    }
    const currentArr = (data ? data[field.key] : null) || [];
    const selectedIds = currentArr.map(r => r.notion_id);
    const chips = currentArr.map(r => `<span class="ssm-chip" data-id="${r.notion_id}">${escapeHtml(r.nombre)}<span class="ssm-chip-x">&times;</span></span>`).join('');
    const items = srcArr.map(r => `<div class="ss-option" data-value="${r.notion_id}" style="${selectedIds.includes(r.notion_id) ? 'display:none' : ''}">${escapeHtml(r.nombre)}</div>`).join('');
    return `<div class="form-group"><label>${field.label}</label>
      <div class="ssm-wrap" data-field="${field.key}" data-source="${field.source}">
        <input type="hidden" id="field-${field.key}" value='${JSON.stringify(selectedIds)}'>
        <div class="ssm-chips">${chips}</div>
        <input type="text" class="ss-input" placeholder="Buscar..." autocomplete="off">
        <div class="ss-dropdown">${items}</div>
      </div></div>`;
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
  initSearchableSelects(body);

  const footer = document.getElementById('modal-footer');
  footer.innerHTML = `
    <button class="btn" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-success" onclick="saveModal()">Guardar</button>
  `;

  document.getElementById('modal-overlay').classList.add('open');
}

function initSearchableSelects(container) {
  container.querySelectorAll('.ss-wrap').forEach(wrap => {
    const hidden = wrap.querySelector('input[type="hidden"]');
    const input = wrap.querySelector('.ss-input');
    const dropdown = wrap.querySelector('.ss-dropdown');
    const allOptions = [...dropdown.querySelectorAll('.ss-option')];

    input.addEventListener('focus', () => {
      dropdown.classList.add('open');
      input.select();
      filterOptions('');
    });

    input.addEventListener('input', () => {
      filterOptions(input.value);
    });

    function filterOptions(query) {
      const q = query.toLowerCase();
      allOptions.forEach(opt => {
        opt.style.display = opt.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    allOptions.forEach(opt => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hidden.value = opt.dataset.value;
        input.value = opt.dataset.value ? opt.textContent : '';
        dropdown.classList.remove('open');
      });
    });

    input.addEventListener('blur', () => {
      setTimeout(() => dropdown.classList.remove('open'), 150);
    });
  });

  // Multi-select (ssm-wrap)
  container.querySelectorAll('.ssm-wrap').forEach(wrap => {
    const hidden = wrap.querySelector('input[type="hidden"]');
    const chipsContainer = wrap.querySelector('.ssm-chips');
    const input = wrap.querySelector('.ss-input');
    const dropdown = wrap.querySelector('.ss-dropdown');
    const allOptions = [...dropdown.querySelectorAll('.ss-option')];

    function getIds() { try { return JSON.parse(hidden.value || '[]'); } catch { return []; } }
    function setIds(ids) { hidden.value = JSON.stringify(ids); }

    function refreshOptionVisibility() {
      const ids = getIds();
      allOptions.forEach(opt => {
        opt.dataset.hidden = ids.includes(opt.dataset.value) ? '1' : '';
      });
      filterOpts(input.value);
    }

    function filterOpts(query) {
      const q = query.toLowerCase();
      allOptions.forEach(opt => {
        const matchesSearch = opt.textContent.toLowerCase().includes(q);
        const isSelected = opt.dataset.hidden === '1';
        opt.style.display = (matchesSearch && !isSelected) ? '' : 'none';
      });
    }

    function addChip(id, name) {
      const chip = document.createElement('span');
      chip.className = 'ssm-chip';
      chip.dataset.id = id;
      chip.innerHTML = `${escapeHtml(name)}<span class="ssm-chip-x">&times;</span>`;
      chip.querySelector('.ssm-chip-x').addEventListener('click', () => {
        chip.remove();
        const ids = getIds().filter(i => i !== id);
        setIds(ids);
        refreshOptionVisibility();
      });
      chipsContainer.appendChild(chip);
    }

    // Wire up existing chip X buttons
    chipsContainer.querySelectorAll('.ssm-chip').forEach(chip => {
      chip.querySelector('.ssm-chip-x')?.addEventListener('click', () => {
        const id = chip.dataset.id;
        chip.remove();
        const ids = getIds().filter(i => i !== id);
        setIds(ids);
        refreshOptionVisibility();
      });
    });

    input.addEventListener('focus', () => {
      dropdown.classList.add('open');
      input.select();
      filterOpts('');
    });
    input.addEventListener('input', () => filterOpts(input.value));

    allOptions.forEach(opt => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const id = opt.dataset.value;
        const name = opt.textContent;
        if (!id) return;
        const ids = getIds();
        if (!ids.includes(id)) {
          ids.push(id);
          setIds(ids);
          addChip(id, name);
          refreshOptionVisibility();
        }
        input.value = '';
      });
    });

    input.addEventListener('blur', () => {
      setTimeout(() => dropdown.classList.remove('open'), 150);
    });
  });
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

  if (!(CONFIG.USE_NOTION && CONFIG.WORKER_URL) && !getGitHubToken()) {
    alert('No hay conexión configurada para guardar datos.');
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
    } else if (field.type === 'select-rel-multi') {
      const ids = JSON.parse(el.value || '[]');
      const srcArr = (DATA[field.source] || []).filter(field.filter || (() => true));
      newData[field.key] = ids.map(id => {
        const found = srcArr.find(r => r.notion_id === id);
        return found ? { notion_id: found.notion_id, nombre: found.nombre } : null;
      }).filter(Boolean);
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

  // Marcar registros creados por jugadores
  if (action === 'add' && !isDM()) {
    newData.creado_por_jugador = true;
    newData.conocida_jugadores = true;
    newData.conocido_jugadores = true;
  }

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
    if (CONFIG.USE_NOTION && CONFIG.WORKER_URL) {
      if (action === 'add') {
        const res = await fetch(`${CONFIG.WORKER_URL}/api/${dataKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newData),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || res.status); }
        const created = await res.json();
        newData.notion_id = created.notion_id;
        // Si creamos un Lugar desde el mapa, guardar posición del marcador
        if (dataKey === 'lugares' && pendingMarkerCoords) {
          try { await saveMarkerPosition(created.notion_id, pendingMarkerCoords.x, pendingMarkerCoords.y); } catch(me) { console.warn('Marker save failed:', me); }
          pendingMarkerCoords = null;
        }
      } else {
        const res = await fetch(`${CONFIG.WORKER_URL}/api/${dataKey}/${newData.notion_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newData),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || res.status); }
      }
    } else {
      await saveToGitHub(filename, DATA[dataKey]);
    }
    closeModal();
    renderAll();
  } catch(e) {
    DATA[dataKey] = snapshot; // revertir cambio local
    alert('Error al guardar: ' + e.message);
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

const MAP_LEGENDS = {
  biomes: { title: 'Biomas', parent: 'biomes', items: [
    {name:'Grassland',color:'#c8d68f',svgId:'biome4'},
    {name:'Temperate deciduous forest',color:'#29bc56',svgId:'biome6'},
    {name:'Tundra',color:'#96784b',svgId:'biome10'},
    {name:'Taiga',color:'#4b6b32',svgId:'biome9'},
    {name:'Temperate rainforest',color:'#409c43',svgId:'biome8'},
    {name:'Wetland',color:'#0b9131',svgId:'biome12'},
    {name:'Hot desert',color:'#fbe79f',svgId:'biome1'},
    {name:'Cold desert',color:'#b5b887',svgId:'biome2'},
    {name:'Volcano',color:'#ff5050',svgId:'biome13'},
    {name:'Glacier',color:'#d5e7eb',svgId:'biome11'},
  ]},
  regions: { title: 'Reinos', parent: 'statesBody', items: [
    {name:'Valora',color:'#1ddea4',svgId:'state1'},
    {name:'Krigh',color:'#6d42ae',svgId:'state2'},
    {name:'Genghis',color:'#87f557',svgId:'state3'},
    {name:'Bhiaxi',color:'#3fff58',svgId:'state4'},
    {name:'Mirnax',color:'#eb535b',svgId:'state5'},
    {name:'Khunulba',color:'#f6a95c',svgId:'state6'},
    {name:'Whitbury',color:'#1dbbce',svgId:'state7'},
    {name:'Duskairn',color:'#e6f443',svgId:'state8'},
    {name:'Khaz-Alun',color:'#db4ed2',svgId:'state9'},
    {name:'Elarithva',color:'#b5ea51',svgId:'state10'},
    {name:'Mythalos',color:'#7b3fae',svgId:'state11'},
    {name:'Shatrekvan',color:'#20b3d4',svgId:'state12'},
    {name:'Gnomalia',color:'#2188e4',svgId:'state13'},
    {name:'Sellumanora',color:'#b7d035',svgId:'state14'},
    {name:'Naiolonde',color:'#d53ea6',svgId:'state15'},
    {name:'Shimberia',color:'#ff5c66',svgId:'state16'},
  ]},
  cults: { title: 'Culturas', parent: 'cults', items: [
    {name:'Humans',color:'#dababf',svgId:'culture1'},
    {name:'Drow',color:'#7040ab',svgId:'culture2'},
    {name:'Elves',color:'#41ac3f',svgId:'culture3'},
    {name:'Dwarves',color:'#f29b58',svgId:'culture4'},
    {name:'Goblins',color:'#a7f652',svgId:'culture5'},
    {name:'Orcs',color:'#000000',svgId:'culture6'},
    {name:'Gnomes',color:'#415bf4',svgId:'culture7'},
    {name:'Aasimar',color:'#969696',svgId:'culture8'},
    {name:'Goliath',color:'#4fb8cf',svgId:'culture9'},
    {name:'Dragonborn',color:'#f54c50',svgId:'culture10'},
    {name:'Halflings',color:'#b03e71',svgId:'culture11'},
  ]},
};

const MAP_LAYER_GROUPS = [
  { label: 'Biomas',      ids: ['biomes'],                  on: true,  legend: 'biomes' },
  { label: 'Cuadrícula', ids: ['gridOverlay'],              on: true  },
  { label: 'Ciudades',    ids: ['burgIcons', 'burgLabels'], on: true  },
  { label: 'Lugares',     ids: ['markers'],                 on: true  },
  { label: 'Reinos',      ids: ['regions'],                 on: false, legend: 'regions' },
  { label: 'Fronteras',   ids: ['borders'],                 on: false },
  { label: 'Culturas',    ids: ['cults'],                   on: false, legend: 'cults' },
];

function injectGridPattern(svgEl) {
  const ns = 'http://www.w3.org/2000/svg';
  const defs = svgEl.querySelector('defs');
  if (!defs || svgEl.querySelector('#pattern_pointyHex')) return;

  const pattern = document.createElementNS(ns, 'pattern');
  pattern.setAttribute('id', 'pattern_pointyHex');
  pattern.setAttribute('width', '25');
  pattern.setAttribute('height', '43.4');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  pattern.setAttribute('fill', 'none');
  pattern.setAttribute('stroke', '#777777');
  pattern.setAttribute('stroke-width', '0.5');
  pattern.setAttribute('patternTransform', 'scale(0.28) translate(0 0)');

  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M 0,0 12.5,7.2 25,0 M 12.5,21.7 V 7.2 Z M 0,43.4 V 28.9 L 12.5,21.7 25,28.9 v 14.5');
  pattern.appendChild(path);
  defs.appendChild(pattern);
}

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

    // --- Fix tierra gris: sea_island renderiza feature_2 con fill:black al 50% ---
    const seaIsland = mapSvgEl.querySelector('#sea_island');
    if (seaIsland) seaIsland.setAttribute('fill', 'none');

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

    // --- Inyectar patrón hex del grid (FMG no lo exporta en el SVG) ---
    injectGridPattern(mapSvgEl);

    renderMapLayerPanel();
    initMapZoomPan(viewport);
    initMapCityLinks();
    initMapMarkerDrop();
    renderMapMarkers();
    initMapToLegendHighlight();
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
  renderMapLegend();
}

function renderMapLegend() {
  let container = document.getElementById('map-legend');
  if (!container) {
    container = document.createElement('div');
    container.id = 'map-legend';
    container.className = 'map-legend';
    const wrapper = document.querySelector('.map-wrapper');
    if (wrapper) wrapper.appendChild(container);
  }
  const activeLegends = MAP_LAYER_GROUPS.filter(g => g.on && g.legend && MAP_LEGENDS[g.legend]);
  if (!activeLegends.length) { container.style.display = 'none'; return; }
  container.style.display = '';
  container.innerHTML = activeLegends.map(g => {
    const leg = MAP_LEGENDS[g.legend];
    return `<div class="map-legend-section" data-legend="${g.legend}">
      <div class="map-legend-title">${leg.title}</div>
      ${leg.items.map(it => `<div class="map-legend-item" data-svg-id="${it.svgId}" data-legend="${g.legend}"><span class="map-legend-swatch" style="background:${it.color}"></span>${it.name}</div>`).join('')}
    </div>`;
  }).join('');
  initLegendHighlight();
}

// Leyenda → Mapa: hover en item de leyenda resalta la zona SVG
function initLegendHighlight() {
  const container = document.getElementById('map-legend');
  if (!container || !mapSvgEl) return;

  container.querySelectorAll('.map-legend-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      const svgId = item.dataset.svgId;
      const legendKey = item.dataset.legend;
      const leg = MAP_LEGENDS[legendKey];
      if (!leg) return;
      // Dim todos los hermanos, highlight el actual
      const parent = mapSvgEl.querySelector('#' + leg.parent);
      if (parent) {
        parent.querySelectorAll(':scope > *').forEach(child => {
          child.classList.add('map-dim');
        });
      }
      const target = mapSvgEl.querySelector('#' + svgId);
      if (target) { target.classList.remove('map-dim'); target.classList.add('map-highlight'); }
    });

    item.addEventListener('mouseleave', () => {
      const legendKey = item.dataset.legend;
      const leg = MAP_LEGENDS[legendKey];
      if (!leg) return;
      const parent = mapSvgEl.querySelector('#' + leg.parent);
      if (parent) {
        parent.querySelectorAll(':scope > *').forEach(child => {
          child.classList.remove('map-dim', 'map-highlight');
        });
      }
    });
  });
}

// Mapa → Leyenda: hover en el mapa resalta el item de leyenda
function initMapToLegendHighlight() {
  if (!mapSvgEl) return;
  let lastHighlighted = null;
  let throttleTimer = null;

  mapSvgEl.addEventListener('mousemove', (e) => {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => { throttleTimer = null; }, 50);

    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    let found = null;

    for (const el of elements) {
      const id = el.id || '';
      if (/^(biome|state|culture)\d+$/.test(id)) {
        found = id;
        break;
      }
      // Check parent for nested paths
      if (el.parentElement && /^(biome|state|culture)\d+$/.test(el.parentElement.id || '')) {
        found = el.parentElement.id;
        break;
      }
    }

    if (found === lastHighlighted) return;

    // Clear previous
    if (lastHighlighted) {
      const prev = document.querySelector(`.map-legend-item[data-svg-id="${lastHighlighted}"]`);
      if (prev) prev.classList.remove('map-legend-item-active');
    }

    lastHighlighted = found;

    if (found) {
      const item = document.querySelector(`.map-legend-item[data-svg-id="${found}"]`);
      if (item) item.classList.add('map-legend-item-active');
    }
  });

  mapSvgEl.addEventListener('mouseleave', () => {
    if (lastHighlighted) {
      const prev = document.querySelector(`.map-legend-item[data-svg-id="${lastHighlighted}"]`);
      if (prev) prev.classList.remove('map-legend-item-active');
      lastHighlighted = null;
    }
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

  // Touch: pan con 1 dedo, pinch-to-zoom con 2 dedos
  let t0x = 0, t0y = 0, pinchDist0 = 0, isPinching = false;

  function getTouchDist(t) {
    const dx = t[1].clientX - t[0].clientX;
    const dy = t[1].clientY - t[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      isPinching = true;
      pinchDist0 = getTouchDist(e.touches);
      t0x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      t0y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    } else {
      isPinching = false;
      t0x = e.touches[0].clientX;
      t0y = e.touches[0].clientY;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();

    if (e.touches.length === 2 && isPinching) {
      // Pinch-to-zoom
      const dist = getTouchDist(e.touches);
      const factor = pinchDist0 / dist;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const ratioX = (mx - rect.left) / rect.width;
      const ratioY = (my - rect.top)  / rect.height;
      const svgCX = vbX + ratioX * vbW;
      const svgCY = vbY + ratioY * vbH;
      vbW = Math.max(60, Math.min(VB_W0 * 3, vbW * factor));
      vbH = vbW * (VB_H0 / VB_W0);
      vbX = svgCX - ratioX * vbW;
      vbY = svgCY - ratioY * vbH;
      // También pan con el movimiento del centro
      vbX -= (mx - t0x) / rect.width  * vbW;
      vbY -= (my - t0y) / rect.height * vbH;
      pinchDist0 = dist;
      t0x = mx; t0y = my;
    } else if (e.touches.length === 1 && !isPinching) {
      // Pan con 1 dedo
      vbX -= (e.touches[0].clientX - t0x) / rect.width  * vbW;
      vbY -= (e.touches[0].clientY - t0y) / rect.height * vbH;
      t0x = e.touches[0].clientX; t0y = e.touches[0].clientY;
    }
    applyMapViewBox();
  }, { passive: false });

  viewport.addEventListener('touchend', () => { isPinching = false; }, { passive: true });
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

// ── MAP MARKERS ───────────────────────────────────────────────────

// Iconos SVG por tipo (viewBox 0 0 12 12, paths centrados)
const MARKER_ICONS = {
  'Dungeon':    'M2 10V5l4-3 4 3v5H8V7H4v3zm3-5h2V4L6 3.2 5 4z', // portal con arco
  'Ruinas':     'M3 10V5h1v5h1V3h2v7h1V5h1v5h1V4L6 2 2 4v6z',      // columnas rotas
  'Fortaleza':  'M2 10V5h1V3h1v2h1V3h2v2h1V3h1v2h1v5zm2-4v3h4V6z', // torre almenas
  'Templo':     'M6 1L2 5v1h2v4h4V6h2V5zm0 2.5L8 5H4z',           // templo triangular
  'Cueva':      'M1 10l3-7 2 3 2-3 3 7zm4-4l1 2 1-2z',             // montaña con abertura
  'Bosque':     'M6 1L3 5h1.5L3 8h2v2h2V8h2l-1.5-3H9z',            // pino
  'Puerto':     'M6 1v3M4 4l2 3 2-3M3 8h6M5 8v2h2V8',              // ancla
  'Torre':      'M4 10V4l2-2 2 2v6zm1-5v2h2V5z',                    // torre
  'Pueblo':     'M2 10V6l4-4 4 4v4zm3-3v2h2V7z',                    // casa
  'Aldea':      'M3 10V7l3-3 3 3v3zm2-2v1h2V8z',                    // cabaña
  'Otro':       'M6 2L2 6l4 4 4-4z',                                 // diamante
};

const MARKER_COLORS = {
  'Dungeon': '#dc3545', 'Ruinas': '#888', 'Fortaleza': '#6f42c1', 'Templo': '#ffc107',
  'Cueva': '#795548', 'Bosque': '#28a745', 'Puerto': '#17a2b8', 'Torre': '#fd7e14',
  'Pueblo': '#e8c874', 'Aldea': '#a5854a', 'Otro': '#adb5bd',
};

let markerMode = false;
let pendingMarkerCoords = null;

function toggleMarkerMode() {
  markerMode = !markerMode;
  const btn = document.getElementById('btn-add-marker');
  if (btn) btn.classList.toggle('active', markerMode);
  if (mapSvgEl) mapSvgEl.style.cursor = markerMode ? 'crosshair' : '';
}

function screenToSvg(clientX, clientY) {
  const rect = mapSvgEl.getBoundingClientRect();
  return {
    x: vbX + (clientX - rect.left) / rect.width * vbW,
    y: vbY + (clientY - rect.top) / rect.height * vbH,
  };
}

function onMarkerDragStart(e) {
  e.dataTransfer.setData('text/plain', 'new-marker');
  e.dataTransfer.effectAllowed = 'copy';
}

function initMapMarkerDrop() {
  if (!mapSvgEl) return;
  const vp = document.getElementById('map-viewport');

  // Drag & drop (desktop)
  vp.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('text/plain')) e.preventDefault();
  });
  vp.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.getData('text/plain') !== 'new-marker') return;
    const coords = screenToSvg(e.clientX, e.clientY);
    openMarkerModal(coords.x, coords.y);
  });

  // Click/tap modo marcador (mobile + desktop fallback)
  mapSvgEl.addEventListener('click', (e) => {
    if (!markerMode) return;
    e.stopPropagation();
    const coords = screenToSvg(e.clientX, e.clientY);
    openMarkerModal(coords.x, coords.y);
    toggleMarkerMode(); // desactivar tras colocar
  });
}

function openMarkerModal(x, y) {
  pendingMarkerCoords = { x, y };
  openModal('lugares', null);
  // Auto-marcar checkboxes para jugadores
  if (!isDM()) {
    setTimeout(() => {
      const cb1 = document.getElementById('field-conocido_jugadores');
      const cb2 = document.getElementById('field-creado_por_jugador');
      if (cb1) cb1.checked = true;
      if (cb2) cb2.checked = true;
    }, 50);
  }
}

function renderMapMarkers() {
  if (!mapSvgEl) return;
  const ns = 'http://www.w3.org/2000/svg';

  // Eliminar capa previa
  let g = mapSvgEl.querySelector('#markers');
  if (g) g.remove();

  g = document.createElementNS(ns, 'g');
  g.setAttribute('id', 'markers');
  mapSvgEl.appendChild(g);

  const lugares = DATA.lugares || [];
  const visibles = isDM() ? lugares : lugares.filter(l => l.conocido_jugadores || l.creado_por_jugador);

  for (const lugar of visibles) {
    const pos = MAP_MARKERS[lugar.notion_id];
    if (!pos) continue;

    const color = MARKER_COLORS[lugar.tipo] || MARKER_COLORS['Otro'];
    const iconPath = MARKER_ICONS[lugar.tipo] || MARKER_ICONS['Otro'];
    const size = 3; // similar a burgs (ciudades=2, pueblos=1)
    const half = size / 2;

    // Inyectar symbol si no existe
    const symId = `marker-icon-${(lugar.tipo || 'Otro').replace(/\s/g, '')}`;
    if (!mapSvgEl.querySelector(`#${symId}`)) {
      const defs = mapSvgEl.querySelector('defs');
      if (defs) {
        const sym = document.createElementNS(ns, 'symbol');
        sym.setAttribute('id', symId);
        sym.setAttribute('viewBox', '0 0 12 12');
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', iconPath);
        sym.appendChild(p);
        defs.appendChild(sym);
      }
    }

    const pin = document.createElementNS(ns, 'g');
    pin.setAttribute('class', 'map-marker');
    pin.style.cursor = 'pointer';

    // Icono usando <use> (tamaño consistente con burgs)
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', `#${symId}`);
    use.setAttribute('x', String(pos.x - half));
    use.setAttribute('y', String(pos.y - half));
    use.setAttribute('width', String(size));
    use.setAttribute('height', String(size));
    use.setAttribute('fill', '#ffffff');
    use.setAttribute('fill-opacity', '0.85');
    use.setAttribute('stroke', '#3e3e4b');
    use.setAttribute('stroke-width', '0.3');
    pin.appendChild(use);

    // Label (tamaño proporcional a burgs)
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(pos.x));
    label.setAttribute('y', String(pos.y + half + 2.5));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', '2.5');
    label.setAttribute('fill', '#fff');
    label.setAttribute('stroke', '#000');
    label.setAttribute('stroke-width', '0.2');
    label.setAttribute('paint-order', 'stroke');
    label.textContent = lugar.nombre;
    pin.appendChild(label);

    // Click → detalle
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail('lugares', lugar);
    });

    g.appendChild(pin);
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
