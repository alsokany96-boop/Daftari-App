# PRD — دفتري (Daftari)

## Overview
Mobile Expo React Native app (Arabic RTL, PWA-standalone) for grocery shop owners to manage customer debt accounts. Multi-tier auth (super_admin / owner / employee), subscription gating, WhatsApp integrations, per-owner data isolation.

## Tech
- Frontend: Expo Router SDK 54, react-native-keyboard-controller, expo-image-picker, expo-secure-store, safe-area-context
- Backend: FastAPI + Motor (MongoDB), JWT (python-jose + passlib/bcrypt)
- PWA: standalone display, theme #EF4444, lang=ar, dir=rtl

## Roles
- **super_admin**: Registered with username `admin` (configurable via `SUPER_ADMIN_USERNAME` env). Manages all users: activate/deactivate + reset password.
- **owner**: Regular shop owner account. Full CRUD on customers/transactions. Access to Settings + Staff management.
- **employee**: Created by owners under themselves. Sees owner's customers, can add transactions and edit customer name/phone. Cannot delete anything, cannot see totals, cannot manage settings/staff.

## Subscription Rules
- First `FREE_TIER_LIMIT` (default 10) owners → auto `is_active=true`
- Owner #11+ → `is_active=false` → routed to `/subscription-lock` screen (Arabic) with:
  - Price display (20 دينار, `SUBSCRIPTION_PRICE`)
  - Admin phone (`ADMIN_PHONE=0926609606`)
  - WhatsApp deep link to `ADMIN_WHATSAPP=218926609606`
- Super admin activates users from `/admin` dashboard.

## Screens
1. Sign-in (with "نسيت كلمة المرور؟" link)
2. Sign-up (register as owner)
3. Forgot Password (contact admin via WhatsApp)
4. Subscription Lock (for inactive users)
5. Home (RBAC-aware: employees see no totals/settings/staff)
6. Add Customer
7. Customer Detail (WhatsApp reminder + Edit button + transaction timeline + debt/payment action bar)
8. Edit Customer (name/phone; owner also max_debt + delete)
9. Add Transaction (amount + notes + camera/gallery image → post-save WhatsApp reminder prompt)
10. Settings (reminder frequency: daily/weekly/monthly/custom-days + editable template with {name}/{shop}/{amount}/{currency} variables)
11. Staff (add/toggle/delete employees)
12. Admin Dashboard (super_admin only): list users, activate/deactivate, reset password

## WhatsApp Integrations
- Customer detail: "تذكير بالواتساب" uses saved template + current balance
- Post-transaction: reminder prompt modal — pre-built message about the new balance
- Forgot password: pre-filled message to admin
- Subscription lock: pre-filled subscription request to admin

## API Endpoints (all under /api)
- Public: GET /config
- Auth: POST /auth/register, POST /auth/login, GET /auth/me
- Customers: GET/POST/PUT/DELETE /customers, GET /customers/summary
- Transactions: POST /transactions, GET /transactions/{customer_id}, DELETE /transactions/{id}
- Settings: GET/PUT /settings
- Staff (owner): GET/POST /staff, PUT/DELETE /staff/{id}
- Admin (super_admin): GET /admin/users, PUT /admin/users/{id}/activate|deactivate|reset-password

## Data Scoping
- `root_owner_id(user)` = user.id for owners; user.parent_owner_id for employees
- All customer/transaction queries filter by `owner_id == root_owner_id`

## Testing
- Backend: 18/18 pytest v2 (test_daftari_v2.py) + 10/10 v1
- Frontend E2E flows: verified in iteration_2 report
