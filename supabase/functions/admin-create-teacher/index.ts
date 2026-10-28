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
  // Handle CORS preflight requests.
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  // Allow POST requests only.
  if (req.method !== "POST") {
    return respond({ error: "Method not allowed." }, 405);
  }

  // Get Supabase server environment variables.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Required server environment variables are missing.");

    return respond({ error: "Server configuration is incomplete." }, 500);
  }

  // Get the logged-in user's access token.
  const authorization = req.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return respond({ error: "Please log in as an administrator." }, 401);
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    return respond({ error: "Missing access token." }, 401);
  }

  // Create a server-side Supabase client.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    // Verify the current user's access token.
    const {
      data: { user: caller },
      error: authError,
    } = await adminClient.auth.getUser(token);

    if (authError || !caller) {
      return respond(
        { error: "Your session is invalid. Please log in again." },
        401,
      );
    }

    // Verify the user's role from the profiles table.
    const { data: callerProfile, error: roleError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (roleError) {
      console.error("Role verification failed:", roleError.message);

      return respond(
        { error: "Could not verify administrator permissions." },
        500,
      );
    }

    if (callerProfile?.role !== "administrator") {
      return respond(
        {
          error: "Only administrators can create teacher accounts.",
        },
        403,
      );
    }

    // Read the submitted teacher details.
    let body: {
      full_name?: unknown;
      email?: unknown;
      password?: unknown;
    };

    try {
      body = await req.json();
    } catch {
      return respond({ error: "Invalid request body." }, 400);
    }

    const fullName =
      typeof body.full_name === "string" ? body.full_name.trim() : "";

    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const password = typeof body.password === "string" ? body.password : "";

    // Validate required fields.
    if (!fullName || !email || !password) {
      return respond(
        {
          error: "Full name, email, and password are required.",
        },
        400,
      );
    }

    if (fullName.length > 100) {
      return respond(
        { error: "Full name must not exceed 100 characters." },
        400,
      );
    }

    // Validate email format.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond({ error: "Enter a valid email address." }, 400);
    }

    // Require a password with at least 8 characters.
    if (password.length < 8) {
      return respond(
        {
          error: "Password must have at least 8 characters.",
        },
        400,
      );
    }

    // Create the teacher's Auth account without changing
    // the administrator's current session.
    const { data: created, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: "teacher",
        },
      });

    if (createError || !created.user) {
      console.error("Auth user creation failed:", createError?.message);

      return respond(
        {
          error:
            createError?.message || "Unable to create the teacher account.",
        },
        400,
      );
    }

    // Create or update the teacher's profile.
    const { error: saveError } = await adminClient.from("profiles").upsert(
      {
        id: created.user.id,
        email,
        full_name: fullName,
        role: "teacher",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (saveError) {
      console.error("Profile creation failed:", saveError.message);

      // Remove the Auth account if saving the profile fails.
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(
        created.user.id,
      );

      if (rollbackError) {
        console.error("Rollback failed:", rollbackError.message);
      }

      return respond(
        {
          error:
            "The teacher profile could not be saved. Check the profiles table schema and try again.",
        },
        500,
      );
    }

    // Return a successful response.
    return respond(
      {
        message: "Teacher account created successfully.",
        user: {
          id: created.user.id,
          email,
          full_name: fullName,
          role: "teacher",
        },
      },
      201,
    );
  } catch (error) {
    console.error("Unexpected Edge Function error:", error);

    return respond({ error: "An unexpected server error occurred." }, 500);
  }
});
