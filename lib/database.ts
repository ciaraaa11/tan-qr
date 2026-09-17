import * as SQLite from "expo-sqlite";
import { supabase } from "./supabase";

export type AttendanceRecord = {
  id: number;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
};

export type Event = {
  eventId: string;
  title: string;
  start: string;
  end: string;
};

type EventPayload = {
  v: number;
  event: string;
  title?: string;
  start?: string;
  end?: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};

let db: SQLite.SQLiteDatabase | null = null;

async function getDb() {
  if (!db) {
    db = await SQLite.openDatabaseAsync("qr-attendance.db");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS events (
        eventId TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        start TEXT NOT NULL,
        end TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId TEXT NOT NULL,
        eventId TEXT NOT NULL,
        scannedAt TEXT NOT NULL,
        UNIQUE (studentId, eventId)
      );
    `);
  }
  return db;
}

export async function registerAttendance(
  rawPayload: string,
  studentId: string,
): Promise<RegisterResult> {
  let payload: EventPayload;

  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { success: false, message: "Invalid QR code." };
  }

  if (payload.v !== 1 || !payload.event) {
    return { success: false, message: "Not an attendance QR code." };
  }

  const title = payload.title ?? payload.event;
  const now = Date.now();
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start && now < start) {
    return { success: false, message: "Event has not started yet." };
  }

  if (end && now > end) {
    return { success: false, message: "Event has already ended." };
  }

  const database = await getDb();

  await database.runAsync(
    "INSERT OR IGNORE INTO events (eventId, title, start, end) VALUES (?, ?, ?, ?)",
    payload.event,
    title,
    payload.start ?? "",
    payload.end ?? "",
  );

  const { error: attError } = await supabase.from("attendance").insert([
    {
      student_id: studentId,
      event_id: payload.event,
    },
  ]);

  if (attError) {
    if (attError.code === "23505") {
      return {
        success: false,
        message: "Already registered for this event.",
        eventTitle: title,
      };
    }
    return { success: false, message: attError.message };
  }

  return { success: true, message: "Attendance recorded!", eventTitle: title };
}

export async function getAttendanceHistory(
  studentId: string,
): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("id, scanned_at, events ( event_code, title )")
    .eq("student_id", studentId)
    .order("scanned_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? "",
    eventTitle: row.events?.title ?? "",
    scannedAt: row.scanned_at,
  }));
}

export async function createEvent(event: Event): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("events").upsert(
    {
      event_code: event.eventId,
      title: event.title,
      start_time: event.start || null,
      end_time: event.end || null,
      created_by: user?.id ?? null,
    },
    { onConflict: "event_code" },
  );
}
