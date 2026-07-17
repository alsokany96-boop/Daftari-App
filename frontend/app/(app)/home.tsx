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
  Modal,
  ScrollView,
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
  const { user, signOut, stores, activeStoreId, setActiveStoreId, partyType, setPartyType } = useSession();
  const isEmployee = user?.role === "employee";
  const isOwner = user?.role === "owner";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showStorePicker, setShowStorePicker] = useState(false);

  const activeStore = stores.find((s) => s.id === activeStoreId);
  const isSupplier = partyType === "supplier";

  const load = useCallback(
    async (q?: string) => {
      if (!activeStoreId) {
        setLoading(false);
        return;
      }
      try {
        const promises: Promise<any>[] = [api.listCustomers({ search: q, store_id: activeStoreId, party_type: partyType })];
        if (!isEmployee) promises.push(api.summary({ store_id: activeStoreId, party_type: partyType }));
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
    [activeStoreId, partyType, isEmployee]
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

  const chooseStore = async (id: string) => {
    await setActiveStoreId(id);
    setShowStorePicker(false);
  };

  const goAddCustomer = () => {
    router.push(`/(app)/add-customer?party_type=${partyType}`);
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
        <View style={[styles.avatarCircle, isSupplier && styles.avatarCircleSupplier]}>
          <Ionicons
            name={isSupplier ? "business" : "person"}
            size={22}
            color={isSupplier ? colors.paymentGreen : colors.debtRed}
          />
        </View>
        <View style={styles.customerInfo}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.customerName} numberOfLines={1}>{item.name}</Text>
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
          {isEmployee && <Text style={styles.appSubtitle}>حساب موظف</Text>}
        </View>
        {isOwner && (
          <>
            <TouchableOpacity
              testID="open-verification-button"
              onPress={() => router.push("/(app)/verification-code")}
              style={styles.iconBtn}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
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

      {/* Store switcher */}
      <TouchableOpacity
        testID="store-switcher"
        style={styles.storeSwitcher}
        onPress={() => setShowStorePicker(true)}
        activeOpacity={0.85}
      >
        <Ionicons
          name={(activeStore?.icon as any) || "storefront"}
          size={22}
          color={colors.primary}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.storeLabel}>المحل الحالي</Text>
          <Text style={styles.storeName} numberOfLines={1}>
            {activeStore?.name || "..."}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      {/* Party type tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          testID="tab-customer"
          style={[styles.tab, !isSupplier && styles.tabActive]}
          onPress={() => setPartyType("customer")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="person"
            size={16}
            color={!isSupplier ? colors.white : colors.textMuted}
          />
          <Text style={[styles.tabText, !isSupplier && styles.tabTextActive]}>الزبائن</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="tab-supplier"
          style={[styles.tab, isSupplier && styles.tabActiveGreen]}
          onPress={() => setPartyType("supplier")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="business"
            size={16}
            color={isSupplier ? colors.white : colors.textMuted}
          />
          <Text style={[styles.tabText, isSupplier && styles.tabTextActive]}>الموردين</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          testID="search-input"
          style={styles.searchInput}
          value={search}
          onChangeText={onSearchChange}
          placeholder={isSupplier ? "ابحث عن مورد..." : "ابحث عن زبون..."}
          placeholderTextColor={colors.textMuted}
          textAlign="right"
        />
      </View>

      {!isEmployee && (
        <View
          style={[styles.totalCard, isSupplier && styles.totalCardSupplier]}
          testID="total-debt-card"
        >
          <Text style={styles.totalLabel}>
            {isSupplier ? "إجمالي المستحق للموردين (عليّ)" : "إجمالي الديون المستحقة (لي)"}
          </Text>
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
              <Ionicons name={isSupplier ? "business-outline" : "people-outline"} size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>
                {isSupplier ? "لا يوجد موردون بعد" : "لا يوجد زبائن بعد"}
              </Text>
              <Text style={styles.emptySubtitle}>اضغط على الزر (+) للإضافة</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        testID="add-customer-fab"
        style={[styles.fab, isSupplier && { backgroundColor: colors.paymentGreenDark }]}
        onPress={goAddCustomer}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={34} color={colors.white} />
      </TouchableOpacity>

      {/* Store picker modal */}
      <Modal visible={showStorePicker} transparent animationType="fade" onRequestClose={() => setShowStorePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard} testID="store-picker-modal">
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>محلاتك</Text>
              <TouchableOpacity onPress={() => setShowStorePicker(false)} testID="store-picker-close">
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {stores.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  testID={`store-item-${s.id}`}
                  style={[styles.storeItem, activeStoreId === s.id && styles.storeItemActive]}
                  onPress={() => chooseStore(s.id)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={(s.icon as any) || "storefront"}
                    size={22}
                    color={activeStoreId === s.id ? colors.debtRed : colors.textMain}
                  />
                  <Text style={[styles.storeItemText, activeStoreId === s.id && { color: colors.debtRed }]}>
                    {s.name}
                  </Text>
                  {activeStoreId === s.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.debtRed} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {isOwner && (
              <TouchableOpacity
                testID="manage-stores-btn"
                style={styles.manageBtn}
                onPress={() => {
                  setShowStorePicker(false);
                  router.push("/(app)/stores");
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="settings" size={18} color={colors.white} />
                <Text style={styles.manageBtnText}>إدارة المحلات</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={showSignOut}
        title="هل أنت متأكد من تسجيل الخروج؟"
        message="سيتم إنهاء جلستك الحالية."
        confirmLabel="تسجيل الخروج"
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
    appSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: "right" },
    iconBtn: { width: 36, height: 44, justifyContent: "center", alignItems: "center" },
    storeSwitcher: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    storeLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600", textAlign: "right" },
    storeName: { fontSize: 16, color: colors.textMain, fontWeight: "800", textAlign: "right" },
    tabs: {
      flexDirection: "row",
      marginHorizontal: 16,
      marginTop: 12,
      gap: 8,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tabActive: { backgroundColor: colors.debtRed, borderColor: colors.debtRed },
    tabActiveGreen: { backgroundColor: colors.paymentGreen, borderColor: colors.paymentGreen },
    tabText: { fontSize: 14, fontWeight: "800", color: colors.textMuted },
    tabTextActive: { color: colors.white },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 10,
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
      marginTop: 14,
      borderRadius: 20,
      padding: 20,
      alignItems: "center",
    },
    totalCardSupplier: { backgroundColor: colors.paymentGreen },
    totalLabel: { color: "#FFEDED", fontSize: 13, fontWeight: "600" },
    totalRow: { flexDirection: "row", alignItems: "baseline", marginTop: 6, gap: 8 },
    totalAmount: { color: colors.white, fontSize: 36, fontWeight: "900" },
    totalCurrency: { color: "#FFF0F0", fontSize: 16, fontWeight: "700" },
    customerCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    customerCardOverLimit: { borderColor: colors.warnBorder, backgroundColor: colors.warnBg },
    avatarCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.debtRedBg,
      justifyContent: "center",
      alignItems: "center",
    },
    avatarCircleSupplier: { backgroundColor: colors.paymentGreenBg },
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
    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: "center", padding: 24 },
    pickerCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16 },
    pickerHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    pickerTitle: { fontSize: 18, fontWeight: "900", color: colors.textMain },
    storeItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      marginTop: 8,
    },
    storeItemActive: { backgroundColor: colors.debtRedBg, borderWidth: 1.5, borderColor: colors.debtRed },
    storeItemText: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.textMain, textAlign: "right" },
    manageBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      marginTop: 14,
    },
    manageBtnText: { color: colors.primaryText, fontSize: 15, fontWeight: "800" },
  });
