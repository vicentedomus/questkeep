// Cloudflare Worker: proxy Notion API para dnd-halo
// Token de Notion se configura como secreto: wrangler secret put NOTION_TOKEN

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Mapeo de endpoints a Notion Database IDs
const DB_MAP = {
  ciudades:         '325bece6f7da81c8a35cd3b01080783c',
  npcs:             '325bece6f7da8124bcfbff68c5ade8e1',
  establecimientos: '325bece6f7da811d8b6ffeedc633f811',
  players:          '325bece6f7da81888d04ef0759006e21',
  items:            '325bece6f7da81ff8d23d9a9e0b8d9f0',
  quests:           '325bece6f7da8156976bee7f99f6bd03',
  notas_dm:         '325bece6f7da81b0a73fd430c9509c35',
  notas_jugadores:  '325bece6f7da8154a8eff964dd7bac12',
  lugares:          '325bece6f7da816f9cf2ca30ac4cceda',
};

// --- Helpers de extracción de propiedades Notion ---

function getText(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return prop.title?.map(t => t.plain_text).join('') || '';
  if (prop.type === 'rich_text') return prop.rich_text?.map(t => t.plain_text).join('') || '';
  return '';
}

function getSelect(prop) {
  return prop?.select?.name || '';
}

function getNumber(prop) {
  return prop?.number ?? null;
}

function getCheckbox(prop) {
  return prop?.checkbox ?? false;
}

function getMultiSelect(prop) {
  return prop?.multi_select?.map(s => s.name) || [];
}

function getDate(prop) {
  return prop?.date?.start || '';
}

function getRelation(prop) {
  if (!prop?.relation?.length) return null;
  return prop.relation.map(r => r.id);
}

function getRelationSingle(prop) {
  const ids = getRelation(prop);
  return ids?.[0] || null;
}

// --- Resolución de relaciones via cache (evita rate limiting) ---

let nameCache = {};

async function buildNameCache(token) {
  nameCache = {};
  const dbsToCache = ['ciudades', 'npcs', 'establecimientos', 'items', 'quests', 'players', 'lugares', 'notas_dm', 'notas_jugadores'];
  await Promise.all(dbsToCache.map(async (entity) => {
    try {
      const pages = await queryDatabase(DB_MAP[entity], token);
      for (const page of pages) {
        for (const [, prop] of Object.entries(page.properties)) {
          if (prop.type === 'title') {
            nameCache[page.id] = prop.title?.map(t => t.plain_text).join('') || '';
            break;
          }
        }
      }
    } catch { /* skip failed DB */ }
  }));
}

function resolveRelationCached(prop) {
  const id = getRelationSingle(prop);
  if (!id) return null;
  const nombre = nameCache[id];
  return nombre !== undefined ? { notion_id: id, nombre } : null;
}

function resolveRelationMultiCached(prop) {
  const ids = getRelation(prop);
  if (!ids?.length) return [];
  return ids.map(id => {
    const nombre = nameCache[id];
    return nombre !== undefined ? { notion_id: id, nombre } : null;
  }).filter(Boolean);
}

// --- Transformadores por entidad ---

function transformCiudad(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['burg_nombre']),
    burg_id: getNumber(p['burg_id']),
    descripcion: getText(p['descripcion_burg']),
    descripcion_lider: getText(p['descripcion_lider']),
    estado: getText(p['estado_burg']),
    lider: getText(p['lider']),
    poblacion: getNumber(p['poblacion']),
    conocida_jugadores: getCheckbox(p['Conocida por Jugadores?']),
    creado_por_jugador: getCheckbox(p['Creado por Jugador?']),
  };
}

function transformNpc(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Name']),
    raza: getSelect(p['Raza']),
    tipo_npc: getSelect(p['Tipo de NPC']),
    estado: getSelect(p['Estado']),
    rol: getSelect(p['Rol']),
    ciudad: resolveRelationCached(p['Ciudad']) || { notion_id: '', nombre: '' },
    establecimiento: resolveRelationCached(p['Establecimiento']) || { notion_id: '', nombre: '' },
    descripcion: getText(p['Descripción']),
    items_magicos: resolveRelationMultiCached(p['Items Mágicos']),
    lugares: resolveRelationMultiCached(p['Lugares']),
    quests: resolveRelationMultiCached(p['Quests']),
    conocido_jugadores: getCheckbox(p['Conocido por Jugadores']),
    creado_por_jugador: getCheckbox(p['Creado por Jugador?']),
  };
}

