/* =============================================================
   HALO — Asistente de Campaña (Chat IA)
   planear.js — Chat UI con streaming, localStorage, botones rápidos
   Se abre dentro de util-workspace (pestaña Utilidades)
   ============================================================= */

const CHAT_STORAGE_KEY = () => `${CONFIG.SLUG}-chat-history`;
const CHAT_EDGE_FN = `${CONFIG.SUPABASE_URL}/functions/v1/chat`;

let chatMessages = []; // [{role, content}]
let isStreaming = false;
const undoStack = new Map(); // changeId -> { table, sbid, previousFields }

// ── QUICK PROMPTS ────────────────────────────────────────────
const QUICK_PROMPTS = {
  prep:      'Quiero preparar la próxima sesión.',
  npc:       'Genera un NPC interesante para la campaña actual, que encaje con las quests activas o la ciudad donde está el party.',
  encounter: 'Dame una idea de encuentro para la próxima sesión, considerando las quests activas y la situación actual del party.',
  update:    'Ayúdame a identificar qué registros de la campaña debo actualizar después de la última sesión jugada.',
};

// ── OPEN (inyecta en util-workspace) ─────────────────────────
function openAsistente() {
  const ws = document.getElementById('util-workspace');
  ws.style.display = '';
  ws.innerHTML = `
    <div class="util-panel chat-panel">
      <div class="util-panel-header">
        <h3 class="util-title">&#9876; Asistente de Campaña</h3>
        <div class="chat-header-actions">
          <button class="btn btn-sm" onclick="clearChat()">Limpiar</button>
          <button class="btn btn-sm" onclick="closeUtilWorkspace()">&#10005; Cerrar</button>
        </div>
      </div>
      <div class="chat-quick-actions" id="chat-quick-actions">
        <button class="btn-quick" onclick="sendQuick('prep')">📜 Preparar sesión</button>
        <button class="btn-quick" onclick="sendQuick('npc')">👤 Generar NPC</button>
        <button class="btn-quick" onclick="sendQuick('encounter')">⚔ Idea de encuentro</button>
        <button class="btn-quick" onclick="sendQuick('update')">🔄 Actualizar BDs</button>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-bar">
        <textarea id="chat-input" placeholder="Pregunta sobre tu campaña..." rows="1"></textarea>
        <button class="btn" id="chat-send" onclick="sendMessage()">Enviar</button>
      </div>
    </div>
  `;
  initPlanear();
  ws.scrollIntoView({ behavior: 'smooth' });
}

