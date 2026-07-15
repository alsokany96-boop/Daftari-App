import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { colors } from "@/src/theme";

export default function SignInScreen() {
  const { signIn } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(username.trim(), password);
      await signIn(res.access_token, res.user);
      router.replace("/");
    } catch (e: any) {
      setError(e?.message || "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoBox} testID="signin-logo">
          <View style={styles.logoCircle}>
            <Ionicons name="book" size={44} color={colors.white} />
          </View>
          <Text style={styles.title}>دفتري</Text>
          <Text style={styles.subtitle}>إدارة ديون الزبائن ببساطة</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.formTitle}>تسجيل الدخول</Text>

          <Text style={styles.label}>اسم المستخدم</Text>
          <TextInput
            testID="signin-username-input"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="أدخل اسم المستخدم"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            textAlign="right"
          />

          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            testID="signin-password-input"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="أدخل كلمة المرور"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textAlign="right"
          />

          {error && (
            <Text style={styles.error} testID="signin-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            testID="signin-submit-button"
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitText}>دخول</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="signin-goto-register"
            onPress={() => router.push("/sign-up")}
            style={styles.linkBtn}
          >
            <Text style={styles.linkText}>ليس لديك حساب؟ سجّل الآن</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="signin-forgot-password"
            onPress={() => router.push("/forgot-password")}
            style={styles.linkBtn}
          >
            <Text style={styles.forgotText}>نسيت كلمة المرور؟</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  logoBox: { alignItems: "center", marginBottom: 32 },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: colors.debtRed,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: colors.debtRed,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: { fontSize: 36, fontWeight: "900", color: colors.primary },
  subtitle: { fontSize: 16, color: colors.textMuted, marginTop: 4 },
  form: {
    backgroundColor: colors.surface,
    padding: 24,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  formTitle: { fontSize: 22, fontWeight: "800", color: colors.textMain, marginBottom: 16, textAlign: "right" },
  label: { fontSize: 14, fontWeight: "600", color: colors.textMain, marginTop: 12, marginBottom: 6, textAlign: "right" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textMain,
    backgroundColor: colors.background,
  },
  error: { color: colors.debtRed, marginTop: 12, textAlign: "right", fontWeight: "600" },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  submitText: { color: colors.white, fontSize: 18, fontWeight: "800" },
  linkBtn: { alignItems: "center", marginTop: 16, paddingVertical: 8 },
  linkText: { color: colors.debtRed, fontSize: 14, fontWeight: "700" },
  forgotText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});
