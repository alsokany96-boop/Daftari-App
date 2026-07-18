import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors, CURRENCY } from "@/src/theme";
import { whatsappUrl } from "@/src/utils/api";
import { fmtAmount, fmtDate } from "@/src/utils/format";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function SubscriptionLockScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, config, signOut, refreshUser, refreshConfig } = useSession();
  const [showSignOut, setShowSignOut] = useState(false);

  // Once the user becomes active again (admin activated / extended subscription
  // OR the customer count went back under the free-tier limit), bounce back
  // through the root redirect so the normal home/admin screen loads. Also
  // handle the case where the user signs out from this locked screen — the
  // session becomes null but expo-router keeps this URL, so we must redirect
  // ourselves.
  useEffect(() => {
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    if (user.is_active && !user.is_locked) {
      router.replace("/");
    }
  }, [user]);

  const adminPhone = config?.admin_phone || "0926609606";
  const adminWa = config?.admin_whatsapp || "218926609606";
  const price = config?.subscription_price ?? 20;
  const limit = user?.free_tier_limit ?? config?.free_tier_limit ?? 10;
  const count = user?.customer_count ?? 0;
  const exp = user?.subscription_expires_at || null;
  const expDate = exp ? new Date(exp) : null;
  const isExpired = !!expDate && expDate.getTime() < Date.now();

  const openWhatsApp = () => {
    const status = isExpired
      ? `انتهت صلاحية اشتراكي في ${fmtDate(exp)}`
      : `وصلت إلى ${count} زبون في أحد المحلات (الحد المجاني ${limit})`;
    const message = `مرحباً، أنا ${user?.username || ""} وأود تجديد/تفعيل اشتراكي الشهري في تطبيق دفتري (${price} ${CURRENCY}).\n${status}.`;
    const url = whatsappUrl(adminWa, message);
    Linking.openURL(url).catch(() => {});
  };

  const call = () => {
    Linking.openURL(`tel:${adminPhone}`).catch(() => {});
  };

  const subtitle = isExpired
    ? `انتهت صلاحية اشتراكك الشهري في ${fmtDate(exp)}. للاستمرار في استخدام التطبيق، يرجى تجديد الاشتراك عبر التواصل مع المشرف.`
    : `وصلت إلى ${count} زبون في أحد محلاتك، وهو الحد الأقصى المجاني (${limit} زبون لكل محل). لمتابعة إضافة زبائن، يرجى تفعيل الاشتراك الشهري.`;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="subscription-lock-screen">
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.iconBox}>
          <Ionicons name="lock-closed" size={64} color={colors.white} />
        </View>

        <Text style={styles.title}>الاشتراك مطلوب</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>الاشتراك الشهري</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount} testID="subscription-price">{fmtAmount(price)}</Text>
            <Text style={styles.priceCurrency}>{CURRENCY}</Text>
          </View>
          <Text style={styles.priceMonthly}>يُجدَّد كل 30 يوماً</Text>
        </View>

        {expDate && (
          <View style={styles.statusCard} testID="subscription-status-card">
            <Ionicons
              name={isExpired ? "alert-circle" : "checkmark-circle"}
              size={20}
              color={isExpired ? colors.debtRedDark : colors.paymentGreenDark}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>
                {isExpired ? "انتهت الصلاحية" : "الاشتراك ساري حتى"}
              </Text>
              <Text style={styles.statusValue}>{fmtDate(exp)}</Text>
            </View>
          </View>
        )}

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
          onPress={async () => {
            await refreshConfig();
            await refreshUser();
          }}
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
          try {
            await signOut();
          } finally {
            // Explicit navigation guarantees we leave the lock screen even if
            // the state update or route guard is racy under Expo Router.
            router.replace("/sign-in");
          }
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
  priceMonthly: { color: colors.debtRedDark, fontSize: 12, fontWeight: "600", marginTop: 6 },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", textAlign: "right" },
  statusValue: { color: colors.textMain, fontSize: 16, fontWeight: "800", marginTop: 2, textAlign: "right" },
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