// ── CAMPAIGN CONTEXT (enriquecido) ───────────────────────────
function buildCampaignContext() {
  const parts = [];

  // Party
  const pjs = (DATA.players || []).filter(p => p.es_pj);
  if (pjs.length) {
    parts.push('## Party');
    pjs.forEach(p => {
      let line = `- ${p.nombre} (${p.raza} ${p.clase}, nivel ${p.nivel || '?'}) — Jugador: ${p.jugador || '?'}`;
      line += (p.hp_maximo ? ` | HP: ${p.hp_maximo}` : '') + (p.ac ? ` | AC: ${p.ac}` : '');
      // Enriquecer con datos de D&D Beyond si están disponibles
      const ddb = p.ddb_data;
      if (ddb) {
        if (ddb.abilities) {
          const abs = Object.entries(ddb.abilities).map(([k, v]) => `${k}:${v.total}(${v.mod >= 0 ? '+' : ''}${v.mod})`).join(', ');
          line += ` | Stats: ${abs}`;
        }
        if (ddb.spells && ddb.spells.length) {
          const spellNames = ddb.spells.map(s => s.name).join(', ');
          line += `\n  Hechizos: ${spellNames}`;
        }
        if (ddb.equipment && ddb.equipment.length) {
          const equipped = ddb.equipment.filter(e => e.equipped).map(e => e.name).join(', ');
          if (equipped) line += `\n  Equipamiento: ${equipped}`;
        }
      }
      parts.push(line);
    });
  }

  // Últimas sesiones CON contenido completo (últimas 3)
  const notas = (DATA.notas_dm || [])
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .slice(0, 3);
  if (notas.length) {
    parts.push('\n## Últimas sesiones (detalle completo)');
    notas.forEach(n => {
      parts.push(`\n### ${n.nombre} (${n.fecha || 'sin fecha'})`);
      if (n.resumen) parts.push(`**Resumen:** ${n.resumen}`);
      if (n.jugadores_presentes) parts.push(`**Jugadores presentes:** ${n.jugadores_presentes}`);
      if (n.quests && n.quests.length) parts.push(`**Quests vinculadas:** ${n.quests.map(q => q.nombre).join(', ')}`);
      if (n.contenido_html) {
        // Strip HTML tags para reducir tokens, mantener texto
        const text = n.contenido_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 0) parts.push(`**Contenido:**\n${text}`);
      }
    });
  }

  // Quests (todas, con contenido)
  const quests = DATA.quests || [];
  if (quests.length) {
    parts.push('\n## Quests');
    quests.forEach(q => {
      parts.push(`\n### ${q.nombre} [${q.estado || '?'}]`);
      if (q.resumen) parts.push(`**Resumen:** ${q.resumen}`);
      if (q.quest_npcs && q.quest_npcs.length) parts.push(`**NPCs:** ${q.quest_npcs.map(n => n.nombre).join(', ')}`);
      if (q.ciudades && q.ciudades.length) parts.push(`**Ciudades:** ${q.ciudades.map(c => c.nombre).join(', ')}`);
      if (q.establecimientos && q.establecimientos.length) parts.push(`**Establecimientos:** ${q.establecimientos.map(e => e.nombre).join(', ')}`);
      if (q.lugares && q.lugares.length) parts.push(`**Lugares:** ${q.lugares.map(l => l.nombre).join(', ')}`);
      if (q.contenido_html) {
        const text = q.contenido_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 0) parts.push(`**Detalles:**\n${text}`);
      }
    });
  }

  // NPCs
  const npcs = DATA.npcs || [];
  if (npcs.length) {
    parts.push('\n## NPCs');
    npcs.forEach(n => {
      const ciudad = n.ciudad ? ` | Ciudad: ${n.ciudad.nombre}` : '';
      const estab = n.establecimiento ? ` | Establecimiento: ${n.establecimiento.nombre}` : '';
      const estado = n.estado ? ` | Estado: ${n.estado}` : '';
      const conocido = n.conocido_jugadores ? ' [conocido]' : ' [desconocido]';
      const desc = n.primera_impresion ? ` — ${n.primera_impresion}` : '';
      parts.push(`- ${n.nombre} (${n.raza || '?'}, ${n.tipo_npc || n.rol || '?'})${ciudad}${estab}${estado}${conocido}${desc}`);
    });
  }

  // Ciudades
  const ciudades = DATA.ciudades || [];
  if (ciudades.length) {
    parts.push('\n## Ciudades');
    ciudades.forEach(c => {
      const conocida = c.conocida_jugadores ? ' [conocida]' : ' [desconocida]';
      const lider = c.lider ? ` | Líder: ${c.lider}` : '';
      const poblacion = c.poblacion ? ` | Población: ${c.poblacion}` : '';
      parts.push(`- ${c.nombre}${conocida}${lider}${poblacion} — ${c.descripcion || 'Sin descripción'}`);
    });
  }

  // Establecimientos
  const estabs = DATA.establecimientos || [];
  if (estabs.length) {
    parts.push('\n## Establecimientos');
    estabs.forEach(e => {
      const ciudad = e.ciudad ? ` en ${e.ciudad.nombre}` : '';
      const dueno = e.dueno ? ` | Dueño: ${e.dueno.nombre}` : '';
      const conocido = e.conocido_jugadores ? ' [conocido]' : ' [desconocido]';
      parts.push(`- ${e.nombre} (${e.tipo || '?'})${ciudad}${dueno}${conocido}`);
    });
  }

  // Lugares
  const lugares = DATA.lugares || [];
  if (lugares.length) {
    parts.push('\n## Lugares');
    lugares.forEach(l => {
      const ciudad = l.ciudad ? ` | Ciudad: ${l.ciudad.nombre}` : '';
      const conocido = l.conocido_jugadores ? ' [conocido]' : ' [desconocido]';
      parts.push(`- ${l.nombre} (${l.tipo || '?'}) — ${l.region || '?'}${ciudad}${conocido}`);
    });
  }

  // Items
  const items = DATA.items || [];
  if (items.length) {
    parts.push('\n## Items mágicos');
    items.forEach(i => {
      const portador = i.personaje ? ` | Portador: ${i.personaje.nombre}` : '';
      const conocido = i.conocido_jugadores ? ' [conocido]' : ' [desconocido]';
      parts.push(`- ${i.nombre} (${i.tipo || '?'}, ${i.rareza || '?'})${portador}${conocido}`);
    });
  }

  return parts.join('\n');
}

