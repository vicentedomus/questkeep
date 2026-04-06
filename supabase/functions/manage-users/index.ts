import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ENV_ORIGINS = Deno.env.get("ALLOWED_ORIGINS") || "";
const DEFAULT_ORIGINS = "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000,https://vicentedomus.github.io,https://questkeep.vercel.app";
const ALLOWED_ORIGINS = (ENV_ORIGINS ? `${ENV_ORIGINS},${DEFAULT_ORIGINS}` : DEFAULT_ORIGINS).split(",");

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-campaign-slug",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
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

  const authHeader = req.headers.get("authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Admin client for user management
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller's JWT
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: callerJwt } } = await callerClient.auth.getUser();
  if (!callerJwt) {
    return jsonResponse({ error: "No autenticado" }, 401, headers);
  }

  const body = await req.json();
  const { action } = body;

  // Campaign slug comes from the request header (set by frontend)
  const campaignSlug = req.headers.get("x-campaign-slug") || body.campaign || "";
  if (!campaignSlug) {
    return jsonResponse({ error: "Falta el slug de la campaña" }, 400, headers);
  }

  // Verify caller is DM of this campaign via campaign_members
  const { data: callerMembership } = await adminClient
    .from("campaign_members")
    .select("role")
    .eq("user_id", callerJwt.id)
    .eq("campaign", campaignSlug)
    .single();

  if (!callerMembership || callerMembership.role !== "dm") {
    return jsonResponse({ error: "Solo el DM puede administrar usuarios" }, 403, headers);
  }

  // ── LIST: Get all users for this campaign ─────────────────
  if (action === "list") {
    const { data: members, error } = await adminClient
      .from("campaign_members")
      .select("user_id, username, role, created_at")
      .eq("campaign", campaignSlug);

    if (error) return jsonResponse({ error: error.message }, 500, headers);

    // Get mustChangePassword from auth.users metadata
    const users = [];
    for (const m of (members || [])) {
      const { data: { user } } = await adminClient.auth.admin.getUserById(m.user_id);
      users.push({
        id: m.user_id,
        username: m.username,
        role: m.role,
        mustChangePassword: user?.user_metadata?.mustChangePassword || false,
        created_at: m.created_at,
      });
    }

    return jsonResponse({ users }, 200, headers);
  }

  // ── CREATE: Add a new user ────────────────────────────────
  if (action === "create") {
    const { username, role, password } = body;
    if (!username || !role || !password) {
      return jsonResponse({ error: "username, role y password son requeridos" }, 400, headers);
    }

    const email = `${username.toLowerCase()}@dnd.local`;

    // Check if user already exists in auth
    const { data: { users: existing } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = existing?.find((u) => u.email === email);

    let userId: string;

    if (existingUser) {
      // User exists — check if already member of this campaign
      const { data: existingMember } = await adminClient
        .from("campaign_members")
        .select("user_id")
        .eq("user_id", existingUser.id)
        .eq("campaign", campaignSlug)
        .single();

      if (existingMember) {
        return jsonResponse({ error: `${username} ya es miembro de esta campaña` }, 400, headers);
      }
      userId = existingUser.id;
    } else {
      // Create new auth user
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: username.toLowerCase(),
          mustChangePassword: true,
        },
      });
      if (error) return jsonResponse({ error: error.message }, 400, headers);
      userId = data.user.id;
    }

    // Add membership
    const { error: memberError } = await adminClient
      .from("campaign_members")
      .insert({
        user_id: userId,
        campaign: campaignSlug,
        role,
        username: username.toLowerCase(),
      });

    if (memberError) return jsonResponse({ error: memberError.message }, 400, headers);

    return jsonResponse({
      user: {
        id: userId,
        username: username.toLowerCase(),
        role,
        mustChangePassword: !existingUser,
      },
    }, 201, headers);
  }

  // ── UPDATE: Change role or reset password ─────────────────
  if (action === "update") {
    const { userId, role, resetPassword, newPassword } = body;
    if (!userId) return jsonResponse({ error: "userId requerido" }, 400, headers);

    // Verify target user is member of this campaign
    const { data: targetMember } = await adminClient
      .from("campaign_members")
      .select("*")
      .eq("user_id", userId)
      .eq("campaign", campaignSlug)
      .single();

    if (!targetMember) {
      return jsonResponse({ error: "Usuario no encontrado en esta campaña" }, 404, headers);
    }

    if (role) {
      await adminClient
        .from("campaign_members")
        .update({ role })
        .eq("user_id", userId)
        .eq("campaign", campaignSlug);
    }

    if (resetPassword) {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword || "cambiar2026",
        user_metadata: { mustChangePassword: true },
      });
      if (error) return jsonResponse({ error: error.message }, 400, headers);
    }

    return jsonResponse({ ok: true }, 200, headers);
  }

  // ── DELETE: Remove a user from this campaign ──────────────
  if (action === "delete") {
    const { userId } = body;
    if (!userId) return jsonResponse({ error: "userId requerido" }, 400, headers);

    // Verify target user is member of this campaign
    const { data: targetMember } = await adminClient
      .from("campaign_members")
      .select("*")
      .eq("user_id", userId)
      .eq("campaign", campaignSlug)
      .single();

    if (!targetMember) {
      return jsonResponse({ error: "Usuario no encontrado en esta campaña" }, 404, headers);
    }

    // Don't allow DM to delete themselves
    if (userId === callerJwt.id) {
      return jsonResponse({ error: "No puedes eliminarte a ti mismo" }, 400, headers);
    }

    // Remove membership (don't delete auth user — may be in other campaigns)
    const { error } = await adminClient
      .from("campaign_members")
      .delete()
      .eq("user_id", userId)
      .eq("campaign", campaignSlug);

    if (error) return jsonResponse({ error: error.message }, 400, headers);
    return jsonResponse({ ok: true }, 200, headers);
  }

  return jsonResponse({ error: `Acción desconocida: ${action}` }, 400, headers);
});
