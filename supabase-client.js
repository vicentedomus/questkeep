/**
 * supabase-client.js — Capa de datos Supabase
 */

const sbClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
  db: { schema: CONFIG.SCHEMA },
});

// ── HELPERS ───────────────────────────────────────────────────────────

/** Normaliza un registro de Supabase: expone _sbid */
function _norm(entity) {
  if (!entity) return entity;
  entity._sbid = entity.id;
  return entity;
}

/** Convierte un objeto joinado a {id, nombre} */
function _toRef(obj) {
  if (!obj) return null;
  return { id: obj.id, nombre: obj.nombre };
}

/** Agrupa filas de junction en un mapa: keyField → [{id, nombre}] */
function _groupRefs(rows, keyField, entityField) {
  const map = {};
  for (const row of (rows || [])) {
    const key = row[keyField];
    const entity = row[entityField];
    if (!key || !entity) continue;
    if (!map[key]) map[key] = [];
    map[key].push(_toRef(entity));
  }
  return map;
}

/** Busca el Supabase UUID (_sbid) dado un id en un array de DATA */
function _findSbid(dataKey, entityId) {
  if (!entityId) return null;
  const arr = DATA[dataKey] || [];
  const found = arr.find(r => r.id === entityId);
  return found ? found._sbid : null;
}

/** Mapea dataKey a nombre de tabla en Supabase */
function _tableName(dataKey) {
  return dataKey === 'players' ? 'personajes' : dataKey;
}

/** Extrae el nombre de columna problemática de un mensaje de error de Supabase */
function _extractBadColumn(msg) {
  // Supabase/PostgREST: "Could not find the 'xyz' column..."
  const m = msg.match(/column[^'"]*['"](\w+)['"]/i);
  return m ? m[1] : null;
}

// ── JUNCTION TABLE CONFIG ─────────────────────────────────────────────

const M2M_CONFIG = {
  quests: {
    quest_npcs:       { table: 'npcs_quests',            selfCol: 'quest_id',        otherCol: 'npc_id',             dataKey: 'npcs' },
    lugares:          { table: 'quests_lugares',          selfCol: 'quest_id',        otherCol: 'lugar_id',           dataKey: 'lugares' },
    ciudades:         { table: 'quests_ciudades',         selfCol: 'quest_id',        otherCol: 'ciudad_id',          dataKey: 'ciudades' },
    establecimientos: { table: 'quests_establecimientos', selfCol: 'quest_id',        otherCol: 'establecimiento_id', dataKey: 'establecimientos' },
    notas_dm:         { table: 'quests_notas_dm',         selfCol: 'quest_id',        otherCol: 'nota_dm_id',         dataKey: 'notas_dm' },
  },
  lugares: {
    npcs:             { table: 'npcs_lugares',            selfCol: 'lugar_id',        otherCol: 'npc_id',             dataKey: 'npcs' },
    items_magicos:    { table: 'lugares_items',           selfCol: 'lugar_id',        otherCol: 'item_id',            dataKey: 'items' },
    quests:           { table: 'quests_lugares',          selfCol: 'lugar_id',        otherCol: 'quest_id',           dataKey: 'quests' },
  },
  notas_dm: {
    quests:           { table: 'quests_notas_dm',         selfCol: 'nota_dm_id',      otherCol: 'quest_id',           dataKey: 'quests' },
  },
  notas_jugadores: {
    items:            { table: 'notas_jugadores_items',   selfCol: 'nota_jugador_id', otherCol: 'item_id',            dataKey: 'items' },
  },
};

/** Campos de formulario que son FK → mapean a columna UUID en Supabase */
const FK_CONFIG = {
  ciudad:          { column: 'ciudad_id',          dataKey: 'ciudades' },
  establecimiento: { column: 'establecimiento_id',  dataKey: 'establecimientos' },
  dueno:           { column: 'dueno_id',            dataKey: 'npcs' },
  personaje:       { column: 'personaje_id',        dataKey: 'players' },
};

const SKIP_FIELDS  = new Set(['_sbid', 'id', 'created_at', 'updated_at', 'notion_id']);
const ARRAY_FIELDS = new Set(['jugadores_presentes', 'jugador']); // text[] en BD, string en form