// ── RENDER ───────────────────────────────────────────────────
function renderChatMessage(role, content, animate = false) {
  const container = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble chat-${role}`;

  if (role === 'assistant') {
    bubble.innerHTML = typeof marked !== 'undefined' ? marked.parse(content) : content;
    processChangesBlocks(bubble);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-note';
    saveBtn.textContent = '💾 Guardar como Nota DM';
    saveBtn.onclick = () => saveAsNotaDm(content);
    bubble.appendChild(saveBtn);
  } else {
    bubble.textContent = content;
  }

  if (animate) bubble.classList.add('chat-animate');
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function renderWelcome() {
  const container = document.getElementById('chat-messages');
  if (!container || container.querySelector('.chat-welcome')) return;
  const welcome = document.createElement('div');
  welcome.className = 'chat-welcome';
  welcome.innerHTML = `
    <div class="chat-welcome-icon">⚔</div>
    <h3>Asistente de Campaña</h3>
    <p>Pregunta sobre tu campaña, prepara sesiones, genera NPCs, diseña encuentros, o actualiza registros post-sesión.</p>
  `;
  container.appendChild(welcome);
}

function showThinking() {
  const container = document.getElementById('chat-messages');
  const el = document.createElement('div');
  el.className = 'chat-bubble chat-assistant chat-thinking';
  el.id = 'chat-thinking';
  el.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function hideThinking() {
  const el = document.getElementById('chat-thinking');
  if (el) el.remove();
}

// ── CHANGES BLOCKS (parse & render) ──────────────────────────
let changeIdCounter = 0;

function processChangesBlocks(bubble) {
  const codeBlocks = bubble.querySelectorAll('code.language-halo-changes');
  codeBlocks.forEach(code => {
    const pre = code.closest('pre');
    if (!pre) return;

    try {
      const changes = JSON.parse(code.textContent);
      if (!Array.isArray(changes) || changes.length === 0) return;

      const container = document.createElement('div');
      container.className = 'changes-container';

      changes.forEach(change => {
        const id = `change-${++changeIdCounter}`;
        const card = document.createElement('div');
        card.className = 'change-card';
        card.id = id;
        card.innerHTML = `
          <div class="change-info">
            <span class="change-table">${change.table}</span>
            <span class="change-label">${escapeHtml(change.label)}</span>
          </div>
          <div class="change-actions" id="${id}-actions">
            <button class="btn btn-sm btn-success" onclick="applyChange('${id}')">Aplicar</button>
          </div>
        `;
        card.dataset.change = JSON.stringify(change);
        container.appendChild(card);
      });

      // Add "Apply all" button
      const allBtn = document.createElement('button');
      allBtn.className = 'btn btn-sm btn-apply-all';
      allBtn.textContent = '✓ Aplicar todos';
      allBtn.onclick = () => applyAllChanges(container);
      container.appendChild(allBtn);

      pre.replaceWith(container);
    } catch {
      // Not valid JSON, leave as-is
    }
  });
}

function _resolveTable(table) {
  return table === 'players' ? 'personajes' : table;
}

function _findRecord(table, name) {
  const dataKey = table;
  const arr = DATA[dataKey] || [];
  return arr.find(r => r.nombre === name);
}

async function applyChange(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;

  const change = JSON.parse(card.dataset.change);
  const actionsEl = document.getElementById(`${cardId}-actions`);

  try {
    actionsEl.innerHTML = '<span class="change-status loading">Aplicando...</span>';

    if (change.action === 'update') {
      const record = _findRecord(change.table, change.name);
      if (!record) throw new Error(`No se encontró "${change.name}" en ${change.table}`);

      // Save previous values for undo
      const previousFields = {};
      for (const key of Object.keys(change.fields)) {
        previousFields[key] = record[key];
      }
      undoStack.set(cardId, {
        table: change.table,
        sbid: record._sbid,
        previousFields,
      });

      // Apply update directly via Supabase client
      const sbTable = _resolveTable(change.table);
      const { error } = await sbClient.from(sbTable)
        .update({ ...change.fields, updated_at: new Date().toISOString() })
        .eq('id', record._sbid);
      if (error) throw new Error(error.message);

      // Update local DATA
      Object.assign(record, change.fields);

    } else if (change.action === 'create') {
      const sbTable = _resolveTable(change.table);
      const { data: created, error } = await sbClient.from(sbTable)
        .insert(change.fields)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Save for undo (delete on undo)
      undoStack.set(cardId, {
        table: change.table,
        sbid: created.id,
        isCreate: true,
      });

      // Add to local DATA
      const norm = { ...change.fields, _sbid: created.id, id: created.id };
      if (!DATA[change.table]) DATA[change.table] = [];
      DATA[change.table].push(norm);
    }

    // Update UI
    card.classList.add('applied');
    actionsEl.innerHTML = `
      <span class="change-status applied">✓ Aplicado</span>
      <button class="btn btn-sm btn-undo" onclick="undoChange('${cardId}')">Deshacer</button>
    `;

    renderAll();
    showToast(`Aplicado: ${change.label}`);

  } catch (err) {
    actionsEl.innerHTML = `
      <span class="change-status error">Error: ${escapeHtml(err.message)}</span>
      <button class="btn btn-sm btn-success" onclick="applyChange('${cardId}')">Reintentar</button>
    `;
  }
}

async function undoChange(cardId) {
  const undoData = undoStack.get(cardId);
  if (!undoData) return;

  const card = document.getElementById(cardId);
  const actionsEl = document.getElementById(`${cardId}-actions`);

  try {
    actionsEl.innerHTML = '<span class="change-status loading">Deshaciendo...</span>';

    const sbTable = _resolveTable(undoData.table);

    if (undoData.isCreate) {
      // Undo a create = delete the record
      const { error } = await sbClient.from(sbTable)
        .delete()
        .eq('id', undoData.sbid);
      if (error) throw new Error(error.message);

      // Remove from local DATA
      const arr = DATA[undoData.table] || [];
      const idx = arr.findIndex(r => r._sbid === undoData.sbid);
      if (idx >= 0) arr.splice(idx, 1);

    } else {
      // Undo an update = restore previous values
      const { error } = await sbClient.from(sbTable)
        .update({ ...undoData.previousFields, updated_at: new Date().toISOString() })
        .eq('id', undoData.sbid);
      if (error) throw new Error(error.message);

      // Restore local DATA
      const arr = DATA[undoData.table] || [];
      const record = arr.find(r => r._sbid === undoData.sbid);
      if (record) Object.assign(record, undoData.previousFields);
    }

    undoStack.delete(cardId);
    card.classList.remove('applied');
    actionsEl.innerHTML = `
      <span class="change-status">Deshecho</span>
      <button class="btn btn-sm btn-success" onclick="applyChange('${cardId}')">Aplicar</button>
    `;

    renderAll();
    showToast('Cambio deshecho');

  } catch (err) {
    actionsEl.innerHTML = `
      <span class="change-status error">Error: ${escapeHtml(err.message)}</span>
      <button class="btn btn-sm btn-undo" onclick="undoChange('${cardId}')">Reintentar</button>
    `;
  }
}

async function applyAllChanges(container) {
  const cards = container.querySelectorAll('.change-card:not(.applied)');
  for (const card of cards) {
    await applyChange(card.id);
  }
}

// ── STREAMING ────────────────────────────────────────────────
async function sendMessage(text) {
  if (isStreaming) return;

  const input = document.getElementById('chat-input');
  const userText = text || input.value.trim();
  if (!userText) return;

  input.value = '';
  input.style.height = 'auto';

  const welcome = document.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const quickActions = document.getElementById('chat-quick-actions');
  if (chatMessages.length === 0 && quickActions) {
    quickActions.classList.add('hidden');
  }

  chatMessages.push({ role: 'user', content: userText });
  renderChatMessage('user', userText, true);

  showThinking();
  isStreaming = true;
  updateSendButton();

  try {
    const { data: { session: chatSession } } = await sbClient.auth.getSession();
    const response = await fetch(CHAT_EDGE_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chatSession?.access_token || CONFIG.SUPABASE_ANON_KEY}`,
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'x-campaign-slug': CONFIG.SLUG,
      },
      body: JSON.stringify({
        messages: chatMessages,
        campaignContext: buildCampaignContext(),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || `Error ${response.status}`);
    }

    hideThinking();
    const assistantBubble = document.createElement('div');
    assistantBubble.className = 'chat-bubble chat-assistant chat-animate';
    document.getElementById('chat-messages').appendChild(assistantBubble);

    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            assistantBubble.innerHTML = typeof marked !== 'undefined'
              ? marked.parse(fullText)
              : fullText;
            document.getElementById('chat-messages').scrollTop =
              document.getElementById('chat-messages').scrollHeight;
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    if (fullText) {
      assistantBubble.innerHTML = typeof marked !== 'undefined'
        ? marked.parse(fullText)
        : fullText;

      // Process halo-changes blocks into interactive cards
      processChangesBlocks(assistantBubble);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn-save-note';
      saveBtn.textContent = '💾 Guardar como Nota DM';
      saveBtn.onclick = () => saveAsNotaDm(fullText);
      assistantBubble.appendChild(saveBtn);

      chatMessages.push({ role: 'assistant', content: fullText });
      saveChatHistory();
    }

    document.getElementById('chat-messages').scrollTop =
      document.getElementById('chat-messages').scrollHeight;

  } catch (err) {
    hideThinking();
    const errorBubble = document.createElement('div');
    errorBubble.className = 'chat-bubble chat-error';
    errorBubble.textContent = `Error: ${err.message}`;
    document.getElementById('chat-messages').appendChild(errorBubble);
  } finally {
    isStreaming = false;
    updateSendButton();
  }
}

