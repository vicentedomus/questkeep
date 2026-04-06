/* =============================================================
   QuestKeep — D&D Campaign Manager (Multi-Campaign)
   app.js — Full application logic
   ============================================================= */

// ── DATA STORE ────────────────────────────────────────────
const DATA = {};
let MAP_MARKERS = {}; // {id: {x, y}}
let currentModalSection = null;
let currentModalData = null;
let currentModalMode = null; // 'detail' | 'edit'

// ── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username-input').value.trim();
    const pw = document.getElementById('password-input').value.trim();
    const errEl = document.getElementById('login-error');
    if (!username || !pw) return;
    const result = await login(username, pw);
    if (result === 'must_change') {
      return; // showChangePasswordScreen() ya se encargó
    }
    if (result === 'no_access') {
      errEl.textContent = 'No tienes acceso a ninguna campaña.';
      return;
    }
    if (result === 'select_campaign') {
      errEl.textContent = '';
      showCampaignSelector();
      return;
    }
    if (result) {
      errEl.textContent = '';
      bootApp();
    } else {
      errEl.textContent = 'Usuario o contraseña incorrectos.';
      document.getElementById('password-input').select();
    }
  });

  initAuth().then(() => {
    if (isLoggedIn() && CONFIG.SLUG) {
      bootApp();
    } else if (window._pendingMemberships) {
      showCampaignSelector();
    }
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      closeSidebar();
    });
  });

  // Mobile menu toggle
  document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
});

async function bootApp() {
  document.getElementById('login-screen').style.display = 'none';
  const app = document.getElementById('app');
  app.classList.add('visible');
  if (isDM()) app.classList.add('is-dm');

  // Branding dinámico
  const campaignName = CONFIG.CAMPAIGN_NAME || CONFIG.SLUG || 'Campaña';
  const sidebarLogo = document.querySelector('.sidebar-logo');
  if (sidebarLogo) sidebarLogo.textContent = campaignName.toUpperCase();
  document.title = `${campaignName} — Campaña D&D`;

  // Tabs exclusivas de Halo: mapa
  const mapaTab = document.querySelector('[data-tab="mapa"]');
  if (mapaTab) mapaTab.style.display = CONFIG.SLUG === 'halo' ? '' : 'none';

  await loadData();
  const titleEl = document.getElementById('header-section-title');
  if (titleEl) titleEl.textContent = 'Campaña';
  renderAll();
  renderCampana();
  initGlobalSearch();
}

// ── GITHUB TOKEN ──────────────────────────────────────────
function getGitHubToken() {
  return localStorage.getItem('gh_token') || '';
}

// ── DATA LOADING ──────────────────────────────────────────────
async function loadData() {
  await loadAllData();
  console.log('✓ Datos cargados desde Supabase');
}

// ── MOBILE SIDEBAR ──────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
}

// ── TAB SWITCHING ───────────────────────────────────────────────
const TAB_TITLES = { campana:'Campaña', notas:'Notas de Sesión', npcs:'NPCs', establecimientos:'Establecimientos', ciudades:'Ciudades', lugares:'Lugares', items:'Items Mágicos', personajes:'Personajes', quests:'Quests', mapa:'Mapa', utilidades:'Utilidades' };
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === `section-${tab}`));
  const titleEl = document.getElementById('header-section-title');
  if (titleEl) titleEl.textContent = TAB_TITLES[tab] || tab;
  const content = document.getElementById('content');
  if (tab === 'mapa') {
    content.classList.add('map-active');
    renderMapa();
  } else {
    content.classList.remove('map-active');
  }
  if (tab === 'campana') renderCampana();
  if (tab === 'utilidades') renderUtilidades();
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

function visibilityToggleHtml(entity, entityId, isVisible) {
  if (!isDM()) return '';
  return `<span class="visibility-toggle ${isVisible ? 'is-visible' : ''}" onclick="event.stopPropagation(); toggleVisibility('${entity}', '${entityId}', this)" title="${isVisible ? 'Visible para jugadores' : 'Oculto para jugadores'}">${isVisible ? EYE_OPEN : EYE_CLOSED}</span>`;
}

async function toggleVisibility(entity, entityId, iconEl) {
  const dataKey = entity;
  const arr = DATA[dataKey] || [];
  const item = arr.find(x => x.id === entityId);
  if (!item) return;

  // Determinar el campo correcto
  const field = entity === 'ciudades' ? 'conocida_jugadores' : 'conocido_jugadores';
  const newVal = !item[field];
  item[field] = newVal;

  // Actualizar icono inmediatamente
  iconEl.innerHTML = newVal ? EYE_OPEN : EYE_CLOSED;
  iconEl.classList.toggle('is-visible', newVal);
  iconEl.title = newVal ? 'Visible para jugadores' : 'Oculto para jugadores';

  // Persistir en Supabase
  try {
    await sbUpdate(dataKey, item._sbid, { [field]: newVal });
  } catch(e) { console.warn('Toggle visibility save failed:', e); }
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

// ── @MENTION SYSTEM ──────────────────────────────────────────────

/** Categorías de entidades para el dropdown de menciones */
const MENTION_SOURCES = [
  { key: 'npcs',              label: 'NPC',             icon: '👤' },
  { key: 'ciudades',          label: 'Ciudad',          icon: '🏙' },
  { key: 'establecimientos',  label: 'Establecimiento', icon: '🏪' },
  { key: 'lugares',           label: 'Lugar',           icon: '🗺' },
  { key: 'items',             label: 'Item',            icon: '⚔' },
  { key: 'quests',            label: 'Quest',           icon: '★' },
  { key: 'players',           label: 'Personaje',       icon: '🎭', tab: 'personajes' },
];

/** Recopila todas las entidades mencionables filtradas por query */
function getMentionResults(query) {
  const q = query.toLowerCase();
  const results = [];
  for (const src of MENTION_SOURCES) {
    const arr = DATA[src.key] || [];
    for (const item of arr) {
      if (!item.nombre) continue;
      if (q && !item.nombre.toLowerCase().includes(q)) continue;
      results.push({ section: src.tab || src.key, entityId: item.id, nombre: item.nombre, icon: src.icon, label: src.label });
    }
    if (results.length > 50) break;
  }
  return results.slice(0, 20);
}

/** Parsea texto con @menciones y devuelve HTML con links clickeables */
function parseMentions(escapedHtml) {
  return escapedHtml.replace(/@\[([^\]]+)\]\(([^:]+):([^)]+)\)/g, (_, nombre, section, entityId) => {
    return `<span class="mention-link" onclick="event.stopPropagation();navegarA('${section}','${entityId}')" onmouseenter="showPreview('${section}','${entityId}',event)" onmouseleave="hidePreview()">${nombre}</span>`;
  });
}

/** Limpia @menciones dejando solo el nombre (para previews en cards) */
function stripMentions(text) {
  if (!text) return text;
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/** Convierte texto raw (con @menciones) a HTML para contenteditable */
function textToContentEditable(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/@\[([^\]]+)\]\(([^:]+):([^)]+)\)/g, (_, nombre, section, entityId) => {
      return `<span class="ce-mention" contenteditable="false" data-section="${section}" data-id="${entityId}">${nombre}</span>`;
    })
    .replace(/\n/g, '<br>');
}

/** Extrae texto raw (con @menciones) desde un contenteditable div */
function contentEditableToText(el) {
  let text = '';
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeName === 'BR') {
      text += '\n';
    } else if (node.classList && node.classList.contains('ce-mention')) {
      text += `@[${node.textContent}](${node.dataset.section}:${node.dataset.id})`;
    } else if (node.nodeName === 'DIV') {
      // Browsers sometimes wrap lines in divs
      if (text.length > 0 && !text.endsWith('\n')) text += '\n';
      text += contentEditableToText(node);
    } else {
      text += node.textContent || '';
    }
  }
  return text;
}

/** Estado del dropdown de menciones */
let mentionState = null; // { textarea, dropdown, startPos }

function initMentionTextarea(ceDiv) {
  const wrap = document.createElement('div');
  wrap.className = 'mention-wrap';
  ceDiv.parentNode.insertBefore(wrap, ceDiv);
  wrap.appendChild(ceDiv);

  const dropdown = document.createElement('div');
  dropdown.className = 'mention-dropdown';
  wrap.appendChild(dropdown);

  ceDiv.addEventListener('input', () => onMentionInput(ceDiv, dropdown));
  ceDiv.addEventListener('keydown', (e) => onMentionKeydown(e, ceDiv, dropdown));
  ceDiv.addEventListener('blur', () => setTimeout(() => { dropdown.classList.remove('open'); mentionState = null; }, 200));
}

/** Obtiene el texto antes del cursor en un contenteditable */
function getTextBeforeCursor(ceDiv) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return { text: '', range: null };
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  // Recorrer nodos hacia atrás para construir el texto antes del cursor
  const preRange = document.createRange();
  preRange.selectNodeContents(ceDiv);
  preRange.setEnd(range.startContainer, range.startOffset);

  const frag = preRange.cloneContents();
  const tmp = document.createElement('div');
  tmp.appendChild(frag);
  // Convertir BR y mention spans a texto plano
  tmp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  tmp.querySelectorAll('.ce-mention').forEach(m => m.replaceWith(`@[${m.textContent}]`));
  return { text: tmp.textContent || '', range };
}

function onMentionInput(ceDiv, dropdown) {
  const { text: before } = getTextBeforeCursor(ceDiv);
  const atIdx = before.lastIndexOf('@');

  if (atIdx === -1 || (atIdx > 0 && /\w/.test(before[atIdx - 1]))) {
    dropdown.classList.remove('open');
    mentionState = null;
    return;
  }

  const query = before.substring(atIdx + 1);
  if (query.includes('\n') || query.length > 30) {
    dropdown.classList.remove('open');
    mentionState = null;
    return;
  }

  const results = getMentionResults(query);
  if (!results.length) {
    dropdown.classList.remove('open');
    mentionState = null;
    return;
  }

  mentionState = { ceDiv, dropdown, atIdx, queryLen: query.length };
  dropdown.innerHTML = results.map((r, i) =>
    `<div class="mention-option${i === 0 ? ' active' : ''}" data-idx="${i}" data-section="${r.section}" data-id="${r.entityId}" data-nombre="${escapeHtml(r.nombre)}">${r.icon} <strong>${escapeHtml(r.nombre)}</strong> <span class="mention-type">${r.label}</span></div>`
  ).join('');
  dropdown.classList.add('open');

  dropdown.querySelectorAll('.mention-option').forEach(opt => {
    opt.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertMention(opt.dataset.section, opt.dataset.id, opt.dataset.nombre);
    });
  });
}

function onMentionKeydown(e, ceDiv, dropdown) {
  if (!mentionState || !dropdown.classList.contains('open')) return;
  const opts = [...dropdown.querySelectorAll('.mention-option')];
  const activeIdx = opts.findIndex(o => o.classList.contains('active'));

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    opts[activeIdx]?.classList.remove('active');
    opts[(activeIdx + 1) % opts.length]?.classList.add('active');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    opts[activeIdx]?.classList.remove('active');
    opts[(activeIdx - 1 + opts.length) % opts.length]?.classList.add('active');
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    const active = dropdown.querySelector('.mention-option.active');
    if (active) {
      e.preventDefault();
      insertMention(active.dataset.section, active.dataset.id, active.dataset.nombre);
    }
  } else if (e.key === 'Escape') {
    dropdown.classList.remove('open');
    mentionState = null;
  }
}

function insertMention(section, entityId, nombre) {
  if (!mentionState) return;
  const { ceDiv, dropdown, queryLen } = mentionState;

  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);

  // Borrar el "@query" que escribió el usuario
  range.setStart(range.startContainer, range.startOffset - queryLen - 1); // -1 para el @
  range.deleteContents();

  // Insertar el chip de mención
  const chip = document.createElement('span');
  chip.className = 'ce-mention';
  chip.contentEditable = 'false';
  chip.dataset.section = section;
  chip.dataset.id = entityId;
  chip.textContent = nombre;
  range.insertNode(chip);

  // Mover cursor después del chip
  const space = document.createTextNode('\u00A0');
  chip.after(space);
  range.setStartAfter(space);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);

  ceDiv.focus();
  dropdown.classList.remove('open');
  mentionState = null;
}

// ── GLOBAL SEARCH ────────────────────────────────────────────────

const SEARCH_SOURCES = [
  { key: 'npcs',              tab: 'npcs',              label: 'NPC',             icon: '👤', fields: ['nombre','raza','primera_impresion'] },
  { key: 'ciudades',          tab: 'ciudades',          label: 'Ciudad',          icon: '🏙', fields: ['nombre','descripcion','lider'] },
  { key: 'establecimientos',  tab: 'establecimientos',  label: 'Establecimiento', icon: '🏪', fields: ['nombre','descripcion_interior','descripcion_exterior'] },
  { key: 'lugares',           tab: 'lugares',           label: 'Lugar',           icon: '🗺', fields: ['nombre','descripcion'] },
  { key: 'items',             tab: 'items',             label: 'Item',            icon: '⚔', fields: ['nombre','descripcion'] },
  { key: 'quests',            tab: 'quests',            label: 'Quest',           icon: '★', fields: ['nombre','resumen'] },
  { key: 'players',           tab: 'personajes',        label: 'Personaje',       icon: '🎭', fields: ['nombre','descripcion'] },
  { key: 'notas_jugadores',   tab: 'notas_jugadores',   label: 'Nota',            icon: '📓', fields: ['nombre','resumen'] },
];

function globalSearch(query) {
  const q = query.toLowerCase();
  const results = [];
  const dm = isDM();
  for (const src of SEARCH_SOURCES) {
    // DM-only sources
    if (src.key === 'notas_dm' && !dm) continue;
    const arr = DATA[src.key] || [];
    for (const item of arr) {
      // Visibilidad: jugadores solo ven lo que tienen acceso
      if (!dm && src.key !== 'players' && src.key !== 'notas_jugadores') {
        if (!item.conocida_jugadores && !item.conocido_jugadores && !item.creado_por_jugador) continue;
      }
      const match = src.fields.some(f => {
        const val = item[f];
        return val && stripMentions(String(val)).toLowerCase().includes(q);
      });
      if (!match) continue;
      // Extraer snippet del campo que matcheó
      let snippet = '';
      for (const f of src.fields) {
        const val = item[f];
        if (val && stripMentions(String(val)).toLowerCase().includes(q)) {
          snippet = stripMentions(String(val)).substring(0, 80);
          break;
        }
      }
      results.push({ section: src.tab, entityId: item.id, nombre: item.nombre, icon: src.icon, label: src.label, snippet });
      if (results.length >= 25) return results;
    }
  }
  return results;
}

function toggleGlobalSearch() {
  const container = document.getElementById('global-search');
  const input = document.getElementById('global-search-input');
  container.classList.toggle('open');
  if (container.classList.contains('open')) {
    input.value = '';
    input.focus();
    document.getElementById('global-search-results').classList.remove('open');
  }
}

function initGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const results = document.getElementById('global-search-results');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (q.length < 2) { results.classList.remove('open'); return; }
    const items = globalSearch(q);
    if (!items.length) {
      results.innerHTML = '<div class="gs-empty">Sin resultados</div>';
      results.classList.add('open');
      return;
    }
    results.innerHTML = items.map((r, i) =>
      `<div class="gs-option${i === 0 ? ' active' : ''}" data-section="${r.section}" data-id="${r.entityId}">
        <span class="gs-icon">${r.icon}</span>
        <div class="gs-info">
          <div class="gs-name">${escapeHtml(r.nombre)}</div>
          ${r.snippet && r.snippet !== r.nombre ? `<div class="gs-snippet">${escapeHtml(r.snippet).substring(0,60)}${r.snippet.length > 60 ? '…' : ''}</div>` : ''}
        </div>
        <span class="gs-type">${r.label}</span>
      </div>`
    ).join('');
    results.classList.add('open');

    results.querySelectorAll('.gs-option').forEach(opt => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        openGlobalSearchResult(opt.dataset.section, opt.dataset.id);
      });
    });
  });

  input.addEventListener('keydown', (e) => {
    if (!results.classList.contains('open')) return;
    const opts = [...results.querySelectorAll('.gs-option')];
    const activeIdx = opts.findIndex(o => o.classList.contains('active'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[activeIdx]?.classList.remove('active');
      opts[(activeIdx + 1) % opts.length]?.classList.add('active');
      opts[(activeIdx + 1) % opts.length]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      opts[activeIdx]?.classList.remove('active');
      opts[(activeIdx - 1 + opts.length) % opts.length]?.classList.add('active');
      opts[(activeIdx - 1 + opts.length) % opts.length]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const active = results.querySelector('.gs-option.active');
      if (active) {
        e.preventDefault();
        openGlobalSearchResult(active.dataset.section, active.dataset.id);
      }
    } else if (e.key === 'Escape') {
      toggleGlobalSearch();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      results.classList.remove('open');
    }, 200);
  });

  // Ctrl+K / Cmd+K atajo global
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      toggleGlobalSearch();
    }
  });
}

function openGlobalSearchResult(section, entityId) {
  const dataKey = section === 'personajes' ? 'players' : section;
  const arr = DATA[dataKey] || [];
  const item = arr.find(x => x.id === entityId);
  if (item) {
    document.getElementById('global-search').classList.remove('open');
    document.getElementById('global-search-results').classList.remove('open');
    openDetail(section, item);
  }
}

// ── RELATION CHIP (clickeable + hover preview) ───────────────────
function relChip(tab, entityId, nombre) {
  if (!nombre) return '—';
  const safe = escapeHtml(nombre);
  if (!entityId) return safe;
  return `<span class="rel-chip" onclick="event.stopPropagation();navegarA('${tab}','${entityId}')" onmouseenter="showPreview('${tab}','${entityId}',event)" onmouseleave="hidePreview()">${safe}</span>`;
}

