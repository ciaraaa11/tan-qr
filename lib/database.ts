import { supabase } from "./supabase";
import * as SQLite from "expo-sqlite";

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

export type Student = {
  studentId: string;
  name: string;
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
      CREATE TABLE IF NOT EXISTS students (
        studentId TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        studentId TEXT
      );
    `);
  }
  return db;
}

export async function registerAttendance(
  rawPayload: string,
  _studentId: string,
): Promise<RegisterResult> {
  let payload: EventPayload;

  // Step 1: Validate QR
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return {
      success: false,
      message: "Invalid QR code.",
    };
  }

  if (
    payload?.v !== 1 ||
    typeof payload.event !== "string" ||
    !payload.event.trim()
  ) {
    return {
      success: false,
      message: "Not an attendance QR code.",
    };
  }

  try {
    // Step 2: Get authenticated student
    const { data: authData, error: authError } = await supabase.auth.getUser();

    const user = authData.user;

    if (authError || !user) {
      return {
        success: false,
        message: "Please log in first.",
      };
    }

    // Step 3: Check student academic details
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, program, year_level, block")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return {
        success: false,
        message: "Student profile not found.",
      };
    }

    if (profile.role !== "student") {
      return {
        success: false,
        message: "Only students can scan attendance.",
      };
    }

    // Step 4: Get event details from Supabase
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, start_time, end_time, program, year_level, block")
      .eq("event_code", payload.event.trim())
      .maybeSingle();

    if (eventError) throw eventError;

    if (!event) {
      return {
        success: false,
        message: "Event not found in Supabase.",
      };
    }

    // Step 5: Validate event target students
    if (!event.program || !event.year_level || !event.block) {
      return {
        success: false,
        message:
          "This event has no target students assigned. Contact your teacher.",
      };
    }

    if (
      profile.program !== event.program ||
      profile.year_level !== event.year_level ||
      profile.block !== event.block
    ) {
      return {
        success: false,
        message: "You are not included in the target students for this event.",
      };
    }

    // Step 6: Validate event schedule
    const now = Date.now();

    if (event.start_time && now < new Date(event.start_time).getTime()) {
      return {
        success: false,
        message: "Event has not started yet.",
      };
    }

    if (event.end_time && now > new Date(event.end_time).getTime()) {
      return {
        success: false,
        message: "Event has already ended.",
      };
    }

    // Step 7: Save attendance to Supabase
    const { error: insertError } = await supabase.from("attendance").insert({
      student_id: user.id,
      event_id: event.id,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return {
          success: false,
          message: "Already registered for this event.",
          eventTitle: event.title,
        };
      }

      throw insertError;
    }

    return {
      success: true,
      message: "Attendance recorded successfully!",
      eventTitle: event.title,
    };
  } catch (error) {
    console.error("Attendance error:", error);

    return {
      success: false,
      message: "Failed to save attendance. Please try again.",
    };
  }
}

export async function getAttendanceHistory(
  studentId: string,
): Promise<AttendanceRecord[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<AttendanceRecord>(
    `SELECT a.id, a.eventId, e.title AS eventTitle, a.scannedAt
     FROM attendance a
     JOIN events e ON e.eventId = a.eventId
     WHERE a.studentId = ?
     ORDER BY a.scannedAt DESC`,
    studentId,
  );
  return rows;
}

export async function createEvent(event: Event): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "INSERT OR REPLACE INTO events (eventId, title, start, end) VALUES (?, ?, ?, ?)",
    event.eventId,
    event.title,
    event.start,
    event.end,
  );
}

export async function getCurrentStudentId(): Promise<string | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ studentId: string }>(
    "SELECT studentId FROM session WHERE id = 1",
  );
  return row?.studentId ?? null;
}

export async function setCurrentStudent(studentId: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "INSERT OR REPLACE INTO session (id, studentId) VALUES (1, ?)",
    studentId,
  );
}

export async function clearSession(): Promise<void> {
  const database = await getDb();
  await database.runAsync("DELETE FROM session WHERE id = 1");
}

export async function getAllStudents(): Promise<Student[]> {
  const database = await getDb();
  return database.getAllAsync<Student>(
    "SELECT studentId, name FROM students ORDER BY name",
  );
}

export async function getStudent(studentId: string): Promise<Student | null> {
  const database = await getDb();
  return (
    (await database.getFirstAsync<Student>(
      "SELECT studentId, name FROM students WHERE studentId = ?",
      studentId,
    )) ?? null
  );
}

export async function createStudent(name: string): Promise<Student> {
  const database = await getDb();
  const countRow = await database.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM students",
  );
  const next = (countRow?.c ?? 0) + 1;
  const studentId = `STUDENT-2026-${String(next).padStart(3, "0")}`;
  const trimmedName = name.trim();

  await database.runAsync(
    "INSERT OR IGNORE INTO students (studentId, name) VALUES (?, ?)",
    studentId,
    trimmedName,
  );
  return { studentId, name: trimmedName };
}

export async function updateStudentName(
  studentId: string,
  name: string,
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    "UPDATE students SET name = ? WHERE studentId = ?",
    name.trim(),
    studentId,
  );
}

export async function getAttendanceCount(studentId: string): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM attendance WHERE studentId = ?",
    studentId,
  );
  return row?.c ?? 0;
}
