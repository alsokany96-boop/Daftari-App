import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors } from "@/src/theme";
import { whatsappUrl } from "@/src/utils/api";

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { config } = useSession();
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const adminWa = config?.admin_whatsapp || "218926609606";
  const adminPhone = config?.admin_phone || "0926609606";

  const handleContact = () => {
    if (!username.trim()) {
      setError("الرجاء إدخال اسم المستخدم");
      return;
    }
    setError(null);
    const message = `مرحباً، أنا نسيت كلمة المرور لحسابي في تطبيق دفتري.
- اسم المستخدم: ${username.trim()}
- رقم الهاتف: ${phone.trim() || "غير محدد"}
أرجو مساعدتي بإعادة تعيين كلمة المرور.`;
    const url = whatsappUrl(adminWa, message);
    Linking.openURL(url).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="forgot-back-button"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>استعادة كلمة المرور</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} bottomOffset={20}>
        <View style={styles.iconBox}>
          <Ionicons name="key" size={48} color={colors.white} />
        </View>

        <Text style={styles.title}>هل نسيت كلمة المرور؟</Text>
        <Text style={styles.subtitle}>
          أدخل معلومات حسابك وسنفتح لك محادثة واتساب جاهزة مع المشرف لطلب إعادة تعيين كلمة المرور.
        </Text>

        <Text style={styles.label}>اسم المستخدم *</Text>
        <TextInput
          testID="forgot-username-input"
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder="اسم المستخدم"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          textAlign="right"
        />

        <Text style={styles.label}>رقم هاتفك (اختياري)</Text>
        <TextInput
          testID="forgot-phone-input"
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="لتسهيل التحقق من هويتك"
          placeholderTextColor={colors.textMuted}
          keyboardType="phone-pad"
          textAlign="right"
        />

        {error && (
          <Text style={styles.error} testID="forgot-error">{error}</Text>
        )}

        <TouchableOpacity
          testID="forgot-whatsapp-button"
          style={styles.waBtn}
          onPress={handleContact}
          activeOpacity={0.85}
        >
          <Ionicons name="logo-whatsapp" size={22} color={colors.white} />
          <Text style={styles.waText}>تواصل مع المشرف عبر الواتساب</Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>رقم المشرف: {adminPhone}</Text>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain },
  container: { padding: 24 },
  iconBox: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: colors.debtRed,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginTop: 8,
  },
  title: { fontSize: 22, fontWeight: "900", color: colors.textMain, marginTop: 20, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 8, lineHeight: 22 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textMain, marginTop: 18, marginBottom: 6, textAlign: "right" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textMain,
    backgroundColor: colors.surface,
  },
  error: { color: colors.debtRed, marginTop: 12, textAlign: "right", fontWeight: "600" },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.whatsapp,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 24,
  },
  waText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  infoBox: { alignItems: "center", marginTop: 20 },
  infoText: { color: colors.textMuted, fontSize: 13 },
});
