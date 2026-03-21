# Plan: Integración D&D Beyond API — Opción 1 (API Directa via Proxy)

## Estado Actual

Ya tenemos la base funcional:
- **Edge Function proxy** (`supabase/functions/dndbeyond-proxy/index.ts`) que llama a `character-service.dndbeyond.com/character/v5/character/{id}`
- **Parser** (`dndbeyond.js`) que extrae abilities, HP, AC, clases, equipo, spells, monedas
- **Renderer** que genera una hoja de personaje visual dentro del modal de detalle
- **Campo `dndbeyond_url`** en el form schema de personajes (pendiente: columna en Supabase)

### Problema actual
El campo `dndbeyond_url` no se persiste porque la columna no existe en la tabla `personajes` de Supabase. Además, los datos de D&D Beyond solo se muestran en el modal y no se sincronizan con los campos locales (nivel, AC, HP máx).

---

## Tareas a Implementar

### 1. Crear columna `dndbeyond_url` en Supabase

**Archivo:** Ejecutar en Supabase SQL Editor

```sql
ALTER TABLE personajes ADD COLUMN IF NOT EXISTS dndbeyond_url TEXT;
```

Ya existe la migración en `supabase/migrations/20260321_add_dndbeyond_url_to_personajes.sql`.

**Verificar:** Después de ejecutar, editar un personaje, agregar URL y guardar. Confirmar que el valor persiste al recargar.

---

### 2. Auto-sync: poblar campos locales desde D&D Beyond

Cuando un personaje tiene `dndbeyond_url`, sincronizar automáticamente `nivel`, `ac`, `hp_maximo`, `clase`, `subclase` y `raza` desde la API.

**Archivo:** `app.js` — función `buildDetailHTML`, case `'personajes'`

**Lógica:**
1. Al abrir el detalle de un personaje con `dndbeyond_url`, llamar a `ddbFetchCharacter(id)`
2. Comparar los valores de D&D Beyond con los locales
3. Si difieren, mostrar un banner: _"Los datos de D&D Beyond difieren. ¿Sincronizar?"_
4. Al aceptar, actualizar los campos en Supabase via `sbUpdate`

**Campos a sincronizar:**

| Campo local    | Fuente D&D Beyond             |
|---------------|-------------------------------|
| `nivel`       | `char.totalLevel`             |
| `ac`          | `char.ac`                     |
| `hp_maximo`   | `char.maxHP`                  |
| `clase`       | `char.classes[0].name`        |
| `subclase`    | `char.classes[0].subclass`    |
| `raza`        | `char.race`                   |

**Opcional (fase 2):** Auto-sync silencioso en `renderAll()` sin confirmación del usuario.

---

### 3. Mejorar el form de edición para auto-completar URL

**Archivo:** `app.js` — función `formFieldHTML` y/o `switchToEdit`

Cuando el usuario pega una URL de D&D Beyond en el campo:
1. Detectar el `input` event en `field-dndbeyond_url`
2. Extraer el ID con `ddbExtractId(value)`
3. Si es válido, hacer fetch al proxy y pre-llenar los campos vacíos (clase, raza, nivel, etc.)
4. Mostrar un indicador visual (checkmark verde) de que la URL es válida

**Código sugerido (en `switchToEdit` o post-render):**
```javascript
const urlInput = document.getElementById('field-dndbeyond_url');
if (urlInput) {
  urlInput.addEventListener('change', async () => {
    const id = ddbExtractId(urlInput.value);
    if (!id) return;
    try {
      const char = await ddbFetchCharacter(id);
      // Pre-llenar campos vacíos
      const fields = {
        clase: char.classes[0]?.name,
        subclase: char.classes[0]?.subclass,
        raza: char.race,
        nivel: char.totalLevel,
        ac: char.ac,
        hp_maximo: char.maxHP,
      };
      for (const [key, val] of Object.entries(fields)) {
        const el = document.getElementById(`field-${key}`);
        if (el && !el.value) el.value = val;
      }
    } catch (e) {
      console.warn('DDB fetch failed:', e);
    }
  });
}
```

---

### 4. Mostrar hoja D&D Beyond en las cards (no solo en modal)

**Archivo:** `app.js` — función que renderiza cards de personajes (~línea 460-502)

Agregar un mini-badge o indicador en la card del personaje si tiene URL de D&D Beyond, tipo:
- Icono de D&D Beyond (dado d20 o similar)
- Tooltip con "Vinculado a D&D Beyond"

Esto es cosmético pero ayuda a saber qué personajes están vinculados.

---

### 5. Cache de datos D&D Beyond en Supabase (opcional, fase 2)

Para no depender de la API en cada carga:

1. Crear tabla `ddb_cache`:
```sql
CREATE TABLE ddb_cache (
  character_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT now()
);
```

2. Modificar el proxy para cachear en esta tabla
3. Servir desde cache si tiene < 5 min de antigüedad
4. Esto reduce latencia y evita rate limiting de D&D Beyond

---

## Orden de Implementación Recomendado

1. **Paso 1** — Ejecutar migración SQL (5 min) ← **BLOCKER, hacer primero**
2. **Paso 3** — Auto-completar form al pegar URL (30 min)
3. **Paso 2** — Auto-sync banner en detalle (45 min)
4. **Paso 4** — Badge en cards (15 min)
5. **Paso 5** — Cache en Supabase (opcional, 1hr+)

---

## Notas

- La API de D&D Beyond (`character-service.dndbeyond.com`) es pública para personajes marcados como **públicos**. No requiere autenticación.
- El proxy Edge Function es necesario para evitar CORS desde el frontend.
- El fix actual en `supabase-client.js` (`_extractBadColumn`) hace que el save no falle aunque la columna no exista aún — pero el URL no se persiste hasta ejecutar la migración.
