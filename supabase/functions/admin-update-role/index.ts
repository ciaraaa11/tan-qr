import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    return respond({ error: "Server configuration error." }, 500);
  }

  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond({ error: "Authentication required." }, 401);
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return respond({ error: "Missing access token." }, 401);
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Verify logged-in user
    const { data: authData, error: authError } =
      await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return respond({ error: "Invalid session." }, 401);
    }

    const callerId = authData.user.id;

    // Check administrator permissions
    const { data: admin, error: adminError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (adminError) {
      return respond({ error: "Permission check failed." }, 500);
    }

    if (admin.role !== "administrator") {
      return respond({ error: "Administrator access required." }, 403);
    }

    // Validate request
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return respond({ error: "Invalid JSON body." }, 400);
    }

    if (!body || typeof body !== "object") {
      return respond({ error: "Invalid request." }, 400);
    }

    const input = body as Record<string, unknown>;
    const userId = input.user_id;
    const role = input.role;

    if (
      typeof userId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        userId,
      )
    ) {
      return respond({ error: "Invalid user ID." }, 400);
    }

    if (role !== "student" && role !== "teacher") {
      return respond({ error: "Invalid target role." }, 400);
    }

    // Prevent modifying own administrator account
    if (userId === callerId) {
      return respond({ error: "Cannot change your own role." }, 403);
    }

    // Verify target user exists and is not administrator
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (targetError || !target) {
      return respond({ error: "Target user not found." }, 404);
    }

    if (target.role === "administrator") {
      return respond({ error: "Cannot modify an administrator." }, 403);
    }

    // Update role using server-side privileges
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .neq("role", "administrator")
      .select("id, role")
      .maybeSingle();

    if (updateError) {
      console.error("Role update failed:", updateError.message);
      return respond({ error: "Unable to update role." }, 500);
    }

    if (!updated) {
      return respond({ error: "Role update was not applied." }, 409);
    }

    return respond({
      message: "User role updated successfully.",
      user: updated,
    });
  } catch (error) {
    console.error("Unexpected error:", error);

    return respond({ error: "Internal server error." }, 500);
  }
});
