import { supabase } from "@/lib/supabase";

export type Role = "student" | "teacher" | "administrator";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  program?: string | null;
  year_level?: string | null;
  block?: string | null;
  created_at?: string;
  updated_at?: string;
};

function normalizeRole(value: unknown): Role {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();

  if (role === "student" || role === "teacher" || role === "administrator") {
    return role;
  }

  return "student";
}

function withTimeout<T>(
  promise: PromiseLike<T>,
  milliseconds = 15000,
): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "Connection timed out. Please check your internet connection.",
          ),
        );
      }, milliseconds);
    }),
  ]);
}

// Get the current user's profile.
export async function getProfile(userId: string): Promise<Profile | null> {
  if (!userId) {
    throw new Error("A user ID is required.");
  }

  const { data, error } = await withTimeout(
    supabase
      .from("profiles")
      .select("id, email, full_name, role, program, year_level, block")
      .eq("id", userId)
      .maybeSingle(),
  );

  if (error) {
    console.error("Error fetching profile:", error.message);
    throw new Error(error.message);
  }

  if (!data) {
    console.warn("Profile not found.");
    return null;
  }

  return {
    ...data,
    role: normalizeRole(data.role),
  };
}

// Update the signed-in user's full name.
export async function updateProfile(
  userId: string,
  updates: { full_name: string },
): Promise<{ data: Profile | null; error: string | null }> {
  if (!userId) {
    return {
      data: null,
      error: "A user ID is required.",
    };
  }

  const name = updates.full_name.trim();

  if (!name) {
    return {
      data: null,
      error: "Full name is required.",
    };
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .update({ full_name: name })
        .eq("id", userId)
        .select("id, email, full_name, role, program, year_level, block")
        .single(),
    );

    if (error) {
      return {
        data: null,
        error: error.message,
      };
    }

    return {
      data: {
        ...data,
        role: normalizeRole(data.role),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : "Unable to update profile.",
    };
  }
}