// ── LOAD ALL DATA ─────────────────────────────────────────────────────

async function loadAllData() {
  const [
    ciudadesRes, personajesRes, questsRes, notasDmRes, notasJugadoresRes,
    npcsRes, establecimientosRes, itemsRes, lugaresRes,
    npcQuestsRes, questLugaresRes, questCiudadesRes,
    questEstRes, questNotasDmRes,
    npcLugaresRes, lugarItemsRes, notasJugItemsRes,
    npcItemsRes, marcadoresRes,
    monstruosRes,
    itemsCatalogRes,
  ] = await Promise.all([
    sbClient.from('ciudades').select('*').eq('archived', false),
    sbClient.from('personajes').select('*').eq('archived', false),
    sbClient.from('quests').select('*').eq('archived', false),
    sbClient.from('notas_dm').select('*').eq('archived', false),
    sbClient.from('notas_jugadores').select('*').eq('archived', false),
    sbClient.from('npcs').select('*, ciudad:ciudad_id(id,nombre), establecimiento:establecimiento_id(id,nombre)').eq('archived', false),
    sbClient.from('establecimientos').select('*, ciudad:ciudad_id(id,nombre), dueno:dueno_id(id,nombre)').eq('archived', false),
    sbClient.from('items').select('*, personaje:personaje_id(id,nombre)').eq('archived', false),
    sbClient.from('lugares').select('*, ciudad:ciudad_id(id,nombre)').eq('archived', false),
    // Junction tables con datos relacionados para construir refs
    sbClient.from('npcs_quests').select('npc_id, quest_id, npc:npcs(id,nombre), quest:quests(id,nombre)'),
    sbClient.from('quests_lugares').select('quest_id, lugar_id, quest:quests(id,nombre), lugar:lugares(id,nombre)'),
    sbClient.from('quests_ciudades').select('quest_id, ciudad:ciudades(id,nombre)'),
    sbClient.from('quests_establecimientos').select('quest_id, establecimiento:establecimientos(id,nombre)'),
    sbClient.from('quests_notas_dm').select('quest_id, nota_dm_id, quest:quests(id,nombre), nota_dm:notas_dm(id,nombre)'),
    sbClient.from('npcs_lugares').select('npc_id, lugar_id, npc:npcs(id,nombre), lugar:lugares(id,nombre)'),
    sbClient.from('lugares_items').select('lugar_id, item:items(id,nombre)'),
    sbClient.from('notas_jugadores_items').select('nota_jugador_id, item:items(id,nombre)'),
    sbClient.from('npcs_items').select('npc_id, item:items(id,nombre)'),
    sbClient.from('marcadores').select('*'),
    sbClient.from('monstruos').select('*').eq('archived', false),
    sbClient.from('items_catalog').select('*').eq('archived', false),
  ]);

  // Verificar errores en tablas principales
  const mainResults = [ciudadesRes, personajesRes, questsRes, notasDmRes, notasJugadoresRes, npcsRes, establecimientosRes, itemsRes, lugaresRes];
  const errs = mainResults.filter(r => r.error);
  if (errs.length) throw new Error('Supabase: ' + errs.map(r => r.error.message).join('; '));

  // Construir mapas de refs M2M
  const npcByQuest    = _groupRefs(npcQuestsRes.data,     'quest_id',        'npc');
  const questByNpc    = _groupRefs(npcQuestsRes.data,     'npc_id',          'quest');
  const lugarByQuest  = _groupRefs(questLugaresRes.data,  'quest_id',        'lugar');
  const questByLugar  = _groupRefs(questLugaresRes.data,  'lugar_id',        'quest');
  const ciudadByQuest = _groupRefs(questCiudadesRes.data, 'quest_id',        'ciudad');
  const estByQuest    = _groupRefs(questEstRes.data,      'quest_id',        'establecimiento');
  const notaDmByQuest = _groupRefs(questNotasDmRes.data,  'quest_id',        'nota_dm');
  const questByNotaDm = _groupRefs(questNotasDmRes.data,  'nota_dm_id',      'quest');
  const npcByLugar    = _groupRefs(npcLugaresRes.data,    'lugar_id',        'npc');
  const lugarByNpc    = _groupRefs(npcLugaresRes.data,    'npc_id',          'lugar');
  const itemByLugar   = _groupRefs(lugarItemsRes.data,    'lugar_id',        'item');
  const itemByNotaJug = _groupRefs(notasJugItemsRes.data, 'nota_jugador_id', 'item');
  const itemByNpc     = _groupRefs(npcItemsRes.data,      'npc_id',          'item');

  // Normalizar tablas y adjuntar relaciones
  DATA.ciudades = (ciudadesRes.data || []).map(_norm);

  DATA.players = (personajesRes.data || []).map(_norm);

  DATA.quests = (questsRes.data || []).map(q => {
    _norm(q);
    q.quest_npcs       = npcByQuest[q._sbid]    || [];
    q.lugares          = lugarByQuest[q._sbid]  || [];
    q.ciudades         = ciudadByQuest[q._sbid] || [];
    q.establecimientos = estByQuest[q._sbid]    || [];
    q.notas_dm         = notaDmByQuest[q._sbid] || [];
    return q;
  });

  DATA.notas_dm = (notasDmRes.data || []).map(n => {
    _norm(n);
    if (Array.isArray(n.jugadores_presentes)) n.jugadores_presentes = n.jugadores_presentes[0] || '';
    n.quests = questByNotaDm[n._sbid] || [];
    return n;
  });

  DATA.notas_jugadores = (notasJugadoresRes.data || []).map(n => {
    _norm(n);
    if (Array.isArray(n.jugador)) n.jugador = n.jugador[0] || '';
    n.items = itemByNotaJug[n._sbid] || [];
    return n;
  });

  DATA.npcs = (npcsRes.data || []).map(npc => {
    _norm(npc);
    npc.ciudad          = npc.ciudad          ? _toRef(npc.ciudad)          : null;
    npc.establecimiento = npc.establecimiento ? _toRef(npc.establecimiento) : null;
    npc.items_magicos   = itemByNpc[npc._sbid]  || [];
    npc.lugares         = lugarByNpc[npc._sbid] || [];
    npc.quests          = questByNpc[npc._sbid] || [];
    return npc;
  });

  DATA.establecimientos = (establecimientosRes.data || []).map(est => {
    _norm(est);
    est.ciudad = est.ciudad ? _toRef(est.ciudad) : null;
    est.dueno  = est.dueno  ? _toRef(est.dueno)  : null;
    return est;
  });

  DATA.items = (itemsRes.data || []).map(item => {
    _norm(item);
    item.personaje = item.personaje ? _toRef(item.personaje) : null;
    return item;
  });

  DATA.lugares = (lugaresRes.data || []).map(lugar => {
    _norm(lugar);
    lugar.ciudad        = lugar.ciudad ? _toRef(lugar.ciudad) : null;
    lugar.npcs          = npcByLugar[lugar._sbid]  || [];
    lugar.items_magicos = itemByLugar[lugar._sbid]  || [];
    lugar.quests        = questByLugar[lugar._sbid] || [];
    return lugar;
  });

  // Monstruos (tabla plana, sin relaciones)
  DATA.monstruos = (monstruosRes.data || []).map(_norm);

  // Catálogo de ítems (tabla plana, sin relaciones)
  DATA.items_catalog = (itemsCatalogRes.data || []).map(_norm);

  // Construir MAP_MARKERS desde Supabase (localStorage tiene prioridad)
  const sbMarkers = {};
  for (const m of (marcadoresRes.data || [])) {
    const key = m.lugar_id;
    if (key) sbMarkers[key] = { x: Number(m.x), y: Number(m.y) };
  }
  const stored = localStorage.getItem('map_markers');
  MAP_MARKERS = stored ? JSON.parse(stored) : sbMarkers;
}

