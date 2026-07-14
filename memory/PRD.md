# PRD — دفتري (Daftari)

## Overview
A mobile (Expo React Native) app for grocery shop owners to manage customer debt accounts. Full Arabic RTL, red/green semantic color system.

## Tech
- Frontend: Expo Router + React Native (SDK 54), react-native-keyboard-controller, expo-image-picker, expo-secure-store
- Backend: FastAPI + Motor (MongoDB) with JWT auth (python-jose + passlib/bcrypt)
- Storage: MongoDB collections `users`, `customers`, `transactions`
- Currency: دينار (Dinar)

## Screens
1. **Sign-in / Sign-up** — username + password (+ optional shop name on register)
2. **Home** — App bar with title + shop name + sign-out; search bar; big red total-debt card; customer list cards (name, last transaction date, debt amount); floating (+) FAB
3. **Add Customer** — name (required), phone (required), optional max debt
4. **Customer Detail** — balance card + prominent WhatsApp reminder button; transaction timeline (red for debt, green for payment); two large bottom action buttons (red "أخذ/دَين", green "دفع/سداد")
5. **Add Transaction** — big amount input (numeric), optional notes, camera/gallery receipt image (base64), confirm & save

## API (all /api-prefixed)
- POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
- CRUD /api/customers (+ ?search, /summary, GET/PUT/DELETE by id)
- POST/GET/DELETE /api/transactions

## Business Rules
- All customer/transaction data scoped to the authenticated user (owner_id).
- `total_debt` = Σ debt − Σ payment for each customer.
- Transaction amount must be > 0; type ∈ {"debt","payment"}.

## Auth
Simple JWT (HS256), 30-day expiry, secure-store on device.

## Testing
Full backend pytest suite + frontend E2E flows verified (see /app/test_reports/iteration_1.json).