function showPreview(tab, entityId, event) {
  const arrMap = { npcs: DATA.npcs, ciudades: DATA.ciudades, establecimientos: DATA.establecimientos, personajes: DATA.players, items: DATA.items, quests: DATA.quests, lugares: DATA.lugares, notas_dm: DATA.notas_dm };
  const arr = arrMap[tab] || [];
  const rec = arr.find(x => x.id === entityId);
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
  const previewDesc = rec.descripcion || rec.primera_impresion || rec.descripcion_interior || '';
  if (previewDesc) { const clean = stripMentions(previewDesc); html += `<div class="preview-desc">${escapeHtml(clean).substring(0,100)}${clean.length > 100 ? '…' : ''}</div>`; }

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
function navegarA(tab, entityId) {
  if (!entityId) return;
  // Buscar el item en DATA y abrir su detalle en popup
  const dataKey = tab === 'personajes' ? 'players' : tab;
  const arr = DATA[dataKey] || [];
  const item = arr.find(x => x.id === entityId);
  if (item) {
    openDetail(tab, item);
  }
}

// ── DETAIL MODAL ────────────────────────────────────────────────
function openDetailFromCard(el) {
  const section = el.dataset.section;
  const entityId = el.dataset.entityId;
  let arr;
  if (section === 'notas_dm') arr = DATA.notas_dm || [];
  else if (section === 'notas_jugadores') arr = DATA.notas_jugadores || [];
  else if (section === 'personajes') arr = DATA.players || [];
  else if (section === 'monstruos') arr = DATA.monstruos || [];
  else if (section === 'items_catalog') arr = DATA.items_catalog || [];
  else arr = DATA[section] || [];
  const item = arr.find(x => x.id === entityId);
  if (item) openDetail(section, item);
}

const ENTITY_NOTES_SECTIONS = new Set(['npcs','ciudades','establecimientos','lugares','items']);

function openDetail(section, data) {
  hidePreview();
  currentModalSection = section;
  currentModalData = data;
  currentModalMode = 'detail';
  const label = SECTION_LABELS[section] || section;
  document.getElementById('modal-title').textContent = escapeHtml(data.nombre || label);

  const body = document.getElementById('modal-body');
  let html = buildDetailHTML(section, data);

  // Auto-refresh D&D Beyond data if PJ modal opened with stale ddb_data
  if (section === 'personajes' && data.es_pj && data.dndbeyond_url && data.ddb_data && !data.ddb_data.classResources) {
    const ddbId = ddbExtractId(data.dndbeyond_url);
    const sbId = data._sbid || '';
    if (ddbId) {
      delete _ddbCache[ddbId];
      ddbFetchCharacter(ddbId).then(char => {
        ddbSyncToSupabase(sbId, char).then(() => {
          // Re-render if modal still showing same character
          if (currentModalData === data && currentModalMode === 'detail') {
            const p = (DATA.players || []).find(pl => pl._sbid === sbId);
            if (p) body.querySelector('.ddb-integrated')?.replaceWith(
              Object.assign(document.createElement('div'), {
                innerHTML: ddbBuildIntegratedCard(char, p, ddbId, sbId)
              }).firstElementChild
            );
          }
        });
      }).catch(() => {});
    }
  }

  // Sección de notas de jugadores (colapsable)
  if (ENTITY_NOTES_SECTIONS.has(section) && data._sbid) {
    html += `<div class="entity-notes-section">
      <div class="entity-notes-toggle" onclick="toggleEntityNotes()">
        <span class="entity-notes-arrow" id="en-arrow">▸</span> Notas de Jugadores
      </div>
      <div class="entity-notes-body" id="entity-notes-body" style="display:none">
        <div class="ce-textarea entity-notes-editor" id="entity-notes-editor" contenteditable="true" data-placeholder="Escribe notas sobre este elemento..."></div>
        <div class="entity-notes-actions">
          <button class="btn btn-sm btn-success" onclick="saveEntityNote()">Guardar nota</button>
          <span class="entity-notes-status" id="en-status"></span>
        </div>
      </div>
    </div>`;
  }

  body.innerHTML = html;
  body.classList.add('is-detail');

  const footer = document.getElementById('modal-footer');
  const isReadOnly = section === 'monstruos' || section === 'items_catalog';
  const canEdit = !isReadOnly && (isDM() || data.creado_por_jugador || section === 'notas_jugadores');
  const canDelete = canEdit && data.id;
  footer.innerHTML = `
    ${canDelete ? `<button class="btn btn-danger" onclick="deleteRecord('${section}','${data.id}')" style="margin-right:auto">Eliminar</button>` : ''}
    <button class="btn" onclick="closeModal()">Cerrar</button>
    ${canEdit ? `<button class="btn btn-success" onclick="switchToEdit()">✎ Editar</button>` : ''}
  `;

  document.getElementById('modal-overlay').classList.add('open');

  // Mostrar contenido HTML de notas
  const targetId = section === 'notas_dm' ? 'session-prep-content' : section === 'notas_jugadores' ? 'nota-page-content' : null;
  if (targetId && (section !== 'notas_dm' || isDM())) {
    const el = document.getElementById(targetId);
    if (el) el.innerHTML = data.contenido_html || '<em>Sin contenido</em>';
  }

  // Cargar notas de jugadores si aplica
  if (ENTITY_NOTES_SECTIONS.has(section) && data._sbid) {
    loadEntityNote(section, data._sbid);
  }
}

function toggleEntityNotes() {
  const body = document.getElementById('entity-notes-body');
  const arrow = document.getElementById('en-arrow');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.textContent = open ? '▸' : '▾';
}

async function loadEntityNote(entityType, entityId) {
  const editor = document.getElementById('entity-notes-editor');
  if (!editor) return;
  try {
    const text = await sbLoadEntityNote(entityType, entityId);
    editor.innerHTML = textToContentEditable(text);
    // Inicializar menciones en el editor
    initMentionTextarea(editor);
  } catch(e) {
    console.warn('Error loading entity note:', e);
  }
}

async function saveEntityNote() {
  const editor = document.getElementById('entity-notes-editor');
  const status = document.getElementById('en-status');
  if (!editor || !currentModalData?._sbid) return;
  const text = contentEditableToText(editor);
  try {
    await sbSaveEntityNote(currentModalSection, currentModalData._sbid, text);
    if (status) { status.textContent = '✓ Guardado'; setTimeout(() => status.textContent = '', 2000); }
  } catch(e) {
    if (status) status.textContent = 'Error: ' + e.message;
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
  body.querySelectorAll('.ce-textarea').forEach(ce => initMentionTextarea(ce));

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
    return `<div class="detail-section"><div class="detail-label">${label}</div><div class="detail-text">${parseMentions(escapeHtml(text)).replace(/\n/g,'<br>')}</div></div>`;
  }
  switch(section) {
    case 'npcs': {
      const n = data;
      return [
        row('Rol', rolBadge(n.rol)),
        row('Estado', estadoBadge(n.estado)),
        row('Tipo', n.tipo_npc ? `<span class="badge tipo-badge">${escapeHtml(n.tipo_npc)}</span>` : ''),
        row('Raza', escapeHtml(n.raza)),
        row('Ciudad', n.ciudad ? relChip('ciudades', n.ciudad.id, n.ciudad.nombre) : ''),
        row('Establecimiento', n.establecimiento ? relChip('establecimientos', n.establecimiento.id, n.establecimiento.nombre) : ''),
        n.edad ? row('Edad', `${n.edad} años`) : '',
        textBlock('Primera Impresi\u00f3n', n.primera_impresion),
        isDM() && n.notas_roleplay ? textBlock('Notas Roleplay (DM)', n.notas_roleplay) : '',
        (n.quests && n.quests.length) ? row('Quests', n.quests.map(q => relChip('quests', q.id, q.nombre)).join(' ')) : '',
        (n.items_magicos && n.items_magicos.length) ? row('Items', n.items_magicos.map(i => relChip('items', i.id, i.nombre)).join(' ')) : '',
        (n.lugares && n.lugares.length) ? row('Lugares', n.lugares.map(l => relChip('lugares', l.id, l.nombre)).join(' ')) : '',
      ].join('');
    }
    case 'personajes': {
      const p = data;
      const ddbId = ddbExtractId(p.dndbeyond_url);
      const sbId = p._sbid || '';
      const ddb = p.ddb_data;

      // If PJ with D&D Beyond data, use integrated card
      if (p.es_pj && ddbId && ddb) {
        return ddbBuildIntegratedCard(ddb, p, ddbId, sbId);
      }

      // Fallback: simple rows for NPCs or PCs without D&D Beyond
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
        (p.items_magicos && p.items_magicos.length) ? `<div class="detail-section"><div class="detail-label">Items M\u00e1gicos</div><ul class="card-list">${p.items_magicos.map(i => `<li>${relChip('items', i.id, i.nombre)}</li>`).join('')}</ul></div>` : '',
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
        qNpcs.length ? row('NPCs', qNpcs.map(n => relChip('npcs', n.id, n.nombre)).join(' ')) : '',
        qLugares.length ? row('Lugares', qLugares.map(l => relChip('lugares', l.id, l.nombre)).join(' ')) : '',
        qCiudades.length ? row('Ciudades', qCiudades.map(c => relChip('ciudades', c.id, c.nombre)).join(' ')) : '',
        qEstabs.length ? row('Establecimientos', qEstabs.map(e => relChip('establecimientos', e.id, e.nombre)).join(' ')) : '',
        textBlock('Resumen', q.resumen),
        isDM() && qNotas.length ? row('Notas DM', qNotas.map(n => relChip('notas_dm', n.id, n.nombre)).join(' ')) : '',
      ].join('');
    }
    case 'ciudades': {
      const c = data;
      const cEstabs = (DATA.establecimientos || []).filter(e => e.ciudad && e.ciudad.id === c.id);
      const cNpcs   = (DATA.npcs || []).filter(n => n.ciudad && n.ciudad.id === c.id);
      return [
        row('Reino/Estado', escapeHtml(c.estado)),
        row('L\u00edder', escapeHtml(c.lider)),
        c.poblacion ? row('Poblaci\u00f3n', c.poblacion.toLocaleString()) : '',
        textBlock('Descripci\u00f3n', c.descripcion),
        (isDM() && c.descripcion_lider) ? textBlock('Descripci\u00f3n L\u00edder (DM)', c.descripcion_lider) : '',
        cEstabs.length ? `<div class="detail-section"><div class="detail-label">Establecimientos</div><ul class="card-list">${cEstabs.map(e => `<li>${relChip('establecimientos', e.id, e.nombre)}</li>`).join('')}</ul></div>` : '',
        cNpcs.length ? `<div class="detail-section"><div class="detail-label">NPCs</div><ul class="card-list">${cNpcs.map(n => `<li>${relChip('npcs', n.id, n.nombre)}</li>`).join('')}</ul></div>` : '',
      ].join('');
    }
    case 'establecimientos': {
      const e = data;
      return [
        row('Tipo', e.tipo ? `<span class="badge tipo-badge">${escapeHtml(e.tipo)}</span>` : ''),
        row('Ciudad', e.ciudad ? relChip('ciudades', e.ciudad.id, e.ciudad.nombre) : ''),
        row('Due\u00f1o', e.dueno ? relChip('npcs', e.dueno.id, e.dueno.nombre) : ''),
        textBlock('Exterior', e.descripcion_exterior),
        textBlock('Interior', e.descripcion_interior),
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
        row('Ciudad', l.ciudad?.nombre ? relChip('ciudades', l.ciudad.id, l.ciudad.nombre) : ''),
        npcsL.length ? row('NPCs', npcsL.map(n => relChip('npcs', n.id, n.nombre)).join(' ')) : '',
        itemsL.length ? row('Items', itemsL.map(i => relChip('items', i.id, i.nombre)).join(' ')) : '',
        questsL.length ? row('Quests', questsL.map(q => relChip('quests', q.id, q.nombre)).join(' ')) : '',
        textBlock('Descripci\u00f3n', l.descripcion),
      ].join('');
    }
    case 'items': {
      const it = data;
      return [
        row('Rareza', rarezaBadge(it.rareza)),
        row('Tipo', it.tipo ? `<span class="badge tipo-badge">${escapeHtml(it.tipo)}</span>` : ''),
        row('Attunement', it.requiere_sintonizacion ? '\u2713 S\u00ed' : 'No'),
        row('Portador', it.personaje?.nombre ? relChip('personajes', it.personaje.id, it.personaje.nombre) : '<span style="color:var(--text-dim)">Sin portador</span>'),
        it.npc_portador?.nombre ? row('NPC Portador', relChip('npcs', it.npc_portador.id, it.npc_portador.nombre)) : '',
        row('Fuente', escapeHtml(it.fuente)),
        textBlock('Descripci\u00f3n', it.descripcion),
      ].join('');
    }
    case 'notas_dm': {
      const n = data;
      const _jp = n.jugadores_presentes || n.jugadores;
      const jugadores = Array.isArray(_jp) ? _jp : (_jp ? [_jp] : []);
      const quests = n.quests || [];
      return [
        n.fecha ? row('Fecha', escapeHtml(n.fecha)) : '',
        jugadores.length ? row('Jugadores', jugadores.map(j => `<span class="player-chip">${escapeHtml(typeof j === 'string' ? j : j.nombre)}</span>`).join(' ')) : '',
        quests.length ? row('Quests', quests.map(q => relChip('quests', q.id, q.nombre)).join(' ')) : '',
        textBlock('Resumen', n.resumen),
        isDM() ? `<div class="detail-section detail-section-prep" id="session-prep-container"><div class="detail-label-prep">&#9876; Session Prep</div><div class="detail-text detail-text-prep" id="session-prep-content"><em>Cargando...</em></div></div>` : '',
      ].join('');
    }
    case 'notas_jugadores': {
      const n = data;
      const _jug = n.jugador;
      const jugador = Array.isArray(_jug) ? _jug : (_jug ? [_jug] : []);
      const items = n.items || [];
      return [
        n.fecha ? row('Fecha', escapeHtml(n.fecha)) : '',
        jugador.length ? row('Jugador', jugador.map(j => `<span class="player-chip">${escapeHtml(typeof j === 'string' ? j : j.nombre)}</span>`).join(' ')) : '',
        items.length ? row('Items', items.map(i => relChip('items', i.id, i.nombre)).join(' ')) : '',
        textBlock('Resumen', n.resumen),
        `<div class="detail-section" id="nota-content-container"><div class="detail-label">Contenido</div><div class="detail-text" id="nota-page-content"><em>Cargando...</em></div></div>`,
      ].join('');
    }
    case 'monstruos': {
      const m = data;
      const mod = (score) => {
        if (score === null || score === undefined) return '';
        const bonus = Math.floor((score - 10) / 2);
        return bonus >= 0 ? `+${bonus}` : `${bonus}`;
      };
      const statblockSection = (title, content) => {
        if (!content) return '';
        return `
          <div class="statblock-section statblock-collapsible">
            <div class="statblock-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
              <span class="statblock-section-title">${title}</span>
              <span class="statblock-chevron">&#9660;</span>
            </div>
            <div class="statblock-section-body">${content}</div>
          </div>`;
      };
      const prop = (label, value) => {
        if (!value) return '';
        return `<div class="statblock-property"><span class="statblock-prop-label">${label}</span> ${escapeHtml(String(value))}</div>`;
      };
      const abilities = ['fuerza','destreza','constitucion','inteligencia','sabiduria','carisma'];
      const abLabels = ['FUE','DES','CON','INT','SAB','CAR'];

      return `
        <div class="statblock">
          <div class="statblock-header">
            <div class="statblock-name">${escapeHtml(m.nombre || '')}</div>
            <div class="statblock-meta">${escapeHtml([m.tamano, m.tipo, m.alineamiento].filter(Boolean).join(' \u2022 '))}</div>
          </div>
          <div class="statblock-divider"></div>

          <div class="statblock-combat">
            ${prop('Armor Class', m.ac)}
            ${prop('Hit Points', m.hp)}
            ${prop('Speed', m.velocidad)}
          </div>
          <div class="statblock-divider"></div>

          <div class="statblock-abilities">
            ${abilities.map((ab, i) => {
              const score = m[ab];
              return `<div class="statblock-ability">
                <div class="statblock-ability-label">${abLabels[i]}</div>
                <div class="statblock-ability-score">${score !== null && score !== undefined ? score : '—'}</div>
                <div class="statblock-ability-mod">${score !== null && score !== undefined ? '(' + mod(score) + ')' : ''}</div>
              </div>`;
            }).join('')}
          </div>
          <div class="statblock-divider"></div>

          <div class="statblock-props">
            ${prop('Saving Throws', m.tiradas_salvacion)}
            ${prop('Skills', m.habilidades)}
            ${prop('Vulnerabilities', m.vulnerabilidades)}
            ${prop('Resistances', m.resistencias)}
            ${prop('Damage Immunities', m.inmunidades_dano)}
            ${prop('Condition Immunities', m.inmunidades_condicion)}
            ${prop('Senses', m.sentidos)}
            ${prop('Languages', m.idiomas)}
            ${prop('Challenge', m.cr)}
          </div>

          ${m.rasgos || m.acciones || m.acciones_bonus || m.reacciones || m.acciones_legendarias ? '<div class="statblock-divider"></div>' : ''}
          ${statblockSection('Rasgos', m.rasgos ? escapeHtml(m.rasgos).replace(/\n/g,'<br>') : '')}
          ${statblockSection('Acciones', m.acciones ? escapeHtml(m.acciones).replace(/\n/g,'<br>') : '')}
          ${statblockSection('Acciones Bonus', m.acciones_bonus ? escapeHtml(m.acciones_bonus).replace(/\n/g,'<br>') : '')}
          ${statblockSection('Reacciones', m.reacciones ? escapeHtml(m.reacciones).replace(/\n/g,'<br>') : '')}
          ${statblockSection('Acciones Legendarias', m.acciones_legendarias ? escapeHtml(m.acciones_legendarias).replace(/\n/g,'<br>') : '')}

          <div class="statblock-footer">
            ${m.fuente ? `<span>${escapeHtml(m.fuente)}</span>` : ''}
            ${m.entorno ? `<span><em>Entorno: ${escapeHtml(m.entorno)}</em></span>` : ''}
          </div>
        </div>`;
    }
    case 'items_catalog': {
      const it = data;
      const prop = (label, value) => {
        if (!value) return '';
        return `<div class="statblock-property"><span class="statblock-prop-label">${label}</span> ${escapeHtml(String(value))}</div>`;
      };
      const rarezaClass = 'rareza-' + (it.rareza || '').toLowerCase().replace(/\s+/g,'-');
      return `
        <div class="statblock">
          <div class="statblock-header">
            <div class="statblock-name">${escapeHtml(it.nombre || '')}</div>
            <div class="statblock-meta">${escapeHtml([it.tipo, it.rareza].filter(Boolean).join(' \u2022 '))}${it.requiere_sintonizacion ? ' <span style="color:var(--orange)">(requires attunement)</span>' : ''}</div>
          </div>
          <div class="statblock-divider"></div>

          <div class="statblock-combat">
            ${it.rareza ? `<div class="statblock-property"><span class="statblock-prop-label">Rarity</span> <span class="rareza-badge ${rarezaClass}">${escapeHtml(it.rareza)}</span></div>` : ''}
            ${prop('Type', it.tipo)}
            ${prop('Damage', it.dano)}
            ${prop('Weight', it.peso)}
            ${prop('Value', it.valor)}
            ${prop('Properties', it.propiedades)}
          </div>

          ${it.descripcion ? `
          <div class="statblock-divider"></div>
          <div class="statblock-section">
            <div class="statblock-section-header">
              <span class="statblock-section-title">Descripción</span>
            </div>
            <div class="statblock-section-body">${escapeHtml(it.descripcion).replace(/\n/g,'<br>')}</div>
          </div>` : ''}

          <div class="statblock-footer">
            ${it.fuente ? `<span>${escapeHtml(it.fuente)}</span>` : ''}
          </div>
        </div>`;
    }
    default:
      return `<pre style="font-size:0.75rem;color:var(--text-dim)">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  }
}

// ── RENDER CAMPAÑA (multi-columna) ──────────────────────────────────

// Estado persistente de la pestaña Campaña
let campanaSelected = null;  // { section, id }
let campanaColOrder = null;  // ['npcs','ciudades',...] — se inicializa en primer render
let campanaVisibleCols = null; // Set de keys visibles — se inicializa desde localStorage

// Mapa de relaciones: dado un tipo+id, qué IDs de otras entidades están relacionados
function campanaGetRelatedIds(section, entityId) {
  const related = {}; // { npcs: Set, ciudades: Set, ... }
  const id = entityId;

  if (section === 'ciudades') {
    related.npcs = new Set((DATA.npcs || []).filter(n => n.ciudad?.id === id).map(n => n.id));
    related.establecimientos = new Set((DATA.establecimientos || []).filter(e => e.ciudad?.id === id).map(e => e.id));
    related.lugares = new Set((DATA.lugares || []).filter(l => l.ciudad?.id === id).map(l => l.id));
    related.quests = new Set((DATA.quests || []).filter(q => (q.ciudades || []).some(c => c.id === id)).map(q => q.id));
    related.items = new Set();
  } else if (section === 'npcs') {
    const npc = (DATA.npcs || []).find(n => n.id === id);
    related.ciudades = new Set(npc?.ciudad ? [npc.ciudad.id] : []);
    related.establecimientos = new Set(npc?.establecimiento ? [npc.establecimiento.id] : []);
    related.lugares = new Set((npc?.lugares || []).map(l => l.id));
    related.quests = new Set((npc?.quests || []).map(q => q.id));
    related.items = new Set((npc?.items_magicos || []).map(i => i.id));
  } else if (section === 'establecimientos') {
    const est = (DATA.establecimientos || []).find(e => e.id === id);
    related.ciudades = new Set(est?.ciudad ? [est.ciudad.id] : []);
    related.npcs = new Set(est?.dueno ? [est.dueno.id] : []);
    // También NPCs que están en este establecimiento
    (DATA.npcs || []).forEach(n => { if (n.establecimiento?.id === id) (related.npcs || (related.npcs = new Set())).add(n.id); });
    related.lugares = new Set();
    related.quests = new Set((DATA.quests || []).filter(q => (q.establecimientos || []).some(e => e.id === id)).map(q => q.id));
    related.items = new Set();
  } else if (section === 'lugares') {
    const lug = (DATA.lugares || []).find(l => l.id === id);
    related.ciudades = new Set(lug?.ciudad ? [lug.ciudad.id] : []);
    related.npcs = new Set((lug?.npcs || []).map(n => n.id));
    related.establecimientos = new Set();
    related.quests = new Set((lug?.quests || []).map(q => q.id));
    related.items = new Set((lug?.items_magicos || []).map(i => i.id));
  } else if (section === 'quests') {
    const q = (DATA.quests || []).find(q => q.id === id);
    related.npcs = new Set((q?.quest_npcs || []).map(n => n.id));
    related.ciudades = new Set((q?.ciudades || []).map(c => c.id));
    related.lugares = new Set((q?.lugares || []).map(l => l.id));
    related.establecimientos = new Set((q?.establecimientos || []).map(e => e.id));
    related.items = new Set();
  } else if (section === 'items') {
    const item = (DATA.items || []).find(i => i.id === id);
    related.npcs = new Set(item?.npc_portador ? [item.npc_portador.id] : []);
    related.ciudades = new Set();
    related.lugares = new Set();
    related.quests = new Set();
    related.establecimientos = new Set();
  }
  return related;
}

function campanaSelectItem(section, entityId) {
  // Toggle: si ya estaba seleccionado, deseleccionar
  if (campanaSelected && campanaSelected.section === section && campanaSelected.id === entityId) {
    campanaSelected = null;
  } else {
    campanaSelected = { section, id: entityId };
  }
  renderCampana();
}

// Columna drag & drop
let campanaDragCol = null;

function initCampanaDrag() {
  const container = document.getElementById('campana-columns');
  if (!container) return;

  container.querySelectorAll('.campana-col').forEach(col => {
    const header = col.querySelector('.campana-col-header');
    header.setAttribute('draggable', 'true');

    header.addEventListener('dragstart', (e) => {
      campanaDragCol = col;
      col.classList.add('campana-col-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    header.addEventListener('dragend', () => {
      campanaDragCol = null;
      col.classList.remove('campana-col-dragging');
      container.querySelectorAll('.campana-col').forEach(c => c.classList.remove('campana-col-over'));
    });

    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!campanaDragCol || campanaDragCol === col) return;
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('campana-col-over');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('campana-col-over');
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('campana-col-over');
      if (!campanaDragCol || campanaDragCol === col) return;
      // Swap directo de posiciones en el DOM
      const placeholder = document.createComment('');
      container.replaceChild(placeholder, campanaDragCol);
      container.replaceChild(campanaDragCol, col);
      container.replaceChild(col, placeholder);
      // Guardar orden
      campanaColOrder = [...container.querySelectorAll('.campana-col')].map(c => c.dataset.col);
      try { localStorage.setItem(`${CONFIG.SLUG}_col_order`, JSON.stringify(campanaColOrder)); } catch {}
    });
  });
}

// Restaurar orden de columnas desde localStorage
function restoreCampanaColOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(`${CONFIG.SLUG}_col_order`));
    if (saved && Array.isArray(saved)) {
      campanaColOrder = saved;
      return;
    }
  } catch {}
  if (!campanaColOrder) {
    campanaColOrder = CAMPANA_COL_DEFS.map(c => c.key);
  }
}

let campanaDragInited = false;

const CAMPANA_COL_ICONS = {
  npcs: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  ciudades: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>',
  lugares: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
  quests: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  items: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',
  establecimientos: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
};
const CAMPANA_COL_TITLES = {
  npcs: 'NPCs', ciudades: 'Ciudades', lugares: 'Lugares',
  quests: 'Quests', items: 'Items', establecimientos: 'Establecimientos',
};

const CAMPANA_COL_DEFS = [
  {
    key: 'ciudades', dataKey: 'ciudades',
    visFilter: c => isDM() || c.conocida_jugadores,
    renderMini: (c, isRelated, isSelected) => {
      const cls = ['campana-mini'];
      if (isRelated) cls.push('campana-related');
      if (isSelected) cls.push('campana-selected');
      return `<div class="${cls.join(' ')}" data-section="ciudades" data-entity-id="${c.id}" onclick="campanaClickMini(this, event)">
        <div class="campana-mini-top"><div class="campana-mini-name">${escapeHtml(c.nombre)}</div><button class="campana-detail-btn" onclick="campanaOpenDetail(this, event)" title="Ver detalle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></div>
        <div class="campana-mini-meta">${c.estado ? `<span class="campana-mini-dim">${escapeHtml(c.estado)}</span>` : ''}${c.poblacion ? `<span class="campana-mini-dim">Pob. ${c.poblacion.toLocaleString()}</span>` : ''}</div>
      </div>`;
    },
    searchFields: ['nombre','estado','lider','region'],
    filters: [
      { id: 'estado', label: 'Reino', values: () => [...new Set((DATA.ciudades||[]).map(c=>c.estado).filter(Boolean))].sort(), match: (item,v) => item.estado === v },
    ]
  },
  {
    key: 'establecimientos', dataKey: 'establecimientos',
    visFilter: e => isDM() || e.conocido_jugadores,
    renderMini: (e, isRelated, isSelected) => {
      const cls = ['campana-mini'];
      if (isRelated) cls.push('campana-related');
      if (isSelected) cls.push('campana-selected');
      return `<div class="${cls.join(' ')}" data-section="establecimientos" data-entity-id="${e.id}" onclick="campanaClickMini(this, event)">
        <div class="campana-mini-top"><div class="campana-mini-name">${escapeHtml(e.nombre)}</div><button class="campana-detail-btn" onclick="campanaOpenDetail(this, event)" title="Ver detalle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></div>
        <div class="campana-mini-meta">${e.tipo ? `<span class="badge tipo-badge" style="font-size:0.6rem">${escapeHtml(e.tipo)}</span>` : ''}${e.ciudad ? `<span class="campana-mini-dim">${escapeHtml(e.ciudad.nombre)}</span>` : ''}</div>
      </div>`;
    },
    searchFields: ['nombre','tipo'],
    searchRelFields: ['ciudad','dueno'],
    searchRelMultiFields: ['quests'],
    filters: [
      { id: 'tipo', label: 'Tipo', values: () => [...new Set((DATA.establecimientos||[]).map(e=>e.tipo).filter(Boolean))].sort(), match: (item,v) => item.tipo === v },
      { id: 'ciudad', label: 'Ciudad', values: () => [...new Set((DATA.establecimientos||[]).map(e=>e.ciudad?.nombre).filter(Boolean))].sort(), match: (item,v) => item.ciudad?.nombre === v },
    ]
  },
  {
    key: 'npcs', dataKey: 'npcs',
    visFilter: n => isDM() || n.conocido_jugadores,
    renderMini: (n, isRelated, isSelected) => {
      const cls = ['campana-mini'];
      if (isRelated) cls.push('campana-related');
      if (isSelected) cls.push('campana-selected');
      return `<div class="${cls.join(' ')}" data-section="npcs" data-entity-id="${n.id}" onclick="campanaClickMini(this, event)">
        <div class="campana-mini-top"><div class="campana-mini-name">${escapeHtml(n.nombre)}</div><button class="campana-detail-btn" onclick="campanaOpenDetail(this, event)" title="Ver detalle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></div>
        <div class="campana-mini-meta">${rolBadge(n.rol)} ${n.ciudad ? `<span class="campana-mini-dim">${escapeHtml(n.ciudad.nombre)}</span>` : ''}</div>
      </div>`;
    },
    searchFields: ['nombre','raza','tipo_npc','primera_impresion','rol'],
    searchRelFields: ['ciudad','establecimiento'],
    searchRelMultiFields: ['quests','items_magicos','lugares'],
    filters: [
      { id: 'rol', label: 'Rol', values: () => [...new Set((DATA.npcs||[]).map(n=>n.rol).filter(Boolean))].sort(), match: (item,v) => item.rol === v },
      { id: 'ciudad', label: 'Ciudad', values: () => [...new Set((DATA.npcs||[]).map(n=>n.ciudad?.nombre).filter(Boolean))].sort(), match: (item,v) => item.ciudad?.nombre === v },
    ]
  },
  {
    key: 'lugares', dataKey: 'lugares',
    visFilter: l => isDM() || l.conocido_jugadores || l.creado_por_jugador,
    renderMini: (l, isRelated, isSelected) => {
      const cls = ['campana-mini'];
      if (isRelated) cls.push('campana-related');
      if (isSelected) cls.push('campana-selected');
      return `<div class="${cls.join(' ')}" data-section="lugares" data-entity-id="${l.id}" onclick="campanaClickMini(this, event)">
        <div class="campana-mini-top"><div class="campana-mini-name">${escapeHtml(l.nombre)}</div><button class="campana-detail-btn" onclick="campanaOpenDetail(this, event)" title="Ver detalle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></div>
        <div class="campana-mini-meta">${l.tipo ? `<span class="badge tipo-badge" style="font-size:0.6rem">${escapeHtml(l.tipo)}</span>` : ''}${l.region ? `<span class="campana-mini-dim">${escapeHtml(l.region)}</span>` : ''}</div>
      </div>`;
    },
    searchFields: ['nombre','tipo','region'],
    searchRelFields: ['ciudad'],
    searchRelMultiFields: ['npcs','quests','items_magicos'],
    filters: [
      { id: 'tipo', label: 'Tipo', values: () => [...new Set((DATA.lugares||[]).map(l=>l.tipo).filter(Boolean))].sort(), match: (item,v) => item.tipo === v },
    ]
  },
  {
    key: 'items', dataKey: 'items',
    visFilter: i => isDM() || i.personaje !== null,
    renderMini: (i, isRelated, isSelected) => {
      const cls = ['campana-mini'];
      if (isRelated) cls.push('campana-related');
      if (isSelected) cls.push('campana-selected');
      return `<div class="${cls.join(' ')}" data-section="items" data-entity-id="${i.id}" onclick="campanaClickMini(this, event)">
        <div class="campana-mini-top"><div class="campana-mini-name">${escapeHtml(i.nombre)}</div><button class="campana-detail-btn" onclick="campanaOpenDetail(this, event)" title="Ver detalle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></div>
        <div class="campana-mini-meta">${i.rareza ? rarezaBadge(i.rareza) : ''}${i.tipo ? `<span class="badge tipo-badge" style="font-size:0.6rem">${escapeHtml(i.tipo)}</span>` : ''}</div>
      </div>`;
    },
    searchFields: ['nombre','tipo','rareza'],
    searchRelFields: ['npc_portador'],
    filters: [
      { id: 'rareza', label: 'Rareza', values: () => [...new Set((DATA.items||[]).map(i=>i.rareza).filter(Boolean))].sort(), match: (item,v) => item.rareza === v },
      { id: 'tipo', label: 'Tipo', values: () => [...new Set((DATA.items||[]).map(i=>i.tipo).filter(Boolean))].sort(), match: (item,v) => item.tipo === v },
    ]
  },
  {
    key: 'quests', dataKey: 'quests',
    visFilter: q => isDM() || q.conocido_jugadores,
    renderMini: (q, isRelated, isSelected) => {
      const cls = ['campana-mini'];
      if (isRelated) cls.push('campana-related');
      if (isSelected) cls.push('campana-selected');
      return `<div class="${cls.join(' ')}" data-section="quests" data-entity-id="${q.id}" onclick="campanaClickMini(this, event)">
        <div class="campana-mini-top"><div class="campana-mini-name">${escapeHtml(q.nombre)}</div><button class="campana-detail-btn" onclick="campanaOpenDetail(this, event)" title="Ver detalle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button></div>
        <div class="campana-mini-meta">${estadoQuestBadge(q.estado)}</div>
      </div>`;
    },
    searchFields: ['nombre','resumen','estado'],
    searchRelMultiFields: ['quest_npcs','ciudades','lugares','establecimientos'],
    filters: [
      { id: 'estado', label: 'Estado', values: () => [...new Set((DATA.quests||[]).map(q=>q.estado).filter(Boolean))].sort(), match: (item,v) => item.estado === v },
    ]
  }
];

// Estado de filtros por columna: { npcs: { rol: 'Aliado' }, ... }
const campanaFilters = {};

// ── Configuración de columnas visibles ──
function campanaInitVisibleCols() {
  if (campanaVisibleCols) return;
  try {
    const saved = JSON.parse(localStorage.getItem(`${CONFIG.SLUG}_visible_cols`));
    if (saved && Array.isArray(saved)) {
      campanaVisibleCols = new Set(saved);
      return;
    }
  } catch {}
  campanaVisibleCols = new Set(CAMPANA_COL_DEFS.map(c => c.key));
}

function campanaSaveVisibleCols() {
  try { localStorage.setItem(`${CONFIG.SLUG}_visible_cols`, JSON.stringify([...campanaVisibleCols])); } catch {}
}

function campanaToggleCol(key) {
  campanaInitVisibleCols();
  if (campanaVisibleCols.has(key)) {
    if (campanaVisibleCols.size <= 1) return; // no ocultar la última
    campanaVisibleCols.delete(key);
  } else {
    campanaVisibleCols.add(key);
  }
  campanaSaveVisibleCols();
  campanaBuildColumns();
  renderCampana();
  campanaRenderConfigPanel();
}

function campanaToggleConfig() {
  const panel = document.getElementById('campana-config-panel');
  if (!panel) return;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) campanaRenderConfigPanel();
}

function campanaRenderConfigPanel() {
  campanaInitVisibleCols();
  const panel = document.getElementById('campana-config-panel');
  if (!panel) return;
  panel.innerHTML = CAMPANA_COL_DEFS.map(col => {
    const checked = campanaVisibleCols.has(col.key);
    return `<label class="campana-config-item${checked ? ' active' : ''}">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="campanaToggleCol('${col.key}')">
      <span class="campana-config-icon">${CAMPANA_COL_ICONS[col.key]}</span>
      <span>${CAMPANA_COL_TITLES[col.key]}</span>
    </label>`;
  }).join('');
}

// Generar columnas dinámicamente en el DOM
function campanaBuildColumns() {
  campanaInitVisibleCols();
  const container = document.getElementById('campana-columns');
  if (!container) return;

  // Determinar orden: usar campanaColOrder si existe, sino orden por defecto
  const allKeys = CAMPANA_COL_DEFS.map(c => c.key);
  let order = campanaColOrder || allKeys;
  // Asegurar que todas las keys existen en order
  for (const k of allKeys) {
    if (!order.includes(k)) order.push(k);
  }

  container.innerHTML = '';
  const filterIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';

  for (const key of order) {
    if (!campanaVisibleCols.has(key)) continue;
    const title = CAMPANA_COL_TITLES[key] || key;
    const icon = CAMPANA_COL_ICONS[key] || '';
    const colEl = document.createElement('div');
    colEl.className = 'campana-col';
    colEl.dataset.col = key;
    colEl.innerHTML = `
      <div class="campana-col-header">
        <span class="campana-col-icon">${icon}</span>
        <span class="campana-col-title">${title}</span>
        <span class="campana-col-count" id="campana-count-${key}">0</span>
        <button class="campana-filter-btn" id="campana-filter-btn-${key}" onclick="campanaToggleFilter('${key}')" title="Filtrar">${filterIcon}</button>
      </div>
      <div class="campana-filter-panel" id="campana-filter-panel-${key}"></div>
      <div class="campana-col-body" id="campana-list-${key}"></div>`;
    container.appendChild(colEl);
  }

  // Re-inicializar drag & drop
  campanaDragInited = false;
}

function campanaToggleFilter(colKey) {
  const panel = document.getElementById(`campana-filter-panel-${colKey}`);
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  // Cerrar otros paneles
  if (isOpen) {
    document.querySelectorAll('.campana-filter-panel.open').forEach(p => {
      if (p !== panel) p.classList.remove('open');
    });
  }
}

function campanaSetFilter(colKey, filterId, value) {
  if (!campanaFilters[colKey]) campanaFilters[colKey] = {};
  if (value) {
    campanaFilters[colKey][filterId] = value;
  } else {
    delete campanaFilters[colKey][filterId];
  }
  renderCampana();
}

function campanaClickMini(el, event) {
  const section = el.dataset.section;
  const entityId = el.dataset.entityId;
  campanaSelectItem(section, entityId);
}

function campanaOpenDetail(btn, event) {
  event.stopPropagation();
  const card = btn.closest('.campana-mini');
  if (card) openDetailFromCard(card);
}

function renderCampana() {
  // Construir columnas dinámicamente en el primer render
  const container = document.getElementById('campana-columns');
  if (container && !container.children.length) {
    restoreCampanaColOrder();
    campanaBuildColumns();
  }

  campanaInitVisibleCols();
  const searchVal = (document.getElementById('campana-search')?.value || '').toLowerCase().trim();
  const relatedIds = campanaSelected ? campanaGetRelatedIds(campanaSelected.section, campanaSelected.id) : null;

  for (const col of CAMPANA_COL_DEFS) {
    if (!campanaVisibleCols.has(col.key)) continue;
    let items = DATA[col.dataKey] || [];
    items = items.filter(col.visFilter);

    // Aplicar búsqueda global (campos directos + relaciones)
    if (searchVal) {
      items = items.filter(item => {
        // Campos de texto directo
        if (col.searchFields.some(f => {
          const v = item[f];
          return v && String(v).toLowerCase().includes(searchVal);
        })) return true;
        // Relaciones simples (objeto con .nombre)
        if (col.searchRelFields) {
          if (col.searchRelFields.some(f => {
            const rel = item[f];
            return rel && rel.nombre && rel.nombre.toLowerCase().includes(searchVal);
          })) return true;
        }
        // Relaciones múltiples (array de objetos con .nombre)
        if (col.searchRelMultiFields) {
          if (col.searchRelMultiFields.some(f => {
            const arr = item[f];
            return Array.isArray(arr) && arr.some(r => r.nombre && r.nombre.toLowerCase().includes(searchVal));
          })) return true;
        }
        return false;
      });
    }

    // Aplicar filtros de columna
    const colFilters = campanaFilters[col.key] || {};
    for (const [filterId, filterVal] of Object.entries(colFilters)) {
      const filterDef = col.filters.find(f => f.id === filterId);
      if (filterDef && filterVal) {
        items = items.filter(item => filterDef.match(item, filterVal));
      }
    }

    // Cross-sort: seleccionado primero en su columna, relacionados primero en las demás
    if (campanaSelected) {
      if (col.key === campanaSelected.section) {
        // En la propia columna: el seleccionado va primero
        items.sort((a, b) => {
          const aS = a.id === campanaSelected.id ? 0 : 1;
          const bS = b.id === campanaSelected.id ? 0 : 1;
          return aS - bS;
        });
      } else if (relatedIds && relatedIds[col.key]) {
        // En otras columnas: relacionados primero
        const relSet = relatedIds[col.key];
        items.sort((a, b) => {
          const aRel = relSet.has(a.id) ? 0 : 1;
          const bRel = relSet.has(b.id) ? 0 : 1;
          return aRel - bRel;
        });
      }
    }

    // Render filtros en header
    const filterBtn = document.getElementById(`campana-filter-btn-${col.key}`);
    const filterPanel = document.getElementById(`campana-filter-panel-${col.key}`);
    if (filterBtn && filterPanel) {
      filterPanel.innerHTML = col.filters.map(f => {
        const vals = f.values();
        if (!vals.length) return '';
        const current = colFilters[f.id] || '';
        return `<select class="campana-filter-select" onchange="campanaSetFilter('${col.key}','${f.id}',this.value)">
          <option value="">${escapeHtml(f.label)}</option>
          ${vals.map(v => `<option value="${escapeHtml(v)}"${v === current ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('')}
        </select>`;
      }).join('');
      const activeCount = Object.keys(colFilters).length;
      filterBtn.classList.toggle('campana-filter-active', activeCount > 0);
    }

    // Contadores
    const countEl = document.getElementById(`campana-count-${col.key}`);
    if (countEl) countEl.textContent = items.length;

    // Render items
    const listEl = document.getElementById(`campana-list-${col.key}`);
    if (listEl) {
      if (!items.length) {
        listEl.innerHTML = `<div class="campana-empty">Sin registros</div>`;
      } else {
        listEl.innerHTML = items.map(item => {
          const isSelected = campanaSelected && campanaSelected.section === col.key && campanaSelected.id === item.id;
          const isRelated = relatedIds && relatedIds[col.key] && relatedIds[col.key].has(item.id);
          return col.renderMini(item, isRelated, isSelected);
        }).join('');
      }
    }
  }

  // Mostrar/ocultar botón limpiar selección
  const clearBtn = document.getElementById('campana-clear-sel');
  if (clearBtn) clearBtn.style.display = campanaSelected ? '' : 'none';

  // Init drag después de construir columnas
  if (!campanaDragInited) {
    initCampanaDrag();
    campanaDragInited = true;
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

    const ddb = p.ddb_data;

    // Stats pills — enriquecidos con HP actual si hay D&D Beyond
    const stats = (isPJ && (p.nivel || p.ac || p.hp_maximo)) ? `
      <div class="stat-pills">
        ${p.nivel !== null ? `<div class="stat-pill"><span class="stat-pill-label">Nv</span><span class="stat-pill-value">${p.nivel}</span></div>` : ''}
        ${p.ac !== null ? `<div class="stat-pill"><span class="stat-pill-label">AC</span><span class="stat-pill-value">${p.ac}</span></div>` : ''}
        ${p.hp_maximo !== null ? `<div class="stat-pill"><span class="stat-pill-label">HP</span><span class="stat-pill-value">${ddb ? `${ddb.currentHP}/${ddb.maxHP}` : p.hp_maximo}</span></div>` : ''}
        ${ddb && ddb.profBonus ? `<div class="stat-pill"><span class="stat-pill-label">Prof</span><span class="stat-pill-value">+${ddb.profBonus}</span></div>` : ''}
      </div>` : '';

    // Ability scores mini-bar (solo si hay D&D Beyond)
    const abilitiesBar = (isPJ && ddb && ddb.abilities) ? `
      <div class="ddb-abilities-bar">
        ${Object.entries(ddb.abilities).map(([k, v]) => `<div class="ddb-ab"><span class="ddb-ab-name">${k}</span><span class="ddb-ab-mod">${v.mod >= 0 ? '+' : ''}${v.mod}</span><span class="ddb-ab-score">${v.total}</span></div>`).join('')}
      </div>` : '';

    // HP bar (solo si hay D&D Beyond con HP actual)
    const hpBar = (isPJ && ddb && ddb.maxHP) ? (() => {
      const pct = Math.max(0, (ddb.currentHP / ddb.maxHP) * 100);
      const color = pct > 60 ? 'var(--accent)' : pct > 30 ? '#d4a017' : '#8b0000';
      return `<div class="ddb-hp-bar-card"><div class="ddb-hp-fill-card" style="width:${pct}%;background:${color}"></div><span class="ddb-hp-text-card">${ddb.currentHP}${ddb.tempHP ? `+${ddb.tempHP}` : ''} / ${ddb.maxHP}</span></div>`;
    })() : '';

    // Spells summary (cantrips + prepared count)
    const spellsSummary = (isPJ && ddb && ddb.spells && ddb.spells.length) ? (() => {
      const cantrips = ddb.spells.filter(s => s.level === 0);
      const prepared = ddb.spells.filter(s => s.level > 0 && s.prepared);
      const parts = [];
      if (cantrips.length) parts.push(`${cantrips.length} cantrips`);
      if (prepared.length) parts.push(`${prepared.length} preparados`);
      return parts.length ? `<div class="ddb-spells-summary">&#10040; ${parts.join(', ')}</div>` : '';
    })() : '';

    // Resource pills (Rage 3/3, Sorcery Points 4/4, etc.)
    const resourcePills = (isPJ && ddb && ddb.classResources && ddb.classResources.length) ? (() => {
      return `<div class="ddb-resource-pills">${ddb.classResources.slice(0, 3).map(r => {
        const rem = r.maxUses - r.numberUsed;
        const cls = rem === 0 ? ' ddb-resource-pill-empty' : rem <= Math.ceil(r.maxUses / 3) ? ' ddb-resource-pill-warn' : '';
        return `<span class="ddb-resource-pill${cls}">${escapeHtml(r.name)} ${rem}/${r.maxUses}</span>`;
      }).join('')}</div>`;
    })() : '';

    // Mini spell slot dots (support both {max} and legacy {available})
    const slotsForGrid = (ddb && ddb.spellSlots || []).filter(s => (s.max || s.available || 0) > 0);
    const slotDots = (isPJ && slotsForGrid.length) ? (() => {
      return `<div class="ddb-slots-mini">${slotsForGrid.map(s => {
        const max = s.max || s.available || 0;
        const dots = [];
        for (let i = 0; i < max; i++) {
          dots.push(`<span class="ddb-slot-mini${i < s.used ? ' ddb-slot-mini-used' : ''}"></span>`);
        }
        return `<span class="ddb-slot-group-mini"><span class="ddb-slot-label-mini">${s.level}</span>${dots.join('')}</span>`;
      }).join('')}</div>`;
    })() : '';

    const itemsList = (p.items_magicos && p.items_magicos.length) ? `
      <div style="margin-top:10px">
        <div style="font-family:'Cinzel',serif;font-size:0.68rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:4px">ITEMS M\u00c1GICOS</div>
        <ul class="card-list">${p.items_magicos.map(i => `<li>${escapeHtml(i.nombre)}</li>`).join('')}</ul>
      </div>` : '';

    return `
    <div class="${cardClass}" data-section="personajes" data-entity-id="${p.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(p.nombre)}${ddb && ddb.avatar ? `<img class="ddb-card-avatar" src="${ddb.avatar}" alt="">` : ''}</div>
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:3px;font-style:italic">${subtipo}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta">${jugadorStr}${subclaseStr}</div>
        ${stats}
        ${abilitiesBar}
        ${hpBar}
        ${resourcePills}
        ${slotDots}
        ${spellsSummary}
        ${p.descripcion ? `<div class="card-desc">${escapeHtml(stripMentions(p.descripcion))}</div>` : ''}
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
    <div class="card" data-section="quests" data-entity-id="${q.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('quests', q.id, q.conocido_jugadores)}
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(q.nombre)}</div>
          <div class="card-meta" style="margin-top:6px">${estadoQuestBadge(q.estado)} ${gp}</div>
        </div>
      </div>
      <div class="card-body">
        ${(q.quest_npcs && q.quest_npcs.length) ? `<div class="card-meta"><span class="meta-label">NPCs:</span> ${q.quest_npcs.map(n => relChip('npcs', n.id, n.nombre)).join(' ')}</div>` : ''}
        ${(q.lugares && q.lugares.length) ? `<div class="card-meta"><span class="meta-label">Lugares:</span> ${q.lugares.map(l => relChip('lugares', l.id, l.nombre)).join(' ')}</div>` : ''}
        ${(q.ciudades && q.ciudades.length) ? `<div class="card-meta"><span class="meta-label">Ciudades:</span> ${q.ciudades.map(c => relChip('ciudades', c.id, c.nombre)).join(' ')}</div>` : ''}
        ${q.resumen ? `<div class="card-desc">${escapeHtml(stripMentions(q.resumen)).substring(0,150)}${q.resumen.length > 150 ? '\u2026' : ''}</div>` : ''}
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
    const cEstabs = (DATA.establecimientos || []).filter(e => e.ciudad && e.ciudad.id === c.id);
    const cNpcs   = (DATA.npcs || []).filter(n => n.ciudad && n.ciudad.id === c.id);
    return `
    <div class="card" data-section="ciudades" data-entity-id="${c.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('ciudades', c.id, c.conocida_jugadores)}
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
        ${c.descripcion ? `<div class="card-desc">${escapeHtml(stripMentions(c.descripcion))}</div>` : ''}
        ${cEstabs.length ? `<div style="margin-top:8px"><div style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:4px">ESTABLECIMIENTOS</div><div style="display:flex;flex-wrap:wrap;gap:4px">${cEstabs.map(e => relChip('establecimientos', e.id, e.nombre)).join('')}</div></div>` : ''}
        ${cNpcs.length ? `<div style="margin-top:8px"><div style="font-family:'Cinzel',serif;font-size:0.65rem;color:var(--text-dim);letter-spacing:0.1em;margin-bottom:4px">NPCS</div><div style="display:flex;flex-wrap:wrap;gap:4px">${cNpcs.map(n => relChip('npcs', n.id, n.nombre)).join('')}</div></div>` : ''}
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
    <div class="card" data-section="establecimientos" data-entity-id="${e.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('establecimientos', e.id, e.conocido_jugadores)}
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(e.nombre)}</div>
          <div class="card-meta" style="margin-top:5px">
            <span class="badge tipo-badge">${val(e.tipo)}</span>
            ${e.ciudad ? relChip('ciudades', e.ciudad.id, e.ciudad.nombre) : ''}
          </div>
        </div>
      </div>
      <div class="card-body">
        ${e.dueno ? `<div class="card-meta"><span class="meta-item"><span class="meta-label">Due\u00f1o:</span> ${relChip('npcs', e.dueno.id, e.dueno.nombre)}</span></div>` : ''}
        ${e.descripcion_interior ? `<div class="card-desc">${escapeHtml(stripMentions(e.descripcion_interior))}</div>` : ''}
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
    <div class="card" data-section="lugares" data-entity-id="${l.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('lugares', l.id, l.conocido_jugadores)}
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
        ${l.descripcion ? `<div class="card-desc">${escapeHtml(stripMentions(l.descripcion))}</div>` : ''}
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

  items = filterBySearch(items, 'search-npcs', ['nombre', 'raza', 'tipo_npc', 'primera_impresion']);

  if (!items.length) { grid.innerHTML = emptyState('No hay NPCs con esos filtros.'); return; }

  grid.innerHTML = items.map(n => `
    <div class="card" data-section="npcs" data-entity-id="${n.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('npcs', n.id, n.conocido_jugadores)}
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
          ${n.ciudad ? `<span class="meta-item"><span class="meta-label">Ciudad:</span> ${relChip('ciudades', n.ciudad.id, n.ciudad.nombre)}</span>` : ''}
          ${n.establecimiento ? `<span class="meta-item"><span class="meta-label">Lugar:</span> ${relChip('establecimientos', n.establecimiento.id, n.establecimiento.nombre)}</span>` : ''}
        </div>
        ${n.primera_impresion ? `<div class="card-desc">${escapeHtml(stripMentions(n.primera_impresion)).substring(0,120)}${n.primera_impresion.length > 120 ? '\u2026' : ''}</div>` : ''}
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
    <div class="card" data-section="items" data-entity-id="${it.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
      ${visibilityToggleHtml('items', it.id, it.conocido_jugadores)}
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
          ${it.personaje ? `<span class="meta-item"><span class="meta-label">Portador:</span> ${relChip('personajes', it.personaje.id, it.personaje.nombre)}</span>` : '<span class="meta-item" style="color:var(--text-dim)">Sin portador</span>'}
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
      ? `<div class="card-desc" style="border-top:none;padding-top:0">${escapeHtml(stripMentions(n.resumen)).substring(0,120)}${n.resumen.length > 120 ? '\u2026' : ''}</div>`
      : `<div class="card-desc" style="border-top:none;padding-top:0;opacity:0.5">Sin resumen a\u00fan.</div>`;

    return `
    <div class="card nota-card" data-section="${sectionKey}" data-entity-id="${n.id || ''}" onclick="openDetailFromCard(this)" style="cursor:pointer">
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

async function deleteRecord(section, entityId) {
  const label = SECTION_LABELS[section] || section;
  if (!confirm(`¿Eliminar este registro de ${label}? Se archivará.`)) return;
  const spinner = document.getElementById('spinner');
  spinner.classList.add('open');
  try {
    const arr = DATA[section] || [];
    const record = arr.find(r => r.id === entityId);
    if (record && record._sbid) {
      await sbDelete(section, record._sbid);
      // Limpiar marcadores si es un lugar
      if (section === 'lugares') {
        await sbClient.from('marcadores').delete().eq('lugar_id', record._sbid);
      }
    }
    DATA[section] = arr.filter(r => r.id !== entityId);
    if (section === 'lugares' && MAP_MARKERS[entityId]) {
      delete MAP_MARKERS[entityId];
      localStorage.setItem(`${CONFIG.SLUG}_map_markers`, JSON.stringify(MAP_MARKERS));
    }
    closeModal();
    renderAll();
  } catch(e) {
    alert('Error al eliminar: ' + e.message);
  } finally {
    spinner.classList.remove('open');
  }
}

async function saveMarkerPosition(entityId, x, y) {
  MAP_MARKERS[entityId] = { x, y };
  localStorage.setItem(`${CONFIG.SLUG}_map_markers`, JSON.stringify(MAP_MARKERS));
  try { await sbUpsertMarker(entityId, x, y); } catch(e) { console.warn('Supabase marker sync failed:', e); }
}

// ── RENDER BESTIARIO ─────────────────────────────────────────────────

function renderBestiarioFilters() {
  const bar = document.getElementById('filter-bar-bestiario');
  if (!bar) return;

  const items = DATA.monstruos || [];

  const unique = (fn) => [...new Set(items.map(fn).filter(Boolean))].sort();
  const tipos = unique(m => m.tipo);
  const tamanos = unique(m => m.tamano);
  const alineamientos = unique(m => m.alineamiento);
  const fuentes = unique(m => m.fuente);
  const entornos = [...new Set(items.flatMap(m => (m.entorno || '').split(',').map(e => e.trim())).filter(Boolean))].sort();

  // CR con ordenamiento numérico especial (fracciones primero)
  const crToNum = v => { const s = String(v); if (s.includes('/')) { const [n,d] = s.split('/'); return Number(n)/Number(d); } return Number(s); };
  const crs = [...new Set(items.map(m => m.cr).filter(v => v !== null && v !== undefined && v !== ''))].sort((a,b) => crToNum(a) - crToNum(b));

  const buildSelect = (id, label, opts) => `
    <select class="filter-select" id="${id}" onchange="renderBestiarioGrid()">
      <option value="">${label}</option>
      ${opts.map(o => `<option value="${escapeHtml(String(o))}">${escapeHtml(String(o))}</option>`).join('')}
    </select>`;

  bar.innerHTML = `
    <div class="filter-bar">
      ${buildSelect('filter-bestiario-tipo', 'Tipo', tipos)}
      ${buildSelect('filter-bestiario-tamano', 'Tamaño', tamanos)}
      ${buildSelect('filter-bestiario-cr', 'CR', crs)}
      ${buildSelect('filter-bestiario-alineamiento', 'Alineamiento', alineamientos)}
      ${buildSelect('filter-bestiario-entorno', 'Entorno', entornos)}
      ${buildSelect('filter-bestiario-fuente', 'Fuente', fuentes)}
      <button class="btn" onclick="clearBestiarioFilters()" style="font-size:0.75rem;padding:6px 10px">Limpiar</button>
    </div>`;
}

function clearBestiarioFilters() {
  ['tipo','tamano','cr','alineamiento','entorno','fuente'].forEach(f => {
    const el = document.getElementById(`filter-bestiario-${f}`);
    if (el) el.value = '';
  });
  const search = document.getElementById('search-bestiario');
  if (search) search.value = '';
  renderBestiarioGrid();
}

function renderBestiarioGrid() {
  const thead = document.getElementById('thead-bestiario');
  const tbody = document.getElementById('tbody-bestiario');
  const countEl = document.getElementById('bestiario-count');

  let items = DATA.monstruos || [];

  // Búsqueda por texto
  items = filterBySearch(items, 'search-bestiario', ['nombre']);

  // Filtros dropdown
  const fVal = id => document.getElementById(id)?.value || '';
  const fTipo = fVal('filter-bestiario-tipo');
  const fTamano = fVal('filter-bestiario-tamano');
  const fCR = fVal('filter-bestiario-cr');
  const fAlin = fVal('filter-bestiario-alineamiento');
  const fEntorno = fVal('filter-bestiario-entorno');
  const fFuente = fVal('filter-bestiario-fuente');

  if (fTipo) items = items.filter(m => m.tipo === fTipo);
  if (fTamano) items = items.filter(m => m.tamano === fTamano);
  if (fCR) items = items.filter(m => String(m.cr) === fCR);
  if (fAlin) items = items.filter(m => m.alineamiento === fAlin);
  if (fEntorno) items = items.filter(m => (m.entorno || '').includes(fEntorno));
  if (fFuente) items = items.filter(m => m.fuente === fFuente);

  // Ordenar por nombre
  items.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  // Header
  thead.innerHTML = `<tr>
    <th>Nombre</th><th>CR</th><th>Tipo</th><th>Tamaño</th>
    <th>AC</th><th>HP</th><th>Vel.</th><th>Alineamiento</th>
    <th>Entorno</th><th>Fuente</th>
  </tr>`;

  const total = (DATA.monstruos || []).length;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--on-surface-variant)">No se encontraron monstruos.</td></tr>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  tbody.innerHTML = items.map(m => `
    <tr class="bestiario-row" data-section="monstruos" data-entity-id="${m.id || m.id || ''}" onclick="openDetailFromCard(this)">
      <td class="bestiario-name">${escapeHtml(m.nombre || '')}</td>
      <td class="bestiario-cr">${escapeHtml(val(m.cr))}</td>
      <td>${escapeHtml(val(m.tipo))}</td>
      <td>${escapeHtml(val(m.tamano))}</td>
      <td>${escapeHtml(val(m.ac))}</td>
      <td>${escapeHtml(val(m.hp))}</td>
      <td>${escapeHtml(val(m.velocidad))}</td>
      <td>${escapeHtml(val(m.alineamiento))}</td>
      <td>${escapeHtml(val(m.entorno))}</td>
      <td class="bestiario-fuente">${escapeHtml(val(m.fuente))}</td>
    </tr>`).join('');

  if (countEl) countEl.textContent = `${items.length} de ${total} monstruos`;
}

function renderBestiario() {
  renderBestiarioFilters();
  renderBestiarioGrid();
}

// ── RENDER CATÁLOGO ITEMS ─────────────────────────────────────────────

function renderCatalogoItemsFilters() {
  const bar = document.getElementById('filter-bar-catalogo_items');
  if (!bar) return;

  const items = DATA.items_catalog || [];

  const unique = (fn) => [...new Set(items.map(fn).filter(Boolean))].sort();
  const tipos = unique(m => m.tipo);
  const rarezas = ['Common','Uncommon','Rare','Very Rare','Legendary','Artifact'].filter(r => items.some(i => i.rareza === r));
  const fuentes = unique(m => m.fuente);
  const attune = [{val:'true',label:'Sí'},{val:'false',label:'No'}];

  const buildSelect = (id, label, opts) => `
    <select class="filter-select" id="${id}" onchange="renderCatalogoItemsGrid()">
      <option value="">${label}</option>
      ${opts.map(o => typeof o === 'object'
        ? `<option value="${o.val}">${o.label}</option>`
        : `<option value="${escapeHtml(String(o))}">${escapeHtml(String(o))}</option>`
      ).join('')}
    </select>`;

  bar.innerHTML = `
    <div class="filter-bar">
      ${buildSelect('filter-catalogo-tipo', 'Tipo', tipos)}
      ${buildSelect('filter-catalogo-rareza', 'Rareza', rarezas)}
      ${buildSelect('filter-catalogo-attune', 'Sintonización', attune)}
      ${buildSelect('filter-catalogo-fuente', 'Fuente', fuentes)}
      <button class="btn" onclick="clearCatalogoItemsFilters()" style="font-size:0.75rem;padding:6px 10px">Limpiar</button>
    </div>`;
}

function clearCatalogoItemsFilters() {
  ['tipo','rareza','attune','fuente'].forEach(f => {
    const el = document.getElementById(`filter-catalogo-${f}`);
    if (el) el.value = '';
  });
  const search = document.getElementById('search-catalogo_items');
  if (search) search.value = '';
  renderCatalogoItemsGrid();
}

function renderCatalogoItemsGrid() {
  const thead = document.getElementById('thead-catalogo_items');
  const tbody = document.getElementById('tbody-catalogo_items');
  const countEl = document.getElementById('catalogo_items-count');

  let items = DATA.items_catalog || [];

  // Búsqueda por texto
  items = filterBySearch(items, 'search-catalogo_items', ['nombre']);

  // Filtros
  const fVal = id => document.getElementById(id)?.value || '';
  const fTipo = fVal('filter-catalogo-tipo');
  const fRareza = fVal('filter-catalogo-rareza');
  const fAttune = fVal('filter-catalogo-attune');
  const fFuente = fVal('filter-catalogo-fuente');

  if (fTipo) items = items.filter(i => i.tipo === fTipo);
  if (fRareza) items = items.filter(i => i.rareza === fRareza);
  if (fAttune) items = items.filter(i => String(!!i.requiere_sintonizacion) === fAttune);
  if (fFuente) items = items.filter(i => i.fuente === fFuente);

  items.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

  thead.innerHTML = `<tr>
    <th>Nombre</th><th>Rareza</th><th>Tipo</th><th>Attune</th>
    <th>Daño</th><th>Peso</th><th>Valor</th><th>Fuente</th>
  </tr>`;

  const total = (DATA.items_catalog || []).length;

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--on-surface-variant)">No se encontraron ítems.</td></tr>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  tbody.innerHTML = items.map(it => `
    <tr class="bestiario-row" data-section="items_catalog" data-entity-id="${it.id || it.id || ''}" onclick="openDetailFromCard(this)">
      <td class="bestiario-name">${escapeHtml(it.nombre || '')}</td>
      <td><span class="rareza-badge rareza-${(it.rareza || '').toLowerCase().replace(/\s+/g,'-')}">${escapeHtml(val(it.rareza))}</span></td>
      <td>${escapeHtml(val(it.tipo))}</td>
      <td style="text-align:center">${it.requiere_sintonizacion ? '✓' : '—'}</td>
      <td>${escapeHtml(val(it.dano))}</td>
      <td>${escapeHtml(val(it.peso))}</td>
      <td>${escapeHtml(val(it.valor))}</td>
      <td class="bestiario-fuente">${escapeHtml(val(it.fuente))}</td>
    </tr>`).join('');

  if (countEl) countEl.textContent = `${items.length} de ${total} ítems`;
}

function renderCatalogoItems() {
  renderCatalogoItemsFilters();
  renderCatalogoItemsGrid();
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
    { key:'dndbeyond_url', label:'D&D Beyond URL', type:'text', placeholder:'https://www.dndbeyond.com/characters/123456' },
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
    { key:'tipo',    label:'Tipo',   type:'select', options:['','Taberna','Comercio General','Librer\u00eda','Herrero','Templo','Tienda de Armas','Tienda Objetos M\u00e1gicos','Gremio','Gremio de Ladrones','Otro'] },
    { key:'ciudad',  label:'Ciudad', type:'select-rel', source:'ciudades' },
    { key:'dueno',   label:'Due\u00f1o', type:'select-rel', source:'npcs' },
    { key:'descripcion_exterior', label:'Descripci\u00f3n Exterior', type:'textarea' },
    { key:'descripcion_interior', label:'Descripci\u00f3n Interior', type:'textarea' },
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
    { key:'edad',              label:'Edad', type:'number' },
    { key:'primera_impresion', label:'Primera Impresi\u00f3n', type:'textarea' },
    { key:'notas_roleplay',    label:'Notas Roleplay (DM)', type:'textarea', dmOnly:true },
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
    { key:'fecha',   label:'Fecha', type:'date' },
    { key:'jugadores_presentes', label:'Jugadores presentes', type:'select', options:['','Tino','Caco','Leo','Enoch','Hiram'] },
    { key:'quests', label:'Quests relacionadas', type:'select-rel-multi', source:'quests' },
    { key:'resumen', label:'Resumen', type:'textarea' },
  ],
  notas_jugadores: [
    { key:'nombre',   label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',    label:'Fecha', type:'date' },
    { key:'jugador',  label:'Jugador', type:'select', options:['','Tino','Caco','Leo','Enoch','Hiram'] },
    { key:'items', label:'Items relacionados', type:'select-rel-multi', source:'items' },
    { key:'resumen',  label:'Resumen', type:'textarea' },
  ],
  notas: [
    { key:'nombre',  label:'T\u00edtulo', type:'text', required:true },
    { key:'fecha',   label:'Fecha', type:'date' },
    { key:'resumen', label:'Resumen', type:'textarea' },
  ],
};

const SECTION_LABELS = {
  personajes:'Personaje', quests:'Quest', ciudades:'Ciudad',
  establecimientos:'Establecimiento', lugares:'Lugar', npcs:'NPC',
  items:'Item', notas_dm:'Nota DM', notas_jugadores:'Nota Jugador', notas:'Nota',
  monstruos:'Monstruo',
  items_catalog:'Ítem'
};

// ── FORM FIELD RENDERER ───────────────────────────────────────────────
function formFieldHTML(field, data) {
  const v = data ? (data[field.key] !== undefined ? data[field.key] : '') : (field.type === 'checkbox' ? false : '');
  if (field.type === 'textarea') {
    const rendered = textToContentEditable(v || '');
    return `<div class="form-group"><label>${field.label}</label><div class="ce-textarea" id="field-${field.key}" contenteditable="true">${rendered}</div></div>`;
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
    const currentId = current ? current.id : '';
    const items = [{ value: '', label: '— Ninguno —' }, ...srcArr.map(r => ({ value: r.id, label: r.nombre }))];
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
    const selectedIds = currentArr.map(r => r.id);
    const chips = currentArr.map(r => `<span class="ssm-chip" data-id="${r.id}">${escapeHtml(r.nombre)}<span class="ssm-chip-x">&times;</span></span>`).join('');
    const items = srcArr.map(r => `<div class="ss-option" data-value="${r.id}" style="${selectedIds.includes(r.id) ? 'display:none' : ''}">${escapeHtml(r.nombre)}</div>`).join('');
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
  body.querySelectorAll('.ce-textarea').forEach(ce => initMentionTextarea(ce));

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
  hidePreview();
  document.getElementById('modal-overlay').classList.remove('open');
  document.getElementById('modal-body').classList.remove('is-detail');
  currentModalSection = null;
  currentModalData = null;
  currentModalMode = null;
}

async function saveModal() {
  if (!currentModalSection) return;

  const schema = FORM_SCHEMAS[currentModalSection] || [];
  const newData = currentModalData ? {...currentModalData} : { id: null };

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
        const found = srcArr.find(r => r.id === id);
        return found ? { id: found.id, nombre: found.nombre } : null;
      }).filter(Boolean);
    } else if (field.type === 'select-rel') {
      const selectedId = el.value;
      if (selectedId) {
        const srcArr = (DATA[field.source] || []).filter(field.filter || (() => true));
        const found = srcArr.find(r => r.id === selectedId);
        newData[field.key] = found ? { id: found.id, nombre: found.nombre } : null;
      } else {
        newData[field.key] = null;
      }
    } else if (field.type === 'textarea') {
      newData[field.key] = contentEditableToText(el);
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
  const action = (currentModalData && currentModalData.id) ? 'edit' : 'add';

  // Marcar registros creados por jugadores (solo tablas que tienen estas columnas)
  if (action === 'add' && !isDM() && dataKey !== 'notas_jugadores') {
    newData.creado_por_jugador = true;
    newData.conocida_jugadores = true;
    newData.conocido_jugadores = true;
  }

  if (!DATA[dataKey]) DATA[dataKey] = [];
  const snapshot = [...DATA[dataKey]]; // backup para rollback

  if (action === 'add') {
    DATA[dataKey].push(newData);
  } else {
    const idx = DATA[dataKey].findIndex(i => i.id === newData.id);
    if (idx >= 0) DATA[dataKey][idx] = newData;
  }

  const spinner = document.getElementById('spinner');
  spinner.classList.add('open');
  try {
    await sbSave(dataKey, newData, action);
    // Si creamos un Lugar desde el mapa, guardar posición del marcador
    if (action === 'add' && dataKey === 'lugares' && pendingMarkerCoords) {
      try { await saveMarkerPosition(newData.id, pendingMarkerCoords.x, pendingMarkerCoords.y); } catch(me) { console.warn('Marker save failed:', me); }
      pendingMarkerCoords = null;
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
// ViewBox original del SVG
const VB_W0 = 1271, VB_H0 = 872;
// ViewBox recortado a la tierra (con padding)
const LAND_X = 530, LAND_Y = 340, LAND_W = 300, LAND_H = 250;
let LAND_HEXES = null; // Set de hexes de tierra, cargado desde data/land-hexes.json
let vbX = LAND_X, vbY = LAND_Y, vbW = LAND_W, vbH = LAND_H;
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
  { label: 'Niebla',      ids: ['fogOfWar'],                on: true,  dmOnly: true },
  { label: 'Dificultad',  ids: ['difficultyLayer'],         on: false, dmOnly: true },
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
    mapSvgEl.setAttribute('preserveAspectRatio', 'xMidYMid slice');

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

    // --- Fog of War ---
    initFogLayer();

    // --- Hex Tooltip ---
    initHexTooltip();

    renderMapLayerPanel();
    initMapZoomPan(viewport);
    initMapCityLinks();
    initMapMarkerDrop();
    renderMapMarkers();
    initMapToLegendHighlight();
    initMapToolsBar();
    initFogBrushTools();
    initPartySystem();
    if (typeof HexDifficulty !== 'undefined') HexDifficulty.buildCityCache(mapSvgEl);
    // Cargar hexes de tierra para capa de dificultad
    fetch('data/land-hexes.json').then(r => r.json()).then(d => { LAND_HEXES = d.land; }).catch(() => {});
    mapLoaded = true;
  } catch(e) {
    viewport.innerHTML = `<div style="padding:40px;color:var(--text-dim);font-family:'Cinzel',serif;text-align:center">Error al cargar el mapa: ${e.message}</div>`;
  }
}

function renderMapLayerPanel() {
  const panel = document.getElementById('map-layer-panel');
  if (!panel) return;
  const dm = isDM();
  panel.innerHTML = `
    <div class="map-panel-title">Capas</div>
    ${MAP_LAYER_GROUPS.filter(g => !g.dmOnly || dm).map((g, i) => {
      const realIdx = MAP_LAYER_GROUPS.indexOf(g);
      return `
      <label class="map-layer-row">
        <input type="checkbox" ${g.on ? 'checked' : ''} onchange="toggleMapLayer(${realIdx}, this.checked)">
        <span>${g.label}</span>
      </label>`;
    }).join('')}
  `;
  MAP_LAYER_GROUPS.forEach((g, i) => toggleMapLayer(i, g.on));
}

function toggleMapLayer(groupIdx, visible) {
  const g = MAP_LAYER_GROUPS[groupIdx];
  if (g) g.on = visible;
  if (!mapSvgEl) return;

  // Capas especiales
  if (g && g.ids.includes('fogOfWar')) {
    toggleFog(visible);
  } else if (g && g.ids.includes('difficultyLayer')) {
    toggleDifficultyLayer(visible);
  } else {
    (g ? g.ids : []).forEach(id => {
      const el = mapSvgEl.querySelector('#' + id);
      if (el) el.style.display = visible ? '' : 'none';
    });
  }
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
    vbW = Math.max(20, Math.min(LAND_W * 2, vbW * factor));
    vbH = vbW * (LAND_H / LAND_W);
    vbX = svgCX - ratioX * vbW;
    vbY = svgCY - ratioY * vbH;
    applyMapViewBox();
  }, { passive: false });

  // Drag con mouse
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (hexDebugMode) return; // No pan cuando modo brocha activo
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
  vbX = LAND_X; vbY = LAND_Y; vbW = LAND_W; vbH = LAND_H;
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
  const pt = mapSvgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = mapSvgEl.getScreenCTM();
  if (ctm) {
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }
  // Fallback si getScreenCTM no disponible
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
    const pos = MAP_MARKERS[lugar.id];
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

// ── UTILIDADES ────────────────────────────────────────────────────

const UTIL_CARDS_BASE = [
  { id: 'manage-users', title: 'Administrar Jugadores', desc: 'Crear, editar y eliminar usuarios de la campaña. Resetear contraseñas.', icon: '&#128101;' },
  { id: 'shop-gen', title: 'Generador de Inventario', desc: 'Genera inventario aleatorio de tiendas mágicas según ciudad y tipo de establecimiento.', icon: '&#9876;' },
  { id: 'bestiario', title: 'Bestiario', desc: 'Repositorio completo de monstruos con stats, acciones y filtros avanzados.', icon: '&#128050;' },
  { id: 'catalogo-items', title: 'Catálogo Items', desc: 'Catálogo de ítems mágicos con rareza, propiedades y descripciones.', icon: '&#128218;' },
];
// IA solo disponible para Halo
const UTIL_CARDS_HALO = [
  { id: 'campaign-ai', title: 'Asistente de Campaña', desc: 'Chat IA para preparar sesiones, generar NPCs, diseñar encuentros y consultar la campaña.', icon: '&#9876;' },
  { id: 'session-prep', title: 'Preparador de Sesiones', desc: 'Prepara sesiones perfectas con los 8 pasos de Sly Flourish.', icon: '&#128220;' },
];
function getUtilCards() {
  const cards = [...UTIL_CARDS_BASE];
  if (CONFIG.SLUG === 'halo') cards.splice(2, 0, ...UTIL_CARDS_HALO);
  return cards;
}

function renderUtilidades() {
  const grid = document.getElementById('grid-utilidades');
  if (!grid) return;
  grid.innerHTML = getUtilCards().map(u => `
    <div class="card util-card" onclick="openUtilidad('${u.id}')" style="cursor:pointer">
      <div class="card-header">
        <div>
          <div class="card-title"><span style="margin-right:6px">${u.icon}</span>${u.title}</div>
        </div>
      </div>
      <div class="card-body"><div class="card-desc">${u.desc}</div></div>
    </div>
  `).join('');
}

function openUtilidad(id) {
  if (id === 'manage-users') openManageUsers();
  if (id === 'shop-gen') openShopGenerator();
  if (id === 'campaign-ai') openAsistente();
  if (id === 'session-prep') openPreparador();
  if (id === 'bestiario') openBestiario();
  if (id === 'catalogo-items') openCatalogoItems();
}

// ── ADMIN DE USUARIOS ─────────────────────────────────────────────

const MANAGE_USERS_URL = `${CONFIG.SUPABASE_URL}/functions/v1/manage-users`;

async function manageUsersAPI(body) {
  const { data: { session } } = await sbClient.auth.getSession();
  if (!session?.access_token) {
    return { error: 'No hay sesión activa. Reloguéate.' };
  }
  try {
    const res = await fetch(MANAGE_USERS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'x-campaign-slug': CONFIG.SLUG,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { error: `HTTP ${res.status}: ${text}` }; }
    }
    return res.json();
  } catch (e) {
    return { error: `Error de red: ${e.message}` };
  }
}

async function openManageUsers() {
  const ws = document.getElementById('util-workspace');
  ws.style.display = '';
  ws.innerHTML = `
    <div class="util-panel">
      <div class="util-panel-header">
        <h3 class="util-title">&#128101; Administrar Jugadores</h3>
        <button class="btn btn-sm" onclick="closeUtilWorkspace()">&#10005; Cerrar</button>
      </div>
      <div id="mu-list" style="padding:16px"><p style="color:var(--text-dim)">Cargando usuarios...</p></div>
      <div style="padding:0 16px 16px">
        <button class="btn btn-success" onclick="showAddUserForm()">+ Agregar usuario</button>
      </div>
      <div id="mu-add-form" style="display:none;padding:0 16px 16px"></div>
    </div>
  `;
  await refreshUserList();
}

async function refreshUserList() {
  const container = document.getElementById('mu-list');
  const data = await manageUsersAPI({ action: 'list' });
  if (data.error) {
    container.innerHTML = `<p style="color:var(--red)">${data.error}</p>`;
    return;
  }
  const users = data.users || [];
  if (!users.length) {
    container.innerHTML = '<p style="color:var(--text-dim)">No hay usuarios.</p>';
    return;
  }
  container.innerHTML = `
    <table class="data-table" style="width:100%">
      <thead><tr>
        <th>Usuario</th><th>Rol</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td><strong>${u.username}</strong></td>
            <td><span class="badge ${u.role === 'dm' ? 'badge-gold' : 'badge-dim'}">${u.role.toUpperCase()}</span></td>
            <td>${u.mustChangePassword ? '<span style="color:var(--text-dim)">Pendiente</span>' : '<span style="color:var(--green)">Activo</span>'}</td>
            <td style="text-align:right">
              <button class="btn btn-sm" onclick="resetUserPassword('${u.id}','${u.username}')" title="Resetear contraseña">&#128274;</button>
              ${u.role !== 'dm' ? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}','${u.username}')" title="Eliminar">&#128465;</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function showAddUserForm() {
  const form = document.getElementById('mu-add-form');
  form.style.display = '';
  form.innerHTML = `
    <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
      <div class="util-field" style="flex:1;min-width:120px">
        <label>Username</label>
        <input type="text" id="mu-new-username" placeholder="nombre">
      </div>
      <div class="util-field" style="flex:1;min-width:120px">
        <label>Contraseña temporal</label>
        <input type="text" id="mu-new-password" value="halo2026">
      </div>
      <div class="util-field" style="min-width:100px">
        <label>Rol</label>
        <select id="mu-new-role">
          <option value="player">Player</option>
          <option value="dm">DM</option>
        </select>
      </div>
      <button class="btn btn-success" onclick="addUser()">Crear</button>
      <button class="btn btn-sm" onclick="document.getElementById('mu-add-form').style.display='none'">Cancelar</button>
    </div>
    <div id="mu-add-error" style="color:var(--red);font-size:.85rem;margin-top:4px"></div>
  `;
}

