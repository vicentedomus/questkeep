-- =============================================================
-- DND-HALO — Auth + RLS (Row Level Security)
-- Ejecutar DESPUÉS de schema.sql y de crear los usuarios en Auth
-- =============================================================

-- =============================================================
-- FUNCIÓN HELPER DE ROL
-- =============================================================

create or replace function get_user_role()
returns text
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role'),
    'player'
  );
$$;

-- =============================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- =============================================================

alter table ciudades          enable row level security;
alter table npcs              enable row level security;
alter table establecimientos  enable row level security;
alter table personajes        enable row level security;
alter table items             enable row level security;
alter table quests            enable row level security;
alter table notas_dm          enable row level security;
alter table notas_jugadores   enable row level security;
alter table lugares           enable row level security;
alter table marcadores        enable row level security;
alter table npcs_items        enable row level security;
alter table npcs_lugares      enable row level security;
alter table npcs_quests       enable row level security;
alter table personajes_items  enable row level security;
alter table quests_lugares    enable row level security;
alter table quests_ciudades   enable row level security;
alter table quests_establecimientos enable row level security;
alter table quests_notas_dm   enable row level security;
alter table lugares_items     enable row level security;
alter table notas_jugadores_items enable row level security;

-- =============================================================
-- POLÍTICAS SELECT
-- =============================================================

-- ciudades: DM ve todo, jugadores solo las conocidas y no archivadas
create policy "ciudades_select" on ciudades for select using (
  get_user_role() = 'dm'
  or (not archived and conocida_jugadores = true)
);

-- npcs: igual
create policy "npcs_select" on npcs for select using (
  get_user_role() = 'dm'
  or (not archived and conocido_jugadores = true)
);

-- establecimientos: igual
create policy "establecimientos_select" on establecimientos for select using (
  get_user_role() = 'dm'
  or (not archived and conocido_jugadores = true)
);

-- personajes: todos los autenticados ven todos (no hay campo conocido_jugadores)
create policy "personajes_select" on personajes for select using (
  auth.role() = 'authenticated' and (not archived or get_user_role() = 'dm')
);

-- items: conocido_jugadores
create policy "items_select" on items for select using (
  get_user_role() = 'dm'
  or (not archived and conocido_jugadores = true)
);

-- quests: conocido_jugadores
create policy "quests_select" on quests for select using (
  get_user_role() = 'dm'
  or (not archived and conocido_jugadores = true)
);

-- notas_dm: solo DM
create policy "notas_dm_select" on notas_dm for select using (
  get_user_role() = 'dm'
);

-- notas_jugadores: todos los autenticados
create policy "notas_jugadores_select" on notas_jugadores for select using (
  auth.role() = 'authenticated' and not archived
);

-- lugares: conocido_jugadores
create policy "lugares_select" on lugares for select using (
  get_user_role() = 'dm'
  or (not archived and conocido_jugadores = true)
);

-- marcadores: todos los autenticados (filtrado heredado por lugares via RLS)
create policy "marcadores_select" on marcadores for select using (
  auth.role() = 'authenticated'
);

-- junction tables: todos los autenticados
create policy "npcs_items_select"              on npcs_items              for select using (auth.role() = 'authenticated');
create policy "npcs_lugares_select"            on npcs_lugares            for select using (auth.role() = 'authenticated');
create policy "npcs_quests_select"             on npcs_quests             for select using (auth.role() = 'authenticated');
create policy "personajes_items_select"        on personajes_items        for select using (auth.role() = 'authenticated');
create policy "quests_lugares_select"          on quests_lugares          for select using (auth.role() = 'authenticated');
create policy "quests_ciudades_select"         on quests_ciudades         for select using (auth.role() = 'authenticated');
create policy "quests_establecimientos_select" on quests_establecimientos for select using (auth.role() = 'authenticated');
create policy "quests_notas_dm_select"         on quests_notas_dm         for select using (auth.role() = 'authenticated');
create policy "lugares_items_select"           on lugares_items           for select using (auth.role() = 'authenticated');
create policy "notas_jugadores_items_select"   on notas_jugadores_items   for select using (auth.role() = 'authenticated');

-- =============================================================
-- POLÍTICAS INSERT
-- =============================================================

