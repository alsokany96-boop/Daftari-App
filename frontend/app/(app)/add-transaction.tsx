import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, whatsappUrl } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { useColors, ThemeColors, CURRENCY } from "@/src/theme";
import { fmtAmount } from "@/src/utils/format";
import { buildTransactionMessage } from "@/src/utils/whatsapp";

// Keys of our custom POS-style numeric keypad. Left column is a utility column
// (image toggle + backspace) so the number pad itself follows a familiar 1-9,
// 0, . layout.
type KeyId = string;

export default function AddTransactionScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { customerId, type } = useLocalSearchParams<{
    customerId: string;
    type: "debt" | "payment";
  }>();
  const isDebt = type === "debt";
  const { user } = useSession();

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);

  const [showReminder, setShowReminder] = useState(false);
  const [reminderData, setReminderData] = useState<{
    phone: string;
    message: string;
  } | null>(null);

  const accent = isDebt ? colors.debtRed : colors.paymentGreen;
  const amountNum = parseFloat(amount || "0") || 0;

  const pressKey = (k: KeyId) => {
    setError(null);
    if (k === "back") {
      setAmount((v) => v.slice(0, -1));
      return;
    }
    if (k === "clear") {
      setAmount("");
      return;
    }
    if (k === ".") {
      if (amount.includes(".")) return;
      setAmount((v) => (v === "" ? "0." : v + "."));
      return;
    }
    // Digit
    setAmount((v) => {
      // Prevent leading zero like "007"
      if (v === "0") return k;
      // Cap total length to keep the display readable (10 digits + '.').
      if (v.replace(/[^0-9]/g, "").length >= 10) return v;
      return v + k;
    });
  };

  const pickFromGallery = async () => {
    setError(null);
    setImageBusy(true);
    setShowImageOptions(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("الرجاء السماح بالوصول إلى الصور");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.6,
      });
      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } finally {
      setImageBusy(false);
    }
  };

  const takePhoto = async () => {
    setError(null);
    setImageBusy(true);
    setShowImageOptions(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError("الرجاء السماح بالوصول إلى الكاميرا");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.6,
      });
      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } finally {
      setImageBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!amountNum || amountNum <= 0) {
      setError("الرجاء إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    if (!customerId || !type) {
      setError("بيانات غير صحيحة");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.createTransaction({
        customer_id: customerId,
        type: type as "debt" | "payment",
        amount: amountNum,
        notes: notes.trim() || undefined,
        receipt_image: imageBase64 || undefined,
      });

      let reminderEnabled = true;
      let templates: Partial<import("@/src/utils/api").AppSettings> = {};
      try {
        const s = await api.getSettings();
        reminderEnabled = !!s.reminder_enabled;
        templates = s;
      } catch {
        /* default */
      }

      if (!reminderEnabled) {
        router.back();
        return;
      }

      const customer = await api.getCustomer(customerId);
      const message = buildTransactionMessage({
        customerName: customer.name,
        shopName: user?.shop_name || "",
        txType: type as "debt" | "payment",
        txAmount: fmtAmount(amountNum),
        newBalance: fmtAmount(Math.abs(customer.total_debt)),
        currency: CURRENCY,
        partyType: (customer.party_type === "supplier" ? "supplier" : "customer") as
          | "customer"
          | "supplier",
        templates: {
          customer_debt_template: templates.customer_debt_template,
          customer_payment_template: templates.customer_payment_template,
          supplier_debt_template: templates.supplier_debt_template,
          supplier_payment_template: templates.supplier_payment_template,
        },
      });
      setReminderData({ phone: customer.phone, message });
      setShowReminder(true);
    } catch (e: any) {
      setError(e?.message || "فشل الحفظ");
    } finally {
      setLoading(false);
    }
  };

  const sendReminder = () => {
    if (!reminderData) return;
    Linking.openURL(whatsappUrl(reminderData.phone, reminderData.message)).catch(
      () => {}
    );
    setShowReminder(false);
    router.back();
  };

  const skipReminder = () => {
    setShowReminder(false);
    router.back();
  };

  const keypadRows: KeyId[][] = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "back"],
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.header, { backgroundColor: accent }]}>
        <TouchableOpacity
          testID="add-tx-back"
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Ionicons name="close" size={26} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isDebt ? "إضافة دَين" : "إضافة سداد"}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Big amount display */}
        <View style={[styles.amountCard, { borderColor: accent }]}>
          <Text style={styles.amountLabel}>المبلغ ({CURRENCY})</Text>
          <Text
            testID="tx-amount-display"
            style={[styles.amountDisplay, { color: accent }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
          >
            {amount || "0"}
          </Text>
          <TouchableOpacity
            testID="tx-amount-clear"
            style={styles.clearBtn}
            onPress={() => pressKey("clear")}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Ionicons name="refresh" size={16} color={colors.textMuted} />
            <Text style={styles.clearBtnText}>مسح</Text>
          </TouchableOpacity>
        </View>

        {/* Notes */}
        <Text style={styles.sectionLabel}>ملاحظات (اختياري)</Text>
        <TextInput
          testID="tx-notes-input"
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="مثال: خبز وحليب"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        {/* Receipt image */}
        <Text style={styles.sectionLabel}>صورة الفاتورة (اختياري)</Text>
        {imageBase64 ? (
          <View style={styles.imagePreviewWrap}>
            <Image
              source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
              style={styles.imagePreview}
              resizeMode="cover"
            />
            <TouchableOpacity
              testID="tx-image-remove"
              style={styles.removeImageBtn}
              onPress={() => setImageBase64(null)}
            >
              <Ionicons name="trash" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            testID="tx-image-open-picker"
            style={styles.imagePickerBtn}
            onPress={() => setShowImageOptions(true)}
            disabled={imageBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="image" size={22} color={colors.textMuted} />
            <Text style={styles.imagePickerText}>
              أضف صورة (الكاميرا أو المعرض)
            </Text>
          </TouchableOpacity>
        )}

        {error && (
          <Text style={styles.error} testID="tx-error">
            {error}
          </Text>
        )}
      </ScrollView>

      {/* Custom POS-style numeric keypad */}
      <View style={styles.keypadWrap} testID="tx-keypad">
        {keypadRows.map((row, i) => (
          <View style={styles.keypadRow} key={`row-${i}`}>
            {row.map((k) => {
              const isBackspace = k === "back";
              const label = isBackspace ? "" : k;
              return (
                <TouchableOpacity
                  key={k}
                  testID={`keypad-${k}`}
                  style={[styles.key, isBackspace && styles.keyBack]}
                  onPress={() => pressKey(k)}
                  activeOpacity={0.7}
                >
                  {isBackspace ? (
                    <Ionicons
                      name="backspace"
                      size={26}
                      color={colors.debtRed}
                    />
                  ) : (
                    <Text style={styles.keyText}>{label}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <TouchableOpacity
          testID="tx-submit-button"
          style={[
            styles.submitBtn,
            { backgroundColor: accent },
            loading && { opacity: 0.7 },
          ]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Ionicons
                name={isDebt ? "arrow-up-circle" : "checkmark-circle"}
                size={22}
                color={colors.white}
              />
              <Text style={styles.submitText}>
                {isDebt ? "تأكيد الدَّين" : "تأكيد السداد"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Image-source chooser */}
      <Modal
        visible={showImageOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.imageOptionsCard} testID="tx-image-options">
            <Text style={styles.modalTitle}>إضافة صورة الفاتورة</Text>
            <TouchableOpacity
              testID="tx-image-camera"
              style={styles.optionBtn}
              onPress={takePhoto}
              disabled={imageBusy}
              activeOpacity={0.85}
            >
              <Ionicons
                name="camera"
                size={22}
                color={colors.textMain}
              />
              <Text style={styles.optionText}>الكاميرا</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tx-image-gallery"
              style={styles.optionBtn}
              onPress={pickFromGallery}
              disabled={imageBusy}
              activeOpacity={0.85}
            >
              <Ionicons
                name="images"
                size={22}
                color={colors.textMain}
              />
              <Text style={styles.optionText}>المعرض</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionCancel}
              onPress={() => setShowImageOptions(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showReminder}
        transparent
        animationType="fade"
        onRequestClose={skipReminder}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="reminder-prompt-modal">
            <View style={styles.reminderIconBox}>
              <Ionicons name="logo-whatsapp" size={40} color={colors.white} />
            </View>
            <Text style={styles.modalTitle}>إرسال تذكير للزبون؟</Text>
            <Text style={styles.modalSubtitle}>
              تم حفظ العملية. هل تريد إعلام الزبون عبر الواتساب بالتحديث؟
            </Text>
            {reminderData && (
              <View style={styles.previewBox}>
                <Text style={styles.previewText} numberOfLines={4}>
                  {reminderData.message}
                </Text>
              </View>
            )}
            <TouchableOpacity
              testID="reminder-send-button"
              style={styles.waBtn}
              onPress={sendReminder}
              activeOpacity={0.85}
            >
              <Ionicons name="logo-whatsapp" size={22} color={colors.white} />
              <Text style={styles.waText}>إرسال عبر الواتساب</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="reminder-skip-button"
              style={styles.skipBtn}
              onPress={skipReminder}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>لاحقاً</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const KEY_HEIGHT = 62;

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    backBtn: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.white },
    scrollContent: { padding: 20, paddingBottom: 16 },
    amountCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 2,
      paddingHorizontal: 20,
      paddingVertical: 22,
      alignItems: "center",
      position: "relative",
      shadowColor: "#000",
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    amountLabel: {
      fontSize: 13,
      color: colors.textMuted,
      fontWeight: "700",
      marginBottom: 8,
    },
    amountDisplay: {
      fontSize: 56,
      fontWeight: "900",
      textAlign: "center",
      letterSpacing: 1,
    },
    clearBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      position: "absolute",
      top: 12,
      right: 14,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    clearBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textMain,
      marginTop: 20,
      marginBottom: 8,
      textAlign: "right",
    },
    notesInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.textMain,
      backgroundColor: colors.surface,
      minHeight: 70,
    },
    imagePickerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
    },
    imagePickerText: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "700",
    },
    imagePreviewWrap: { position: "relative" },
    imagePreview: { width: "100%", height: 140, borderRadius: 12 },
    removeImageBtn: {
      position: "absolute",
      top: 8,
      left: 8,
      backgroundColor: colors.debtRed,
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: "center",
      alignItems: "center",
    },
    error: {
      color: colors.debtRed,
      marginTop: 14,
      textAlign: "right",
      fontWeight: "700",
    },
    keypadWrap: {
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    keypadRow: {
      flexDirection: "row",
      gap: 8,
    },
    key: {
      flex: 1,
      height: KEY_HEIGHT,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    keyBack: {
      backgroundColor: colors.debtRedBg,
      borderColor: colors.debtRedBg,
    },
    keyText: {
      fontSize: 28,
      fontWeight: "900",
      color: colors.textMain,
    },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      borderRadius: 16,
      paddingVertical: 16,
      marginTop: 8,
    },
    submitText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "800",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 24,
      alignItems: "center",
    },
    imageOptionsCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 20,
      gap: 10,
    },
    reminderIconBox: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: colors.whatsapp,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "900",
      color: colors.textMain,
      marginTop: 4,
      textAlign: "center",
    },
    modalSubtitle: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 6,
      textAlign: "center",
      lineHeight: 22,
    },
    previewBox: {
      width: "100%",
      backgroundColor: colors.surfaceAlt,
      borderRadius: 12,
      padding: 12,
      marginTop: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    previewText: {
      fontSize: 13,
      color: colors.textMain,
      textAlign: "right",
      lineHeight: 20,
    },
    optionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionText: {
      color: colors.textMain,
      fontSize: 15,
      fontWeight: "800",
    },
    optionCancel: {
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    optionCancelText: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
    waBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      backgroundColor: colors.whatsapp,
      paddingVertical: 14,
      borderRadius: 14,
      marginTop: 18,
      width: "100%",
    },
    waText: { color: colors.white, fontSize: 16, fontWeight: "800" },
    skipBtn: { padding: 10, marginTop: 6 },
    skipText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  });