async function addUser() {
  const username = document.getElementById('mu-new-username').value.trim();
  const password = document.getElementById('mu-new-password').value.trim();
  const role = document.getElementById('mu-new-role').value;
  const errEl = document.getElementById('mu-add-error');

  if (!username || !password) { errEl.textContent = 'Username y contraseña son requeridos.'; return; }

  errEl.textContent = 'Creando...';
  const data = await manageUsersAPI({ action: 'create', username, password, role });
  if (data.error) { errEl.textContent = data.error; return; }

  document.getElementById('mu-add-form').style.display = 'none';
  await refreshUserList();
}

async function resetUserPassword(userId, username) {
  if (!confirm(`¿Resetear contraseña de ${username}? Se pondrá la temporal y deberá cambiarla al entrar.`)) return;
  const data = await manageUsersAPI({ action: 'update', userId, resetPassword: true });
  if (data.error) { alert(data.error); return; }
  await refreshUserList();
}

async function deleteUser(userId, username) {
  if (!confirm(`¿Eliminar a ${username}? Esta acción no se puede deshacer.`)) return;
  const data = await manageUsersAPI({ action: 'delete', userId });
  if (data.error) { alert(data.error); return; }
  await refreshUserList();
}

function openShopGenerator() {
  const ws = document.getElementById('util-workspace');
  ws.style.display = '';
  ws.innerHTML = `
    <div class="util-panel">
      <div class="util-panel-header">
        <h3 class="util-title">&#9876; Generador de Inventario</h3>
        <button class="btn btn-sm" onclick="closeUtilWorkspace()">&#10005; Cerrar</button>
      </div>
      <div class="util-controls">
        <div class="util-field">
          <label>Ciudad</label>
          <select id="util-burg" onchange="onUtilBurgChange()">
            <option value="">— Selecciona ciudad —</option>
          </select>
        </div>
        <div class="util-field">
          <label>Tipo de Tienda</label>
          <select id="util-tienda"><option value="">— Selecciona tienda —</option></select>
        </div>
        <button class="btn btn-success" onclick="generarInventario()">Generar</button>
      </div>
      <div id="util-info"></div>
      <div id="util-resultado"></div>
    </div>
  `;
  // Poblar burgs
  const sel = document.getElementById('util-burg');
  getBurgs().forEach(b => { const o = document.createElement('option'); o.value = b; o.textContent = b; sel.appendChild(o); });
  // Scroll al workspace
  ws.scrollIntoView({ behavior: 'smooth' });
}