-- DM puede insertar en todo
create policy "ciudades_insert"         on ciudades         for insert with check (get_user_role() = 'dm');
create policy "npcs_insert"             on npcs             for insert with check (get_user_role() = 'dm' or creado_por_jugador = true);
create policy "establecimientos_insert" on establecimientos for insert with check (get_user_role() = 'dm' or creado_por_jugador = true);
create policy "personajes_insert"       on personajes       for insert with check (get_user_role() = 'dm');
create policy "items_insert"            on items            for insert with check (get_user_role() = 'dm');
create policy "quests_insert"           on quests           for insert with check (get_user_role() = 'dm');
create policy "notas_dm_insert"         on notas_dm         for insert with check (get_user_role() = 'dm');
create policy "notas_jugadores_insert"  on notas_jugadores  for insert with check (auth.role() = 'authenticated');
create policy "lugares_insert"          on lugares          for insert with check (get_user_role() = 'dm' or creado_por_jugador = true);
create policy "marcadores_insert"       on marcadores       for insert with check (auth.role() = 'authenticated');

-- Junction tables: DM inserta, jugadores solo en las que pueden crear
create policy "npcs_items_insert"              on npcs_items              for insert with check (get_user_role() = 'dm');
create policy "npcs_lugares_insert"            on npcs_lugares            for insert with check (get_user_role() = 'dm');
create policy "npcs_quests_insert"             on npcs_quests             for insert with check (get_user_role() = 'dm');
create policy "personajes_items_insert"        on personajes_items        for insert with check (get_user_role() = 'dm');
create policy "quests_lugares_insert"          on quests_lugares          for insert with check (get_user_role() = 'dm');
create policy "quests_ciudades_insert"         on quests_ciudades         for insert with check (get_user_role() = 'dm');
create policy "quests_establecimientos_insert" on quests_establecimientos for insert with check (get_user_role() = 'dm');
create policy "quests_notas_dm_insert"         on quests_notas_dm         for insert with check (get_user_role() = 'dm');
create policy "lugares_items_insert"           on lugares_items           for insert with check (get_user_role() = 'dm');
create policy "notas_jugadores_items_insert"   on notas_jugadores_items   for insert with check (auth.role() = 'authenticated');

-- =============================================================
-- POLÍTICAS UPDATE
-- =============================================================

create policy "ciudades_update"         on ciudades         for update using (get_user_role() = 'dm');
create policy "npcs_update"             on npcs             for update using (get_user_role() = 'dm' or creado_por_jugador = true);
create policy "establecimientos_update" on establecimientos for update using (get_user_role() = 'dm' or creado_por_jugador = true);
create policy "personajes_update"       on personajes       for update using (get_user_role() = 'dm');
create policy "items_update"            on items            for update using (get_user_role() = 'dm');
create policy "quests_update"           on quests           for update using (get_user_role() = 'dm');
create policy "notas_dm_update"         on notas_dm         for update using (get_user_role() = 'dm');
create policy "notas_jugadores_update"  on notas_jugadores  for update using (auth.role() = 'authenticated');
create policy "lugares_update"          on lugares          for update using (get_user_role() = 'dm' or creado_por_jugador = true);
create policy "marcadores_update"       on marcadores       for update using (auth.role() = 'authenticated');

-- =============================================================
-- POLÍTICAS DELETE (soft delete via archived=true, solo DM)
-- =============================================================

create policy "ciudades_delete"         on ciudades         for delete using (get_user_role() = 'dm');
create policy "npcs_delete"             on npcs             for delete using (get_user_role() = 'dm');
create policy "establecimientos_delete" on establecimientos for delete using (get_user_role() = 'dm');
create policy "personajes_delete"       on personajes       for delete using (get_user_role() = 'dm');
create policy "items_delete"            on items            for delete using (get_user_role() = 'dm');
create policy "quests_delete"           on quests           for delete using (get_user_role() = 'dm');
create policy "notas_dm_delete"         on notas_dm         for delete using (get_user_role() = 'dm');
create policy "notas_jugadores_delete"  on notas_jugadores  for delete using (auth.role() = 'authenticated');
create policy "lugares_delete"          on lugares          for delete using (get_user_role() = 'dm');
create policy "marcadores_delete"       on marcadores       for delete using (auth.role() = 'authenticated');
