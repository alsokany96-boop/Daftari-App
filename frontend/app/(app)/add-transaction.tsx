import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
  Linking,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api, whatsappUrl } from "@/src/utils/api";
import { useSession } from "@/src/ctx/SessionProvider";
import { colors, CURRENCY } from "@/src/theme";
import { buildTransactionMessage } from "@/src/utils/whatsapp";

function formatAmount(n: number) {
  return n.toLocaleString("ar", { maximumFractionDigits: 2 });
}

export default function AddTransactionScreen() {
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

  const [showReminder, setShowReminder] = useState(false);
  const [reminderData, setReminderData] = useState<{
    phone: string;
    message: string;
    newBalance: number;
  } | null>(null);

  const pickFromGallery = async () => {
    setError(null);
    setImageBusy(true);
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
    const amt = parseFloat(amount.replace(",", "."));
    if (!amt || amt <= 0 || isNaN(amt)) {
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
      // Save transaction
      await api.createTransaction({
        customer_id: customerId,
        type: type as "debt" | "payment",
        amount: amt,
        notes: notes.trim() || undefined,
        receipt_image: imageBase64 || undefined,
      });

      // Load reminder settings + fresh customer to build message
      let reminderEnabled = true;
      try {
        const s = await api.getSettings();
        reminderEnabled = !!s.reminder_enabled;
      } catch {
        /* default true */
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
        txAmount: formatAmount(amt),
        newBalance: formatAmount(Math.abs(customer.total_debt)),
        currency: CURRENCY,
      });
      setReminderData({
        phone: customer.phone,
        message,
        newBalance: customer.total_debt,
      });
      setShowReminder(true);
    } catch (e: any) {
      setError(e?.message || "فشل الحفظ");
    } finally {
      setLoading(false);
    }
  };

  const sendReminder = () => {
    if (!reminderData) return;
    Linking.openURL(whatsappUrl(reminderData.phone, reminderData.message)).catch(() => {});
    setShowReminder(false);
    router.back();
  };

  const skipReminder = () => {
    setShowReminder(false);
    router.back();
  };

  const accent = isDebt ? colors.debtRed : colors.paymentGreen;

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

      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        bottomOffset={20}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>المبلغ ({CURRENCY}) *</Text>
        <TextInput
          testID="tx-amount-input"
          style={[styles.amountInput, { borderColor: accent, color: accent }]}
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
          textAlign="center"
          autoFocus
        />

        <Text style={styles.label}>ملاحظات (اختياري)</Text>
        <TextInput
          testID="tx-notes-input"
          style={[styles.input, { minHeight: 90 }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="مثال: خبز وحليب"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        <Text style={styles.label}>صورة الفاتورة (اختياري)</Text>
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
          <View style={styles.imageRow}>
            <TouchableOpacity
              testID="tx-image-camera"
              style={styles.imageBtn}
              onPress={takePhoto}
              disabled={imageBusy}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={22} color={colors.textMain} />
              <Text style={styles.imageBtnText}>الكاميرا</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tx-image-gallery"
              style={styles.imageBtn}
              onPress={pickFromGallery}
              disabled={imageBusy}
              activeOpacity={0.85}
            >
              <Ionicons name="images" size={22} color={colors.textMain} />
              <Text style={styles.imageBtnText}>المعرض</Text>
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <Text style={styles.error} testID="tx-error">
            {error}
          </Text>
        )}

        <TouchableOpacity
          testID="tx-submit-button"
          style={[styles.submitBtn, { backgroundColor: accent }, loading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitText}>تأكيد وحفظ</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      {/* Post-save WhatsApp reminder prompt */}
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

const styles = StyleSheet.create({
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
  container: { padding: 20 },
  label: { fontSize: 14, fontWeight: "700", color: colors.textMain, marginTop: 20, marginBottom: 8, textAlign: "right" },
  amountInput: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 14,
    fontSize: 36,
    fontWeight: "900",
    backgroundColor: colors.surface,
  },
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
  imageRow: { flexDirection: "row", gap: 12 },
  imageBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageBtnText: { fontSize: 15, fontWeight: "700", color: colors.textMain },
  imagePreviewWrap: { position: "relative" },
  imagePreview: { width: "100%", height: 180, borderRadius: 12 },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.debtRed,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  error: { color: colors.debtRed, marginTop: 16, textAlign: "right", fontWeight: "600" },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 28,
  },
  submitText: { color: colors.white, fontSize: 18, fontWeight: "800" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
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
  modalTitle: { fontSize: 20, fontWeight: "900", color: colors.textMain, marginTop: 12, textAlign: "center" },
  modalSubtitle: { fontSize: 14, color: colors.textMuted, marginTop: 6, textAlign: "center", lineHeight: 22 },
  previewBox: {
    width: "100%",
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewText: { fontSize: 13, color: colors.textMain, textAlign: "right", lineHeight: 20 },
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