function closeUtilWorkspace() {
  const ws = document.getElementById('util-workspace');
  ws.style.display = 'none';
  ws.innerHTML = '';
}

function openFullscreenUtil(html, afterRender) {
  let overlay = document.getElementById('fullscreen-util-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'fullscreen-util-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = html;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (afterRender) afterRender();
}

function closeFullscreenUtil() {
  const overlay = document.getElementById('fullscreen-util-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.innerHTML = '';
  }
  document.body.style.overflow = '';
}

function openBestiario() {
  openFullscreenUtil(`
    <div class="fullscreen-util-panel">
      <div class="fullscreen-util-header">
        <h2 class="fullscreen-util-title">&#128050; Bestiario</h2>
        <button class="btn" onclick="closeFullscreenUtil()">&#10005; Cerrar</button>
      </div>
      <div class="fullscreen-util-controls">
        <input type="text" class="search-input" id="search-bestiario" placeholder="Buscar monstruo..." oninput="renderBestiario()">
      </div>
      <div id="filter-bar-bestiario"></div>
      <div class="bestiario-table-wrapper fullscreen-table-wrapper">
        <table class="bestiario-table" id="table-bestiario">
          <thead id="thead-bestiario"></thead>
          <tbody id="tbody-bestiario"></tbody>
        </table>
      </div>
      <div id="bestiario-count" class="bestiario-count"></div>
    </div>`, renderBestiario);
}

function openCatalogoItems() {
  openFullscreenUtil(`
    <div class="fullscreen-util-panel">
      <div class="fullscreen-util-header">
        <h2 class="fullscreen-util-title">&#128218; Catálogo Items</h2>
        <button class="btn" onclick="closeFullscreenUtil()">&#10005; Cerrar</button>
      </div>
      <div class="fullscreen-util-controls">
        <input type="text" class="search-input" id="search-catalogo_items" placeholder="Buscar ítem..." oninput="renderCatalogoItems()">
      </div>
      <div id="filter-bar-catalogo_items"></div>
      <div class="bestiario-table-wrapper fullscreen-table-wrapper">
        <table class="bestiario-table" id="table-catalogo_items">
          <thead id="thead-catalogo_items"></thead>
          <tbody id="tbody-catalogo_items"></tbody>
        </table>
      </div>
      <div id="catalogo_items-count" class="bestiario-count"></div>
    </div>`, renderCatalogoItems);
}

function onUtilBurgChange() {
  const burgName = document.getElementById('util-burg').value;
  const tiendaSel = document.getElementById('util-tienda');
  tiendaSel.innerHTML = '<option value="">— Selecciona tienda —</option>';
  document.getElementById('util-resultado').innerHTML = '';
  document.getElementById('util-info').innerHTML = '';
  if (!burgName) return;
  getTiendasDeBurg(burgName).forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; tiendaSel.appendChild(o); });
  const cat = getCategoriaBurg(burgName);
  if (cat) document.getElementById('util-info').innerHTML = `<div class="util-info-bar"><span class="badge tipo-badge">${burgName}</span> <span class="util-cat">${cat}</span> — ${getTiendasDeBurg(burgName).length} tiendas con items mágicos</div>`;
}