function transformEstablecimiento(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Nombre Establecimiento ']),
    tipo: getSelect(p['Tipo']),
    ciudad: resolveRelationCached(p['Ciudad']) || { notion_id: '', nombre: '' },
    dueno: resolveRelationCached(p['Dueño']) || { notion_id: '', nombre: '' },
    descripcion: getText(p['Descripcion']),
    conocido_jugadores: getCheckbox(p['Conocido por Jugadores?']),
    creado_por_jugador: getCheckbox(p['Creado por Jugador?']),
  };
}

function transformPlayer(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Name']),
    clase: getSelect(p['Clase']),
    subclase: getSelect(p['Subclase']),
    raza: getSelect(p['Raza']),
    tipo: getSelect(p['Tipo']),
    es_pj: getCheckbox(p['Es PJ']),
    jugador: getSelect(p['Jugador']),
    nivel: getNumber(p['Nivel']),
    ac: getNumber(p['AC']),
    hp_maximo: getNumber(p['HP Máximo']),
    descripcion: getText(p['Descripción']),
    rol: getSelect(p['Rol']),
    items_magicos: resolveRelationMultiCached(p['Items Mágicos']),
  };
}

function transformItem(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Name']),
    tipo: getSelect(p['Tipo']),
    rareza: getSelect(p['Rareza']),
    personaje: resolveRelationCached(p['Personaje']) || { notion_id: '', nombre: '' },
    npc_portador: resolveRelationCached(p['NPC Portador']) || { notion_id: '', nombre: '' },
    requiere_sintonizacion: getCheckbox(p['Requiere attunement?']),
    fuente: getText(p['Fuente']),
    descripcion: getText(p['Descripción']),
    conocido_jugadores: getCheckbox(p['Conocido por Jugadores?']),
  };
}

function transformQuest(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Name']),
    estado: getSelect(p['Estado']),
    resumen: getText(p['Resumen']),
    recompensa_gp: getText(p['Recompensa (GP)']),
    conocido_jugadores: getCheckbox(p['Conocido por Jugadores?']),
    quest_npcs: resolveRelationMultiCached(p['Quest NPCs']),
    lugares: resolveRelationMultiCached(p['Lugares']),
    notas_dm: resolveRelationMultiCached(p['Notas DM']),
    ciudades: resolveRelationMultiCached(p['Ciudades']),
    establecimientos: resolveRelationMultiCached(p['Establecimientos']),
  };
}

function transformNotaDm(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Name']),
    fecha: getDate(p['Fecha']),
    jugadores_presentes: getMultiSelect(p['Jugadores presentes']),
    quests: resolveRelationMultiCached(p['Quests']),
    resumen: getText(p['Resumen']),
  };
}

function transformNotaJugador(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Name']),
    fecha: getDate(p['Fecha']),
    jugador: getMultiSelect(p['Jugador']),
    resumen: getText(p['Resumen']),
    items: resolveRelationMultiCached(p['Item']),
  };
}

function transformLugar(page) {
  const p = page.properties;
  return {
    notion_id: page.id,
    nombre: getText(p['Name']),
    tipo: getSelect(p['Tipo']),
    region: getSelect(p['Region']),
    estado_exploracion: getSelect(p['Estado']),
    descripcion: getText(p['Descripción']),
    ciudad: resolveRelationCached(p['Ciudad']) || { notion_id: '', nombre: '' },
    npcs: resolveRelationMultiCached(p['NPCs Relevantes']),
    items_magicos: resolveRelationMultiCached(p['Items Mágicos']),
    quests: resolveRelationMultiCached(p['Quests']),
    conocido_jugadores: getCheckbox(p['Conocido por Jugadores?']),
    creado_por_jugador: getCheckbox(p['Creado por Jugador?']),
  };
}

const TRANSFORMERS = {
  ciudades: transformCiudad,
  npcs: transformNpc,
  establecimientos: transformEstablecimiento,
  players: transformPlayer,
  items: transformItem,
  quests: transformQuest,
  notas_dm: transformNotaDm,
  notas_jugadores: transformNotaJugador,
  lugares: transformLugar,
};

// --- Helpers de escritura (JSON → Notion properties) ---

function toTitle(val) {
  return { title: [{ text: { content: val || '' } }] };
}
function toRichText(val) {
  return { rich_text: [{ text: { content: val || '' } }] };
}
function toSelect(val) {
  return val ? { select: { name: val } } : { select: null };
}
function toNumber(val) {
  return { number: val ?? null };
}
function toCheckbox(val) {
  return { checkbox: !!val };
}
function toRelation(val) {
  if (!val) return { relation: [] };
  if (Array.isArray(val)) return { relation: val.filter(v => v?.notion_id).map(v => ({ id: v.notion_id })) };
  return val.notion_id ? { relation: [{ id: val.notion_id }] } : { relation: [] };
}

