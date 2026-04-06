import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ENV_ORIGINS = Deno.env.get("ALLOWED_ORIGINS") || "";
const DEFAULT_ORIGINS = "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,https://vicentedomus.github.io";
const ALLOWED_ORIGINS = (ENV_ORIGINS ? `${ENV_ORIGINS},${DEFAULT_ORIGINS}` : DEFAULT_ORIGINS).split(",");

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, headers);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();
    const { campaignName, username, password } = body;

    if (!campaignName || !username || !password) {
      return jsonResponse({ error: "campaignName, username y password son requeridos" }, 400, headers);
    }

    if (password.length < 6) {
      return jsonResponse({ error: "La contraseña debe tener al menos 6 caracteres" }, 400, headers);
    }

    const slug = slugify(campaignName);
    if (!slug) {
      return jsonResponse({ error: "Nombre de campaña inválido" }, 400, headers);
    }

    // Check if slug already exists
    const { data: existing } = await adminClient
      .from("campaigns")
      .select("slug")
      .eq("slug", slug)
      .single();

    if (existing) {
      return jsonResponse({ error: `Ya existe una campaña con el slug "${slug}"` }, 400, headers);
    }

    // Create or find auth user
    const email = `${username.toLowerCase()}@dnd.local`;
    let userId: string;

    const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = allUsers?.find((u) => u.email === email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: username.toLowerCase(),
          mustChangePassword: false,
        },
      });
      if (error) return jsonResponse({ error: error.message }, 400, headers);
      userId = data.user.id;
    }

    // Create campaign
    const { error: campError } = await adminClient
      .from("campaigns")
      .insert({
        slug,
        nombre: campaignName,
        created_by: userId,
      });

    if (campError) return jsonResponse({ error: campError.message }, 500, headers);

    // Add DM membership
    const { error: memberError } = await adminClient
      .from("campaign_members")
      .insert({
        user_id: userId,
        campaign: slug,
        role: "dm",
        username: username.toLowerCase(),
      });

    if (memberError) return jsonResponse({ error: memberError.message }, 500, headers);

    return jsonResponse({
      campaign: { slug, nombre: campaignName },
      user: { id: userId, username: username.toLowerCase(), role: "dm" },
    }, 201, headers);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500, headers);
  }
});