const RAREZA_COLORS = { 'Common': '#9e9e9e', 'Uncommon': '#4caf50', 'Rare': '#2196f3', 'Very Rare': '#9c27b0' };

function generarInventario() {
  const burgName = document.getElementById('util-burg').value;
  const tienda = document.getElementById('util-tienda').value;
  if (!burgName || !tienda) { alert('Selecciona ciudad y tipo de tienda.'); return; }
  const r = generarItems(burgName, tienda);
  document.getElementById('util-resultado').innerHTML = `
    <div class="util-result-header">
      <span>${r.tienda} en ${r.burg}</span>
      <span class="util-meta">Costo máx: ${r.costoMax.toLocaleString()} GP — ${r.items.length} items</span>
      <button class="btn btn-sm" onclick="generarInventario()">&#8635; Re-generar</button>
    </div>
    <table class="util-table">
      <thead><tr><th>Item</th><th>Rareza</th><th>Precio</th></tr></thead>
      <tbody>${r.items.map(it => `<tr><td>${escapeHtml(it.nombre)}</td><td><span class="util-rareza" style="background:${RAREZA_COLORS[it.rareza] || '#666'}">${it.rareza}</span></td><td class="util-precio">${it.precio.toLocaleString()} GP</td></tr>`).join('')}</tbody>
    </table>`;
}

// ── D&D BEYOND TOGGLE ─────────────────────────────────────────────
function ddbToggleSheet(btn, characterId, sbId) {
  const container = document.getElementById('ddb-sheet-' + characterId);
  if (!container) return;
  const isHidden = container.style.display === 'none';
  container.style.display = isHidden ? 'block' : 'none';
  btn.innerHTML = isHidden ? '&#9862; Ocultar hoja D&D Beyond' : '&#9862; Ver hoja D&D Beyond';
  if (isHidden && !container.dataset.loaded) {
    container.dataset.loaded = '1';
    ddbLoadAndShow(characterId, container, sbId || undefined);
  }
}

async function ddbManualSync(characterId, sbId, btn) {
  if (!sbId) return;
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '&#x21bb; Sincronizando...';
  try {
    // Limpiar cache para forzar fetch fresco
    delete _ddbCache[characterId];
    const char = await ddbFetchCharacter(characterId);
    const ok = await ddbSyncToSupabase(sbId, char);
    if (ok) {
      btn.innerHTML = '&#x2713; Listo';
      // Re-render integrated card if open in modal
      const integratedCard = btn.closest('.ddb-integrated');
      if (integratedCard) {
        const p = (DATA.players || []).find(pl => pl._sbid === sbId);
        if (p) {
          integratedCard.outerHTML = ddbBuildIntegratedCard(char, p, characterId, sbId);
        }
      } else {
        // Legacy: update standalone sheet if visible
        const container = document.getElementById('ddb-sheet-' + characterId);
        if (container && container.style.display !== 'none') {
          container.innerHTML = ddbRenderSheet(char);
        }
        const bar = btn.closest('.detail-section');
        const oldStatus = bar?.querySelector('.ddb-sync-status');
        const ts = new Date().toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        if (oldStatus) oldStatus.textContent = `Última sync: ${ts}`;
      }
    } else {
      btn.innerHTML = '&#x2717; Error';
    }
  } catch (e) {
    console.error('ddbManualSync:', e);
    btn.innerHTML = '&#x2717; Error';
  }
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2000);
}

// ── D&D BEYOND SYNC ALL ───────────────────────────────────────────
async function ddbSyncAll(btn) {
  const pjs = (DATA.players || []).filter(p => p.es_pj && p.dndbeyond_url);
  if (!pjs.length) { alert('No hay PJs con URL de D&D Beyond configurada.'); return; }

  const orig = btn.innerHTML;
  btn.disabled = true;

  let ok = 0, fail = 0;
  for (const p of pjs) {
    const ddbId = ddbExtractId(p.dndbeyond_url);
    if (!ddbId || !p._sbid) { fail++; continue; }
    btn.innerHTML = `&#x21bb; ${ok + fail + 1}/${pjs.length}...`;
    try {
      delete _ddbCache[ddbId];
      const char = await ddbFetchCharacter(ddbId);
      const synced = await ddbSyncToSupabase(p._sbid, char);
      synced ? ok++ : fail++;
    } catch (e) {
      console.error(`ddbSyncAll error (${p.nombre}):`, e);
      fail++;
    }
  }

  btn.innerHTML = fail ? `&#x2713; ${ok} OK, ${fail} error` : `&#x2713; ${ok} sincronizados`;
  renderPersonajes();
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 3000);
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

