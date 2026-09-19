import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { COLORS } from "@/constants/colors";
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  type AttendanceRecord,
  type TeacherEventAttendance,
} from "@/lib/attendance";
import { useAuth } from "@/lib/auth";
import { getProfile, type Role } from "@/lib/profile";

export default function HistoryScreen() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>(
    [],
  );

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const profile = await getProfile(user.id);
    const currentRole = profile?.role ?? "student";
    setRole(currentRole);

    if (currentRole === "teacher") {
      const events = await getTeacherEventAttendance(user.id);
      setTeacherEvents(events);
      setStudentRecords([]);
    } else {
      const records = await getAttendanceHistory(user.id);
      setStudentRecords(records);
      setTeacherEvents([]);
    }

    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>Loading records...</Text>
      </View>
    );
  }

  if (role === "teacher") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Attendance History</Text>

        {teacherEvents.length === 0 ? (
          <Text style={styles.subtitle}>No events yet.</Text>
        ) : (
          <FlatList
            data={teacherEvents}
            keyExtractor={(item) => item.eventId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>{item.title}</Text>

                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{item.attendeeCount}</Text>
                  </View>
                </View>

                <Text style={styles.eventMeta}>{item.eventCode}</Text>

                {item.startTime && (
                  <Text style={styles.eventMeta}>
                    {formatDate(item.startTime)}
                  </Text>
                )}

                {item.attendees.length === 0 ? (
                  <Text style={styles.attendeeEmpty}>No attendees yet.</Text>
                ) : (
                  <View style={styles.attendeeList}>
                    {item.attendees.map((attendee) => (
                      <View key={attendee.studentId} style={styles.attendeeRow}>
                        <Text style={styles.attendeeName}>
                          {attendee.studentName || shortId(attendee.studentId)}
                        </Text>

                        <Text style={styles.eventMeta}>
                          {formatDate(attendee.scannedAt)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance History</Text>

      {studentRecords.length === 0 ? (
        <Text style={styles.subtitle}>
          No records yet. Scan a QR code to register your attendance.
        </Text>
      ) : (
        <FlatList
          data={studentRecords}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.eventTitle}>{item.eventTitle}</Text>

              <Text style={styles.eventMeta}>{item.eventId}</Text>

              <Text style={styles.eventMeta}>{formatDate(item.scannedAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : "unknown";
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
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
    flex: 1,
  },
  eventMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginLeft: 12,
  },
  countText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  attendeeList: {
    marginTop: 12,
  },
  attendeeRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 10,
  },
  attendeeName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  attendeeEmpty: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
});
