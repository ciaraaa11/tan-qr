import { supabase } from './supabase';
import * as SQLite from 'expo-sqlite';

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
    db = await SQLite.openDatabaseAsync('qr-attendance.db');
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
  studentId: string
): Promise<RegisterResult> {
  let payload: EventPayload;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { success: false, message: 'Invalid QR code.' };
  }

  if (payload.v !== 1 || !payload.event) {
    return { success: false, message: 'Not an attendance QR code.' };
  }

  const now = Date.now();
  const start = payload.start ? new Date(payload.start).getTime() : null;
  const end = payload.end ? new Date(payload.end).getTime() : null;

  if (start && now < start) {
    return { success: false, message: 'Event has not started yet.' };
  }
  if (end && now > end) {
    return { success: false, message: 'Event has already ended.' };
  }

  const database = await getDb();
  const title = payload.title ?? payload.event;

  await database.runAsync(
    'INSERT OR IGNORE INTO events (eventId, title, start, end) VALUES (?, ?, ?, ?)',
    payload.event,
    title,
    payload.start ?? '',
    payload.end ?? ''
  );

  const result = await database.runAsync(
    'INSERT OR IGNORE INTO attendance (studentId, eventId, scannedAt) VALUES (?, ?, ?)',
    studentId,
    payload.event,
    new Date().toISOString()
  );

  if (result.changes === 0) {
    return {
      success: false,
      message: 'Already registered for this event.',
      eventTitle: title,
    };
  }

  return { success: true, message: 'Attendance recorded!', eventTitle: title };
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<AttendanceRecord>(
    `SELECT a.id, a.eventId, e.title AS eventTitle, a.scannedAt
     FROM attendance a
     JOIN events e ON e.eventId = a.eventId
     WHERE a.studentId = ?
     ORDER BY a.scannedAt DESC`,
    studentId
  );
  return rows;
}

export async function createEvent(event: Event): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT OR REPLACE INTO events (eventId, title, start, end) VALUES (?, ?, ?, ?)',
    event.eventId,
    event.title,
    event.start,
    event.end
  );
}

export async function getCurrentStudentId(): Promise<string | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ studentId: string }>(
    'SELECT studentId FROM session WHERE id = 1'
  );
  return row?.studentId ?? null;
}

export async function setCurrentStudent(studentId: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'INSERT OR REPLACE INTO session (id, studentId) VALUES (1, ?)',
  studentId
  );
}

export async function clearSession(): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM session WHERE id = 1');
}

export async function getAllStudents(): Promise<Student[]> {
  const database = await getDb();
  return database.getAllAsync<Student>(
    'SELECT studentId, name FROM students ORDER BY name'
  );
}

export async function getStudent(studentId: string): Promise<Student | null> {
  const database = await getDb();
  return (
    (await database.getFirstAsync<Student>(
      'SELECT studentId, name FROM students WHERE studentId = ?',
      studentId
    )) ?? null
  );
}

export async function createStudent(name: string): Promise<Student> {
  const database = await getDb();
  const countRow = await database.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM students'
  );
  const next = (countRow?.c ?? 0) + 1;
  const studentId = `STUDENT-2026-${String(next).padStart(3, '0')}`;
  const trimmedName = name.trim();

  await database.runAsync(
    'INSERT OR IGNORE INTO students (studentId, name) VALUES (?, ?)',
    studentId,
    trimmedName
  );
  return { studentId, name: trimmedName };
}

export async function updateStudentName(
  studentId: string,
  name: string
): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'UPDATE students SET name = ? WHERE studentId = ?',
    name.trim(),
    studentId
  );
}

export async function getAttendanceCount(studentId: string): Promise<number> {
  const database = await getDb();
  const row = await database.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM attendance WHERE studentId = ?',
    studentId
  );
  return row?.c ?? 0;
}