// =====================================================================
// DIFFICULTY LAYER — Overlay visual de niveles de dificultad
// =====================================================================

let difficultyLayerVisible = false;

function toggleDifficultyLayer(visible) {
  difficultyLayerVisible = visible;
  const g = mapSvgEl && mapSvgEl.querySelector('#difficultyLayer');
  if (g) g.style.display = visible ? '' : 'none';
  if (visible) renderDifficultyLayer();
}

function renderDifficultyLayer() {
  if (!mapSvgEl || typeof HexDifficulty === 'undefined' || typeof HexGrid === 'undefined') return;
  const ns = 'http://www.w3.org/2000/svg';

  let g = mapSvgEl.querySelector('#difficultyLayer');
  if (!g) {
    g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'difficultyLayer');
    g.style.pointerEvents = 'none';
    // Insertar debajo del fog
    const fogRect = mapSvgEl.querySelector('#fogOfWar');
    if (fogRect) {
      mapSvgEl.insertBefore(g, fogRect);
    } else {
      mapSvgEl.appendChild(g);
    }
  }

  if (g.childNodes.length > 0) return; // Ya renderizado
  if (!LAND_HEXES) return;

  for (const [q, r] of LAND_HEXES) {
    const diff = HexDifficulty.getDifficulty(q, r);
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', HexGrid.hexPolygonPoints(q, r));
    poly.setAttribute('fill', diff.color);
    poly.setAttribute('stroke', 'none');
    g.appendChild(poly);
  }
}

// =====================================================================
// FOG OF WAR — Fase 2 Hexplorer
// Capa de niebla hexagonal: hexes no revelados se cubren con fog negro.
// Estrategia: rect negro con mask SVG. Solo se dibujan hexes revelados
// (poligonos blancos en la mascara), no los ocultos (~26k hexes).
// =====================================================================

// Estado del fog: { "q,r": { revealed: bool, discovered: bool, note: string } }
// revealed = visible en el mapa (fog removido)
// discovered = un explorador ha pasado por ahi (puede tener actividades)
let FOG_DATA = {};
let fogEnabled = true;
const FOG_STORAGE_KEY = () => `${CONFIG.SLUG}_fog_data`;

function loadFogData() {
  try {
    const stored = localStorage.getItem(FOG_STORAGE_KEY());
    if (stored) FOG_DATA = JSON.parse(stored);
  } catch (e) {
    console.warn('[Fog] Error loading fog data:', e);
  }
}

function saveFogData() {
  try {
    localStorage.setItem(FOG_STORAGE_KEY(), JSON.stringify(FOG_DATA));
  } catch (e) {
    console.warn('[Fog] Error saving fog data:', e);
  }
}

/** Carga fog desde Supabase y mergea con localStorage (Supabase gana). */
async function loadFogFromSupabase() {
  try {
    const { data, error } = await sbClient.from('hex_fog').select('*');
    if (error) { console.warn('[Fog] Supabase load error:', error.message); return; }
    if (!data || !data.length) return;

    for (const row of data) {
      const key = row.hex_key;
      if (!FOG_DATA[key]) FOG_DATA[key] = {};
      FOG_DATA[key].revealed = row.revealed;
      FOG_DATA[key].discovered = row.discovered;
      if (row.note) FOG_DATA[key].note = row.note;
    }
    // Sincronizar localStorage con lo de Supabase
    saveFogData();
  } catch (e) {
    console.warn('[Fog] Supabase load failed:', e);
  }
}

/** Guarda cambios de fog en Supabase (batch upsert). */
async function saveFogToSupabase(keys) {
  if (!keys || !keys.length) return;
  try {
    const rows = keys.map(key => {
      const d = FOG_DATA[key] || {};
      return {
        hex_key: key,
        revealed: !!d.revealed,
        discovered: !!d.discovered,
        note: d.note || null,
        updated_at: new Date().toISOString(),
      };
    });
    const { error } = await sbClient.from('hex_fog').upsert(rows, { onConflict: 'hex_key' });
    if (error) console.warn('[Fog] Supabase save error:', error.message);
  } catch (e) {
    console.warn('[Fog] Supabase save failed:', e);
  }
}

/** Guarda una nota de hex en Supabase. */
async function saveNoteToSupabase(q, r) {
  const key = HexGrid.hexKey(q, r);
  const d = FOG_DATA[key] || {};
  try {
    await sbClient.from('hex_fog').upsert({
      hex_key: key,
      revealed: !!d.revealed,
      discovered: !!d.discovered,
      note: d.note || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'hex_key' });
  } catch (e) {
    console.warn('[Fog] Note save failed:', e);
  }
}

/** Guarda una entrada en el log de exploración. */
async function logExploration(tipo, titulo, descripcion, hexKey, bioma, roll, tripId, tier, dia) {
  try {
    await sbClient.from('exploration_log').insert({
      tipo, titulo,
      descripcion: descripcion || null,
      hex_key: hexKey || null,
      bioma: bioma || null,
      roll: roll || null,
      trip_id: tripId || null,
      tier: tier || null,
      dia: dia || null,
    });
  } catch (e) {
    console.warn('[Fog] Log save failed:', e);
  }
}

/** Batch insert de múltiples log entries (para viajes multi-día). */
async function logExplorationBatch(entries) {
  if (!entries.length) return;
  try {
    await sbClient.from('exploration_log').insert(entries);
  } catch (e) {
    console.warn('[Fog] Log batch save failed:', e);
  }
}

/** Carga el log de exploración desde Supabase. */
async function loadExplorationLog() {
  try {
    const { data, error } = await sbClient.from('exploration_log')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (error) { console.warn('[Fog] Log load error:', error.message); return []; }
    return data || [];
  } catch (e) {
    console.warn('[Fog] Log load failed:', e);
    return [];
  }
}

function isHexRevealed(q, r) {
  const key = HexGrid.hexKey(q, r);
  return FOG_DATA[key] && FOG_DATA[key].revealed;
}

function isHexDiscovered(q, r) {
  const key = HexGrid.hexKey(q, r);
  return FOG_DATA[key] && FOG_DATA[key].discovered;
}

function markHexDiscovered(q, r) {
  const key = HexGrid.hexKey(q, r);
  if (!FOG_DATA[key]) FOG_DATA[key] = {};
  FOG_DATA[key].discovered = true;
}

function getHexNote(q, r) {
  const key = HexGrid.hexKey(q, r);
  return (FOG_DATA[key] && FOG_DATA[key].note) || '';
}

function setHexNote(q, r, note) {
  const key = HexGrid.hexKey(q, r);
  if (!FOG_DATA[key]) FOG_DATA[key] = {};
  if (note) {
    FOG_DATA[key].note = note;
  } else {
    delete FOG_DATA[key].note;
  }
  saveFogData();
  saveNoteToSupabase(q, r);
}

function revealHex(q, r, save = true) {
  const key = HexGrid.hexKey(q, r);
  if (!FOG_DATA[key]) FOG_DATA[key] = {};
  FOG_DATA[key].revealed = true;
  if (save) saveFogData();
}

function hideHex(q, r, save = true) {
  const key = HexGrid.hexKey(q, r);
  if (FOG_DATA[key]) {
    FOG_DATA[key].revealed = false;
    if (!FOG_DATA[key].discovered) delete FOG_DATA[key];
  }
  if (save) saveFogData();
}

function revealHexes(hexList) {
  hexList.forEach(h => revealHex(h.q, h.r, false));
  saveFogData();
  renderFog();
}

function hideHexes(hexList) {
  hexList.forEach(h => hideHex(h.q, h.r, false));
  saveFogData();
  renderFog();
}

/**
 * Inicializa la capa de fog en el SVG.
 * Crea un <rect> negro con mask, posicionado sobre el contenido del mapa.
 */
async function initFogLayer() {
  if (!mapSvgEl || typeof HexGrid === 'undefined') return;
  loadFogData();
  await loadFogFromSupabase();

  const ns = 'http://www.w3.org/2000/svg';
  const defs = mapSvgEl.querySelector('defs');

  // --- Crear mask para el fog ---
  // Blanco = fog visible (oculto), Negro = fog removido (revelado)
  let fogMask = mapSvgEl.querySelector('#fogRevealMask');
  if (!fogMask) {
    fogMask = document.createElementNS(ns, 'mask');
    fogMask.setAttribute('id', 'fogRevealMask');

    // Base blanca (fog visible en todo el mapa)
    const base = document.createElementNS(ns, 'rect');
    base.setAttribute('x', '0');
    base.setAttribute('y', '0');
    base.setAttribute('width', '1271');
    base.setAttribute('height', '872');
    base.setAttribute('fill', 'white');
    fogMask.appendChild(base);

    // Grupo para hexes revelados (poligonos blancos)
    const revealGroup = document.createElementNS(ns, 'g');
    revealGroup.setAttribute('id', 'fogRevealed');
    fogMask.appendChild(revealGroup);

    defs.appendChild(fogMask);
  }

  // --- Crear rect de fog ---
  let fogRect = mapSvgEl.querySelector('#fogOfWar');
  if (!fogRect) {
    fogRect = document.createElementNS(ns, 'rect');
    fogRect.setAttribute('id', 'fogOfWar');
    fogRect.setAttribute('x', '0');
    fogRect.setAttribute('y', '0');
    fogRect.setAttribute('width', '1271');
    fogRect.setAttribute('height', '872');
    fogRect.setAttribute('mask', 'url(#fogRevealMask)');
    fogRect.style.pointerEvents = 'none';

    // Insertar encima de todo el contenido del mapa pero debajo de la UI
    // (despues de markers, burgLabels, gridOverlay, etc.)
    mapSvgEl.appendChild(fogRect);
  }

  // Color y opacidad segun rol
  updateFogAppearance();

  // Render inicial
  renderFog();
}

/**
 * Actualiza color/opacidad del fog segun el rol del usuario.
 */
function updateFogAppearance() {
  const fogRect = mapSvgEl && mapSvgEl.querySelector('#fogOfWar');
  if (!fogRect) return;

  if (isDM()) {
    fogRect.setAttribute('fill', 'rgba(0, 0, 0, 0.55)');
  } else {
    fogRect.setAttribute('fill', '#466eab');
  }
}

/**
 * Renderiza el estado actual del fog: crea poligonos blancos en la mask
 * para cada hex revelado.
 */
function renderFog() {
  if (!mapSvgEl) return;
  const ns = 'http://www.w3.org/2000/svg';

  const revealGroup = mapSvgEl.querySelector('#fogRevealed');
  if (!revealGroup) return;

  // Limpiar y re-renderizar
  revealGroup.innerHTML = '';

  const keys = Object.keys(FOG_DATA);
  for (const key of keys) {
    if (!FOG_DATA[key].revealed) continue;
    const { q, r } = HexGrid.parseHexKey(key);
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', HexGrid.hexPolygonPoints(q, r));
    poly.setAttribute('fill', 'black');
    revealGroup.appendChild(poly);
  }
}

/**
 * Toggle fog on/off (solo para DM).
 */
function toggleFog(visible) {
  fogEnabled = visible;
  const fogRect = mapSvgEl && mapSvgEl.querySelector('#fogOfWar');
  if (fogRect) fogRect.style.display = visible ? '' : 'none';
}

/**
 * Resetea todo el fog (todo queda oculto). Requiere confirmacion.
 */
function resetFog() {
  if (!confirm('¿Resetear toda la niebla de guerra? Todos los hexes quedarán ocultos.')) return;
  FOG_DATA = {};
  saveFogData();
  renderFog();
}

// =====================================================================
// HEX DATA & TOOLTIP — Fase 3 Hexplorer
// Detecta bioma/reino bajo un hex y muestra tooltip con info contextual.
// =====================================================================

/**
 * Detecta qué bioma y reino hay en el centro de un hex usando elementsFromPoint.
 * Retorna { biome: string|null, region: string|null }
 */
function detectHexContext(q, r) {
  if (!mapSvgEl) return { biome: null, region: null };

  const center = HexGrid.hexCenter(q, r);

  // Usar isPointInFill para detectar bioma/reino sin tocar display/visibility
  const svgPoint = mapSvgEl.createSVGPoint();
  svgPoint.x = center.x;
  svgPoint.y = center.y;

  let biome = null;
  let region = null;

  // Buscar biomas
  for (const entry of MAP_LEGENDS.biomes.items) {
    const el = mapSvgEl.querySelector('#' + entry.svgId);
    if (el && el.isPointInFill && el.isPointInFill(svgPoint)) {
      biome = entry.name;
      break;
    }
  }

  // Buscar reinos (pueden estar ocultos, pero isPointInFill funciona igual)
  for (const entry of MAP_LEGENDS.regions.items) {
    const el = mapSvgEl.querySelector('#' + entry.svgId);
    if (el && el.isPointInFill && el.isPointInFill(svgPoint)) {
      region = entry.name;
      break;
    }
  }

  return { biome, region };
}

/**
 * Encuentra ciudades y lugares que caen dentro del hex (q, r).
 */
function findEntitiesInHex(q, r) {
  const result = { ciudades: [], lugares: [] };
  if (!mapSvgEl) return result;
  const targetKey = HexGrid.hexKey(q, r);

  // Ciudades: buscar en burgLabels usando atributos x/y directos del SVG
  const labelLayer = mapSvgEl.querySelector('#burgLabels');
  if (labelLayer) {
    labelLayer.querySelectorAll('text[data-id]').forEach(t => {
      if (t.style.display === 'none') return;
      const cx = parseFloat(t.getAttribute('x'));
      const cy = parseFloat(t.getAttribute('y'));
      if (isNaN(cx) || isNaN(cy)) return;
      const tHex = HexGrid.svgToHex(cx, cy);
      if (HexGrid.hexKey(tHex.q, tHex.r) === targetKey) {
        const name = (t.childNodes[0] || t).textContent.trim();
        if (name && !result.ciudades.includes(name)) result.ciudades.push(name);
      }
    });
  }

  // Lugares: buscar en MAP_MARKERS (match exacto)
  const lugares = DATA.lugares || [];
  const visibles = isDM() ? lugares : lugares.filter(l => l.conocido_jugadores || l.creado_por_jugador);
  for (const lugar of visibles) {
    const marker = MAP_MARKERS[lugar.id];
    if (!marker) continue;
    const lHex = HexGrid.svgToHex(marker.x, marker.y);
    if (HexGrid.hexKey(lHex.q, lHex.r) === targetKey) {
      result.lugares.push(lugar);
    }
  }

  return result;
}

/**
 * Muestra tooltip HTML cerca del cursor con info del hex.
 */
let hexTooltipEl = null;

function showHexTooltip(e, q, r) {
  if (!hexTooltipEl) {
    hexTooltipEl = document.createElement('div');
    hexTooltipEl.className = 'hex-tooltip';
    document.body.appendChild(hexTooltipEl);
  }

  // Solo mostrar info si el hex esta revelado (o si es DM)
  if (!isDM() && !isHexRevealed(q, r)) {
    hideHexTooltip();
    return;
  }

  const ctx = detectHexContext(q, r);
  const entities = findEntitiesInHex(q, r);

  // Si no hay nada que mostrar, ocultar
  if (!ctx.biome && !ctx.region && !entities.ciudades.length && !entities.lugares.length) {
    hideHexTooltip();
    return;
  }

  let html = '';
  if (ctx.region) html += `<div class="hex-tooltip-region">${ctx.region}</div>`;
  if (ctx.biome) html += `<div class="hex-tooltip-biome">${ctx.biome}</div>`;
  if (entities.ciudades.length) {
    html += `<div class="hex-tooltip-entities">🏰 ${entities.ciudades.join(', ')}</div>`;
  }
  if (entities.lugares.length) {
    html += `<div class="hex-tooltip-entities">📍 ${entities.lugares.map(l => l.nombre).join(', ')}</div>`;
  }

  hexTooltipEl.innerHTML = html;
  hexTooltipEl.style.display = '';

  // Posicionar cerca del cursor
  const offsetX = 16, offsetY = 16;
  const tipW = hexTooltipEl.offsetWidth;
  const tipH = hexTooltipEl.offsetHeight;
  let left = e.clientX + offsetX;
  let top = e.clientY + offsetY;
  if (left + tipW > window.innerWidth - 8) left = e.clientX - tipW - offsetX;
  if (top + tipH > window.innerHeight - 8) top = e.clientY - tipH - offsetY;
  hexTooltipEl.style.left = left + 'px';
  hexTooltipEl.style.top = top + 'px';
}

function hideHexTooltip() {
  if (hexTooltipEl) hexTooltipEl.style.display = 'none';
}

/**
 * Inicializa el tooltip de hex en el mapa.
 * Se muestra al hover sobre hexes revelados (sin necesidad del modo debug).
 */
function initHexTooltip() {
  if (!mapSvgEl || typeof HexGrid === 'undefined') return;

  // Shift+Click en hex revelado: abrir panel de detalle
  mapSvgEl.addEventListener('click', (e) => {
    if (!e.shiftKey) return;
    if (hexDebugMode || markerMode) return;
    const svgPt = screenToSvg(e.clientX, e.clientY);
    const hex = HexGrid.svgToHex(svgPt.x, svgPt.y);
    if (!isDM() && !isHexRevealed(hex.q, hex.r)) return;
    e.stopPropagation();
    showHexDetailPanel(hex.q, hex.r, e);
  });
}

// =====================================================================
// HEX DETAIL PANEL — Fase 6 Hexplorer
// Click en hex revelado muestra panel con entidades, notas DM, y links.
// =====================================================================

let hexDetailEl = null;

function showHexDetailPanel(q, r, e) {
  if (!hexDetailEl) {
    hexDetailEl = document.createElement('div');
    hexDetailEl.className = 'hex-detail-panel';
    hexDetailEl.addEventListener('click', ev => ev.stopPropagation());
    document.body.appendChild(hexDetailEl);
  }

  const ctx = detectHexContext(q, r);
  const entities = findEntitiesInHex(q, r);
  const note = getHexNote(q, r);
  const discovered = isHexDiscovered(q, r);
  const key = HexGrid.hexKey(q, r);

  let html = `<div class="hex-detail-header">`;
  html += `<span class="hex-detail-coords">${key}</span>`;
  html += `<button class="hex-detail-close" onclick="hideHexDetailPanel()">\u2715</button>`;
  html += `</div>`;

  if (ctx.region) html += `<div class="hex-detail-region">${ctx.region}</div>`;
  if (ctx.biome) html += `<div class="hex-detail-biome">${ctx.biome}</div>`;

  // Dificultad (Tiers of Play)
  if (typeof HexDifficulty !== 'undefined') {
    const diff = HexDifficulty.getDifficulty(q, r);
    const tierColors = ['#50dc78', '#c8be32', '#d27828', '#a032b4'];
    const dotColor = tierColors[diff.tier - 1] || '#888';
    html += `<div class="hex-detail-difficulty">
      <span class="hex-detail-diff-dot" style="background:${dotColor}"></span>
      <span>Tier ${diff.tier} — ${diff.name} (Lvl ${diff.levels})</span>
      ${diff.nearestCity ? `<span class="hex-detail-diff-city">${diff.nearestCity} (${diff.distance}h)</span>` : ''}
    </div>`;
  }

  if (discovered) {
    html += `<div class="hex-detail-status hex-detail-discovered">Explorado</div>`;
  }

  // Ciudades
  if (entities.ciudades.length) {
    html += `<div class="hex-detail-section">`;
    html += `<div class="hex-detail-section-title">Ciudades</div>`;
    for (const name of entities.ciudades) {
      const ciudad = (DATA.ciudades || []).find(c => c.nombre.toLowerCase() === name.toLowerCase());
      if (ciudad) {
        html += `<a class="hex-detail-link" onclick="openDetail('ciudades', DATA.ciudades.find(c=>c.id==='${ciudad.id}'));hideHexDetailPanel()">🏰 ${name}</a>`;
      } else {
        html += `<div class="hex-detail-item">🏰 ${name}</div>`;
      }
    }
    html += `</div>`;
  }

  // Lugares
  if (entities.lugares.length) {
    html += `<div class="hex-detail-section">`;
    html += `<div class="hex-detail-section-title">Lugares</div>`;
    for (const lugar of entities.lugares) {
      html += `<a class="hex-detail-link" onclick="openDetail('lugares', DATA.lugares.find(l=>l.id==='${lugar.id}'));hideHexDetailPanel()">📍 ${lugar.nombre}</a>`;
    }
    html += `</div>`;
  }

  // Notas DM
  if (isDM()) {
    html += `<div class="hex-detail-section">`;
    html += `<div class="hex-detail-section-title">Nota del DM</div>`;
    html += `<textarea class="hex-detail-note" placeholder="Escribe una nota..."
      onchange="setHexNote(${q}, ${r}, this.value)">${note}</textarea>`;
    html += `</div>`;
  }

  hexDetailEl.innerHTML = html;
  hexDetailEl.style.display = '';

  // Posicionar
  const panelW = 260;
  let left = e.clientX + 20;
  let top = e.clientY - 40;
  if (left + panelW > window.innerWidth - 12) left = e.clientX - panelW - 20;
  if (top < 12) top = 12;
  if (top + 300 > window.innerHeight) top = window.innerHeight - 320;
  hexDetailEl.style.left = left + 'px';
  hexDetailEl.style.top = top + 'px';
}

