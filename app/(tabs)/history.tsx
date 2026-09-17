import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import { useAuth } from "@/lib/auth";
import { getAttendanceHistory, type AttendanceRecord } from "@/lib/database";

type Role = "student" | "teacher";

type TeacherEventAttendance = {
  id: string | number;
  eventId: string;
  eventTitle: string;
  scannedAt?: string;
  createdAt?: string;
  totalAttendees?: number;
};

type HistoryItem = AttendanceRecord | TeacherEventAttendance;

export default function HistoryScreen() {
  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const load = useCallback(async () => {
    if (!user) {
      setRole(null);
      setStudentRecords([]);
      setTeacherEvents([]);
      setLoading(false);
      return;
    }

    try {
      const currentRole = (user as { role?: Role } | null)?.role ?? "student";
      setRole(currentRole);

      if (currentRole === "teacher") {
        setTeacherEvents([]);
        setStudentRecords([]);
      } else {
        const records = await getAttendanceHistory(user.id);
        setStudentRecords(records);
        setTeacherEvents([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const records = role === "teacher" ? teacherEvents : studentRecords;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>

      {loading ? (
        <Text style={styles.subtitle}>Loading records...</Text>
      ) : records.length === 0 ? (
        <Text style={styles.subtitle}>
          {role === "teacher"
            ? "No events with attendance records yet."
            : "No records yet. Scan a QR code to register your attendance."}
        </Text>
      ) : (
        <FlatList
          data={teacherEvents}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const title =
              "eventTitle" in item ? item.eventTitle : "Attendance Event";
            const eventId = "eventId" in item ? item.eventId : "—";
            const timestamp =
              "scannedAt" in item
                ? (item as AttendanceRecord).scannedAt ?? new Date().toISOString()
                : "createdAt" in item
                  ? ((item as TeacherEventAttendance).createdAt ??
                      new Date().toISOString())
                  : new Date().toISOString();

            return (
              <View style={styles.card}>
                <Text style={styles.eventTitle}>{title}</Text>
                <Text style={styles.eventMeta}>{eventId}</Text>
                <Text style={styles.eventMeta}>{formatDate(timestamp)}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 32,
  },
  list: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
