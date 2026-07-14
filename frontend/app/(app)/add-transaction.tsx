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
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/utils/api";
import { colors, CURRENCY } from "@/src/theme";

export default function AddTransactionScreen() {
  const { customerId, type } = useLocalSearchParams<{
    customerId: string;
    type: "debt" | "payment";
  }>();
  const isDebt = type === "debt";

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

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
      await api.createTransaction({
        customer_id: customerId,
        type: type as "debt" | "payment",
        amount: amt,
        notes: notes.trim() || undefined,
        receipt_image: imageBase64 || undefined,
      });
      router.back();
    } catch (e: any) {
      setError(e?.message || "فشل الحفظ");
    } finally {
      setLoading(false);
    }
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
});
