import { Linking } from "react-native";
import { whatsappUrl } from "./api";

// Default templates. Used only when the server has not yet supplied a template
// (e.g. offline first render). The real values come from AppSettings.
export const DEFAULT_TEMPLATES = {
  customer_debt:
    "مرحباً {name}، تم إضافة مبلغ {amount} {currency} إلى حسابك في {shop}. رصيدك الحالي: {balance} {currency}.",
  customer_payment:
    "مرحباً {name}، شكراً لك على السداد. تم استلام {amount} {currency} في {shop}. رصيدك الحالي: {balance} {currency}.",
  supplier_debt:
    "مرحباً {name}، تم تسجيل بضاعة بالآجل بقيمة {amount} {currency}. إجمالي حسابكم لدينا: {balance} {currency}. شكراً لكم.",
  supplier_payment:
    "مرحباً {name}، تم تسليمكم دفعة بقيمة {amount} {currency}. إجمالي حسابكم لدينا: {balance} {currency}. شكراً لكم.",
};

function interpolate(
  template: string,
  vars: { name: string; shop: string; amount: string; balance: string; currency: string }
): string {
  return template
    .replace(/\{name\}/g, vars.name)
    .replace(/\{shop\}/g, vars.shop || "بقالتنا")
    .replace(/\{amount\}/g, vars.amount)
    .replace(/\{balance\}/g, vars.balance)
    .replace(/\{currency\}/g, vars.currency);
}

export function buildReminderMessage(
  template: string,
  vars: { name: string; shop: string; amount: string; currency: string }
): string {
  // Reminders keep their historical variable set. `{balance}` is treated as a
  // synonym of `{amount}` so owners who use it interchangeably don't get an
  // unreplaced placeholder.
  return interpolate(template, { ...vars, balance: vars.amount });
}

export function buildTransactionMessage(params: {
  customerName: string;
  shopName: string;
  txType: "debt" | "payment";
  txAmount: string;
  newBalance: string;
  currency: string;
  partyType?: "customer" | "supplier";
  templates?: Partial<{
    customer_debt_template: string;
    customer_payment_template: string;
    supplier_debt_template: string;
    supplier_payment_template: string;
  }>;
}): string {
  const {
    customerName,
    shopName,
    txType,
    txAmount,
    newBalance,
    currency,
    partyType = "customer",
    templates = {},
  } = params;

  const key = `${partyType}_${txType}` as
    | "customer_debt"
    | "customer_payment"
    | "supplier_debt"
    | "supplier_payment";
  const templateKey = `${key}_template` as
    | "customer_debt_template"
    | "customer_payment_template"
    | "supplier_debt_template"
    | "supplier_payment_template";
  const template = templates[templateKey] || DEFAULT_TEMPLATES[key];

  return interpolate(template, {
    name: customerName,
    shop: shopName || "بقالتنا",
    amount: txAmount,
    balance: newBalance,
    currency,
  });
}

export async function openWhatsApp(phone: string, message: string) {
  const url = whatsappUrl(phone, message);
  try {
    await Linking.openURL(url);
  } catch {
    /* ignore */
  }
}
