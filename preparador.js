/* =============================================================
   HALO — Preparador de Sesiones
   preparador.js — Prepara sesiones con los 8 pasos de Sly Flourish
   Se abre dentro de util-workspace (pestaña Utilidades)
   ============================================================= */

let currentPlanId = null;
let sessionPlans = [];
let monstruosCache = [];
let itemsCatalogCache = [];

const prepSelectedPlayers = [];
const prepSelectedNpcs = [];
const prepSelectedLugares = [];
const prepSelectedItems = [];
const prepSelectedMonsters = [];
const prepSelectedContext = [];   // { id, titulo, tipo }
let prepCtxCurrentTab = 'notas_dm';

// Escapa valores para usar dentro de atributos onclick="fn('...')"
function escapeAttr(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ── OPEN (modal flotante sobre toda la app) ───────────────────
function openPreparador() {
  document.getElementById('preparador-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'preparador-modal';
  modal.className = 'preparador-modal-overlay';
  modal.innerHTML = `
    <div class="preparador-layout">
      <div class="preparador-sidebar">
        <div class="preparador-sidebar-header">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h3 class="util-title" style="margin:0;font-size:15px">Planes de Sesion</h3>
            <button class="btn btn-sm" onclick="closePreparador()">&#10005;</button>
          </div>
          <input type="text" class="search-input" id="search-plans" placeholder="Buscar plan..." oninput="filterPlans()" style="width:100%">
          <button class="btn" style="width:100%" onclick="openNewPlanForm()">+ Nuevo Plan</button>
        </div>
        <div class="preparador-sidebar-list" id="plan-sidebar-list"></div>
      </div>
      <div class="preparador-main" id="preparador-main">
        <div class="prep-spinner"><span>Selecciona un plan o crea uno nuevo.</span></div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  loadSessionPlans();
  loadCaches();
}

function closePreparador() {
  document.getElementById('preparador-modal')?.remove();
}

// ── LOAD CACHES ──────────────────────────────────────────────
async function loadCaches() {
  try {
    const [mRes, iRes] = await Promise.all([
      sbClient.from('monstruos').select('id,nombre,tipo,cr').eq('archived', false),
      sbClient.from('items_catalog').select('id,nombre,rareza,tipo').eq('archived', false),
    ]);
    monstruosCache = mRes.data || [];
    itemsCatalogCache = iRes.data || [];
  } catch (e) {
    console.warn('Error cargando caches de preparador:', e);
  }
}

// ── LOAD SESSION PLANS ───────────────────────────────────────
async function loadSessionPlans() {
  try {
    const { data, error } = await sbClient.from('session_plans')
      .select('*')
      .eq('campaign_slug', CONFIG.SLUG)
      .order('fecha_sesion', { ascending: false });
    if (error) throw new Error(error.message);
    sessionPlans = data || [];
    renderPlanSidebar(sessionPlans);
  } catch (e) {
    console.warn('Error cargando planes:', e);
    sessionPlans = [];
    renderPlanSidebar([]);
  }
}

// ── RENDER SIDEBAR ───────────────────────────────────────────
function renderPlanSidebar(plans) {
  const list = document.getElementById('plan-sidebar-list');
  if (!list) return;
  if (!plans.length) {
    list.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;font-size:13px;color:var(--on-surface-variant)">No hay planes aun.</div>';
    return;
  }
  list.innerHTML = plans.map(p => {
    const active = p.id === currentPlanId ? ' active' : '';
    const fecha = p.fecha_sesion ? new Date(p.fecha_sesion).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha';
    return `
      <div class="plan-list-item${active}" onclick="openPlanView('${p.id}')">
        <div class="plan-list-item-title">${escapeHtml(p.nombre || 'Plan sin nombre')}</div>
        <div class="plan-list-item-date">${fecha}</div>
      </div>
    `;
  }).join('');
}

function filterPlans() {
  const q = (document.getElementById('search-plans')?.value || '').toLowerCase();
  if (!q) { renderPlanSidebar(sessionPlans); return; }
  const filtered = sessionPlans.filter(p =>
    (p.nombre || '').toLowerCase().includes(q) ||
    (p.fecha_sesion || '').includes(q)
  );
  renderPlanSidebar(filtered);
}

// ── NEW PLAN FORM ────────────────────────────────────────────
function openNewPlanForm() {
  currentPlanId = null;
  renderPlanSidebar(sessionPlans);

  // Reset selections
  prepSelectedPlayers.length = 0;
  prepSelectedNpcs.length = 0;
  prepSelectedLugares.length = 0;
  prepSelectedItems.length = 0;
  prepSelectedMonsters.length = 0;
  prepSelectedContext.length = 0;
  prepCtxCurrentTab = 'notas_dm';

  const main = document.getElementById('preparador-main');
  if (!main) return;

  // Personajes (PJs) — todos seleccionados por defecto
  const pjs = (DATA.players || []).filter(p => p.es_pj);
  pjs.forEach(p => prepSelectedPlayers.push({ id: p.id || p.nombre, nombre: p.nombre }));

  const pjCards = pjs.map(p => {
    const pid = escapeAttr(String(p.id || p.nombre));
    return `
      <div class="bloque-item prep-pj-card selected" id="prep-pj-${pid}"
           onclick="togglePrepPlayer('${pid}', '${escapeAttr(p.nombre)}')">
        <div class="bloque-item-title">${escapeHtml(p.nombre)}</div>
        <div class="bloque-item-desc">${escapeHtml(p.raza || '')} ${escapeHtml(p.clase || '')} — Nivel ${p.nivel || '?'}</div>
      </div>
    `;
  }).join('') || '<div class="bloque-item-desc">No hay PJs registrados.</div>';

  main.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <h3 style="margin:0">Nuevo Plan de Sesion</h3>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:16px;margin-bottom:16px">
      <div>
        <label style="font-weight:600;font-size:13px;display:block;margin-bottom:4px">
          Nombre del Plan
          <span style="font-weight:400;color:var(--on-surface-variant);font-size:11px"> — opcional, se auto-genera</span>
        </label>
        <input type="text" id="prep-nombre" class="search-input" placeholder="Ej: La Cripta del Rey Muerto" style="width:100%">
      </div>
      <div>
        <label style="font-weight:600;font-size:13px;display:block;margin-bottom:4px">Fecha de Sesion</label>
        <input type="date" id="prep-fecha" class="search-input" style="width:100%" value="${new Date().toISOString().slice(0, 10)}">
      </div>
      <div>
        <label style="font-weight:600;font-size:13px;display:block;margin-bottom:4px">Duracion</label>
        <select id="prep-duracion" class="search-input">
          <option value="2">2h</option>
          <option value="2.5" selected>2.5h</option>
          <option value="3">3h</option>
          <option value="4">4h+</option>
        </select>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>1. Personajes (Party)</span>
        <span style="font-size:12px;opacity:0.6">&#9660;</span>
      </div>
      <div class="prep-form-section-body">
        <p style="font-size:12px;color:var(--on-surface-variant);margin:0 0 10px">Clic para incluir/excluir de la sesion.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
          ${pjCards}
        </div>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>2. Contexto de Campaña</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <p style="font-size:12px;color:var(--on-surface-variant);margin:0 0 12px">Selecciona notas y quests para incluir como contexto al generar el plan.</p>

        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="btn btn-sm prep-ctx-tab active" data-ctx="notas_dm" onclick="switchPrepCtxTab(this)">Notas DM</button>
          <button class="btn btn-sm prep-ctx-tab" data-ctx="notas_jugadores" onclick="switchPrepCtxTab(this)">Notas Jugadores</button>
          <button class="btn btn-sm prep-ctx-tab" data-ctx="quests" onclick="switchPrepCtxTab(this)">Quests</button>
        </div>
        <input type="text" id="prep-ctx-search" class="search-input" style="width:100%;margin-bottom:8px"
               placeholder="Buscar..." oninput="renderPrepCtxTable(this.value)" autocomplete="off">
        <div id="prep-ctx-table-wrap" class="prep-catalog-wrap" style="max-height:200px;overflow-y:auto"></div>

        <div id="prep-ctx-selected-wrap" style="margin-top:10px"></div>

        <div style="margin-top:12px">
          <label style="font-size:12px;color:var(--on-surface-variant);display:block;margin-bottom:4px">Contexto adicional (texto libre)</label>
          <textarea id="prep-ctx-extra" rows="3" class="search-input" style="width:100%;resize:vertical" placeholder="Escribe aqui cualquier contexto adicional para la IA..."></textarea>
        </div>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>3. Gancho Fuerte (Strong Start)</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <label style="font-size:12px;color:var(--on-surface-variant);display:block;margin-bottom:6px">Una escena de accion que enganche a los jugadores desde el primer momento.</label>
        <textarea id="prep-gancho" rows="3" class="search-input" style="width:100%;resize:vertical" placeholder="Describe el gancho de apertura..."></textarea>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>4. Escenas Potenciales</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <label style="font-size:12px;color:var(--on-surface-variant);display:block;margin-bottom:6px">Escenas flexibles que podrian ocurrir. No forzar un orden.</label>
        <textarea id="prep-escenas" rows="3" class="search-input" style="width:100%;resize:vertical" placeholder="Lista de escenas potenciales..."></textarea>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>5. Secretos y Pistas</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <label style="font-size:12px;color:var(--on-surface-variant);display:block;margin-bottom:6px">10 secretos o pistas que los jugadores pueden descubrir de distintas formas.</label>
        <textarea id="prep-secretos" rows="3" class="search-input" style="width:100%;resize:vertical" placeholder="Secretos y pistas..."></textarea>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>6. NPCs Importantes</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <label style="font-size:12px;color:var(--on-surface-variant);display:block;margin-bottom:6px">Selecciona NPCs existentes o deja que la IA sugiera nuevos.</label>
        <div style="position:relative" id="prep-npcs-search-wrapper">
          <input type="text" id="prep-npcs-search" class="search-input" style="width:100%"
                 placeholder="Buscar NPC..." oninput="searchPrepNpcs(this.value)" autocomplete="off">
          <div class="monster-search-results" id="prep-npcs-results" style="display:none"></div>
        </div>
        <div class="selected-items-catalog" id="prep-npcs-chips"></div>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>7. Locaciones</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <label style="font-size:12px;color:var(--on-surface-variant);display:block;margin-bottom:6px">Lugares, ciudades y establecimientos que los jugadores podrian visitar.</label>
        <div style="position:relative" id="prep-locaciones-search-wrapper">
          <input type="text" id="prep-locaciones-search" class="search-input" style="width:100%"
                 placeholder="Buscar lugar, ciudad o establecimiento..." oninput="searchPrepLocaciones(this.value)" autocomplete="off">
          <div class="monster-search-results" id="prep-locaciones-results" style="display:none"></div>
        </div>
        <div class="selected-items-catalog" id="prep-locaciones-chips"></div>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>8. Tesoros y Recompensas</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <input type="text" id="prep-items-search" class="search-input" style="width:100%;margin-bottom:8px"
               placeholder="Filtrar items del catalogo..." oninput="renderPrepItemsCatalogTable(this.value)" autocomplete="off">
        <div id="prep-items-catalog-wrap" class="prep-catalog-wrap"></div>
        <div id="prep-items-selected-wrap" style="margin-top:12px"></div>
      </div>
    </div>

    <div class="prep-form-section">
      <div class="prep-form-section-header" onclick="togglePrepSection(this)">
        <span>9. Monstruos y Encuentros</span>
        <span style="font-size:12px;opacity:0.6">&#9654;</span>
      </div>
      <div class="prep-form-section-body" style="display:none">
        <input type="text" id="prep-monsters-search" class="search-input" style="width:100%;margin-bottom:8px"
               placeholder="Filtrar monstruos..." oninput="renderPrepMonstersCatalogTable(this.value)" autocomplete="off">
        <div id="prep-monsters-catalog-wrap" class="prep-catalog-wrap"></div>
        <div id="prep-monsters-selected-wrap" style="margin-top:12px"></div>
      </div>
    </div>

    <div style="margin-top:24px;display:flex;gap:12px">
      <button class="btn" style="flex:1" onclick="generatePlan()">Generar Plan</button>
    </div>
  `;

  // Inicializar tabla de contexto
  renderPrepCtxTable();
}

// ── TOGGLE SECTION ───────────────────────────────────────────
function togglePrepSection(header) {
  const body = header.nextElementSibling;
  if (!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? '' : 'none';
  const arrow = header.querySelector('span:last-child');
  if (arrow) arrow.innerHTML = isHidden ? '&#9660;' : '&#9654;';
}

// ── TOGGLE PLAYER ────────────────────────────────────────────
function togglePrepPlayer(id, nombre) {
  const idx = prepSelectedPlayers.findIndex(x => x.id === id);
  const card = document.getElementById(`prep-pj-${id}`);
  if (idx >= 0) {
    prepSelectedPlayers.splice(idx, 1);
    if (card) card.classList.remove('selected');
  } else {
    prepSelectedPlayers.push({ id, nombre });
    if (card) card.classList.add('selected');
  }
}

// ── CONTEXTO ─────────────────────────────────────────────────
function switchPrepCtxTab(btn) {
  prepCtxCurrentTab = btn.dataset.ctx;
  document.querySelectorAll('.prep-ctx-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const searchInput = document.getElementById('prep-ctx-search');
  if (searchInput) searchInput.value = '';
  renderPrepCtxTable('');
}

function renderPrepCtxTable(query) {
  const wrap = document.getElementById('prep-ctx-table-wrap');
  if (!wrap) return;

  const q = (query ?? document.getElementById('prep-ctx-search')?.value ?? '').toLowerCase().trim();

  const byFecha = (a, b) => (b.fecha || '').localeCompare(a.fecha || '');

  const srcMap = {
    notas_dm: [...(DATA.notas_dm || [])].sort(byFecha)
      .map(n => ({ id: n.id, titulo: n.titulo || n.nombre || '(sin título)', tipo: 'Nota DM', fecha: n.fecha || '' })),
    notas_jugadores: [...(DATA.notas_jugadores || [])].sort(byFecha)
      .map(n => ({ id: n.id, titulo: n.titulo || n.nombre || '(sin título)', tipo: 'Nota Jugadores', fecha: n.fecha || '' })),
    quests: [...(DATA.quests || [])].sort(byFecha)
      .map(qst => ({ id: qst.id, titulo: qst.nombre || qst.titulo || '(sin título)', tipo: 'Quest', fecha: qst.fecha || '' })),
  };

  let items = srcMap[prepCtxCurrentTab] || [];
  if (q) items = items.filter(i => i.titulo.toLowerCase().includes(q));

  if (!items.length) {
    wrap.innerHTML = `<div class="prep-catalog-empty">${q ? 'Sin resultados.' : 'No hay registros disponibles.'}</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="prep-catalog-table">
      <thead><tr><th></th><th>Título</th><th>Fecha</th></tr></thead>
      <tbody>
        ${items.map(item => {
          const sel = !!prepSelectedContext.find(x => x.id === item.id);
          const fechaFmt = item.fecha ? new Date(item.fecha + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
          return `<tr class="${sel ? 'selected' : ''}" onclick="togglePrepCtxItem('${escapeAttr(item.id)}','${escapeAttr(item.titulo)}','${escapeAttr(item.tipo)}')">
            <td class="prep-catalog-check">${sel ? '✓' : ''}</td>
            <td>${escapeHtml(item.titulo)}</td>
            <td style="font-size:11px;color:var(--on-surface-variant)">${fechaFmt}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function togglePrepCtxItem(id, titulo, tipo) {
  const idx = prepSelectedContext.findIndex(x => x.id === id);
  if (idx >= 0) prepSelectedContext.splice(idx, 1);
  else prepSelectedContext.push({ id, titulo, tipo });
  renderPrepCtxSelected();
  renderPrepCtxTable();
}

function renderPrepCtxSelected() {
  const wrap = document.getElementById('prep-ctx-selected-wrap');
  if (!wrap) return;
  if (!prepSelectedContext.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div class="prep-selected-label">Incluido en contexto</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${prepSelectedContext.map(x => `
        <span class="selected-chip">
          <span style="font-size:10px;opacity:0.6;margin-right:2px">${escapeHtml(x.tipo)}</span>
          ${escapeHtml(x.titulo)}
          <span class="remove-chip" onclick="togglePrepCtxItem('${escapeAttr(x.id)}','${escapeAttr(x.titulo)}','${escapeAttr(x.tipo)}')">&times;</span>
        </span>
      `).join('')}
    </div>
  `;
}

// ── SEARCH NPCs ──────────────────────────────────────────────
function searchPrepNpcs(query) {
  const results = document.getElementById('prep-npcs-results');
  if (!results) return;
  const q = query.toLowerCase().trim();
  if (!q) { results.style.display = 'none'; return; }

  const npcs = DATA.npcs || [];
  const matches = npcs.filter(n =>
    (n.nombre || '').toLowerCase().includes(q) && !prepSelectedNpcs.find(x => x.id === n.id)
  ).slice(0, 10);

  if (!matches.length) { results.style.display = 'none'; return; }

  results.style.display = '';
  results.innerHTML = matches.map(n => {
    const id = escapeAttr(n.id);
    const nombre = escapeAttr(n.nombre);
    return `<div class="monster-search-item" onclick="addPrepNpc('${id}','${nombre}')">${escapeHtml(n.nombre)}</div>`;
  }).join('');
}

function addPrepNpc(id, nombre) {
  if (prepSelectedNpcs.find(x => x.id === id)) return;
  prepSelectedNpcs.push({ id, nombre });
  renderPrepNpcChips();
  const inp = document.getElementById('prep-npcs-search');
  if (inp) inp.value = '';
  const res = document.getElementById('prep-npcs-results');
  if (res) res.style.display = 'none';
}

function removePrepNpc(id) {
  const idx = prepSelectedNpcs.findIndex(x => x.id === id);
  if (idx >= 0) prepSelectedNpcs.splice(idx, 1);
  renderPrepNpcChips();
}

function renderPrepNpcChips() {
  const container = document.getElementById('prep-npcs-chips');
  if (!container) return;
  container.innerHTML = prepSelectedNpcs.map(x => `
    <span class="selected-chip">
      ${escapeHtml(x.nombre)}
      <span class="remove-chip" onclick="removePrepNpc('${escapeAttr(x.id)}')">&times;</span>
    </span>
  `).join('');
}

// ── SEARCH LOCACIONES (Lugares + Ciudades + Establecimientos) ─
function searchPrepLocaciones(query) {
  const results = document.getElementById('prep-locaciones-results');
  if (!results) return;
  const q = query.toLowerCase().trim();
  if (!q) { results.style.display = 'none'; return; }

  const all = [
    ...(DATA.lugares || []).map(l => ({ id: l.id, nombre: l.nombre, _cat: 'Lugar' })),
    ...(DATA.ciudades || []).map(c => ({ id: c.id, nombre: c.nombre, _cat: 'Ciudad' })),
    ...(DATA.establecimientos || []).map(e => ({ id: e.id, nombre: e.nombre, _cat: 'Establecimiento' })),
  ];

  const matches = all.filter(l =>
    (l.nombre || '').toLowerCase().includes(q) && !prepSelectedLugares.find(x => x.id === l.id)
  ).slice(0, 12);

  if (!matches.length) { results.style.display = 'none'; return; }

  results.style.display = '';
  results.innerHTML = matches.map(l => {
    const id = escapeAttr(l.id);
    const nombre = escapeAttr(l.nombre);
    const cat = escapeAttr(l._cat);
    return `
      <div class="monster-search-item" onclick="addPrepLocacion('${id}','${nombre}','${cat}')">
        ${escapeHtml(l.nombre)} <span style="font-size:11px;color:var(--on-surface-variant)">${l._cat}</span>
      </div>
    `;
  }).join('');
}

function addPrepLocacion(id, nombre, cat) {
  if (prepSelectedLugares.find(x => x.id === id)) return;
  prepSelectedLugares.push({ id, nombre, cat });
  renderPrepLocacionChips();
  const inp = document.getElementById('prep-locaciones-search');
  if (inp) inp.value = '';
  const res = document.getElementById('prep-locaciones-results');
  if (res) res.style.display = 'none';
}

function removePrepLocacion(id) {
  const idx = prepSelectedLugares.findIndex(x => x.id === id);
  if (idx >= 0) prepSelectedLugares.splice(idx, 1);
  renderPrepLocacionChips();
}

function renderPrepLocacionChips() {
  const container = document.getElementById('prep-locaciones-chips');
  if (!container) return;
  container.innerHTML = prepSelectedLugares.map(x => `
    <span class="selected-chip">
      ${escapeHtml(x.nombre)}<span style="opacity:0.6;font-size:10px;margin-left:3px">${x.cat || ''}</span>
      <span class="remove-chip" onclick="removePrepLocacion('${escapeAttr(x.id)}')">&times;</span>
    </span>
  `).join('');
}

// ── ITEMS (Tesoros) — tabla filtrable ────────────────────────
function renderPrepItemsCatalogTable(query) {
  const wrap = document.getElementById('prep-items-catalog-wrap');
  if (!wrap) return;
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    wrap.innerHTML = '<div class="prep-catalog-empty">Escribe para filtrar items del catálogo...</div>';
    return;
  }
  const matches = itemsCatalogCache.filter(i => (i.nombre || '').toLowerCase().includes(q)).slice(0, 30);
  if (!matches.length) {
    wrap.innerHTML = '<div class="prep-catalog-empty">Sin resultados.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="prep-catalog-table">
      <thead><tr><th></th><th>Nombre</th><th>Rareza</th><th>Tipo</th></tr></thead>
      <tbody>
        ${matches.map(i => {
          const sel = !!prepSelectedItems.find(x => x.id === i.id);
          return `<tr class="${sel ? 'selected' : ''}" onclick="togglePrepItem('${i.id}','${escapeAttr(i.nombre)}','${escapeAttr(i.rareza||'')}','${escapeAttr(i.tipo||'')}')">
            <td class="prep-catalog-check">${sel ? '✓' : ''}</td>
            <td>${escapeHtml(i.nombre)}</td>
            <td>${escapeHtml(i.rareza || '—')}</td>
            <td>${escapeHtml(i.tipo || '—')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function togglePrepItem(id, nombre, rareza, tipo) {
  const idx = prepSelectedItems.findIndex(x => x.id === id);
  if (idx >= 0) prepSelectedItems.splice(idx, 1);
  else prepSelectedItems.push({ id, nombre, rareza, tipo });
  renderPrepItemTable();
  renderPrepItemsCatalogTable(document.getElementById('prep-items-search')?.value || '');
}

function removePrepItem(id) {
  const idx = prepSelectedItems.findIndex(x => x.id === id);
  if (idx >= 0) prepSelectedItems.splice(idx, 1);
  renderPrepItemTable();
  renderPrepItemsCatalogTable(document.getElementById('prep-items-search')?.value || '');
}

function renderPrepItemTable() {
  const wrap = document.getElementById('prep-items-selected-wrap');
  if (!wrap) return;
  if (!prepSelectedItems.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div class="prep-selected-label">Seleccionados</div>
    <table class="prep-selected-table">
      <thead><tr><th>Nombre</th><th>Rareza</th><th>Tipo</th><th></th></tr></thead>
      <tbody>
        ${prepSelectedItems.map(x => `
          <tr>
            <td>${escapeHtml(x.nombre)}</td>
            <td>${escapeHtml(x.rareza || '—')}</td>
            <td>${escapeHtml(x.tipo || '—')}</td>
            <td><span class="remove-chip" onclick="removePrepItem('${x.id}')" style="padding:2px 8px">&times;</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── MONSTRUOS — tabla filtrable ───────────────────────────────
function renderPrepMonstersCatalogTable(query) {
  const wrap = document.getElementById('prep-monsters-catalog-wrap');
  if (!wrap) return;
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    wrap.innerHTML = '<div class="prep-catalog-empty">Escribe para filtrar monstruos...</div>';
    return;
  }
  const matches = monstruosCache.filter(m => (m.nombre || '').toLowerCase().includes(q)).slice(0, 30);
  if (!matches.length) {
    wrap.innerHTML = '<div class="prep-catalog-empty">Sin resultados.</div>';
    return;
  }
  wrap.innerHTML = `
    <table class="prep-catalog-table">
      <thead><tr><th></th><th>Nombre</th><th>CR</th><th>Tipo</th></tr></thead>
      <tbody>
        ${matches.map(m => {
          const sel = !!prepSelectedMonsters.find(x => x.id === m.id);
          return `<tr class="${sel ? 'selected' : ''}" onclick="togglePrepMonster('${m.id}','${escapeAttr(m.nombre)}','${escapeAttr(String(m.cr||''))}','${escapeAttr(m.tipo||'')}')">
            <td class="prep-catalog-check">${sel ? '✓' : ''}</td>
            <td>${escapeHtml(m.nombre)}</td>
            <td>${escapeHtml(String(m.cr || '?'))}</td>
            <td>${escapeHtml(m.tipo || '—')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function togglePrepMonster(id, nombre, cr, tipo) {
  const idx = prepSelectedMonsters.findIndex(x => x.id === id);
  if (idx >= 0) prepSelectedMonsters.splice(idx, 1);
  else prepSelectedMonsters.push({ id, nombre, cr, tipo });
  renderPrepMonsterTable();
  renderPrepMonstersCatalogTable(document.getElementById('prep-monsters-search')?.value || '');
}

function removePrepMonster(id) {
  const idx = prepSelectedMonsters.findIndex(x => x.id === id);
  if (idx >= 0) prepSelectedMonsters.splice(idx, 1);
  renderPrepMonsterTable();
  renderPrepMonstersCatalogTable(document.getElementById('prep-monsters-search')?.value || '');
}

function renderPrepMonsterTable() {
  const wrap = document.getElementById('prep-monsters-selected-wrap');
  if (!wrap) return;
  if (!prepSelectedMonsters.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div class="prep-selected-label">Seleccionados</div>
    <table class="prep-selected-table">
      <thead><tr><th>Nombre</th><th>CR</th><th>Tipo</th><th></th></tr></thead>
      <tbody>
        ${prepSelectedMonsters.map(x => `
          <tr>
            <td>${escapeHtml(x.nombre)}</td>
            <td>${escapeHtml(x.cr || '—')}</td>
            <td>${escapeHtml(x.tipo || '—')}</td>
            <td><span class="remove-chip" onclick="removePrepMonster('${x.id}')" style="padding:2px 8px">&times;</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── GENERATE PLAN ────────────────────────────────────────────
async function generatePlan() {
  const main = document.getElementById('preparador-main');
  if (!main) return;

  let nombre = document.getElementById('prep-nombre')?.value.trim();
  const fecha = document.getElementById('prep-fecha')?.value;
  const duracion = parseFloat(document.getElementById('prep-duracion')?.value || '2.5');
  const gancho = document.getElementById('prep-gancho')?.value.trim();
  const escenas = document.getElementById('prep-escenas')?.value.trim();
  const secretos = document.getElementById('prep-secretos')?.value.trim();

  // Auto-nombre si no se proporcionó
  if (!nombre) {
    if (fecha) {
      const d = new Date(fecha + 'T12:00:00');
      const day = String(d.getDate()).padStart(2, '0');
      const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const month = months[d.getMonth()];
      const year = String(d.getFullYear()).slice(-2);
      nombre = `Plan para ${day}-${month}-${year}`;
    } else {
      nombre = 'Plan sin nombre';
    }
  }

  const ctxExtra = document.getElementById('prep-ctx-extra')?.value.trim();

  // Personajes: objeto completo desde DATA.players
  const personajesCompletos = prepSelectedPlayers.map(sel => {
    const p = (DATA.players || []).find(x => (x.id || x.nombre) === sel.id) || {};
    const base = { nombre: sel.nombre, raza: p.raza || '?', clase: p.clase || '?', nivel: p.nivel || '?', jugador: p.jugador || '?' };
    // Enriquecer con D&D Beyond si disponible
    const ddb = p.ddb_data;
    if (ddb) {
      if (ddb.abilities) base.abilities = ddb.abilities;
      if (ddb.ac) base.ac = ddb.ac;
      if (ddb.maxHP) base.hp_max = ddb.maxHP;
      if (ddb.profBonus) base.proficiency = ddb.profBonus;
      if (ddb.spells?.length) base.hechizos = ddb.spells.map(s => ({ nombre: s.name, nivel: s.level }));
      if (ddb.equipment?.length) base.equipamiento = ddb.equipment.filter(e => e.equipped).map(e => e.name);
    }
    return base;
  });

  // NPCs: objeto completo desde DATA.npcs
  const npcsCompletos = prepSelectedNpcs.map(sel => {
    const n = (DATA.npcs || []).find(x => x.id === sel.id) || {};
    return { nombre: sel.nombre, raza: n.raza || '', tipo_npc: n.tipo_npc || '', primera_impresion: n.primera_impresion || '' };
  });

  // Locaciones: objeto completo desde las 3 fuentes
  const locacionesCompletas = prepSelectedLugares.map(sel => {
    const allLocs = [
      ...(DATA.lugares || []).map(l => ({ id: l.id, tipo: l.tipo || 'Lugar', region: l.region || '' })),
      ...(DATA.ciudades || []).map(c => ({ id: c.id, tipo: 'Ciudad', region: c.region || '' })),
      ...(DATA.establecimientos || []).map(e => ({ id: e.id, tipo: e.tipo || 'Establecimiento', region: e.ciudad?.nombre || '' })),
    ];
    const found = allLocs.find(x => x.id === sel.id) || {};
    return { nombre: sel.nombre, tipo: found.tipo || sel.cat || '?', region: found.region || '' };
  });

  // Contexto seleccionado: incluir contenido real de notas/quests
  const ctxParts = [];
  if (prepSelectedContext.length) {
    ctxParts.push('\n## Contexto adicional seleccionado');
    prepSelectedContext.forEach(c => {
      if (c.tipo === 'Quest') {
        const q = (DATA.quests || []).find(x => x.id === c.id);
        if (q) {
          ctxParts.push(`\n### Quest: ${q.nombre || c.titulo} [${q.estado || '?'}]`);
          if (q.resumen) ctxParts.push(q.resumen);
          if (q.contenido_html) ctxParts.push(q.contenido_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }
      } else {
        const nota = [...(DATA.notas_dm || []), ...(DATA.notas_jugadores || [])].find(x => x.id === c.id);
        if (nota) {
          ctxParts.push(`\n### Nota: ${nota.nombre || c.titulo} (${nota.fecha || ''})`);
          if (nota.resumen) ctxParts.push(nota.resumen);
          if (nota.contenido_html) ctxParts.push(nota.contenido_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
        }
      }
    });
  }
  if (ctxExtra) ctxParts.push(`\n## Notas del DM\n${ctxExtra}`);

  const campaignContextFull = [buildCampaignContext(), ...ctxParts].filter(Boolean).join('\n');

  const formData = {
    nombre,
    fecha_sesion: fecha,
    duracion_horas: duracion,
    personajes: personajesCompletos,
    npcs_seleccionados: npcsCompletos,
    lugares_seleccionados: locacionesCompletas,
    items_seleccionados: prepSelectedItems.map(i => ({ nombre: i.nombre, rareza: i.rareza, tipo: i.tipo })),
    monstruos_seleccionados: prepSelectedMonsters.map(m => ({ monstruo_id: m.id, nombre: m.nombre, cr: m.cr })),
    strong_start_hint: gancho || '',
    escenas_hint: escenas || '',
    secretos_hint: secretos || '',
  };

  const aiSteps = [
    { pct: 10, msg: 'Leyendo contexto de campaña...' },
    { pct: 25, msg: 'Construyendo el gancho fuerte...' },
    { pct: 42, msg: 'Generando escenas y secretos...' },
    { pct: 60, msg: 'Definiendo NPCs y locaciones...' },
    { pct: 75, msg: 'Añadiendo tesoros y monstruos...' },
    { pct: 90, msg: 'Afinando los detalles finales...' },
  ];

  main.innerHTML = `
    <div class="prep-ai-loading">
      <div class="prep-ai-icon">⚔</div>
      <div class="prep-ai-title">La IA está preparando tu sesión</div>
      <div class="prep-ai-step" id="prep-ai-step">${aiSteps[0].msg}</div>
      <div class="prep-progress-wrap">
        <div class="prep-progress-fill" id="prep-progress-fill" style="width:${aiSteps[0].pct}%"></div>
      </div>
      <div class="prep-progress-pct" id="prep-progress-pct">${aiSteps[0].pct}%</div>
    </div>
  `;

  let stepIdx = 1;
  const progressInterval = setInterval(() => {
    if (stepIdx < aiSteps.length) {
      const step = aiSteps[stepIdx];
      const fill = document.getElementById('prep-progress-fill');
      const stepEl = document.getElementById('prep-ai-step');
      const pctEl = document.getElementById('prep-progress-pct');
      if (fill) fill.style.width = step.pct + '%';
      if (stepEl) stepEl.textContent = step.msg;
      if (pctEl) pctEl.textContent = step.pct + '%';
      stepIdx++;
    }
  }, 3000);

  try {
    const { data: { session: prepSession } } = await sbClient.auth.getSession();
    const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/generate-session-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${prepSession?.access_token || CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'x-campaign-slug': CONFIG.SLUG,
      },
      body: JSON.stringify({
        formData,
        campaignContext: campaignContextFull,
        fecha_sesion: fecha,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || `Error ${response.status}`);
    }

    const result = await response.json();

    // Normalizar claves de la Edge Function al formato interno
    const bloques = {
      gancho_fuerte: result.bloque_strong_start || '',
      escenas: result.bloque_escenas || [],
      secretos: result.bloque_secretos || [],
      npcs: result.bloque_npcs || [],
      locaciones: result.bloque_locaciones || [],
      tesoros: result.bloque_tesoros || [],
      monstruos: result.bloque_monstruos || [],
      pivote: result.bloque_pivote || '',
      notas_dm: result.bloque_notas_dm || [],
    };

    // Save plan to Supabase
    const planData = {
      nombre,
      fecha_sesion: fecha,
      input_data: formData,
      bloques,
      bloques_committed: {},
      campaign_slug: CONFIG.SLUG,
    };

    const { data: saved, error: saveErr } = await sbClient.from('session_plans')
      .insert(planData)
      .select()
      .single();
    if (saveErr) throw new Error(saveErr.message);

    clearInterval(progressInterval);

    // Refresh list and show plan
    await loadSessionPlans();
    currentPlanId = saved.id;
    renderPlanSidebar(sessionPlans);
    renderPlanView(saved);

  } catch (e) {
    clearInterval(progressInterval);
    main.innerHTML = `
      <div class="prep-spinner" style="color:var(--red)">
        <span>Error: ${escapeHtml(e.message)}</span>
      </div>
      <button class="btn" style="margin:20px" onclick="openNewPlanForm()">Volver al formulario</button>
    `;
  }
}

// ── OPEN PLAN VIEW ───────────────────────────────────────────
async function openPlanView(planId) {
  currentPlanId = planId;
  renderPlanSidebar(sessionPlans);

  const main = document.getElementById('preparador-main');
  if (!main) return;
  main.innerHTML = '<div class="prep-spinner"><div class="spinner" style="width:24px;height:24px;border-width:3px"></div><span>Cargando plan...</span></div>';

  try {
    const { data: plan, error } = await sbClient.from('session_plans')
      .select('*')
      .eq('id', planId)
      .single();
    if (error) throw new Error(error.message);
    renderPlanView(plan);
  } catch (e) {
    main.innerHTML = `<div class="prep-spinner" style="color:var(--red)"><span>Error: ${escapeHtml(e.message)}</span></div>`;
  }
}

// ── RENDER PLAN VIEW ─────────────────────────────────────────
function renderPlanView(plan) {
  const main = document.getElementById('preparador-main');
  if (!main) return;

  const bloques = plan.bloques || {};
  const committed = plan.bloques_committed || {};
  const fecha = plan.fecha_sesion
    ? new Date(plan.fecha_sesion + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Sin fecha';

  const pid = plan.id;

  // ── helpers ────────────────────────────────────────────────
  function regenBtn(key) {
    return `<button class="plan-regen-btn" onclick="regenerateBloque('${pid}','${key}')">↺ Regenerar</button>`;
  }

  // Verifica si un índice específico ya fue commiteado
  function isItemCommitted(key, idx) {
    const val = committed[key];
    if (val === true) return true;                   // formato viejo: toda la sección
    if (Array.isArray(val)) return val.includes(idx); // formato nuevo: por índice
    return false;
  }

  // Verifica si un nombre ya existe en las BDs cargadas
  function existsInDB(nombre, bloqueKey) {
    const n = (nombre || '').trim().toLowerCase();
    if (!n) return false;
    if (bloqueKey === 'bloque_npcs' || bloqueKey === 'npcs') {
      return (DATA.npcs || []).some(x => (x.nombre || '').toLowerCase() === n);
    }
    if (bloqueKey === 'bloque_locaciones' || bloqueKey === 'locaciones') {
      return [...(DATA.lugares || []), ...(DATA.ciudades || []), ...(DATA.establecimientos || [])]
        .some(x => (x.nombre || '').toLowerCase() === n);
    }
    if (bloqueKey === 'bloque_tesoros' || bloqueKey === 'tesoros') {
      return (DATA.items || []).some(x => (x.nombre || '').toLowerCase() === n);
    }
    return false;
  }

  // Badge/botón por tarjeta individual
  function itemAction(bloqueKey, idx, nombre) {
    if (existsInDB(nombre, bloqueKey)) {
      return '<span class="plan-indb-badge">✓ En BD</span>';
    }
    if (isItemCommitted(bloqueKey, idx)) {
      return '<span class="plan-committed-badge">✓ Committed</span>';
    }
    return `<button class="plan-commit-btn plan-commit-item-btn" onclick="commitItem('${pid}','${bloqueKey}',${idx})">✓ Commit</button>`;
  }

  // Verifica si todos los items nuevos de una sección están commiteados o en BD
  function allSectionDone(bloqueKey, items) {
    if (committed[bloqueKey] === true) return true;
    if (!Array.isArray(items) || items.length === 0) return false;
    return items.every((item, idx) =>
      existsInDB(item.nombre, bloqueKey) || isItemCommitted(bloqueKey, idx)
    );
  }

  function sectionHeader(title, key, canCommit, items) {
    const allDone = canCommit && allSectionDone(key, items);
    return `<div class="plan-section-header">
      <h2 class="plan-section-title">${title}</h2>
      <div class="plan-section-actions">
        ${allDone ? '<span class="plan-committed-badge">✓ Committed</span>' : ''}
        ${regenBtn(key)}
      </div>
    </div>`;
  }

  // ── tipo badge colors ──────────────────────────────────────
  const tipoBg = { combate: '#5c1a1a', social: '#1a3060', 'exploración': '#1a4a28', misterio: '#3a1a5c' };
  const tipoColor = { combate: '#ffaaaa', social: '#aabfff', 'exploración': '#aaffcc', misterio: '#d4aaff' };
  function escenaBadge(tipo) {
    const t = (tipo || '').toLowerCase();
    const bg = tipoBg[t] || '#2a2a2a';
    const color = tipoColor[t] || '#d4c5ab';
    return `<span class="escena-tipo-badge" style="background:${bg};color:${color}">${escapeHtml(tipo || '')}</span>`;
  }
  function tensionDots(n) {
    const filled = Math.min(Math.max(parseInt(n) || 0, 0), 5);
    return '<span class="tension-dots">' +
      '●'.repeat(filled) + '<span style="opacity:0.25">' + '●'.repeat(5 - filled) + '</span>' +
      '</span>';
  }

  // ── rareza badge ───────────────────────────────────────────
  const rarezaBg = { común: '#2a2a2a', 'poco común': '#1a3a1a', rara: '#1a1a4a', 'muy rara': '#3a1a4a', legendaria: '#4a3500' };
  const rarezaColor = { común: '#9c8f78', 'poco común': '#6fcf97', rara: '#7eb8ff', 'muy rara': '#c77dff', legendaria: '#ffbf00' };
  function rarezaBadge(r) {
    const k = (r || '').toLowerCase();
    const bg = rarezaBg[k] || '#2a2a2a';
    const color = rarezaColor[k] || '#9c8f78';
    return `<span class="rareza-badge" style="background:${bg};color:${color}">${escapeHtml(r || '—')}</span>`;
  }

  // ── 1. HEADER ──────────────────────────────────────────────
  let html = `<div class="plan-view">
    <div class="plan-header">
      <div>
        <div class="plan-title">${escapeHtml(plan.nombre || 'Plan')}</div>
        <div class="plan-fecha">${fecha}</div>
      </div>
      <button class="plan-delete-btn" onclick="deletePlan('${pid}')">Eliminar</button>
    </div>
    <div class="plan-separator"><span class="plan-separator-diamond">◆</span></div>
  `;

  // ── 2. GANCHO FUERTE ───────────────────────────────────────
  const gancho = bloques['bloque_strong_start'] || bloques['gancho_fuerte'];
  html += `<div class="plan-section">
    ${sectionHeader('Gancho Fuerte', 'bloque_strong_start', false)}
    <div class="gancho-card">
      <div class="gancho-text">${escapeHtml(gancho || 'Sin contenido generado.')}</div>
    </div>
  </div>`;

  // ── 3. ESCENAS ─────────────────────────────────────────────
  const escenas = bloques['bloque_escenas'] || bloques['escenas'] || [];
  html += `<div class="plan-section">
    ${sectionHeader('Escenas Potenciales', 'bloque_escenas', false)}
    <div class="escenas-grid">`;
  (Array.isArray(escenas) ? escenas : []).forEach(e => {
    html += `<div class="escena-card">
      <div class="escena-card-top">
        ${escenaBadge(e.tipo)}
        ${tensionDots(e.tension)}
      </div>
      <div class="escena-titulo">${escapeHtml(e.titulo || '')}</div>
      <div class="escena-desc">${escapeHtml(e.descripcion || '')}</div>
    </div>`;
  });
  html += `</div></div>`;

  // ── 4. SECRETOS ────────────────────────────────────────────
  const secretos = bloques['bloque_secretos'] || bloques['secretos'] || [];
  html += `<div class="plan-section plan-section-dark">
    ${sectionHeader('Secretos y Pistas', 'bloque_secretos', false)}
    <div class="secretos-list">`;
  (Array.isArray(secretos) ? secretos : []).forEach(s => {
    html += `<div class="secreto-row">
      <div class="secreto-left">
        <span class="secreto-icon">◉</span>
        <div class="secreto-text">${escapeHtml(s.secreto || '')}</div>
      </div>
      <div class="secreto-right">
        ${s.pista ? `<div class="secreto-pista"><span class="secreto-label">Pista</span>${escapeHtml(s.pista)}</div>` : ''}
        ${s.quien_sabe ? `<div class="secreto-quien"><span class="secreto-label">Sabe</span>${escapeHtml(s.quien_sabe)}</div>` : ''}
      </div>
    </div>`;
  });
  html += `</div></div>`;

  // ── 5 & 6. NPCS + LOCACIONES (lado a lado en PC) ──────────
  html += `<div class="plan-row-2col">`;

  const npcs = bloques['bloque_npcs'] || bloques['npcs'] || [];
  const npcsKey = bloques['bloque_npcs'] ? 'bloque_npcs' : 'npcs';
  html += `<div class="plan-section">
    ${sectionHeader('NPCs Importantes', npcsKey, true, npcs)}
    <div class="npcs-grid">`;
  (Array.isArray(npcs) ? npcs : []).forEach((n, idx) => {
    const inDB = existsInDB(n.nombre, npcsKey);
    const itemComm = isItemCommitted(npcsKey, idx);
    const cardClass = inDB || itemComm ? ' committed' : '';
    html += `<div class="npc-card${cardClass}">
      <div class="npc-card-top">
        <div class="npc-nombre">${escapeHtml(n.nombre || '')}</div>
        ${itemAction(npcsKey, idx, n.nombre)}
      </div>
      ${n.rol ? `<div class="npc-rol-badge">${escapeHtml(n.rol)}</div>` : ''}
      ${n.motivacion ? `<div class="npc-motivacion"><strong>Quiere:</strong> ${escapeHtml(n.motivacion)}</div>` : ''}
      ${n.tono ? `<div class="npc-tono"><strong>Tono:</strong> ${escapeHtml(n.tono)}</div>` : ''}
      ${n.frase ? `<div class="npc-frase">"${escapeHtml(n.frase)}"</div>` : ''}
    </div>`;
  });
  html += `</div></div>`;

  const locaciones = bloques['bloque_locaciones'] || bloques['locaciones'] || [];
  const locKey = bloques['bloque_locaciones'] ? 'bloque_locaciones' : 'locaciones';
  html += `<div class="plan-section plan-section-dark">
    ${sectionHeader('Locaciones', locKey, true, locaciones)}
    <div class="locaciones-grid">`;
  (Array.isArray(locaciones) ? locaciones : []).forEach((l, idx) => {
    const inDB = existsInDB(l.nombre, locKey);
    const itemComm = isItemCommitted(locKey, idx);
    const cardClass = inDB || itemComm ? ' committed' : '';
    html += `<div class="locacion-card${cardClass}">
      <div class="locacion-card-top">
        <div class="locacion-nombre">${escapeHtml(l.nombre || '')}</div>
        ${itemAction(locKey, idx, l.nombre)}
      </div>
      <div class="locacion-tags">
        ${l.tipo ? `<span class="locacion-tag">${escapeHtml(l.tipo)}</span>` : ''}
        ${l.region ? `<span class="locacion-tag locacion-tag-region">${escapeHtml(l.region)}</span>` : ''}
      </div>
      ${l.descripcion ? `<div class="locacion-desc">${escapeHtml(l.descripcion)}</div>` : ''}
    </div>`;
  });
  html += `</div></div>`;

  html += `</div>`; // .plan-row-2col NPCs+Locaciones

  // ── 7 & 8. TESOROS + MONSTRUOS (lado a lado en PC) ────────
  html += `<div class="plan-row-2col">`;

  const tesoros = bloques['bloque_tesoros'] || bloques['tesoros'] || [];
  const tesorosKey = bloques['bloque_tesoros'] ? 'bloque_tesoros' : 'tesoros';
  html += `<div class="plan-section">
    ${sectionHeader('Tesoros', tesorosKey, true, tesoros)}
    <div class="tesoros-grid">`;
  (Array.isArray(tesoros) ? tesoros : []).forEach((t, idx) => {
    const inDB = existsInDB(t.nombre, tesorosKey);
    const itemComm = isItemCommitted(tesorosKey, idx);
    const cardClass = inDB || itemComm ? ' committed' : '';
    html += `<div class="tesoro-card${cardClass}">
      <div class="tesoro-top">
        <div class="tesoro-nombre">${escapeHtml(t.nombre || '')}</div>
        ${rarezaBadge(t.rareza)}
        ${itemAction(tesorosKey, idx, t.nombre)}
      </div>
      ${t.descripcion ? `<div class="tesoro-desc">${escapeHtml(t.descripcion)}</div>` : ''}
      ${t.portador_sugerido ? `<div class="tesoro-para">Para: ${escapeHtml(t.portador_sugerido)}</div>` : ''}
    </div>`;
  });
  html += `</div></div>`;

  const monstruos = bloques['bloque_monstruos'] || bloques['monstruos'] || [];
  html += `<div class="plan-section plan-section-dark">
    ${sectionHeader('Monstruos', 'bloque_monstruos', false)}
    <div class="monstruos-grid">`;
  (Array.isArray(monstruos) ? monstruos : []).forEach(m => {
    html += `<div class="monstruo-card">
      <div class="monstruo-header">
        <span class="monstruo-nombre">${escapeHtml(m.nombre || '')}</span>
        ${m.cantidad ? `<span class="monstruo-cantidad">×${m.cantidad}</span>` : ''}
      </div>
      ${m.contexto_narrativo ? `<div class="monstruo-ctx">${escapeHtml(m.contexto_narrativo)}</div>` : ''}
    </div>`;
  });
  html += `</div></div>`;

  html += `</div>`; // .plan-row-2col Tesoros+Monstruos

  // ── 9. MOMENTO PIVOTE ──────────────────────────────────────
  const pivote = bloques['bloque_pivote'] || bloques['pivote'];
  if (pivote) {
    html += `<div class="plan-section">
      ${sectionHeader('Momento Pivote', 'bloque_pivote', false)}
      <div class="pivote-card">
        <span class="pivote-icon">⚔</span>
        <div class="pivote-text">${escapeHtml(pivote)}</div>
      </div>
    </div>`;
  }

  // ── 10. NOTAS PRIVADAS DM ─────────────────────────────────
  const notasDm = bloques['bloque_notas_dm'] || bloques['notas_dm'];
  if (Array.isArray(notasDm) && notasDm.length) {
    html += `<div class="plan-section plan-section-dark">
      ${sectionHeader('Notas Privadas DM', 'bloque_notas_dm', false)}
      <div class="notas-dm-list">
        ${notasDm.map(n => `<div class="nota-dm-item"><span class="nota-dm-dot">▸</span>${escapeHtml(n)}</div>`).join('')}
      </div>
    </div>`;
  }

  html += '</div>'; // .plan-view
  main.innerHTML = html;
}

// ── REGENERATE BLOQUE ────────────────────────────────────────
async function regenerateBloque(planId, bloqueKey) {
  try {
    const { data: plan } = await sbClient.from('session_plans')
      .select('*')
      .eq('id', planId)
      .single();

    const { data: { session: regenSession } } = await sbClient.auth.getSession();
    const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/generate-session-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${regenSession?.access_token || CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'x-campaign-slug': CONFIG.SLUG,
      },
      body: JSON.stringify({
        formData: { ...(plan.input_data || {}), bloque_objetivo: bloqueKey },
        campaignContext: buildCampaignContext(),
        fecha_sesion: plan.fecha_sesion,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || `Error ${response.status}`);
    }

    const result = await response.json();
    const newBloques = { ...plan.bloques };
    // Mapear clave de Edge Function al formato interno
    const edgeKeyMap = {
      gancho_fuerte: 'bloque_strong_start', escenas: 'bloque_escenas',
      secretos: 'bloque_secretos', npcs: 'bloque_npcs',
      locaciones: 'bloque_locaciones', tesoros: 'bloque_tesoros',
      monstruos: 'bloque_monstruos',
    };
    newBloques[bloqueKey] = result[edgeKeyMap[bloqueKey]] || result[bloqueKey] || result;

    const { error: updateErr } = await sbClient.from('session_plans')
      .update({ bloques: newBloques })
      .eq('id', planId);
    if (updateErr) throw new Error(updateErr.message);

    plan.bloques = newBloques;
    renderPlanView(plan);
    showToast(`Bloque "${bloqueKey}" regenerado.`);

  } catch (e) {
    alert('Error al regenerar: ' + e.message);
  }
}

// ── COMMIT ITEM INDIVIDUAL ────────────────────────────────────
async function commitItem(planId, bloqueKey, index) {
  try {
    const { data: plan } = await sbClient.from('session_plans')
      .select('*')
      .eq('id', planId)
      .single();

    const items = plan.bloques?.[bloqueKey];
    if (!items || !Array.isArray(items) || !items[index]) {
      alert('Item no encontrado.');
      return;
    }

    const item = items[index];
    document.getElementById('spinner')?.classList.add('active');

    // Normalizar bloqueKey para determinar tabla destino
    const keyNorm = bloqueKey.replace('bloque_', '');

    if (keyNorm === 'npcs') {
      const tiposValidos = ['Comerciante','Gremio','Religioso','Otro'];
      const tipoRaw = item.tipo_npc || item.tipo || '';
      const tipo = tiposValidos.includes(tipoRaw) ? tipoRaw : 'Otro';
      const partes_pi = [item.motivacion && `Quiere: ${item.motivacion}`, item.tono && `Tono: ${item.tono}`].filter(Boolean);
      const partes_rp = [item.rol && `Rol en sesión: ${item.rol}`, item.frase && `Frase: "${item.frase}"`].filter(Boolean);
      await sbSave('npcs', {
        nombre: item.nombre || item.name,
        tipo_npc: tipo,
        primera_impresion: item.primera_impresion || item.descripcion || partes_pi.join('. ') || '',
        notas_roleplay: item.notas_roleplay || partes_rp.join('. ') || '',
        raza: item.raza || '',
      }, 'add');
    } else if (keyNorm === 'locaciones') {
      await sbSave('lugares', {
        nombre: item.nombre || item.name,
        tipo: item.tipo || '',
        descripcion: item.descripcion || item.description || '',
        region: item.region || '',
      }, 'add');
    } else if (keyNorm === 'tesoros') {
      await sbSave('items', {
        nombre: item.nombre || item.name,
        tipo: item.tipo || '',
        rareza: item.rareza || '',
        descripcion: item.descripcion || item.description || '',
      }, 'add');
    }

    // Marcar índice como committed (granular)
    const committed = plan.bloques_committed || {};
    if (committed[bloqueKey] === true) {
      // Ya estaba todo committed, no hacer nada
    } else {
      const arr = Array.isArray(committed[bloqueKey]) ? committed[bloqueKey] : [];
      if (!arr.includes(index)) arr.push(index);
      committed[bloqueKey] = arr;
    }
    await sbClient.from('session_plans')
      .update({ bloques_committed: committed })
      .eq('id', planId);

    plan.bloques_committed = committed;
    document.getElementById('spinner')?.classList.remove('active');

    await loadAllData();
    renderAll();
    renderPlanView(plan);
    showToast(`"${item.nombre}" committed a la base de datos.`);

  } catch (e) {
    document.getElementById('spinner')?.classList.remove('active');
    alert('Error al commit: ' + e.message);
  }
}

// ── DELETE PLAN ──────────────────────────────────────────────
async function deletePlan(planId) {
  if (!confirm('Eliminar este plan de sesion?')) return;

  try {
    const { error } = await sbClient.from('session_plans')
      .delete()
      .eq('id', planId);
    if (error) throw new Error(error.message);

    currentPlanId = null;
    await loadSessionPlans();
    const main = document.getElementById('preparador-main');
    if (main) main.innerHTML = '<div class="prep-spinner"><span>Plan eliminado. Selecciona otro o crea uno nuevo.</span></div>';
    showToast('Plan eliminado.');
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

// ── Close search dropdowns on outside click ──────────────────
document.addEventListener('click', function(e) {
  const wrappers = [
    { wrapper: 'prep-items-search-wrapper', results: 'prep-items-results' },
    { wrapper: 'prep-monsters-search-wrapper', results: 'prep-monsters-results' },
    { wrapper: 'prep-npcs-search-wrapper', results: 'prep-npcs-results' },
    { wrapper: 'prep-locaciones-search-wrapper', results: 'prep-locaciones-results' },
  ];
  wrappers.forEach(({ wrapper, results }) => {
    if (!e.target.closest(`#${wrapper}`)) {
      const r = document.getElementById(results);
      if (r) r.style.display = 'none';
    }
  });
});