function sendQuick(key) {
  const prompt = QUICK_PROMPTS[key];
  if (prompt) sendMessage(prompt);
}

function updateSendButton() {
  const btn = document.getElementById('chat-send');
  if (!btn) return;
  btn.disabled = isStreaming;
  btn.textContent = isStreaming ? '...' : 'Enviar';
}

// ── SAVE AS NOTA DM ──────────────────────────────────────────
async function saveAsNotaDm(content) {
  const today = new Date();
  const defaultName = `Sesión ${today.getDate()}-${today.toLocaleString('es', { month: 'short' })}-${String(today.getFullYear()).slice(2)}`;

  const name = prompt('Nombre de la nota:', defaultName);
  if (!name) return;

  const dateStr = today.toISOString().slice(0, 10);

  try {
    document.getElementById('spinner').classList.add('active');
    await sbSave('notas_dm', {
      nombre: name,
      fecha: dateStr,
      contenido_html: content,
    }, 'add');

    await loadAllData();
    renderNotas();

    document.getElementById('spinner').classList.remove('active');
    showToast('Nota guardada correctamente');
  } catch (err) {
    document.getElementById('spinner').classList.remove('active');
    alert('Error al guardar: ' + err.message);
  }
}

function showToast(msg) {
  let toast = document.getElementById('chat-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'chat-toast';
    toast.className = 'chat-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ── LOCAL STORAGE ────────────────────────────────────────────
function saveChatHistory() {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY(), JSON.stringify(chatMessages));
  } catch { /* quota exceeded */ }
}

function loadChatHistory() {
  try {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY());
    if (saved) {
      chatMessages = JSON.parse(saved);
      return true;
    }
  } catch { /* corrupted */ }
  return false;
}

function clearChat() {
  chatMessages = [];
  localStorage.removeItem(CHAT_STORAGE_KEY());
  undoStack.clear();
  const container = document.getElementById('chat-messages');
  if (container) container.innerHTML = '';
  const quickActions = document.getElementById('chat-quick-actions');
  if (quickActions) quickActions.classList.remove('hidden');
  renderWelcome();
}

// ── INIT (llamado después de inyectar HTML en workspace) ─────
function initPlanear() {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = '';

  if (loadChatHistory() && chatMessages.length > 0) {
    const quickActions = document.getElementById('chat-quick-actions');
    if (quickActions) quickActions.classList.add('hidden');
    chatMessages.forEach(m => renderChatMessage(m.role, m.content));
  } else {
    renderWelcome();
  }

  const input = document.getElementById('chat-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
}
