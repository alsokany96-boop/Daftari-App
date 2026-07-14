import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Linking,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Customer, Transaction } from "@/src/utils/api";
import { colors, CURRENCY } from "@/src/theme";

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ar", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatAmount(n: number) {
  return n.toLocaleString("ar", { maximumFractionDigits: 2 });
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, txs] = await Promise.all([api.getCustomer(id), api.listTransactions(id)]);
      setCustomer(c);
      setTransactions(txs);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const sendWhatsApp = () => {
    if (!customer) return;
    const debt = customer.total_debt;
    const message =
      debt > 0
        ? `مرحباً ${customer.name}، نود تذكيرك بأن حسابك الحالي في بقالتنا هو ${formatAmount(
            debt
          )} ${CURRENCY}. نسعد بزيارتك.`
        : `مرحباً ${customer.name}، نود تذكيرك بأن حسابك الحالي في بقالتنا مسدد. نسعد بزيارتك.`;
    let phone = customer.phone.replace(/[^\d+]/g, "");
    if (phone.startsWith("00")) phone = "+" + phone.slice(2);
    const url = `whatsapp://send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}`;
    const fallback = `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url).then((can) => {
      Linking.openURL(can ? url : fallback).catch(() => Linking.openURL(fallback));
    });
  };

  const debt = customer?.total_debt ?? 0;
  const isDebt = debt > 0;

  const renderTx = ({ item }: { item: Transaction }) => {
    const isDebtTx = item.type === "debt";
    return (
      <View style={styles.txCard} testID={`tx-item-${item.id}`}>
        <View style={[styles.txIcon, isDebtTx ? styles.txIconDebt : styles.txIconPayment]}>
          <Ionicons
            name={isDebtTx ? "arrow-up" : "arrow-down"}
            size={20}
            color={isDebtTx ? colors.debtRed : colors.paymentGreen}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txType}>
            {isDebtTx ? "دَين / أخذ" : "سداد / دفع"}
          </Text>
          {item.notes ? <Text style={styles.txNotes} numberOfLines={2}>{item.notes}</Text> : null}
          <Text style={styles.txDate}>{formatDateTime(item.created_at)}</Text>
          {item.receipt_image ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${item.receipt_image}` }}
              style={styles.txImage}
              resizeMode="cover"
            />
          ) : null}
        </View>
        <View style={{ alignItems: "flex-start" }}>
          <Text
            style={[
              styles.txAmount,
              { color: isDebtTx ? colors.debtRed : colors.paymentGreen },
            ]}
          >
            {isDebtTx ? "+" : "−"}
            {formatAmount(item.amount)}
          </Text>
          <Text style={styles.txCurrency}>{CURRENCY}</Text>
        </View>
      </View>
    );
  };

  if (loading || !customer) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          testID="detail-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="arrow-forward" size={26} color={colors.textMain} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{customer.name}</Text>
          <Text style={styles.headerPhone}>{customer.phone}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Balance & WhatsApp */}
      <View style={styles.balanceCard} testID="detail-balance-card">
        <Text style={styles.balanceLabel}>
          {isDebt ? "الرصيد المستحق" : debt < 0 ? "دفعة مقدمة" : "لا يوجد رصيد"}
        </Text>
        <View style={styles.balanceRow}>
          <Text
            style={[
              styles.balanceAmount,
              { color: isDebt ? colors.debtRed : debt < 0 ? colors.paymentGreen : colors.textMuted },
            ]}
            testID="detail-balance-amount"
          >
            {formatAmount(Math.abs(debt))}
          </Text>
          <Text style={styles.balanceCurrency}>{CURRENCY}</Text>
        </View>
        <TouchableOpacity
          testID="whatsapp-reminder-button"
          style={styles.waBtn}
          onPress={sendWhatsApp}
          activeOpacity={0.85}
        >
          <Ionicons name="logo-whatsapp" size={22} color={colors.white} />
          <Text style={styles.waBtnText}>تذكير بالواتساب</Text>
        </TouchableOpacity>
      </View>

      {/* Timeline */}
      <Text style={styles.sectionTitle}>سجل العمليات</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTx}
        contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 16 }}
        ListEmptyComponent={
          <View style={styles.emptyBox} testID="tx-empty">
            <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>لا توجد عمليات بعد</Text>
            <Text style={styles.emptySubtitle}>ابدأ بتسجيل دَين أو سداد</Text>
          </View>
        }
      />

      {/* Bottom Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          testID="add-debt-button"
          style={[styles.actionBtn, { backgroundColor: colors.debtRed }]}
          onPress={() => router.push(`/(app)/add-transaction?customerId=${customer.id}&type=debt`)}
          activeOpacity={0.85}
        >
          <Ionicons name="remove-circle" size={22} color={colors.white} />
          <Text style={styles.actionText}>أخذ / دَين</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="add-payment-button"
          style={[styles.actionBtn, { backgroundColor: colors.paymentGreen }]}
          onPress={() => router.push(`/(app)/add-transaction?customerId=${customer.id}&type=payment`)}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle" size={22} color={colors.white} />
          <Text style={styles.actionText}>دفع / سداد</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: colors.textMain },
  headerPhone: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  balanceCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  balanceLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  balanceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 6, gap: 8 },
  balanceAmount: { fontSize: 40, fontWeight: "900" },
  balanceCurrency: { fontSize: 16, color: colors.textMuted, fontWeight: "700" },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.whatsapp,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    marginTop: 16,
    shadowColor: colors.whatsapp,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  waBtnText: { color: colors.white, fontSize: 16, fontWeight: "800" },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.textMain,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    textAlign: "right",
  },
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  txIconDebt: { backgroundColor: colors.debtRedBg },
  txIconPayment: { backgroundColor: colors.paymentGreenBg },
  txType: { fontSize: 15, fontWeight: "800", color: colors.textMain, textAlign: "right" },
  txNotes: { fontSize: 13, color: colors.textMain, marginTop: 2, textAlign: "right" },
  txDate: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: "right" },
  txImage: { width: 80, height: 60, borderRadius: 8, marginTop: 6 },
  txAmount: { fontSize: 18, fontWeight: "900" },
  txCurrency: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  emptyBox: { alignItems: "center", paddingTop: 40, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.textMain, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, textAlign: "center" },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    padding: 16,
    paddingBottom: 24,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  actionText: { color: colors.white, fontSize: 16, fontWeight: "800" },
});
