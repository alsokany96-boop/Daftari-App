import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, Customer } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { colors, CURRENCY } from "@/src/theme";

function formatDate(iso?: string | null) {
  if (!iso) return "لا توجد عمليات";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

function formatAmount(n: number) {
  return n.toLocaleString("ar", { maximumFractionDigits: 2 });
}

export default function HomeScreen() {
  const { user, signOut } = useSession();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (q?: string) => {
      try {
        const [list, sum] = await Promise.all([
          api.listCustomers(q),
          api.summary(),
        ]);
        setCustomers(list);
        setTotalDebt(sum.total_debt);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      load(search);
    }, [load, search])
  );

  const onSearchChange = (text: string) => {
    setSearch(text);
    load(text);
  };

  const onRefresh = () => {
    setRefreshing(true);
    load(search);
  };

  const renderCustomer = ({ item }: { item: Customer }) => {
    const debt = item.total_debt;
    const isDebt = debt > 0;
    const isCredit = debt < 0;
    return (
      <TouchableOpacity
        testID={`customer-card-${item.id}`}
        style={styles.customerCard}
        onPress={() => router.push(`/(app)/customer/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.customerDate}>{formatDate(item.last_transaction_at)}</Text>
        </View>
        <View style={styles.customerAmountBox}>
          <Text
            style={[
              styles.customerAmount,
              isDebt && { color: colors.debtRed },
              isCredit && { color: colors.paymentGreen },
              !isDebt && !isCredit && { color: colors.textMuted },
            ]}
          >
            {formatAmount(Math.abs(debt))}
          </Text>
          <Text style={styles.currencyText}>{CURRENCY}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>دفتري</Text>
          {user?.shop_name ? <Text style={styles.appSubtitle}>{user.shop_name}</Text> : null}
        </View>
        <TouchableOpacity
          testID="signout-button"
          onPress={signOut}
          style={styles.iconBtn}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="log-out-outline" size={26} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          testID="search-input"
          style={styles.searchInput}
          value={search}
          onChangeText={onSearchChange}
          placeholder="ابحث عن زبون بالاسم..."
          placeholderTextColor={colors.textMuted}
          textAlign="right"
        />
      </View>

      {/* Total Debt Card */}
      <View style={styles.totalCard} testID="total-debt-card">
        <Text style={styles.totalLabel}>إجمالي الديون المستحقة</Text>
        <View style={styles.totalRow}>
          <Text style={styles.totalAmount} testID="total-debt-amount">
            {formatAmount(totalDebt)}
          </Text>
          <Text style={styles.totalCurrency}>{CURRENCY}</Text>
        </View>
      </View>

      {/* Customer List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.debtRed} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomer}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.debtRed} />}
          ListEmptyComponent={
            <View style={styles.emptyBox} testID="empty-state">
              <Ionicons name="people-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>لا يوجد زبائن بعد</Text>
              <Text style={styles.emptySubtitle}>اضغط على الزر (+) لإضافة زبون جديد</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        testID="add-customer-fab"
        style={styles.fab}
        onPress={() => router.push("/(app)/add-customer")}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={34} color={colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appTitle: { fontSize: 26, fontWeight: "900", color: colors.primary, textAlign: "right" },
  appSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, textAlign: "right" },
  iconBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textMain,
  },
  totalCard: {
    backgroundColor: colors.debtRed,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    shadowColor: colors.debtRed,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  totalLabel: { color: "#FEE2E2", fontSize: 15, fontWeight: "600" },
  totalRow: { flexDirection: "row", alignItems: "baseline", marginTop: 8, gap: 8 },
  totalAmount: { color: colors.white, fontSize: 44, fontWeight: "900" },
  totalCurrency: { color: "#FECACA", fontSize: 18, fontWeight: "700" },
  customerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.debtRedBg,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: colors.debtRed, fontSize: 20, fontWeight: "900" },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 17, fontWeight: "800", color: colors.textMain, textAlign: "right" },
  customerDate: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: "right" },
  customerAmountBox: { alignItems: "flex-start" },
  customerAmount: { fontSize: 20, fontWeight: "900" },
  currencyText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  centerBox: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyBox: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: colors.textMain, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: "center" },
  fab: {
    position: "absolute",
    bottom: 24,
    left: 24,
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