// Transformadores inversos: JSON del frontend → properties de Notion
const WRITE_MAP = {
  ciudades: (d) => ({
    'burg_nombre': toTitle(d.nombre),
    'burg_id': toNumber(d.burg_id),
    'descripcion_burg': toRichText(d.descripcion),
    'descripcion_lider': toRichText(d.descripcion_lider),
    'estado_burg': toRichText(d.estado),
    'lider': toRichText(d.lider),
    'poblacion': toNumber(d.poblacion),
    'Conocida por Jugadores?': toCheckbox(d.conocida_jugadores),
    'Creado por Jugador?': toCheckbox(d.creado_por_jugador),
  }),
  npcs: (d) => ({
    'Name': toTitle(d.nombre),
    'Raza': toSelect(d.raza),
    'Tipo de NPC': toSelect(d.tipo_npc),
    'Estado': toSelect(d.estado),
    'Rol': toSelect(d.rol),
    'Ciudad': toRelation(d.ciudad),
    'Establecimiento': toRelation(d.establecimiento),
    'Descripción': toRichText(d.descripcion),
    'Items Mágicos': toRelation(d.items_magicos),
    'Lugares': toRelation(d.lugares),
    'Quests': toRelation(d.quests),
    'Conocido por Jugadores': toCheckbox(d.conocido_jugadores),
    'Creado por Jugador?': toCheckbox(d.creado_por_jugador),
  }),
  establecimientos: (d) => ({
    'Nombre Establecimiento ': toTitle(d.nombre),
    'Tipo': toSelect(d.tipo),
    'Ciudad': toRelation(d.ciudad),
    'Dueño': toRelation(d.dueno),
    'Descripcion': toRichText(d.descripcion),
    'Conocido por Jugadores?': toCheckbox(d.conocido_jugadores),
    'Creado por Jugador?': toCheckbox(d.creado_por_jugador),
  }),
  players: (d) => ({
    'Name': toTitle(d.nombre),
    'Clase': toSelect(d.clase),
    'Subclase': toSelect(d.subclase),
    'Raza': toSelect(d.raza),
    'Tipo': toSelect(d.tipo),
    'Es PJ': toCheckbox(d.es_pj),
    'Jugador': toSelect(d.jugador),
    'Nivel': toNumber(d.nivel),
    'AC': toNumber(d.ac),
    'HP Máximo': toNumber(d.hp_maximo),
    'Descripción': toRichText(d.descripcion),
    'Rol': toSelect(d.rol),
    'Items Mágicos': toRelation(d.items_magicos),
  }),
  items: (d) => ({
    'Name': toTitle(d.nombre),
    'Tipo': toSelect(d.tipo),
    'Rareza': toSelect(d.rareza),
    'Personaje': toRelation(d.personaje),
    'Requiere attunement?': toCheckbox(d.requiere_sintonizacion),
    'Fuente': toRichText(d.fuente),
    'Descripción': toRichText(d.descripcion),
    'Conocido por Jugadores?': toCheckbox(d.conocido_jugadores),
  }),
  quests: (d) => ({
    'Name': toTitle(d.nombre),
    'Estado': toSelect(d.estado),
    'Resumen': toRichText(d.resumen),
    'Recompensa (GP)': toRichText(d.recompensa_gp),
    'Conocido por Jugadores?': toCheckbox(d.conocido_jugadores),
    'Quest NPCs': toRelation(d.quest_npcs),
    'Lugares': toRelation(d.lugares),
    'Ciudades': toRelation(d.ciudades),
    'Establecimientos': toRelation(d.establecimientos),
  }),
  notas_dm: (d) => ({
    'Name': toTitle(d.nombre),
    'Resumen': toRichText(d.resumen),
  }),
  notas_jugadores: (d) => ({
    'Name': toTitle(d.nombre),
    'Resumen': toRichText(d.resumen),
  }),
  lugares: (d) => ({
    'Name': toTitle(d.nombre),
    'Tipo': toSelect(d.tipo),
    'Region': toSelect(d.region),
    'Estado': toSelect(d.estado_exploracion),
    'Descripción': toRichText(d.descripcion),
    'Ciudad': toRelation(d.ciudad),
    'NPCs Relevantes': toRelation(d.npcs),
    'Items Mágicos': toRelation(d.items_magicos),
    'Quests': toRelation(d.quests),
    'Conocido por Jugadores?': toCheckbox(d.conocido_jugadores),
    'Creado por Jugador?': toCheckbox(d.creado_por_jugador),
  }),
};

