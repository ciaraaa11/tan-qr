export type AttendanceStatus = "present" | "late" | "absent" | "pending";

export type LateSettings = {
  start_time: string | null;
  end_time: string | null;
  late_mode: "minutes" | "exact" | null;
  late_minutes: number | null;
  late_cutoff_time: string | null;
};

// Calculate the Late cutoff for an event.
export function getLateCutoff(event: LateSettings): Date | null {
  if (!event.start_time) return null;

  const start = new Date(event.start_time);

  if (Number.isNaN(start.getTime())) return null;

  if (event.late_mode === "minutes") {
    const minutes = event.late_minutes;

    if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
      return null;
    }

    return new Date(start.getTime() + minutes * 60 * 1000);
  }

  if (event.late_mode === "exact") {
    const time = event.late_cutoff_time;

    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return null;
    }

    const [hours, minutes] = time.split(":").map(Number);

    // The app currently uses Philippine local time.
    const dateText = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(start);

    const cutoff = new Date(`${dateText}T${time}:00+08:00`);

    if (Number.isNaN(cutoff.getTime())) return null;

    // For an overnight event, a cutoff earlier than
    // the start belongs to the following day.
    if (cutoff.getTime() < start.getTime()) {
      cutoff.setTime(cutoff.getTime() + 24 * 60 * 60 * 1000);
    }

    return cutoff;
  }

  return null;
}

export function getAttendanceStatus(
  scannedAt: string | null,
  event: LateSettings,
  now = new Date(),
): AttendanceStatus {
  const cutoff = getLateCutoff(event);

  if (scannedAt) {
    const scan = new Date(scannedAt);

    if (Number.isNaN(scan.getTime()) || !cutoff) {
      return "pending";
    }

    return scan.getTime() <= cutoff.getTime() ? "present" : "late";
  }

  if (!event.end_time) return "pending";

  const end = new Date(event.end_time);

  if (Number.isNaN(end.getTime())) return "pending";

  return now.getTime() > end.getTime() ? "absent" : "pending";
}
