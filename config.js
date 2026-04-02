/**
 * config.js — Configuración global derivada de campaign.js
 * campaign.js se carga ANTES de este archivo y define CAMPAIGN.
 */
const CONFIG = {
  // Campaña
  SLUG:           CAMPAIGN.slug,
  SCHEMA:         CAMPAIGN.schema || CAMPAIGN.slug.replace(/-/g, '_'),
  NAME:           CAMPAIGN.name,
  SUBTITLE:       CAMPAIGN.subtitle,
  HAS_MAP:        CAMPAIGN.hasMap,
  HAS_AI:         CAMPAIGN.hasAI,
  // Supabase
  SUPABASE_URL:      CAMPAIGN.supabaseUrl,
  SUPABASE_ANON_KEY: CAMPAIGN.supabaseKey,
  // GitHub
  GITHUB_OWNER: CAMPAIGN.githubOwner,
  GITHUB_REPO:  CAMPAIGN.githubRepo,
  // GitHub token se guarda en localStorage del DM, nunca en este archivo
};

/** Genera una key de localStorage con prefijo de campaña */
function storageKey(name) {
  return CONFIG.SLUG + '_' + name;
}
