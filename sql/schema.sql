-- =============================================================
-- DND-HALO — Schema Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================

create extension if not exists "pgcrypto";

-- =============================================================
-- TABLAS PRINCIPALES
-- =============================================================

create table ciudades (
  id                  uuid primary key default gen_random_uuid(),
  notion_id           text unique,
  nombre              text not null,
  burg_id             integer,
  descripcion         text,
  descripcion_lider   text,
  estado              text,
  lider               text,
  poblacion           integer,
  conocida_jugadores  boolean not null default false,
  creado_por_jugador  boolean not null default false,
  archived            boolean not null default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table npcs (
  id                  uuid primary key default gen_random_uuid(),
  notion_id           text unique,
  nombre              text not null,
  raza                text,
  tipo_npc            text,
  estado              text,
  rol                 text,
  ciudad_id           uuid references ciudades(id) on delete set null,
  -- establecimiento_id se agrega al final (dependencia circular con establecimientos)
  descripcion         text,
  conocido_jugadores  boolean not null default false,
  creado_por_jugador  boolean not null default false,
  archived            boolean not null default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table establecimientos (
  id                  uuid primary key default gen_random_uuid(),
  notion_id           text unique,
  nombre              text not null,
  tipo                text,
  ciudad_id           uuid references ciudades(id) on delete set null,
  dueno_id            uuid references npcs(id) on delete set null,
  descripcion         text,
  conocido_jugadores  boolean not null default false,
  creado_por_jugador  boolean not null default false,
  archived            boolean not null default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- FK circular: npc puede pertenecer a un establecimiento
alter table npcs
  add column establecimiento_id uuid references establecimientos(id) on delete set null;

create table personajes (
  id          uuid primary key default gen_random_uuid(),
  notion_id   text unique,
  nombre      text not null,
  clase       text,
  subclase    text,
  raza        text,
  tipo        text,
  es_pj       boolean not null default false,
  jugador     text,
  nivel       integer,
  ac          integer,
  hp_maximo   integer,
  descripcion text,
  rol         text,
  archived    boolean not null default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table items (
  id                     uuid primary key default gen_random_uuid(),
  notion_id              text unique,
  nombre                 text not null,
  tipo                   text,
  rareza                 text,
  personaje_id           uuid references personajes(id) on delete set null,
  npc_portador_id        uuid references npcs(id) on delete set null,
  requiere_sintonizacion boolean not null default false,
  fuente                 text,
  descripcion            text,
  conocido_jugadores     boolean not null default false,
  archived               boolean not null default false,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table quests (
  id                 uuid primary key default gen_random_uuid(),
  notion_id          text unique,
  nombre             text not null,
  estado             text,
  resumen            text,
  recompensa_gp      text,
  conocido_jugadores boolean not null default false,
  archived           boolean not null default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table notas_dm (
  id                  uuid primary key default gen_random_uuid(),
  notion_id           text unique,
  nombre              text not null,
  fecha               date,
  jugadores_presentes text[],
  resumen             text,
  contenido_html      text,
  archived            boolean not null default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table notas_jugadores (
  id         uuid primary key default gen_random_uuid(),
  notion_id  text unique,
  nombre     text not null,
  fecha      date,
  jugador    text[],
  resumen    text,
  archived   boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table lugares (
  id                 uuid primary key default gen_random_uuid(),
  notion_id          text unique,
  nombre             text not null,
  tipo               text,
  region             text,
  estado_exploracion text,
  descripcion        text,
  ciudad_id          uuid references ciudades(id) on delete set null,
  conocido_jugadores boolean not null default false,
  creado_por_jugador boolean not null default false,
  archived           boolean not null default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table marcadores (
  id         uuid primary key default gen_random_uuid(),
  lugar_id   uuid unique references lugares(id) on delete cascade,
  notion_id  text unique,
  x          numeric not null,
  y          numeric not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =============================================================
-- JUNCTION TABLES (relaciones muchos a muchos)
-- =============================================================

create table npcs_items (
  npc_id  uuid references npcs(id) on delete cascade,
  item_id uuid references items(id) on delete cascade,
  primary key (npc_id, item_id)
);

create table npcs_lugares (
  npc_id   uuid references npcs(id) on delete cascade,
  lugar_id uuid references lugares(id) on delete cascade,
  primary key (npc_id, lugar_id)
);

create table npcs_quests (
  npc_id   uuid references npcs(id) on delete cascade,
  quest_id uuid references quests(id) on delete cascade,
  primary key (npc_id, quest_id)
);

create table personajes_items (
  personaje_id uuid references personajes(id) on delete cascade,
  item_id      uuid references items(id) on delete cascade,
  primary key (personaje_id, item_id)
);

create table quests_lugares (
  quest_id uuid references quests(id) on delete cascade,
  lugar_id uuid references lugares(id) on delete cascade,
  primary key (quest_id, lugar_id)
);

create table quests_ciudades (
  quest_id  uuid references quests(id) on delete cascade,
  ciudad_id uuid references ciudades(id) on delete cascade,
  primary key (quest_id, ciudad_id)
);

create table quests_establecimientos (
  quest_id           uuid references quests(id) on delete cascade,
  establecimiento_id uuid references establecimientos(id) on delete cascade,
  primary key (quest_id, establecimiento_id)
);

create table quests_notas_dm (
  quest_id   uuid references quests(id) on delete cascade,
  nota_dm_id uuid references notas_dm(id) on delete cascade,
  primary key (quest_id, nota_dm_id)
);

create table lugares_items (
  lugar_id uuid references lugares(id) on delete cascade,
  item_id  uuid references items(id) on delete cascade,
  primary key (lugar_id, item_id)
);

create table notas_jugadores_items (
  nota_jugador_id uuid references notas_jugadores(id) on delete cascade,
  item_id         uuid references items(id) on delete cascade,
  primary key (nota_jugador_id, item_id)
);