// ── SAVE (INSERT o UPDATE) ────────────────────────────────────────────

async function sbSave(dataKey, data, action) {
  const sbTable = _tableName(dataKey);
  const sbid = data._sbid;
  const m2mCfgForKey = M2M_CONFIG[dataKey] || {};
  const m2mKeys = new Set(Object.keys(m2mCfgForKey));

  // Construir payload principal
  const payload = {};
  for (const [key, val] of Object.entries(data)) {
    if (SKIP_FIELDS.has(key)) continue;
    if (FK_CONFIG[key]) {
      payload[FK_CONFIG[key].column] = val ? _findSbid(FK_CONFIG[key].dataKey, val.id) : null;
      continue;
    }
    if (m2mKeys.has(key)) continue;
    if (ARRAY_FIELDS.has(key)) {
      payload[key] = val ? [val] : null;
      continue;
    }
    payload[key] = val;
  }

  let savedSbid = sbid;

  if (action === 'add') {
    let { data: created, error } = await sbClient.from(sbTable).insert(payload).select().single();
    // Si falla por columna desconocida, reintentar sin ese campo
    if (error && error.message && error.message.includes('column')) {
      const badCol = _extractBadColumn(error.message);
      if (badCol && payload[badCol] !== undefined) {
        delete payload[badCol];
        ({ data: created, error } = await sbClient.from(sbTable).insert(payload).select().single());
      }
    }
    if (error) throw new Error(error.message);
    savedSbid = created.id;
    data._sbid = savedSbid;
    data.id    = savedSbid;
  } else {
    let { error } = await sbClient.from(sbTable).update(payload).eq('id', sbid);
    // Si falla por columna desconocida, reintentar sin ese campo
    if (error && error.message && error.message.includes('column')) {
      const badCol = _extractBadColumn(error.message);
      if (badCol && payload[badCol] !== undefined) {
        delete payload[badCol];
        ({ error } = await sbClient.from(sbTable).update(payload).eq('id', sbid));
      }
    }
    if (error) throw new Error(error.message);
  }

  // Manejar junction tables (M2M)
  for (const [fieldKey, cfg] of Object.entries(m2mCfgForKey)) {
    const refs = data[fieldKey] || [];
    await sbClient.from(cfg.table).delete().eq(cfg.selfCol, savedSbid);
    if (refs.length > 0) {
      const rows = refs.map(ref => {
        const otherId = _findSbid(cfg.dataKey, ref.id);
        return otherId ? { [cfg.selfCol]: savedSbid, [cfg.otherCol]: otherId } : null;
      }).filter(Boolean);
      if (rows.length > 0) {
        const { error } = await sbClient.from(cfg.table).insert(rows);
        if (error) console.warn(`M2M error (${cfg.table}):`, error.message);
      }
    }
  }
}

