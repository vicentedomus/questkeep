/**
 * campaign.example.js — Plantilla de configuración por campaña.
 *
 * Copia este archivo como "campaign.js" y llena los valores de TU campaña.
 * campaign.js está en .gitignore — nunca se sube al repo.
 */
const CAMPAIGN = {
  slug:           'mi-campana',           // ID corto, sin espacios (se usa en localStorage, cache, emails)
  schema:         'mi_campana',           // Schema de Postgres (= slug con guiones reemplazados por _)
  name:           'Nombre de campaña',    // Se muestra en la pantalla de login y sidebar
  subtitle:       'Subtítulo opcional',   // Debajo del nombre en el sidebar
  supabaseUrl:    'https://XXXXX.supabase.co',
  supabaseKey:    'eyJ...',               // anon public key de Supabase (compartida entre campañas)
  githubOwner:    'tu-usuario',
  githubRepo:     'tu-repo',
  hasMap:         false,                  // true si tienes un mapa SVG en data/map.svg
  hasAI:          false,                  // true si configuraste Edge Functions + API key Anthropic
};
