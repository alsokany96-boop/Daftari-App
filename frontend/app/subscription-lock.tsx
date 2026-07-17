import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors, CURRENCY } from "@/src/theme";
import { whatsappUrl } from "@/src/utils/api";
import { fmtAmount } from "@/src/utils/format";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function SubscriptionLockScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, config, signOut, refreshUser } = useSession();
  const [showSignOut, setShowSignOut] = useState(false);

  const adminPhone = config?.admin_phone || "0926609606";
  const adminWa = config?.admin_whatsapp || "218926609606";
  const price = config?.subscription_price ?? 20;

  const openWhatsApp = () => {
    const message = `مرحباً، أنا ${user?.username || ""} وأود تفعيل اشتراكي في تطبيق دفتري (${price} ${CURRENCY}).`;
    const url = whatsappUrl(adminWa, message);
    Linking.openURL(url).catch(() => {});
  };

  const call = () => {
    Linking.openURL(`tel:${adminPhone}`).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="subscription-lock-screen">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.iconBox}>
          <Ionicons name="lock-closed" size={64} color={colors.white} />
        </View>

        <Text style={styles.title}>الاشتراك مطلوب</Text>
        <Text style={styles.subtitle}>
          لقد تم الوصول إلى الحد المجاني. لتفعيل حسابك، يرجى التواصل مع المشرف عبر الواتساب.
        </Text>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>قيمة الاشتراك</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount} testID="subscription-price">{fmtAmount(price)}</Text>
            <Text style={styles.priceCurrency}>{CURRENCY}</Text>
          </View>
        </View>

        <View style={styles.contactCard}>
          <Text style={styles.contactLabel}>رقم المشرف</Text>
          <Text style={styles.contactPhone} testID="admin-phone">{adminPhone}</Text>
        </View>

        <TouchableOpacity
          testID="whatsapp-contact-button"
          style={styles.waBtn}
          onPress={openWhatsApp}
          activeOpacity={0.85}
        >
          <Ionicons name="logo-whatsapp" size={24} color={colors.white} />
          <Text style={styles.waText}>تواصل عبر الواتساب</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="call-admin-button"
          style={styles.callBtn}
          onPress={call}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={22} color={colors.textMain} />
          <Text style={styles.callText}>اتصال بالمشرف</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="refresh-status-button"
          style={styles.refreshBtn}
          onPress={refreshUser}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh" size={18} color={colors.debtRed} />
          <Text style={styles.refreshText}>تحقق من حالة التفعيل</Text>
        </TouchableOpacity>

        <TouchableOpacity
          testID="signout-lock-button"
          style={styles.signOutBtn}
          onPress={() => setShowSignOut(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.signOutText}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </ScrollView>
      <ConfirmDialog
        visible={showSignOut}
        title="هل أنت متأكد من تسجيل الخروج؟"
        confirmLabel="تسجيل الخروج"
        icon="log-out"
        onCancel={() => setShowSignOut(false)}
        onConfirm={async () => {
          setShowSignOut(false);
          await signOut();
        }}
        testID="signout-lock-confirm"
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 24, alignItems: "center", flexGrow: 1 },
  iconBox: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: colors.debtRed,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    shadowColor: colors.debtRed,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: { fontSize: 28, fontWeight: "900", color: colors.textMain, marginTop: 24 },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 12,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  priceCard: {
    backgroundColor: colors.debtRedBg,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginTop: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  priceLabel: { color: colors.debtRedDark, fontSize: 14, fontWeight: "700" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  priceAmount: { fontSize: 42, fontWeight: "900", color: colors.debtRed },
  priceCurrency: { fontSize: 18, fontWeight: "700", color: colors.debtRedDark },
  contactCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginTop: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  contactPhone: { fontSize: 22, fontWeight: "900", color: colors.textMain, marginTop: 4, letterSpacing: 1 },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.whatsapp,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 24,
    width: "100%",
    shadowColor: colors.whatsapp,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  waText: { color: colors.white, fontSize: 17, fontWeight: "800" },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  callText: { color: colors.textMain, fontSize: 15, fontWeight: "700" },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    padding: 8,
  },
  refreshText: { color: colors.debtRed, fontSize: 14, fontWeight: "700" },
  signOutBtn: { marginTop: 24, padding: 8 },
  signOutText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
});
