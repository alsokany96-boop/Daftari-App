import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "daftari_auth_token";
const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await storage.secureGet<string>(TOKEN_KEY, "");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeader()),
    ...((opts.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BASE_URL}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : "خطأ في الاتصال");
  }
  return data as T;
}

export type Role = "super_admin" | "owner" | "employee";
export type PartyType = "customer" | "supplier";

export type UserPublic = {
  id: string;
  username: string;
  shop_name?: string | null;
  phone?: string | null;
  email?: string | null;
  role: Role;
  is_active: boolean;
  parent_owner_id?: string | null;
  created_at?: string | null;
};

export type Store = {
  id: string;
  owner_id: string;
  name: string;
  icon?: string;
  created_at: string;
};

export type Customer = {
  id: string;
  owner_id: string;
  store_id: string;
  party_type: PartyType;
  name: string;
  phone: string;
  max_debt?: number | null;
  created_at: string;
  total_debt: number;
  last_transaction_at?: string | null;
};

export type Transaction = {
  id: string;
  customer_id: string;
  owner_id: string;
  store_id: string;
  party_type: PartyType;
  author_id?: string;
  type: "debt" | "payment";
  amount: number;
  notes?: string | null;
  receipt_image?: string | null;
  created_at: string;
};

export type AppSettings = {
  reminder_enabled: boolean;
  reminder_frequency: "daily" | "weekly" | "monthly" | "custom";
  reminder_custom_days: number;
  reminder_template: string;
};

export type PublicConfig = {
  admin_phone: string;
  admin_whatsapp: string;
  subscription_price: number;
  free_tier_limit: number;
};

export type VerificationCodeResponse = {
  code: string;
  expires_at: string;
  ttl_minutes: number;
};

export type ResetCodeRow = {
  id: string;
  code: string;
  user_id: string;
  username: string;
  phone?: string | null;
  email?: string | null;
  expires_at: string;
  used_at?: string | null;
  created_at: string;
};

function qs(params: Record<string, string | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const api = {
  config: () => request<PublicConfig>("/config"),
  register: (username: string, password: string, shop_name?: string, phone?: string, email?: string) =>
    request<{ access_token: string; user: UserPublic }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, shop_name, phone, email }),
    }),
  login: (username: string, password: string) =>
    request<{ access_token: string; user: UserPublic }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<UserPublic>("/auth/me"),
  changePassword: (current_password: string, new_password: string, verification_code?: string) =>
    request<{ ok: boolean }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password, verification_code }),
    }),
  forgotPin: (username: string) =>
    request<{ ok: boolean; delivery: string; ttl_minutes: number }>("/auth/forgot-pin", {
      method: "POST",
      body: JSON.stringify({ username }),
    }),
  resetPin: (username: string, code: string, new_password: string) =>
    request<{ ok: boolean }>("/auth/reset-pin", {
      method: "POST",
      body: JSON.stringify({ username, code, new_password }),
    }),

  // Stores
  listStores: () => request<Store[]>("/stores"),
  createStore: (name: string, icon?: string) =>
    request<Store>("/stores", { method: "POST", body: JSON.stringify({ name, icon }) }),
  updateStore: (id: string, payload: { name?: string; icon?: string }) =>
    request<Store>(`/stores/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteStore: (id: string) =>
    request<{ ok: boolean }>(`/stores/${id}`, { method: "DELETE" }),

  // Owner verification code
  createVerificationCode: () =>
    request<VerificationCodeResponse>("/owner/verification-codes", { method: "POST" }),

  // Customers / suppliers (parties)
  listCustomers: (options?: { search?: string; store_id?: string; party_type?: PartyType }) =>
    request<Customer[]>(
      `/customers${qs({ search: options?.search, store_id: options?.store_id, party_type: options?.party_type })}`
    ),
  getCustomer: (id: string) => request<Customer>(`/customers/${id}`),
  createCustomer: (payload: {
    name: string;
    phone: string;
    max_debt?: number;
    party_type: PartyType;
    store_id: string;
  }) => request<Customer>("/customers", { method: "POST", body: JSON.stringify(payload) }),
  updateCustomer: (id: string, payload: { name?: string; phone?: string; max_debt?: number | null }) =>
    request<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCustomer: (id: string) => request<{ ok: boolean }>(`/customers/${id}`, { method: "DELETE" }),
  summary: (options?: { store_id?: string; party_type?: PartyType }) =>
    request<{ total_debt: number }>(
      `/customers/summary${qs({ store_id: options?.store_id, party_type: options?.party_type })}`
    ),

  // Transactions
  listTransactions: (customerId: string) =>
    request<Transaction[]>(`/transactions/${customerId}`),
  createTransaction: (payload: {
    customer_id: string;
    type: "debt" | "payment";
    amount: number;
    notes?: string;
    receipt_image?: string;
  }) => request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(payload) }),
  deleteTransaction: (id: string) =>
    request<{ ok: boolean }>(`/transactions/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (payload: Partial<AppSettings>) =>
    request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(payload) }),

  // Staff
  listStaff: () => request<UserPublic[]>("/staff"),
  createStaff: (username: string, password: string, display_name?: string) =>
    request<UserPublic>("/staff", {
      method: "POST",
      body: JSON.stringify({ username, password, display_name }),
    }),
  updateStaff: (id: string, payload: { password?: string; display_name?: string; is_active?: boolean }) =>
    request<UserPublic>(`/staff/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteStaff: (id: string) => request<{ ok: boolean }>(`/staff/${id}`, { method: "DELETE" }),

  // Admin
  adminListUsers: () => request<UserPublic[]>("/admin/users"),
  adminActivate: (id: string) => request<UserPublic>(`/admin/users/${id}/activate`, { method: "PUT" }),
  adminDeactivate: (id: string) => request<UserPublic>(`/admin/users/${id}/deactivate`, { method: "PUT" }),
  adminResetPassword: (id: string, new_password: string) =>
    request<UserPublic>(`/admin/users/${id}/reset-password`, {
      method: "PUT",
      body: JSON.stringify({ new_password }),
    }),
  adminListResetCodes: () => request<ResetCodeRow[]>("/admin/reset-codes"),
};

export function whatsappUrl(phone: string, message: string): string {
  let p = (phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("+")) p = p.slice(1);
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}
