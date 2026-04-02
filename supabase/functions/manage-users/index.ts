import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000").split(",");

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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, headers);
  }

  // Verify caller is authenticated DM
  const authHeader = req.headers.get("authorization") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Admin client for user management
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Verify the caller's JWT to ensure they are DM
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user: callerJwt } } = await callerClient.auth.getUser();
  if (!callerJwt) {
    return jsonResponse({ error: "No autenticado" }, 401, headers);
  }

  // Fetch full user data via admin to get reliable user_metadata
  const { data: { user: caller } } = await adminClient.auth.admin.getUserById(callerJwt.id);
  if (!caller || caller.user_metadata?.role !== "dm") {
    return jsonResponse({ error: "Solo el DM puede administrar usuarios" }, 403, headers);
  }

  const callerCampaign = caller.user_metadata?.campaign;

  const body = await req.json();
  const { action } = body;

  // ── LIST: Get all users for this campaign ─────────────────
  if (action === "list") {
    const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 100 });
    if (error) return jsonResponse({ error: error.message }, 500, headers);

    const campaignUsers = users
      .filter((u) => u.user_metadata?.campaign === callerCampaign)
      .map((u) => ({
        id: u.id,
        username: u.user_metadata?.username || u.email?.split("@")[0],
        role: u.user_metadata?.role || "player",
        mustChangePassword: u.user_metadata?.mustChangePassword || false,
        created_at: u.created_at,
      }));

    return jsonResponse({ users: campaignUsers }, 200, headers);
  }

  // ── CREATE: Add a new user ────────────────────────────────
  if (action === "create") {
    const { username, role, password } = body;
    if (!username || !role || !password) {
      return jsonResponse({ error: "username, role y password son requeridos" }, 400, headers);
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email: `${username.toLowerCase()}@dnd.local`,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        campaign: callerCampaign,
        username: username.toLowerCase(),
        mustChangePassword: true,
      },
    });

    if (error) return jsonResponse({ error: error.message }, 400, headers);
    return jsonResponse({
      user: {
        id: data.user.id,
        username: username.toLowerCase(),
        role,
        mustChangePassword: true,
      },
    }, 201, headers);
  }

  // ── UPDATE: Change role or reset password ─────────────────
  if (action === "update") {
    const { userId, role, resetPassword, newPassword } = body;
    if (!userId) return jsonResponse({ error: "userId requerido" }, 400, headers);

    // Verify target user belongs to same campaign
    const { data: { user: target } } = await adminClient.auth.admin.getUserById(userId);
    if (!target || target.user_metadata?.campaign !== callerCampaign) {
      return jsonResponse({ error: "Usuario no encontrado en esta campaña" }, 404, headers);
    }

    const updates: Record<string, unknown> = {};
    if (role) updates.user_metadata = { ...target.user_metadata, role };
    if (resetPassword) {
      updates.password = newPassword || "halo2026";
      updates.user_metadata = { ...(updates.user_metadata || target.user_metadata), mustChangePassword: true };
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, updates);
    if (error) return jsonResponse({ error: error.message }, 400, headers);
    return jsonResponse({ ok: true }, 200, headers);
  }

  // ── DELETE: Remove a user ─────────────────────────────────
  if (action === "delete") {
    const { userId } = body;
    if (!userId) return jsonResponse({ error: "userId requerido" }, 400, headers);

    // Verify target user belongs to same campaign
    const { data: { user: target } } = await adminClient.auth.admin.getUserById(userId);
    if (!target || target.user_metadata?.campaign !== callerCampaign) {
      return jsonResponse({ error: "Usuario no encontrado en esta campaña" }, 404, headers);
    }

    // Don't allow DM to delete themselves
    if (userId === caller.id) {
      return jsonResponse({ error: "No puedes eliminarte a ti mismo" }, 400, headers);
    }

    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) return jsonResponse({ error: error.message }, 400, headers);
    return jsonResponse({ ok: true }, 200, headers);
  }

  return jsonResponse({ error: `Acción desconocida: ${action}` }, 400, headers);
});