function hideHexDetailPanel() {
  if (hexDetailEl) hexDetailEl.style.display = 'none';
}

// Cerrar panel al hacer click fuera
document.addEventListener('click', (e) => {
  if (hexDetailEl && hexDetailEl.style.display !== 'none') {
    if (!hexDetailEl.contains(e.target)) {
      hideHexDetailPanel();
    }
  }
});

// =====================================================================
// EXPLORATION — Fase 5 Hexplorer
// Banner cinematico + encuentros al revelar hexes.
// =====================================================================

// Regiones ya descubiertas (para no repetir banner)
let discoveredRegions = new Set();
const DISCOVERED_REGIONS_KEY = () => `${CONFIG.SLUG}_discovered_regions`;

function loadDiscoveredRegions() {
  try {
    const stored = localStorage.getItem(DISCOVERED_REGIONS_KEY());
    if (stored) discoveredRegions = new Set(JSON.parse(stored));
  } catch (e) { /* ignore */ }
}

function saveDiscoveredRegions() {
  try {
    localStorage.setItem(DISCOVERED_REGIONS_KEY(), JSON.stringify([...discoveredRegions]));
  } catch (e) { /* ignore */ }
}

/**
 * Procesa los hexes recien revelados: detecta nuevas regiones y lanza encuentro.
 */
function triggerExploration(revealedKeys) {
  if (typeof HexExplore === 'undefined') return;
  if (!isDM()) return;
  loadDiscoveredRegions();

  // Filtrar: solo hexes que no se habian descubierto antes (first-time-only)
  const newHexKeys = revealedKeys.filter(key => {
    const { q, r } = HexGrid.parseHexKey(key);
    return !isHexDiscovered(q, r);
  });

  // Marcar todos como descubiertos
  for (const key of newHexKeys) {
    const { q, r } = HexGrid.parseHexKey(key);
    markHexDiscovered(q, r);
  }
  if (newHexKeys.length > 0) saveFogData();

  // Si no hay hexes nuevos, no hay exploración
  if (newHexKeys.length === 0) return;

  // Detectar regiones nuevas
  const newRegions = new Set();
  let biomeForEncounter = null;

  for (const key of newHexKeys) {
    const { q, r } = HexGrid.parseHexKey(key);
    const ctx = detectHexContext(q, r);
    if (ctx.region && !discoveredRegions.has(ctx.region)) {
      newRegions.add(ctx.region);
    }
    if (!biomeForEncounter && ctx.biome) {
      biomeForEncounter = ctx.biome;
    }
  }

  // Banner para nuevas regiones
  if (newRegions.size > 0) {
    for (const region of newRegions) {
      discoveredRegions.add(region);
      logExploration('region', region, null, newHexKeys[0], biomeForEncounter, null);
    }
    saveDiscoveredRegions();
    const firstRegion = [...newRegions][0];
    showRegionBanner(firstRegion);
  }

  // Guardar hexes descubiertos en Supabase
  saveFogToSupabase(newHexKeys);

  // Encuentro aleatorio — escalar por tier de dificultad del hex
  if (biomeForEncounter) {
    let tierIdx = 0;
    if (typeof HexDifficulty !== 'undefined') {
      const { q, r } = HexGrid.parseHexKey(newHexKeys[0]);
      const diff = HexDifficulty.getDifficulty(q, r);
      tierIdx = diff.tier - 1; // tier 1-4 -> idx 0-3
    }
    const result = HexExplore.explorar(biomeForEncounter, tierIdx);
    if (result.tipo !== 'nada') {
      logExploration(result.tipo, result.tipo, result.resultado, newHexKeys[0], biomeForEncounter, result.roll);
      const delay = newRegions.size > 0 ? 3500 : 200;
      setTimeout(() => showEncounterToast(result), delay);
    }
  }
}

/**
 * Muestra banner cinematico fullscreen con el nombre de la region.
 */
function showRegionBanner(regionName) {
  let banner = document.getElementById('region-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'region-banner';
    banner.className = 'region-banner';
    document.body.appendChild(banner);
  }

  banner.textContent = regionName;
  banner.classList.remove('region-banner-show');
  // Force reflow para reiniciar animacion
  void banner.offsetWidth;
  banner.classList.add('region-banner-show');

  // Remover clase despues de la animacion
  setTimeout(() => banner.classList.remove('region-banner-show'), 3200);
}

/**
 * Muestra toast con resultado de encuentro.
 */
function showEncounterToast(result) {
  let toast = document.getElementById('encounter-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'encounter-toast';
    toast.className = 'encounter-toast';
    document.body.appendChild(toast);
  }

  const icons = { clima: '\u26C8', social: '\uD83D\uDDE3', combate: '\u2694', 'señal': '\uD83D\uDC3E' };
  const labels = { clima: 'Clima', social: 'Encuentro Social', combate: 'Combate', 'señal': 'Señal / Rastro' };
  const icon = icons[result.tipo] || '\u2753';
  const label = labels[result.tipo] || result.tipo;
  const tierTag = result.tier ? ` · Tier ${result.tier}` : '';

  toast.innerHTML = `
    <div class="encounter-toast-header">
      <span class="encounter-toast-icon">${icon}</span>
      <span class="encounter-toast-label">${label}</span>
      <span class="encounter-toast-roll">d100: ${result.roll}${tierTag}</span>
    </div>
    <div class="encounter-toast-body">${(result.resultado || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>
    <button class="encounter-toast-close" onclick="this.parentElement.classList.remove('encounter-toast-show')">\u2715</button>
  `;

  toast.classList.remove('encounter-toast-show');
  void toast.offsetWidth;
  toast.classList.add('encounter-toast-show');

  // Auto-cerrar despues de 12 segundos
  setTimeout(() => toast.classList.remove('encounter-toast-show'), 12000);
}

// =====================================================================
// EXPLORATION LOG — Diario de exploracion
// Panel con historial de descubrimientos, visible para todos.
// =====================================================================

let explorationLogOpen = false;

function toggleExplorationLog() {
  explorationLogOpen = !explorationLogOpen;
  const overlay = document.getElementById('exploration-log-overlay');
  const btn = document.getElementById('btn-exploration-log');
  if (overlay) overlay.style.display = explorationLogOpen ? '' : 'none';
  if (btn) btn.classList.toggle('active', explorationLogOpen);
  if (explorationLogOpen) renderExplorationLog();
}

async function renderExplorationLog() {
  const list = document.getElementById('exploration-log-list');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;color:var(--on-surface-variant);padding:20px">Cargando...</div>';

  const entries = await loadExplorationLog();
  if (!entries.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--on-surface-variant);padding:20px">Sin descubrimientos aún.</div>';
    return;
  }

  const icons = {
    region: '🏔', clima: '⛈', social: '🗣', combate: '⚔',
    viaje: '🚶', 'señal': '🐾', nada: '—',
  };
  const tierColors = ['#50dc78', '#c8be32', '#d27828', '#a032b4'];

  // Agrupar por trip_id
  const trips = [];
  const standalone = [];

  // Entries vienen ordenadas desc por created_at
  const tripMap = {};
  for (const e of entries) {
    if (e.trip_id) {
      if (!tripMap[e.trip_id]) tripMap[e.trip_id] = [];
      tripMap[e.trip_id].push(e);
    } else {
      standalone.push(e);
    }
  }

  // Convertir trips a array ordenado (el viaje header primero, luego días por orden)
  for (const [tripId, tripEntries] of Object.entries(tripMap)) {
    const header = tripEntries.find(e => e.tipo === 'viaje');
    const days = tripEntries.filter(e => e.tipo !== 'viaje' && e.tipo !== 'region')
      .sort((a, b) => (a.dia || 0) - (b.dia || 0));
    const regions = tripEntries.filter(e => e.tipo === 'region');
    trips.push({ header, days, regions, created: header ? header.created_at : tripEntries[0].created_at });
  }
  trips.sort((a, b) => new Date(b.created) - new Date(a.created));

  // Merge trips y standalone en orden cronológico
  const allItems = [];
  for (const trip of trips) allItems.push({ type: 'trip', data: trip, date: new Date(trip.created) });
  for (const e of standalone) allItems.push({ type: 'standalone', data: e, date: new Date(e.created_at) });
  allItems.sort((a, b) => b.date - a.date);

  let html = '';

  for (const item of allItems) {
    if (item.type === 'trip') {
      const trip = item.data;
      const time = item.date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
                   item.date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

      html += `<div class="elog-trip">`;
      html += `<div class="elog-trip-header">`;
      html += `<span class="elog-trip-icon">🚶</span>`;
      html += `<span class="elog-trip-title">${trip.header ? trip.header.titulo : 'Viaje'}</span>`;
      html += `<span class="elog-trip-time">${time}</span>`;
      html += `</div>`;

      if (trip.header && trip.header.descripcion) {
        html += `<div class="elog-trip-summary">${trip.header.descripcion}</div>`;
      }

      // Regiones descubiertas
      for (const r of trip.regions) {
        html += `<div class="elog-day"><span class="elog-day-icon">🏔</span> Nueva región: <strong>${r.titulo}</strong></div>`;
      }

      // Días
      for (const day of trip.days) {
        const icon = icons[day.tipo] || '❓';
        const tierDot = day.tier ? `<span class="elog-tier-dot" style="background:${tierColors[day.tier - 1] || '#888'}"></span>` : '';
        const rollTag = day.roll ? `<span class="elog-roll">d100: ${day.roll}</span>` : '';

        html += `<div class="elog-day">`;
        html += `<div class="elog-day-header">`;
        html += `${tierDot}<span class="elog-day-title">${day.titulo}</span>${rollTag}`;
        html += `</div>`;
        if (day.descripcion && day.tipo !== 'nada') {
          const desc = day.descripcion.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
          html += `<div class="elog-day-result"><span class="elog-day-icon">${icon}</span> ${desc}</div>`;
        } else {
          html += `<div class="elog-day-result elog-day-nada">Sin novedad</div>`;
        }
        html += `</div>`;
      }

      html += `</div>`;
    } else {
      const e = item.data;
      const icon = icons[e.tipo] || '❓';
      const time = item.date.toLocaleDateString('es', { day: 'numeric', month: 'short' }) + ' ' +
                   item.date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      html += `<div class="elog-standalone">`;
      html += `<span class="elog-day-icon">${icon}</span> `;
      html += `<strong>${e.titulo}</strong>`;
      if (e.descripcion) html += ` — ${e.descripcion}`;
      html += `<span class="elog-trip-time" style="float:right">${time}</span>`;
      html += `</div>`;
    }
  }

  list.innerHTML = html;
}

// =====================================================================
// PARTY TOKEN — Sistema de movimiento del grupo
// Marcador draggeable + modo viaje con waypoints + pathfinding.
// =====================================================================

let partyPosition = null; // { q, r }
let partyMoveMode = false;
let partySpeed = 24;
let partyRevealRadius = 1;
let partyTotalDays = 0;
let partyWaypoints = []; // [{ q, r }] — waypoints del viaje planeado
let partyPath = [];      // [{ q, r }] — path completo calculado (hex a hex)
let partyDragging = false;
const PARTY_STORAGE_KEY = () => `${CONFIG.SLUG}_party`;

function loadPartyData() {
  try {
    const stored = localStorage.getItem(PARTY_STORAGE_KEY());
    if (stored) {
      const d = JSON.parse(stored);
      partyPosition = d.position || null;
      partySpeed = d.speed || 24;
      partyRevealRadius = d.revealRadius ?? 1;
      partyTotalDays = d.totalDays || 0;
    }
  } catch (e) { /* ignore */ }
}

function savePartyData() {
  try {
    localStorage.setItem(PARTY_STORAGE_KEY(), JSON.stringify({
      position: partyPosition,
      speed: partySpeed,
      revealRadius: partyRevealRadius,
      totalDays: partyTotalDays,
    }));
  } catch (e) { /* ignore */ }
}

/**
 * Renderiza el marcador del party en el SVG (siempre visible, draggeable).
 */
function renderPartyToken() {
  if (!mapSvgEl || !partyPosition) return;
  const ns = 'http://www.w3.org/2000/svg';

  let g = mapSvgEl.querySelector('#party-token');
  if (!g) {
    g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'party-token');
    g.style.cursor = 'grab';
    mapSvgEl.appendChild(g);
  }

  const center = HexGrid.hexCenter(partyPosition.q, partyPosition.r);
  g.innerHTML = '';

  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', center.x);
  circle.setAttribute('cy', center.y);
  circle.setAttribute('r', '2.8');
  circle.setAttribute('fill', '#ffbf00');
  circle.setAttribute('stroke', '#000');
  circle.setAttribute('stroke-width', '0.5');
  circle.setAttribute('filter', 'drop-shadow(0 0 2px rgba(255,191,0,0.8))');
  g.appendChild(circle);

  const icon = document.createElementNS(ns, 'text');
  icon.setAttribute('x', center.x);
  icon.setAttribute('y', center.y + 0.6);
  icon.setAttribute('text-anchor', 'middle');
  icon.setAttribute('dominant-baseline', 'middle');
  icon.setAttribute('fill', '#000');
  icon.setAttribute('font-size', '2.8');
  icon.textContent = '⚑';
  g.appendChild(icon);
}

let partyDragBound = false;

function initPartyDrag() {
  if (!mapSvgEl || partyDragBound) return;
  partyDragBound = true;

  // Mousedown en el token
  mapSvgEl.addEventListener('mousedown', (e) => {
    if (partyMoveMode) return;
    const g = mapSvgEl.querySelector('#party-token');
    if (!g || !g.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
    partyDragging = true;
    g.style.cursor = 'grabbing';
  });

  // Mousemove: solo actualizar posicion SVG, sin re-render completo
  let lastDragKey = '';
  window.addEventListener('mousemove', (e) => {
    if (!partyDragging) return;
    const svgPt = screenToSvg(e.clientX, e.clientY);
    const hex = HexGrid.svgToHex(svgPt.x, svgPt.y);
    const key = HexGrid.hexKey(hex.q, hex.r);
    if (key === lastDragKey) return; // No actualizar si mismo hex
    lastDragKey = key;
    partyPosition = { q: hex.q, r: hex.r };
    // Mover elementos existentes sin recrear
    const center = HexGrid.hexCenter(hex.q, hex.r);
    const g = mapSvgEl.querySelector('#party-token');
    if (!g) return;
    const circle = g.querySelector('circle');
    const text = g.querySelector('text');
    if (circle) { circle.setAttribute('cx', center.x); circle.setAttribute('cy', center.y); }
    if (text) { text.setAttribute('x', center.x); text.setAttribute('y', center.y + 0.6); }
  });

  window.addEventListener('mouseup', () => {
    if (!partyDragging) return;
    partyDragging = false;
    lastDragKey = '';
    const g = mapSvgEl.querySelector('#party-token');
    if (g) g.style.cursor = 'grab';
    savePartyData();
  });
}

// --- Pathfinding: BFS camino más corto entre dos hexes ---

function hexBFS(startQ, startR, endQ, endR) {
  const startKey = HexGrid.hexKey(startQ, startR);
  const endKey = HexGrid.hexKey(endQ, endR);
  if (startKey === endKey) return [{ q: startQ, r: startR }];

  const visited = new Set([startKey]);
  const parent = {};
  const queue = [{ q: startQ, r: startR }];

  while (queue.length) {
    const cur = queue.shift();
    const neighbors = HexGrid.hexNeighbors(cur.q, cur.r);
    for (const n of neighbors) {
      const nk = HexGrid.hexKey(n.q, n.r);
      if (visited.has(nk)) continue;
      visited.add(nk);
      parent[nk] = HexGrid.hexKey(cur.q, cur.r);
      if (nk === endKey) {
        // Reconstruir path
        const path = [{ q: endQ, r: endR }];
        let k = nk;
        while (parent[k]) {
          const p = HexGrid.parseHexKey(parent[k]);
          path.unshift(p);
          k = parent[k];
        }
        return path;
      }
      queue.push(n);
    }
  }
  return []; // no path found
}

/**
 * Calcula el path completo a partir de party position + waypoints.
 */
function computePartyPath() {
  if (!partyPosition) { partyPath = []; return; }
  if (!partyWaypoints.length) { partyPath = []; return; }

  const points = [partyPosition, ...partyWaypoints];
  const fullPath = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const segment = hexBFS(points[i - 1].q, points[i - 1].r, points[i].q, points[i].r);
    // Skip first hex of segment (it's the end of previous segment)
    for (let j = 1; j < segment.length; j++) {
      fullPath.push(segment[j]);
    }
  }

  partyPath = fullPath;
}

/**
 * Renderiza el path planeado y waypoints en el SVG.
 */
function renderPartyPath() {
  if (!mapSvgEl) return;
  const ns = 'http://www.w3.org/2000/svg';

  let g = mapSvgEl.querySelector('#party-path-layer');
  if (!g) {
    g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'party-path-layer');
    g.style.pointerEvents = 'none';
    mapSvgEl.appendChild(g);
  }
  g.innerHTML = '';

  if (!partyPath.length) return;

  // Dibujar hexes del path (skip el primero, que es la posición actual)
  for (let i = 1; i < partyPath.length; i++) {
    const h = partyPath[i];
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', HexGrid.hexPolygonPoints(h.q, h.r));
    poly.setAttribute('fill', 'rgba(255, 191, 0, 0.2)');
    poly.setAttribute('stroke', '#ffbf00');
    poly.setAttribute('stroke-width', '0.2');
    g.appendChild(poly);
  }

  // Linea de path (centro a centro)
  if (partyPath.length >= 2) {
    const line = document.createElementNS(ns, 'polyline');
    const pts = partyPath.map(h => {
      const c = HexGrid.hexCenter(h.q, h.r);
      return `${c.x},${c.y}`;
    }).join(' ');
    line.setAttribute('points', pts);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#ffbf00');
    line.setAttribute('stroke-width', '0.4');
    line.setAttribute('stroke-dasharray', '1,0.5');
    line.setAttribute('opacity', '0.7');
    g.appendChild(line);
  }

  // Waypoints (diamantes)
  for (const wp of partyWaypoints) {
    const c = HexGrid.hexCenter(wp.q, wp.r);
    const diamond = document.createElementNS(ns, 'rect');
    diamond.setAttribute('x', c.x - 1);
    diamond.setAttribute('y', c.y - 1);
    diamond.setAttribute('width', '2');
    diamond.setAttribute('height', '2');
    diamond.setAttribute('fill', '#ff6b35');
    diamond.setAttribute('stroke', '#000');
    diamond.setAttribute('stroke-width', '0.3');
    diamond.setAttribute('transform', `rotate(45 ${c.x} ${c.y})`);
    g.appendChild(diamond);
  }
}

/**
 * Calcula el resumen del viaje planeado.
 */
function computeTravelSummary() {
  if (partyPath.length < 2) return null;

  let totalDays = 0;
  const biomes = {};

  for (let i = 1; i < partyPath.length; i++) {
    const h = partyPath[i];
    const ctx = detectHexContext(h.q, h.r);
    const tt = HexExplore.travelTime(ctx.biome, partySpeed);
    totalDays += tt.days;
    const bName = ctx.biome || 'Desconocido';
    biomes[bName] = (biomes[bName] || 0) + 1;
  }

  return {
    hexCount: partyPath.length - 1,
    totalDays,
    biomes,
  };
}

function updatePartyPanel() {
  const summary = computeTravelSummary();
  const summaryEl = document.getElementById('party-travel-summary');
  const travelBtn = document.getElementById('btn-party-travel');
  const cancelBtn = document.getElementById('btn-party-cancel');

  if (!summaryEl) return;

  if (!summary) {
    summaryEl.innerHTML = '<span style="color:var(--on-surface-variant)">Click en el mapa para agregar destino</span>';
    if (travelBtn) travelBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    return;
  }

  const biomeSummary = Object.entries(summary.biomes)
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');

  summaryEl.innerHTML = `
    <div><strong>${summary.hexCount}</strong> hexes — <strong>${HexExplore.formatTravelTime({ days: summary.totalDays, fullDays: Math.floor(summary.totalDays), hours: Math.round((summary.totalDays - Math.floor(summary.totalDays)) * 24) })}</strong></div>
    <div style="font-size:0.7rem;color:var(--on-surface-variant);margin-top:2px">${biomeSummary}</div>
  `;
  if (travelBtn) travelBtn.style.display = '';
  if (cancelBtn) cancelBtn.style.display = '';
}

function addWaypoint(q, r) {
  // No agregar si es la posicion actual o el ultimo waypoint
  const last = partyWaypoints.length ? partyWaypoints[partyWaypoints.length - 1] : partyPosition;
  if (last && last.q === q && last.r === r) return;

  partyWaypoints.push({ q, r });
  computePartyPath();
  renderPartyPath();
  updatePartyPanel();
}

function removeWaypoint(idx) {
  partyWaypoints.splice(idx, 1);
  computePartyPath();
  renderPartyPath();
  updatePartyPanel();
}

function cancelTravel() {
  partyWaypoints = [];
  partyPath = [];
  renderPartyPath();
  updatePartyPanel();
}

/**
 * Ejecuta el viaje planeado hex por hex, tirando encuentros por día.
 */
