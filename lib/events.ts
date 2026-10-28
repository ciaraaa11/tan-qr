import { supabase } from "./supabase";

export type LateMode = "minutes" | "exact";

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  attendance_purpose: string;
  program: string;
  year_level: string;
  block: string;

  // Late attendance settings
  late_mode?: LateMode;
  late_minutes?: number | null;
  late_cutoff_time?: string | null;
};

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
  attendance_purpose: string | null;
  program: string | null;
  year_level: string | null;
  block: string | null;

  // Late attendance settings
  late_mode: LateMode | null;
  late_minutes: number | null;
  late_cutoff_time: string | null;
};

// Create a new event
export async function createEvent(
  event: Event,
): Promise<{ error: string | null }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: userError?.message ?? "You must sign in to create an event.",
    };
  }

  const { error } = await supabase.from("events").insert({
    event_code: event.eventId,
    title: event.title,
    start_time: event.start || null,
    end_time: event.end || null,
    created_by: user.id,
    attendance_purpose: event.attendance_purpose,
    program: event.program,
    year_level: event.year_level,
    block: event.block,
    late_mode: event.late_mode ?? "minutes",
    late_minutes:
      event.late_mode === "exact" ? null : (event.late_minutes ?? 15),
    late_cutoff_time:
      event.late_mode === "exact" ? (event.late_cutoff_time ?? null) : null,
  });

  return { error: error?.message ?? null };
}

// Get events created by a teacher
export async function getEventsByTeacher(
  teacherId: string,
): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("created_by", teacherId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("Failed to load events:", error?.message);
    return [];
  }

  return data as CloudEvent[];
}

// Find an event using its event code
export async function getEventByCode(code: string): Promise<CloudEvent | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("event_code", code)
    .maybeSingle();

  if (error) {
    console.error("Failed to find event:", error.message);
    return null;
  }

  return (data as CloudEvent | null) ?? null;
}

// Update an existing event
export async function updateEvent(
  id: string,
  updates: {
    event_code?: string;
    title?: string;
    start_time?: string | null;
    end_time?: string | null;
    attendance_purpose?: string | null;
    program?: string | null;
    year_level?: string | null;
    block?: string | null;
    late_mode?: LateMode | null;
    late_minutes?: number | null;
    late_cutoff_time?: string | null;
  },
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {};

  if (updates.event_code !== undefined) {
    payload.event_code = updates.event_code;
  }

  if (updates.title !== undefined) {
    payload.title = updates.title;
  }

  if ("start_time" in updates) {
    payload.start_time = updates.start_time;
  }

  if ("end_time" in updates) {
    payload.end_time = updates.end_time;
  }

  if ("attendance_purpose" in updates) {
    payload.attendance_purpose = updates.attendance_purpose;
  }

  if ("program" in updates) {
    payload.program = updates.program;
  }

  if ("year_level" in updates) {
    payload.year_level = updates.year_level;
  }

  if ("block" in updates) {
    payload.block = updates.block;
  }

  if ("late_mode" in updates) {
    payload.late_mode = updates.late_mode;
  }

  if ("late_minutes" in updates) {
    payload.late_minutes = updates.late_minutes;
  }

  if ("late_cutoff_time" in updates) {
    payload.late_cutoff_time = updates.late_cutoff_time;
  }

  const { error } = await supabase.from("events").update(payload).eq("id", id);

  return { error: error?.message ?? null };
}

// Delete an event
export async function deleteEvent(
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("events").delete().eq("id", id);

  return { error: error?.message ?? null };
}