// ── UPDATE CAMPO ──────────────────────────────────────────────────────

async function sbUpdate(table, sbid, fields) {
  const sbTable = _tableName(table);
  const { error } = await sbClient.from(sbTable).update(fields).eq('id', sbid);
  if (error) throw new Error(error.message);
}

// ── SOFT DELETE ───────────────────────────────────────────────────────

async function sbDelete(table, sbid) {
  const sbTable = _tableName(table);
  const { error } = await sbClient.from(sbTable).update({ archived: true }).eq('id', sbid);
  if (error) throw new Error(error.message);
}

// ── ENTITY NOTES (notas de jugadores por entidad) ─────────────────────

async function sbLoadEntityNote(entityType, entityId) {
  const { data, error } = await sbClient.from('entity_notes')
    .select('contenido')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();
  if (error) { console.warn('entity_notes load:', error.message); return ''; }
  return data ? data.contenido : '';
}

async function sbSaveEntityNote(entityType, entityId, contenido) {
  const { error } = await sbClient.from('entity_notes').upsert(
    { entity_type: entityType, entity_id: entityId, contenido, updated_at: new Date().toISOString() },
    { onConflict: 'entity_type,entity_id' }
  );
  if (error) throw new Error(error.message);
}

// ── UPSERT MARCADOR ───────────────────────────────────────────────────

async function sbUpsertMarker(lugarId, x, y) {
  const lugar = (DATA.lugares || []).find(l => l.id === lugarId);
  if (!lugar || !lugar._sbid) return;
  const { error } = await sbClient.from('marcadores').upsert(
    { lugar_id: lugar._sbid, x, y },
    { onConflict: 'lugar_id' }
  );
  if (error) console.warn('Marker upsert failed:', error.message);
}