async function createPage(dbId, properties, token) {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion create error ${res.status}: ${err}`);
  }
  return res.json();
}

async function updatePage(pageId, properties, token) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion update error ${res.status}: ${err}`);
  }
  return res.json();
}

// --- Page Content (blocks → HTML) ---

function blocksToHtml(blocks) {
  let html = '';
  let inList = false;
  for (const block of blocks) {
    const text = block[block.type]?.rich_text?.map(t => t.plain_text).join('') || '';
    if (block.type !== 'bulleted_list_item' && block.type !== 'numbered_list_item' && inList) {
      html += '</ul>'; inList = false;
    }
    switch (block.type) {
      case 'heading_1': html += `<h2>${text}</h2>`; break;
      case 'heading_2': html += `<h3>${text}</h3>`; break;
      case 'heading_3': html += `<h4>${text}</h4>`; break;
      case 'paragraph': if (text) html += `<p>${text}</p>`; break;
      case 'bulleted_list_item':
      case 'numbered_list_item':
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${text}</li>`;
        break;
      case 'callout': html += `<blockquote>${text}</blockquote>`; break;
      case 'divider': html += '<hr>'; break;
      default: if (text) html += `<p>${text}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

async function getPageContent(pageId, token) {
  const blocks = [];
  let cursor;
  do {
    const url = `${NOTION_API}/blocks/${pageId}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': NOTION_VERSION },
    });
    if (!res.ok) throw new Error(`Blocks error ${res.status}`);
    const data = await res.json();
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return blocksToHtml(blocks);
}

// --- Query Notion Database ---

async function queryDatabase(dbId, token) {
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion API error ${res.status}: ${err}`);
    }
    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

// --- Request Handler ---

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = [
      env.ALLOWED_ORIGIN || 'https://vicentedomus.github.io',
      'http://127.0.0.1:5500',
      'http://localhost:5500',
    ];
    const matchedOrigin = allowedOrigins.find(o => origin.startsWith(o)) || allowedOrigins[0];

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': matchedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    // Parse: /api/npcs o /api/npcs/{id}
    const pathParts = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '').split('/');
    const entity = pathParts[0];
    const pageId = pathParts[1] || null;

    // Endpoint especial: /api/content/{pageId} — obtener cuerpo de una página
    if (entity === 'content' && pageId && request.method === 'GET') {
      try {
        const token = env.NOTION_TOKEN;
        if (!token) throw new Error('NOTION_TOKEN not configured');
        const html = await getPageContent(pageId, token);
        return new Response(JSON.stringify({ html }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!DB_MAP[entity]) {
      return new Response(JSON.stringify({
        error: 'Not found',
        available: Object.keys(DB_MAP),
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const token = env.NOTION_TOKEN;
      if (!token) throw new Error('NOTION_TOKEN not configured');
      const dbId = DB_MAP[entity];

      // GET: Listar todas las páginas
      if (request.method === 'GET') {
        await buildNameCache(token);
        const pages = await queryDatabase(dbId, token);
        const transformer = TRANSFORMERS[entity];
        const results = pages.map(p => transformer(p));
        return new Response(JSON.stringify(results, null, 2), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
        });
      }

      // POST: Crear nueva página
      if (request.method === 'POST') {
        const data = await request.json();
        const writeMap = WRITE_MAP[entity];
        if (!writeMap) throw new Error(`Write not supported for ${entity}`);
        const properties = writeMap(data);
        const page = await createPage(dbId, properties, token);
        return new Response(JSON.stringify({ notion_id: page.id, success: true }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // PUT: Actualizar página existente
      if (request.method === 'PUT') {
        if (!pageId) throw new Error('PUT requires /{entity}/{notion_id}');
        const data = await request.json();
        const writeMap = WRITE_MAP[entity];
        if (!writeMap) throw new Error(`Write not supported for ${entity}`);
        const properties = writeMap(data);
        await updatePage(pageId, properties, token);
        return new Response(JSON.stringify({ notion_id: pageId, success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // DELETE: Archivar página (soft delete)
      if (request.method === 'DELETE') {
        if (!pageId) throw new Error('DELETE requires /{entity}/{notion_id}');
        const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ archived: true }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Notion archive error ${res.status}: ${err}`);
        }
        return new Response(JSON.stringify({ notion_id: pageId, deleted: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
