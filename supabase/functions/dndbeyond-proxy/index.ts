import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = [
  "https://vicentedomus.github.io",
  "https://questkeep.vercel.app",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5500",
];

const DDB_API = "https://character-service.dndbeyond.com/character/v5/character";

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const characterId = url.searchParams.get("id");

  if (!characterId || !/^\d+$/.test(characterId)) {
    return new Response(JSON.stringify({ error: "Valid numeric character ID required" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const ddbRes = await fetch(`${DDB_API}/${characterId}?includeCustomItems=true`, {
      headers: { "Accept": "application/json" },
    });

    if (!ddbRes.ok) {
      const errText = await ddbRes.text();
      return new Response(JSON.stringify({
        error: `D&D Beyond API returned ${ddbRes.status}`,
        detail: errText,
        hint: ddbRes.status === 403
          ? "El personaje debe estar configurado como PÚBLICO en D&D Beyond."
          : undefined,
      }), {
        status: ddbRes.status === 403 ? 403 : 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const data = await ddbRes.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
