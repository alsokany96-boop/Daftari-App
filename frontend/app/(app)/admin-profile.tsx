import { useEffect, useMemo, useState } from "react";
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
import { useColors, ThemeColors, CURRENCY } from "@/src/theme";

export default function AdminProfileScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, config, refreshUser, refreshConfig } = useSession();

  // Admin-only guard. Any non-admin that lands here is bounced back home.
  useEffect(() => {
    if (user && user.role !== "super_admin") {
      router.replace("/");
    }
  }, [user]);

  const [name, setName] = useState(user?.shop_name || "");
  const [phone, setPhone] = useState(user?.phone || "");

  // Password change fields
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // App-settings fields
  const [price, setPrice] = useState(
    config?.subscription_price != null ? String(config.subscription_price) : ""
  );
  const [limit, setLimit] = useState(
    config?.free_tier_limit != null ? String(config.free_tier_limit) : ""
  );

  useEffect(() => {
    // Keep the form in sync when the config loads/refreshes.
    if (config) {
      setPrice(String(config.subscription_price ?? ""));
      setLimit(String(config.free_tier_limit ?? ""));
    }
  }, [config]);

  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoSuccess, setInfoSuccess] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [cfgSuccess, setCfgSuccess] = useState<string | null>(null);

  const saveInfo = async () => {
    setInfoError(null);
    setInfoSuccess(null);
    if (!name.trim()) {
      setInfoError("الرجاء إدخال اسم المشرف");
      return;
    }
    setSavingInfo(true);
    try {
      await api.updateProfile({ shop_name: name.trim(), phone: phone.trim() });
      await refreshUser();
      setInfoSuccess("تم تحديث المعلومات بنجاح");
    } catch (e: any) {
      setInfoError(e?.message || "فشل التحديث");
    } finally {
      setSavingInfo(false);
    }
  };

  const savePassword = async () => {
    setPwError(null);
    setPwSuccess(null);
    if (!currentPw || !newPw || !confirmPw) {
      setPwError("الرجاء تعبئة جميع حقول كلمة المرور");
      return;
    }
    if (newPw.length < 4) {
      setPwError("كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("تأكيد كلمة المرور لا يطابق الجديدة");
      return;
    }
    setSavingPw(true);
    try {
      await api.changePassword(currentPw, newPw);
      setPwSuccess("تم تحديث كلمة المرور بنجاح");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (e: any) {
      setPwError(e?.message || "فشل التحديث");
    } finally {
      setSavingPw(false);
    }
  };

  const saveConfig = async () => {
    setCfgError(null);
    setCfgSuccess(null);
    const trimmedPrice = price.replace(/[^0-9.]/g, "").trim();
    const trimmedLimit = limit.replace(/[^0-9]/g, "").trim();
    const priceNum = parseFloat(trimmedPrice);
    const limitNum = parseInt(trimmedLimit, 10);
    if (!isFinite(priceNum) || priceNum < 0) {
      setCfgError("قيمة الاشتراك غير صالحة");
      return;
    }
    if (!isFinite(limitNum) || limitNum < 1) {
      setCfgError("الحد المجاني يجب أن يكون 1 على الأقل");
      return;
    }
    setSavingCfg(true);
    try {
      await api.adminUpdateConfig({
        subscription_price: priceNum,
        free_tier_limit: limitNum,
      });
      await refreshConfig();
      await refreshUser();
      setCfgSuccess("تم تحديث الإعدادات بنجاح");
    } catch (e: any) {
      setCfgError(e?.message || "فشل التحديث");
    } finally {
      setSavingCfg(false);
    }
  };

  if (!user || user.role !== "super_admin") {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.debtRed} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="admin-profile-screen">
      <View style={styles.header}>
        <TouchableOpacity
          testID="admin-profile-back"
          style={styles.iconBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.textMain} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الملف الشخصي للمشرف</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} bottomOffset={20}>
        <View style={styles.iconBox}>
          <Ionicons name="shield-checkmark" size={40} color={colors.white} />
        </View>
        <Text style={styles.userLabel}>@{user.username}</Text>

        {/* Info card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle" size={22} color={colors.primary} />
            <Text style={styles.cardTitle}>المعلومات الشخصية</Text>
          </View>

          <Text style={styles.label}>اسم المشرف *</Text>
          <TextInput
            testID="admin-profile-name"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="الاسم الظاهر للمشرف"
            placeholderTextColor={colors.textMuted}
            textAlign="right"
          />

          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput
            testID="admin-profile-phone"
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="مثال: 0926609606"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            textAlign="right"
          />
          <Text style={styles.hint}>
            يُستخدم رقم الهاتف لتلقّي الاستفسارات وإرسال رموز التحقق للمستخدمين.
          </Text>

          {infoError && (
            <Text style={styles.error} testID="admin-profile-info-error">
              {infoError}
            </Text>
          )}
          {infoSuccess && (
            <Text style={styles.success} testID="admin-profile-info-success">
              {infoSuccess}
            </Text>
          )}

          <TouchableOpacity
            testID="admin-profile-info-save"
            style={[styles.submitBtn, savingInfo && { opacity: 0.7 }]}
            onPress={saveInfo}
            disabled={savingInfo}
            activeOpacity={0.85}
          >
            {savingInfo ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.submitText}>حفظ المعلومات</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Password card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="lock-closed" size={22} color={colors.debtRed} />
            <Text style={styles.cardTitle}>تغيير كلمة المرور</Text>
          </View>

          <Text style={styles.label}>كلمة المرور الحالية *</Text>
          <TextInput
            testID="admin-profile-pw-current"
            style={styles.input}
            value={currentPw}
            onChangeText={setCurrentPw}
            placeholder="أدخل كلمة المرور الحالية"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textAlign="right"
          />

          <Text style={styles.label}>كلمة المرور الجديدة *</Text>
          <TextInput
            testID="admin-profile-pw-new"
            style={styles.input}
            value={newPw}
            onChangeText={setNewPw}
            placeholder="4 أحرف على الأقل"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textAlign="right"
          />

          <Text style={styles.label}>تأكيد كلمة المرور الجديدة *</Text>
          <TextInput
            testID="admin-profile-pw-confirm"
            style={styles.input}
            value={confirmPw}
            onChangeText={setConfirmPw}
            placeholder="أعد إدخال كلمة المرور الجديدة"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textAlign="right"
          />

          {pwError && (
            <Text style={styles.error} testID="admin-profile-pw-error">
              {pwError}
            </Text>
          )}
          {pwSuccess && (
            <Text style={styles.success} testID="admin-profile-pw-success">
              {pwSuccess}
            </Text>
          )}

          <TouchableOpacity
            testID="admin-profile-pw-save"
            style={[styles.submitBtn, styles.pwBtn, savingPw && { opacity: 0.7 }]}
            onPress={savePassword}
            disabled={savingPw}
            activeOpacity={0.85}
          >
            {savingPw ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={[styles.submitText, { color: colors.white }]}>
                تحديث كلمة المرور
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* App settings card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="settings" size={22} color={colors.paymentGreen} />
            <Text style={styles.cardTitle}>إعدادات التطبيق</Text>
          </View>
          <Text style={styles.hint}>
            هذه الإعدادات عامة لجميع المستخدمين. عند التحديث سيظهر السعر والحد الجديد
            مباشرة على شاشة «الاشتراك مطلوب».
          </Text>

          <Text style={styles.label}>قيمة الاشتراك الشهري ({CURRENCY}) *</Text>
          <TextInput
            testID="admin-cfg-price"
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            placeholder="مثال: 20"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            textAlign="right"
          />

          <Text style={styles.label}>الحد الأقصى المجاني (عدد الزبائن لكل محل) *</Text>
          <TextInput
            testID="admin-cfg-limit"
            style={styles.input}
            value={limit}
            onChangeText={setLimit}
            placeholder="مثال: 10"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            textAlign="right"
          />
          <Text style={styles.hint}>
            بعد تجاوز هذا الرقم من الزبائن في أي محل واحد سيظهر قفل الاشتراك للمستخدم.
          </Text>

          {cfgError && (
            <Text style={styles.error} testID="admin-cfg-error">
              {cfgError}
            </Text>
          )}
          {cfgSuccess && (
            <Text style={styles.success} testID="admin-cfg-success">
              {cfgSuccess}
            </Text>
          )}

          <TouchableOpacity
            testID="admin-cfg-save"
            style={[styles.submitBtn, styles.cfgBtn, savingCfg && { opacity: 0.7 }]}
            onPress={saveConfig}
            disabled={savingCfg}
            activeOpacity={0.85}
          >
            {savingCfg ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={[styles.submitText, { color: colors.white }]}>
                حفظ الإعدادات
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    iconBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain },
    centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },
    container: { padding: 20, paddingBottom: 40 },
    iconBox: {
      width: 80,
      height: 80,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginBottom: 8,
    },
    userLabel: {
      textAlign: "center",
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "700",
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 14,
    },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
    cardTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: "800",
      color: colors.textMain,
      textAlign: "right",
    },
    label: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textMain,
      marginTop: 14,
      marginBottom: 6,
      textAlign: "right",
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.textMain,
      backgroundColor: colors.background,
    },
    hint: { color: colors.textMuted, fontSize: 12, marginTop: 6, textAlign: "right", lineHeight: 20 },
    error: { color: colors.debtRed, marginTop: 10, textAlign: "right", fontWeight: "700" },
    success: { color: colors.paymentGreen, marginTop: 10, textAlign: "right", fontWeight: "700" },
    submitBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 18,
    },
    pwBtn: { backgroundColor: colors.debtRed },
    cfgBtn: { backgroundColor: colors.paymentGreen },
    submitText: { color: colors.primaryText, fontSize: 15, fontWeight: "800" },
  });
