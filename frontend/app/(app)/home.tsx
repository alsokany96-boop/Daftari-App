import { useCallback, useMemo, useState } from "react";
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
import { useColors, ThemeColors, CURRENCY } from "@/src/theme";
import { fmtAmount, fmtDate } from "@/src/utils/format";
import ConfirmDialog from "@/src/components/ConfirmDialog";

export default function HomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, signOut } = useSession();
  const isEmployee = user?.role === "employee";
  const isOwner = user?.role === "owner";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);

  const load = useCallback(
    async (q?: string) => {
      try {
        const promises: Promise<any>[] = [api.listCustomers(q)];
        if (!isEmployee) promises.push(api.summary());
        const [list, sum] = await Promise.all(promises);
        setCustomers(list);
        if (!isEmployee && sum) setTotalDebt(sum.total_debt);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isEmployee]
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
    const overLimit =
      item.max_debt != null && item.max_debt > 0 && item.total_debt >= item.max_debt;
    return (
      <TouchableOpacity
        testID={`customer-card-${item.id}`}
        style={[styles.customerCard, overLimit && styles.customerCardOverLimit]}
        onPress={() => router.push(`/(app)/customer/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
        </View>
        <View style={styles.customerInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.name}
            </Text>
            {overLimit && (
              <Ionicons name="warning" size={16} color={colors.warnText} testID={`over-limit-${item.id}`} />
            )}
          </View>
          <Text style={styles.customerDate}>
            {item.last_transaction_at ? fmtDate(item.last_transaction_at) : "لا توجد عمليات"}
          </Text>
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
            {fmtAmount(Math.abs(debt))}
          </Text>
          <Text style={styles.currencyText}>{CURRENCY}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.appBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>دفتري</Text>
          {user?.shop_name ? (
            <Text style={styles.appSubtitle}>
              {user.shop_name}
              {isEmployee ? " • موظف" : ""}
            </Text>
          ) : isEmployee ? (
            <Text style={styles.appSubtitle}>حساب موظف</Text>
          ) : null}
        </View>
        {isOwner && (
          <>
            <TouchableOpacity
              testID="open-settings-button"
              onPress={() => router.push("/(app)/settings")}
              style={styles.iconBtn}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="open-staff-button"
              onPress={() => router.push("/(app)/staff")}
              style={styles.iconBtn}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="people-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          testID="open-change-pw-button"
          onPress={() => router.push("/(app)/change-password")}
          style={styles.iconBtn}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="key-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          testID="signout-button"
          onPress={() => setShowSignOut(true)}
          style={styles.iconBtn}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

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

      {!isEmployee && (
        <View style={styles.totalCard} testID="total-debt-card">
          <Text style={styles.totalLabel}>إجمالي الديون المستحقة</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalAmount} testID="total-debt-amount">
              {fmtAmount(totalDebt)}
            </Text>
            <Text style={styles.totalCurrency}>{CURRENCY}</Text>
          </View>
        </View>
      )}

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

      <TouchableOpacity
        testID="add-customer-fab"
        style={styles.fab}
        onPress={() => router.push("/(app)/add-customer")}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={34} color={colors.white} />
      </TouchableOpacity>

      <ConfirmDialog
        visible={showSignOut}
        title="هل أنت متأكد من تسجيل الخروج؟"
        message="سيتم إنهاء جلستك الحالية."
        confirmLabel="تسجيل الخروج"
        confirmColor="danger"
        icon="log-out"
        onCancel={() => setShowSignOut(false)}
        onConfirm={async () => {
          setShowSignOut(false);
          await signOut();
        }}
        testID="signout-confirm"
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    appBar: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    appTitle: { fontSize: 26, fontWeight: "900", color: colors.textMain, textAlign: "right" },
    appSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, textAlign: "right" },
    iconBtn: { width: 38, height: 44, justifyContent: "center", alignItems: "center" },
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
    searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.textMain },
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
    totalAmount: { color: colors.white, fontSize: 40, fontWeight: "900" },
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
    customerCardOverLimit: {
      borderColor: colors.warnBorder,
      backgroundColor: colors.warnBg,
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
