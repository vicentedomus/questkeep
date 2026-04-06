import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://vicentedomus.github.io",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5500",
];

const SYSTEM_PROMPT = `Eres un **planificador de sesiones de D&D 5e** para la campaña **Halo**. Tu trabajo es generar planes de sesión estructurados siguiendo la metodología de **Sly Flourish (The Lazy DM Workbook)**.

---

## Calibración por duración

El input incluye \`duracion_horas\`. Úsalo para calibrar la cantidad de contenido:

| Duración | Escenas | Secretos |
|----------|---------|----------|
| ≤2h      | 3       | 5-6      |
| 2.5–3h   | 4       | 7-8      |
| ≥4h      | 5-6     | 10       |

Si no se especifica duración, usa 4 escenas y 7 secretos.

---

## Metodología: Los 10 pasos del Lazy DM

Genera el plan siguiendo estos bloques en orden:

### 1. Personajes
Ya vienen como input. Úsalos para personalizar todo el plan: sus motivaciones, habilidades, conflictos personales y relaciones con NPCs deben influir en cada bloque.

### 2. Gancho Fuerte (Strong Start)
Una escena inmediata de **acción o tensión** que lanza la sesión sin preámbulos. No es "los personajes se despiertan en la posada" — es algo que los pone en movimiento desde el segundo uno. Debe conectar con lo que ocurrió en la sesión anterior o con una quest activa.

### 3. Escenas Potenciales
**Cantidad según duración** (ver tabla). No un script — ingredientes flexibles que el DM usa, adapta o descarta. Incluye tipo (combate, social, exploración, misterio) y nivel de tensión (1-5).

### 4. Secretos y Pistas
**Cantidad según duración** (ver tabla). Cada secreto tiene una **pista física descubrible** — algo tangible, no solo información que el DM sabe. Múltiples caminos a la misma información. Incluye quién puede revelar cada secreto.

### 5. Locaciones Fantásticas
**3-5 lugares** con descripción sensorial rica (qué ven, oyen, huelen, sienten). Cada locación tiene personalidad. Incluye tipo y región.

### 6. NPCs Importantes
**3-5 NPCs** con: nombre, rol en la sesión, motivación concreta, tono de voz (arquetipo breve), y una frase memorable. No monólogos — solo lo esencial para que el DM los interprete.

### 7. Tesoros Relevantes
**2-4 tesoros** que encajan con las quests activas. No solo oro — también objetos narrativos, información valiosa, favores. Incluye portador sugerido del party.

### 8. Monstruos en Contexto
Para cada monstruo seleccionado: cantidad sugerida y **por qué están ahí** narrativamente. No son encuentros aleatorios — cada uno tiene un motivo.

### 9. Momento Pivote
**Un párrafo.** La decisión, confrontación o revelación central que hace memorable la sesión. Puede ser una traición, una elección moral difícil, o una consecuencia inesperada del pasado. Sin pivote, la sesión es olvidable.

### 10. Notas Privadas DM
**3-5 bullets SOLO para el DM.** Motivaciones ocultas de NPCs que el party no sabe, contingencias si el plan sale mal, secretos a largo plazo que no se revelan esta sesión. No narrativa — notas operativas concisas.

---

## Instrucciones de tono

- Ficción de **alta fantasía** — mundo Halo, dramático pero con espacio para improvisación
- Escribe en **español**
- Dirígete al DM en segunda persona: "tus jugadores", "puedes usar..."
- Sé **conciso y evocador** — como notas de prep, no como prosa literaria
- Las descripciones sensoriales son cortas pero vívidas
- Los NPCs hablan con voz propia (una frase basta para definirlos)

---

## Modo regeneración de bloque

Si el usuario pide regenerar un bloque específico, regenera SOLO ese bloque manteniendo coherencia con el resto del plan. Los bloques válidos son: bloque_strong_start, bloque_escenas, bloque_secretos, bloque_npcs, bloque_locaciones, bloque_tesoros, bloque_monstruos, bloque_pivote, bloque_notas_dm.

---

## Formato de output

Responde SIEMPRE con JSON puro, sin markdown exterior (sin \\\`\\\`\\\`json), sin texto antes o después. El JSON debe seguir esta estructura exacta:

{
  "bloque_strong_start": "texto narrativo del gancho fuerte",
  "bloque_escenas": [
    {"titulo": "...", "descripcion": "...", "tipo": "combate|social|exploración|misterio", "tension": 1-5}
  ],
  "bloque_secretos": [
    {"secreto": "...", "pista": "...", "quien_sabe": "..."}
  ],
  "bloque_npcs": [
    {"nombre": "...", "rol": "...", "motivacion": "...", "tono": "...", "frase": "..."}
  ],
  "bloque_locaciones": [
    {"nombre": "...", "descripcion": "...", "tipo": "...", "region": "..."}
  ],
  "bloque_tesoros": [
    {"nombre": "...", "tipo": "...", "rareza": "...", "descripcion": "...", "portador_sugerido": "..."}
  ],
  "bloque_monstruos": [
    {"monstruo_id": "...", "nombre": "...", "cantidad": 1, "contexto_narrativo": "..."}
  ],
  "bloque_pivote": "texto del momento pivote — la decisión o revelación central de la sesión",
  "bloque_notas_dm": ["nota privada 1", "nota privada 2", "nota privada 3"]
}`;

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-campaign-slug",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  // Verify JWT + membership in campaign 'halo' (IA solo para Halo)
  const authHeader = req.headers.get("authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) {
    return new Response(JSON.stringify({ error: "No autenticado" }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: membership } = await adminClient
    .from("campaign_members")
    .select("role")
    .eq("user_id", caller.id)
    .eq("campaign", "halo")
    .single();

  if (!membership || membership.role !== "dm") {
    return new Response(JSON.stringify({ error: "Planificador solo disponible para DM de Halo" }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { formData, campaignContext, fecha_sesion } = body;

    if (!formData) {
      return new Response(JSON.stringify({ error: "formData required" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    // Build user prompt from formData
    const userPromptParts: string[] = [];

    userPromptParts.push(`# Plan de sesión — ${fecha_sesion || "Fecha no especificada"}`);

    // Duration
    if (formData.duracion_horas) {
      userPromptParts.push(`**Duración de la sesión: ${formData.duracion_horas}h** — calibra la cantidad de escenas y secretos según la tabla.`);
    }

    // Campaign context
    if (campaignContext) {
      userPromptParts.push(`\n[CONTEXTO DE CAMPAÑA]\n${campaignContext}\n[/CONTEXTO DE CAMPAÑA]`);
    }

    // Characters
    if (formData.personajes && formData.personajes.length > 0) {
      userPromptParts.push("\n## Personajes del party");
      for (const p of formData.personajes) {
        userPromptParts.push(`- ${p.nombre || p.name} (${p.raza || "?"} ${p.clase || "?"}, nivel ${p.nivel || "?"}) — Jugador: ${p.jugador || "?"}`);
      }
    }

    // Strong start hint
    if (formData.strong_start_hint) {
      userPromptParts.push(`\n## Pista para el Gancho Fuerte\n${formData.strong_start_hint}`);
    }

    // Scenes hint
    if (formData.escenas_hint) {
      userPromptParts.push(`\n## Pista para Escenas\n${formData.escenas_hint}`);
    }

    // Secrets hint
    if (formData.secretos_hint) {
      userPromptParts.push(`\n## Pista para Secretos\n${formData.secretos_hint}`);
    }

    // Selected NPCs
    if (formData.npcs_seleccionados && formData.npcs_seleccionados.length > 0) {
      userPromptParts.push("\n## NPCs seleccionados para esta sesión");
      for (const npc of formData.npcs_seleccionados) {
        const desc = npc.descripcion ? ` — ${npc.descripcion}` : "";
        userPromptParts.push(`- ${npc.nombre} (${npc.raza || "?"}, ${npc.tipo_npc || npc.rol || "?"})${desc}`);
      }
    }

    // Selected locations
    if (formData.lugares_seleccionados && formData.lugares_seleccionados.length > 0) {
      userPromptParts.push("\n## Lugares seleccionados para esta sesión");
      for (const lugar of formData.lugares_seleccionados) {
        userPromptParts.push(`- ${lugar.nombre} (${lugar.tipo || "?"}) — ${lugar.region || "?"}`);
      }
    }

    // Selected items
    if (formData.items_seleccionados && formData.items_seleccionados.length > 0) {
      userPromptParts.push("\n## Items seleccionados para esta sesión");
      for (const item of formData.items_seleccionados) {
        userPromptParts.push(`- ${item.nombre} (${item.tipo || "?"}, ${item.rareza || "?"})`);
      }
    }

    // Selected monsters
    if (formData.monstruos_seleccionados && formData.monstruos_seleccionados.length > 0) {
      userPromptParts.push("\n## Monstruos seleccionados para esta sesión");
      for (const m of formData.monstruos_seleccionados) {
        userPromptParts.push(`- ${m.nombre || m.name} (CR ${m.cr || "?"})`);
      }
    }

    // Block objective (regeneration mode)
    if (formData.bloque_objetivo) {
      userPromptParts.push(`\n## INSTRUCCIÓN ESPECIAL: Regenerar solo un bloque\nRegenera ÚNICAMENTE el bloque "${formData.bloque_objetivo}". Devuelve el JSON completo pero solo modifica ese bloque. Mantén coherencia con el resto del plan.`);
    } else {
      userPromptParts.push("\n## Instrucción\nGenera el plan de sesión completo con los 7 bloques.");
    }

    const userPrompt = userPromptParts.join("\n");

    // Call Anthropic API (no streaming)
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(
        JSON.stringify({ error: `Claude API error: ${anthropicRes.status}`, detail: errText }),
        {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    const anthropicData = await anthropicRes.json();

    // Extract text content from Claude response
    const textContent = anthropicData.content?.find(
      (c: { type: string }) => c.type === "text"
    );

    if (!textContent || !textContent.text) {
      return new Response(
        JSON.stringify({ error: "No text content in Claude response" }),
        {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    // Parse JSON from response — strip markdown fences if present
    let rawText = textContent.text.trim();
    if (rawText.startsWith("```")) {
      rawText = rawText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    let sessionPlan;
    try {
      sessionPlan = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Failed to parse Claude response as JSON",
          raw: rawText.substring(0, 500),
        }),
        {
          status: 502,
          headers: { ...headers, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(sessionPlan), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
