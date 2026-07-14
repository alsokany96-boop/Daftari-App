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

export default function SignUpScreen() {
  const { signIn } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError("الرجاء إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    if (password.length < 4) {
      setError("كلمة المرور يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.register(username.trim(), password, shopName.trim() || undefined);
      await signIn(res.access_token, res.user);
      router.replace("/(app)/home");
    } catch (e: any) {
      setError(e?.message || "فشل إنشاء الحساب");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="signup-back-button"
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
      </View>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoBox}>
          <View style={styles.logoCircle}>
            <Ionicons name="book" size={40} color={colors.white} />
          </View>
          <Text style={styles.title}>إنشاء حساب</Text>
          <Text style={styles.subtitle}>ابدأ بإدارة دفتر ديون بقالتك</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>اسم المستخدم</Text>
          <TextInput
            testID="signup-username-input"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="اختر اسم مستخدم"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            textAlign="right"
          />

          <Text style={styles.label}>اسم المحل (اختياري)</Text>
          <TextInput
            testID="signup-shopname-input"
            style={styles.input}
            value={shopName}
            onChangeText={setShopName}
            placeholder="مثال: بقالة الأمانة"
            placeholderTextColor={colors.textMuted}
            textAlign="right"
          />

          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            testID="signup-password-input"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="4 أحرف على الأقل"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textAlign="right"
          />

          {error && (
            <Text style={styles.error} testID="signup-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            testID="signup-submit-button"
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitText}>إنشاء الحساب</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "flex-start" },
  container: { flexGrow: 1, padding: 24 },
  logoBox: { alignItems: "center", marginBottom: 24 },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.debtRed,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 28, fontWeight: "900", color: colors.primary },
  subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
  form: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
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
});
