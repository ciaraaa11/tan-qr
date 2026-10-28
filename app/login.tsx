import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppButton from "@/components/AppButton";
import { AuthDecor } from "@/components/AuthDecor";
import Header from "@/components/Header";
import { COLORS } from "@/constants/colors";
import { signIn } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const passwordRef = useRef<TextInput>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const showPasswordField = () => {
    // Keep the password row visible above the Android keyboard.
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);


  const handleLogin = async () => {
    if (loading) return;
    Keyboard.dismiss();
    setError(null);

    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: authError } = await signIn(email.trim(), password);
      if (authError) {
        setError(authError.message);
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setError("Unable to retrieve your account information.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        setError("Unable to verify your account role. Please try again.");
        return;
      }
      if (!profile) {
        setError("Your user profile was not found. Please contact your administrator.");
        return;
      }

      if (profile.role === "administrator") {
        router.replace("/admin");
      } else if (profile.role === "student" || profile.role === "teacher") {
        router.replace("/(tabs)");
      } else {
        setError("Your account has an unrecognized role. Please contact your administrator.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <AuthDecor />
      <View pointerEvents="none" style={styles.topAccent} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            keyboardVisible && styles.scrollWithKeyboard,
            { paddingBottom: Math.max(32, insets.bottom + 20) },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Header title="QR Attendance" />
              <View style={styles.intro}>
                <Text style={styles.eyebrow}>WELCOME TO TAN-QR</Text>
                <Text style={styles.title}>Welcome back</Text>
                <Text style={styles.subtitle}>Sign in to manage and track attendance easily.</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sign in</Text>
              <Text style={styles.cardSubtitle}>Enter your school account details below.</Text>

              <Text style={styles.label}>Email address</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={19} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your.email@school.edu"
                  placeholderTextColor={COLORS.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  accessibilityLabel="Email address"
                />
              </View>

              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={19} color={COLORS.textSecondary} />
                <TextInput
                  ref={passwordRef}
                  onFocus={showPasswordField}
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="password"
                  autoComplete="password"
                  editable={!loading}
                  accessibilityLabel="Password"
                />
                <Pressable
                  onPress={() => setShowPassword((previous) => !previous)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  hitSlop={10}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={21}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle-outline" size={17} color={COLORS.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <View style={styles.buttonWrap}>
                {loading ? (
                  <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
                ) : (
                  <AppButton
                    theme="primary"
                    title="Sign In"
                    icon="log-in-outline"
                    onPress={handleLogin}
                  />
                )}
              </View>
            </View>

            <View style={styles.bottomRow}>
              <Text style={styles.bottomText}>Don't have an account? </Text>
              <Link href="/register" style={styles.link}>Sign Up</Link>
            </View>
            <Text style={styles.footer}>A simpler way to track attendance</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, zIndex: 1 },
  screen: { flex: 1, backgroundColor: COLORS.background, overflow: "hidden" },
  topAccent: { position: "absolute", top: 0, left: 0, right: 0, height: 9, backgroundColor: COLORS.primary },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 22, paddingTop: 28 },
  scrollWithKeyboard: { justifyContent: "flex-start" },
  content: { width: "100%", maxWidth: 430, alignSelf: "center" },
  header: { alignItems: "center", marginBottom: 24 },
  intro: { alignItems: "center", marginTop: 10, paddingHorizontal: 14 },
  eyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: "800", color: COLORS.textSecondary, marginBottom: 10 },
  title: { fontSize: 29, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center" },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 21, color: COLORS.textSecondary, textAlign: "center" },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.78)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.85)",
    padding: 22,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 3,
  },
  cardTitle: { color: COLORS.textPrimary, fontSize: 19, fontWeight: "800" },
  cardSubtitle: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 22 },
  label: { color: COLORS.textPrimary, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", minHeight: 54,
    borderWidth: 1, borderColor: "#DED1D1", borderRadius: 13,
    backgroundColor: "rgba(255, 255, 255, 0.86)", paddingHorizontal: 14, marginBottom: 18, gap: 10,
  },
  input: { flex: 1, minWidth: 0, color: COLORS.textPrimary, fontSize: 14, paddingVertical: 12 },
  eyeButton: { padding: 4 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 1, marginBottom: 8 },
  errorText: { color: COLORS.danger, fontSize: 12, lineHeight: 18, flex: 1 },
  buttonWrap: { marginTop: 8 },
  loader: { paddingVertical: 11 },
  bottomRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", marginTop: 24 },
  bottomText: { color: COLORS.textSecondary, fontSize: 14 },
  link: { color: COLORS.primary, fontSize: 14, fontWeight: "800", paddingVertical: 8 },
  footer: { color: COLORS.textSecondary, textAlign: "center", fontSize: 11, marginTop: 13 },
});