function executeTravel() {
  if (partyPath.length < 2) return;
  if (typeof HexExplore === 'undefined') return;

  const pathToTravel = partyPath.slice(1);
  const allRevealedKeys = [];
  const tripId = 'trip_' + Date.now();
  const startDay = Math.ceil(partyTotalDays) || 1;

  // --- Fase 1: Construir timeline de días ---
  // Cada hex tiene un tiempo de viaje. Acumulamos tiempo y cada vez que
  // cruzamos un límite de día, registramos un encuentro.
  let dayAccum = partyTotalDays - Math.floor(partyTotalDays); // fraccion del dia actual
  const dayEntries = []; // { dia, hexKey, biome, tier, encounter }

  for (const h of pathToTravel) {
    const ctx = detectHexContext(h.q, h.r);
    const tt = HexExplore.travelTime(ctx.biome, partySpeed);
    const hexBiome = ctx.biome;
    const hexKey = HexGrid.hexKey(h.q, h.r);

    // Tier del hex
    let tierIdx = 0;
    if (typeof HexDifficulty !== 'undefined') {
      const diff = HexDifficulty.getDifficulty(h.q, h.r);
      tierIdx = diff.tier - 1;
    }

    let timeLeft = tt.days;

    while (timeLeft > 0) {
      const timeUntilNextDay = 1.0 - dayAccum;

      if (timeLeft >= timeUntilNextDay) {
        // Completamos un día en este hex → tirar encuentro
        dayAccum = 0;
        timeLeft -= timeUntilNextDay;
        partyTotalDays += timeUntilNextDay;

        const currentDay = Math.ceil(partyTotalDays);
        const encounter = HexExplore.explorar(hexBiome, tierIdx);
        dayEntries.push({
          dia: currentDay,
          hexKey,
          biome: hexBiome,
          tier: tierIdx + 1,
          encounter,
        });
      } else {
        // No alcanza para completar el día, acumular y pasar al siguiente hex
        dayAccum += timeLeft;
        partyTotalDays += timeLeft;
        timeLeft = 0;
      }
    }

    // Mover party
    partyPosition = { q: h.q, r: h.r };

    // Revelar fog en radio
    const hexesToReveal = HexGrid.hexesInRadius(h.q, h.r, partyRevealRadius);
    for (const rh of hexesToReveal) {
      if (!isHexRevealed(rh.q, rh.r)) {
        revealHex(rh.q, rh.r, false);
        allRevealedKeys.push(HexGrid.hexKey(rh.q, rh.r));
      }
    }
  }

  // --- Fase 2: Persistir ---
  saveFogData();
  savePartyData();
  if (allRevealedKeys.length) {
    saveFogToSupabase(allRevealedKeys);
  }
  renderFog();
  renderPartyToken();
  initPartyDrag();

  // --- Fase 3: Guardar log del viaje ---
  const endDay = Math.ceil(partyTotalDays);
  const totalDays = endDay - startDay + (dayEntries.length > 0 ? 0 : 1);
  const logEntries = [];

  // Header del viaje
  logEntries.push({
    tipo: 'viaje',
    titulo: `Viaje — Día ${startDay} al ${endDay}`,
    descripcion: `${pathToTravel.length} hexes, ${dayEntries.length} días de viaje`,
    hex_key: HexGrid.hexKey(partyPosition.q, partyPosition.r),
    bioma: null,
    roll: null,
    trip_id: tripId,
    tier: null,
    dia: null,
  });

  // Entrada por cada día
  for (const de of dayEntries) {
    const enc = de.encounter;
    logEntries.push({
      tipo: enc.tipo === 'nada' ? 'nada' : enc.tipo,
      titulo: `Día ${de.dia} — ${de.biome || 'Desconocido'} (Tier ${de.tier})`,
      descripcion: enc.tipo === 'nada' ? 'Sin novedad' : enc.resultado,
      hex_key: de.hexKey,
      bioma: de.biome,
      roll: enc.roll,
      trip_id: tripId,
      tier: de.tier,
      dia: de.dia,
    });
  }

  logExplorationBatch(logEntries);

  // --- Fase 4: Mostrar toast del primer encuentro relevante ---
  const firstEvent = dayEntries.find(de => de.encounter.tipo !== 'nada');
  if (firstEvent) {
    const msg = `Día ${firstEvent.dia}: ${firstEvent.encounter.resultado}`;
    showEncounterToast({
      ...firstEvent.encounter,
      resultado: msg,
    });
  }

  // --- Fase 5: Regiones nuevas + banners ---
  if (allRevealedKeys.length) {
    loadDiscoveredRegions();
    const newRegions = new Set();
    for (const key of allRevealedKeys) {
      const { q, r } = HexGrid.parseHexKey(key);
      const ctx = detectHexContext(q, r);
      if (ctx.region && !discoveredRegions.has(ctx.region)) {
        newRegions.add(ctx.region);
      }
    }
    if (newRegions.size > 0) {
      for (const region of newRegions) {
        discoveredRegions.add(region);
        logExploration('region', region, null, allRevealedKeys[0], null, null, tripId);
      }
      saveDiscoveredRegions();
      showRegionBanner([...newRegions][0]);
    }
  }

  // Limpiar path
  partyWaypoints = [];
  partyPath = [];
  renderPartyPath();
  updatePartyPanel();

  // Actualizar dia en panel
  const dayEl = document.getElementById('party-day-count');
  if (dayEl) dayEl.textContent = Math.ceil(partyTotalDays) || 1;

  // Abrir diario automáticamente para mostrar el viaje
  if (dayEntries.length > 0 && !explorationLogOpen) {
    toggleExplorationLog();
  } else if (explorationLogOpen) {
    renderExplorationLog();
  }
}

function togglePartyMoveMode() {
  partyMoveMode = !partyMoveMode;
  const btn = document.getElementById('btn-party-move');
  if (btn) btn.classList.toggle('active', partyMoveMode);

  const panel = document.getElementById('party-panel');
  if (panel) panel.style.display = partyMoveMode ? '' : 'none';

  if (!partyMoveMode) {
    cancelTravel();
    if (mapSvgEl) mapSvgEl.style.cursor = '';
  } else {
    if (mapSvgEl) mapSvgEl.style.cursor = 'crosshair';
  }
}

function initPartySystem() {
  if (!mapSvgEl || typeof HexGrid === 'undefined') return;
  if (!isDM()) return;

  loadPartyData();
  if (partyPosition) {
    renderPartyToken();
    initPartyDrag();
  }

  // Panel del party
  const wrapper = document.querySelector('.map-wrapper');
  if (wrapper && !document.getElementById('party-panel')) {
    const panel = document.createElement('div');
    panel.id = 'party-panel';
    panel.className = 'party-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="fog-brush-title">Party</div>
      <div class="fog-brush-row">
        <label class="hex-radius-label">
          Velocidad <span id="party-speed-value">${partySpeed}</span> mi/d
          <input type="range" id="party-speed-slider" min="6" max="96" value="${partySpeed}" step="6"
            oninput="partySpeed=+this.value;document.getElementById('party-speed-value').textContent=this.value;savePartyData()">
        </label>
      </div>
      <div class="fog-brush-row">
        <label class="hex-radius-label">
          Radio <span id="party-radius-value">${partyRevealRadius}</span>
          <input type="range" id="party-radius-slider" min="0" max="3" value="${partyRevealRadius}"
            oninput="partyRevealRadius=+this.value;document.getElementById('party-radius-value').textContent=this.value;savePartyData()">
        </label>
      </div>
      <div class="fog-brush-row">
        <span class="travel-day-counter">Día <span id="party-day-count">${Math.ceil(partyTotalDays) || 1}</span></span>
        <button class="fog-action-btn" onclick="partyTotalDays=0;savePartyData();document.getElementById('party-day-count').textContent='1'" title="Resetear contador">↺</button>
      </div>
      <div class="party-travel-summary" id="party-travel-summary">
        <span style="color:var(--on-surface-variant)">Click en el mapa para agregar destino</span>
      </div>
      <div class="fog-brush-row" style="margin-top:6px">
        <button class="fog-action-btn fog-apply" id="btn-party-travel" onclick="executeTravel()" style="display:none;flex:1">Viajar</button>
        <button class="fog-action-btn fog-discard" id="btn-party-cancel" onclick="cancelTravel()" style="display:none;flex:1">Cancelar</button>
      </div>
    `;
    wrapper.appendChild(panel);
  }

  // Click para agregar waypoint (modo viaje)
  mapSvgEl.addEventListener('click', (e) => {
    if (!partyMoveMode) return;
    if (!partyPosition) {
      // Colocar party por primera vez
      const svgPt = screenToSvg(e.clientX, e.clientY);
      const hex = HexGrid.svgToHex(svgPt.x, svgPt.y);
      partyPosition = { q: hex.q, r: hex.r };
      savePartyData();
      renderPartyToken();
      initPartyDrag();
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    const hex = HexGrid.svgToHex(svgPt.x, svgPt.y);
    addWaypoint(hex.q, hex.r);
  });

  // Click derecho para quitar ultimo waypoint
  mapSvgEl.addEventListener('contextmenu', (e) => {
    if (!partyMoveMode || !partyWaypoints.length) return;
    e.preventDefault();
    e.stopPropagation();
    removeWaypoint(partyWaypoints.length - 1);
  });
}

// =====================================================================
// FOG BRUSH TOOLS — Fase 4 Hexplorer
// Panel de brochas para que el DM revele/oculte hexes.
// Cambios se acumulan como preview hasta que el DM hace "Aplicar".
// =====================================================================

let hexDebugMode = false;  // reusado: true = modo brocha activo
let fogBrushType = 'reveal'; // 'reveal' o 'hide'
let fogPendingChanges = {}; // { "q,r": 'reveal'|'hide' } — cambios sin aplicar
let fogBrushDragging = false;

function toggleFogBrush() {
  hexDebugMode = !hexDebugMode;
  const panel = document.getElementById('fog-brush-panel');
  if (panel) panel.style.display = hexDebugMode ? '' : 'none';

  const g = mapSvgEl && mapSvgEl.querySelector('#hex-debug-layer');
  if (g && !hexDebugMode) g.innerHTML = '';
  if (mapSvgEl) mapSvgEl.style.cursor = hexDebugMode ? 'crosshair' : '';

  // Al desactivar, descartar cambios pendientes
  if (!hexDebugMode && Object.keys(fogPendingChanges).length) {
    discardFogChanges();
  }
}

function setFogBrush(type) {
  fogBrushType = type;
  document.querySelectorAll('.fog-brush-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.brush === type);
  });
}

function getFogBrushRadius() {
  const slider = document.getElementById('hex-radius-slider');
  return slider ? parseInt(slider.value, 10) : 0;
}

/**
 * Pinta hexes con la brocha actual (sin guardar — solo preview).
 */
function paintFogBrush(q, r) {
  const radius = getFogBrushRadius();
  const hexes = HexGrid.hexesInRadius(q, r, radius);

  for (const h of hexes) {
    const key = HexGrid.hexKey(h.q, h.r);
    const currentlyRevealed = isHexRevealed(h.q, h.r);
    const alreadyPending = fogPendingChanges[key];

    // Solo agregar si es un cambio real
    if (fogBrushType === 'reveal' && !currentlyRevealed && alreadyPending !== 'reveal') {
      fogPendingChanges[key] = 'reveal';
    } else if (fogBrushType === 'hide' && currentlyRevealed && alreadyPending !== 'hide') {
      fogPendingChanges[key] = 'hide';
    }
  }

  renderFogPreview();
  updateFogPendingCount();
}

/**
 * Renderiza el preview de cambios pendientes sobre el mapa.
 */
function renderFogPreview() {
  if (!mapSvgEl) return;
  const ns = 'http://www.w3.org/2000/svg';
  let g = mapSvgEl.querySelector('#hex-debug-layer');
  if (!g) return;

  g.innerHTML = '';

  for (const [key, action] of Object.entries(fogPendingChanges)) {
    const { q, r } = HexGrid.parseHexKey(key);
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', HexGrid.hexPolygonPoints(q, r));
    if (action === 'reveal') {
      poly.setAttribute('fill', 'rgba(80, 220, 120, 0.35)');
      poly.setAttribute('stroke', '#50dc78');
    } else {
      poly.setAttribute('fill', 'rgba(220, 80, 80, 0.35)');
      poly.setAttribute('stroke', '#dc5050');
    }
    poly.setAttribute('stroke-width', '0.25');
    g.appendChild(poly);
  }
}

function updateFogPendingCount() {
  const count = Object.keys(fogPendingChanges).length;
  const el = document.getElementById('fog-pending-count');
  if (el) el.textContent = count > 0 ? `${count} hex${count > 1 ? 'es' : ''}` : '';
  const actions = document.getElementById('fog-pending-actions');
  if (actions) actions.style.display = count > 0 ? '' : 'none';
}

/**
 * Aplica los cambios pendientes al fog (guarda en localStorage).
 */
function applyFogChanges() {
  if (!Object.keys(fogPendingChanges).length) return;

  // Detectar nuevas regiones descubiertas (para banner)
  const allChangedKeys = Object.keys(fogPendingChanges);
  const revealedKeys = [];
  for (const [key, action] of Object.entries(fogPendingChanges)) {
    const { q, r } = HexGrid.parseHexKey(key);
    if (action === 'reveal') {
      revealHex(q, r, false);
      revealedKeys.push(key);
    } else {
      hideHex(q, r, false);
    }
  }
  saveFogData();
  saveFogToSupabase(allChangedKeys); // async, no-blocking
  fogPendingChanges = {};
  renderFog();
  renderFogPreview();
  updateFogPendingCount();

  // Trigger exploracion para hexes revelados
  if (revealedKeys.length > 0) {
    triggerExploration(revealedKeys);
  }
}

/**
 * Descarta los cambios pendientes.
 */
function discardFogChanges() {
  fogPendingChanges = {};
  renderFogPreview();
  updateFogPendingCount();
}

// =====================================================================
// MAP TOOLS BAR — Barra de herramientas superior izquierda
// =====================================================================

function initMapToolsBar() {
  const bar = document.getElementById('map-tools-bar');
  if (!bar) return;
  const dm = isDM();

  let html = '';

  if (dm) {
    html += `<button class="map-tool-btn" id="btn-party-move" onclick="togglePartyMoveMode()" title="Modo viaje">⚑</button>`;
    html += `<button class="map-tool-btn" id="btn-fog-brush" onclick="toggleFogBrush()" title="Herramientas de niebla">⬡</button>`;
  }

  html += `<button class="map-tool-btn" id="btn-exploration-log" onclick="toggleExplorationLog()" title="Diario de exploración">📜</button>`;

  if (dm) {
    html += `<button class="map-tool-btn" id="btn-add-marker" onclick="toggleMarkerMode()" title="Añadir Lugar" draggable="true" ondragstart="onMarkerDragStart(event)">📍</button>`;
  }

  bar.innerHTML = html;
}

function initFogBrushTools() {
  if (!mapSvgEl || typeof HexGrid === 'undefined') return;
  if (!isDM()) return;

  const ns = 'http://www.w3.org/2000/svg';

  // Capa de preview (reusar hex-debug-layer)
  let g = mapSvgEl.querySelector('#hex-debug-layer');
  if (!g) {
    g = document.createElementNS(ns, 'g');
    g.setAttribute('id', 'hex-debug-layer');
    g.style.pointerEvents = 'none';
    mapSvgEl.appendChild(g);
  }

  // Panel de brochas (insertado en map-wrapper)
  const wrapper = document.querySelector('.map-wrapper');
  if (wrapper && !document.getElementById('fog-brush-panel')) {
    const panel = document.createElement('div');
    panel.id = 'fog-brush-panel';
    panel.className = 'fog-brush-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="fog-brush-title">Niebla</div>
      <div class="fog-brush-row">
        <button class="fog-brush-btn active" data-brush="reveal" onclick="setFogBrush('reveal')">
          <span class="fog-brush-icon" style="background:#50dc78"></span> Revelar
        </button>
        <button class="fog-brush-btn" data-brush="hide" onclick="setFogBrush('hide')">
          <span class="fog-brush-icon" style="background:#dc5050"></span> Ocultar
        </button>
      </div>
      <div class="fog-brush-row">
        <label class="hex-radius-label" title="Radio">
          Radio <span id="hex-radius-value">0</span>
          <input type="range" id="hex-radius-slider" min="0" max="5" value="0"
            oninput="document.getElementById('hex-radius-value').textContent = this.value">
        </label>
      </div>
      <div class="fog-brush-row fog-pending" id="fog-pending-actions" style="display:none">
        <span id="fog-pending-count"></span>
        <button class="fog-action-btn fog-apply" onclick="applyFogChanges()">Aplicar</button>
        <button class="fog-action-btn fog-discard" onclick="discardFogChanges()">Descartar</button>
      </div>
      <div class="fog-brush-row">
        <button class="fog-action-btn fog-reset" onclick="resetFog()">Reset todo</button>
      </div>
    `;
    wrapper.appendChild(panel);
  }

  // --- Interaccion: hover highlight ---
  let lastHoverKey = '';
  mapSvgEl.addEventListener('mousemove', (e) => {
    if (!hexDebugMode || mapDragging) return;
    const svgPt = screenToSvg(e.clientX, e.clientY);
    const hex = HexGrid.svgToHex(svgPt.x, svgPt.y);
    const key = HexGrid.hexKey(hex.q, hex.r);

    // Drag: pintar mientras se mueve con boton presionado
    if (fogBrushDragging && key !== lastHoverKey) {
      paintFogBrush(hex.q, hex.r);
    }
    lastHoverKey = key;
  });

  // --- Interaccion: click para pintar ---
  mapSvgEl.addEventListener('mousedown', (e) => {
    if (!hexDebugMode || markerMode || e.button !== 0) return;
    e.preventDefault();
    fogBrushDragging = true;

    const svgPt = screenToSvg(e.clientX, e.clientY);
    const hex = HexGrid.svgToHex(svgPt.x, svgPt.y);
    paintFogBrush(hex.q, hex.r);
  });

  window.addEventListener('mouseup', () => {
    fogBrushDragging = false;
  });

  // --- Toggle boton activo ---
  const brushBtn = document.getElementById('btn-fog-brush');
  if (brushBtn) {
    const observer = new MutationObserver(() => {
      brushBtn.classList.toggle('active', hexDebugMode);
    });
  }
}

// =====================================================================
// CAMPAIGN SELECTOR — Pantalla de selección de campaña (post-login)
// =====================================================================

async function showCampaignSelector() {
  const memberships = window._pendingMemberships || [];
  const accessToken = window._pendingAccessToken || '';

  // Fetch campaign names
  const campaignNames = {};
  for (const m of memberships) {
    campaignNames[m.campaign] = await fetchCampaignName(m.campaign, accessToken);
  }

  const loginScreen = document.getElementById('login-screen');
  loginScreen.innerHTML = `
    <div class="stone-wall"></div>
    <div class="frame-outer" style="max-width:500px">
      <div class="parchment">
        <div class="login-logo" style="font-size:1.6rem;margin-bottom:4px">&#9876;</div>
        <div class="login-subtitle" style="margin-bottom:12px">Elige tu campaña</div>
        <div class="login-divider"></div>
        <div id="campaign-cards" style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
          ${memberships.map(m => `
            <button class="btn-login campaign-card" data-slug="${m.campaign}" data-role="${m.role}" data-username="${m.username || ''}" style="text-align:left;padding:14px 18px">
              <div style="font-size:1.1rem;font-weight:600">${campaignNames[m.campaign]}</div>
              <div style="font-size:.8rem;opacity:.7;margin-top:4px">${m.role === 'dm' ? 'Dungeon Master' : 'Jugador'}</div>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.campaign-card').forEach(card => {
    card.addEventListener('click', () => {
      const slug = card.dataset.slug;
      const role = card.dataset.role;
      const username = card.dataset.username;
      const name = campaignNames[slug];
      selectCampaign(slug, name, role, username);
      if (role === 'dm') sessionStorage.setItem('dm_password', 'jwt');
      window._pendingMemberships = null;
      window._pendingAccessToken = null;
      bootApp();
    });
  });
}

// =====================================================================
// CREATE CAMPAIGN — Pantalla de creación de nueva campaña
// =====================================================================

function showCreateCampaign() {
  const loginScreen = document.getElementById('login-screen');
  loginScreen.innerHTML = `
    <div class="stone-wall"></div>
    <div class="frame-outer" style="max-width:420px">
      <div class="parchment">
        <div class="login-logo" style="font-size:1.6rem;margin-bottom:4px">&#9876;</div>
        <div class="login-subtitle" style="margin-bottom:12px">Crear nueva campaña</div>
        <div class="login-divider"></div>
        <form id="create-campaign-form" autocomplete="off" style="margin-top:16px">
          <input type="text" id="cc-campaign-name" placeholder="Nombre de la campaña" required autofocus>
          <input type="text" id="cc-username" placeholder="Tu nombre de DM" required>
          <input type="password" id="cc-password" placeholder="Contraseña" minlength="6" required>
          <button type="submit" class="btn-login">Crear campaña</button>
        </form>
        <div class="login-error" id="cc-error"></div>
        <button onclick="window.location.reload()" style="background:none;border:none;color:var(--on-surface-variant);cursor:pointer;margin-top:12px;font-size:.85rem">&larr; Volver al login</button>
      </div>
    </div>
  `;

  document.getElementById('create-campaign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('cc-error');
    const campaignName = document.getElementById('cc-campaign-name').value.trim();
    const username = document.getElementById('cc-username').value.trim();
    const password = document.getElementById('cc-password').value;

    if (!campaignName || !username || !password) return;
    if (password.length < 6) {
      errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }

    errEl.textContent = 'Creando campaña...';
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/create-campaign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignName, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        errEl.textContent = data.error || 'Error al crear campaña';
        return;
      }

      // Login automático
      const result = await login(username, password);
      if (result && result !== 'no_access') {
        bootApp();
      } else {
        errEl.textContent = 'Campaña creada. Inicia sesión manualmente.';
      }
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}
