#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build "دفتري" (Daftari) - Arabic RTL native-feeling mobile app for shop owners to manage
  customer/supplier debts. Latest bug fix cycle:
    1) App was crashing on Customer Details/Edit screens for legacy records missing party_type/store_id.
    2) Add Custom Manual OTP workflow for password recovery (NO Twilio): backend generates a
       6-digit code stored in `reset_codes`, super_admin views pending codes in Admin dashboard,
       admin manually shares the code via WhatsApp; user enters code in reset-pin screen.

backend:
  - task: "Legacy-tolerant customer/transaction schemas"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Server now backfills default party_type='customer' and default store_id for legacy customer docs so /api/customers, /api/customers/{id}, /api/transactions/{customer_id} do not 500."

  - task: "Manual OTP password reset endpoints"
    implemented: true
    working: "NA"
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/auth/forgot-pin generates a 6-digit code in reset_codes (never returned to caller). POST /api/auth/reset-pin validates and resets. GET /api/admin/reset-codes returns pending (unused, unexpired) codes to super_admin only."

frontend:
  - task: "Admin dashboard shows pending manual OTP reset codes with WhatsApp share"
    implemented: true
    working: "NA"
    file: "frontend/app/(app)/admin.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Admin dashboard has a collapsible 'رموز استعادة كلمة المرور المعلّقة' section listing pending codes with a WhatsApp share button that opens wa.me with pre-filled message including the code."

  - task: "Customer details & edit screens tolerant of legacy records"
    implemented: true
    working: "NA"
    file: "frontend/app/(app)/customer/[id].tsx, frontend/app/(app)/customer/edit/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Optional chaining added throughout; legacy customers without party_type/store_id should now open without crashing."

  - task: "Forgot-password screen instructs manual WhatsApp OTP flow"
    implemented: true
    working: "NA"
    file: "frontend/app/forgot-password.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "User is told to contact the admin via WhatsApp to receive the 6-digit code, then enters it on the reset-pin screen."

metadata:
  created_by: "main_agent"
  version: "1.3"
  test_sequence: 7
  run_ui: true

test_plan:
  current_focus:
    - "Sign-out from subscription-lock screen"
    - "Admin profile self-service endpoint PUT /api/auth/profile"
    - "Admin profile UI screen (name/phone/password)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Iteration 7 — Sign-out escape hatch + Admin Profile self-service.

      BUG FIXED (High):
        - Subscription-lock screen previously trapped users. The confirm-signout modal called
          signOut() but never navigated, so Expo Router kept the URL and the user appeared stuck.
        - Fix: subscription-lock.tsx now
            (a) explicitly router.replace('/sign-in') inside the confirm handler AFTER signOut, and
            (b) has a useEffect that routes to /sign-in whenever `user` becomes null.

      FEATURE ADDED (Admin Profile):
        - Backend: PUT /api/auth/profile (auth required, no active-user gate) updates the caller's
          own shop_name (display name) and phone. Only mutates own record.
        - Frontend: /app/(app)/admin-profile.tsx — two-section screen (info + password) gated to
          role='super_admin' (non-admin roles are bounced back via useEffect).
        - Admin dashboard header now has an `admin-profile-open` button opening the new screen.
        - Uses existing api.changePassword for the password section (current + new + confirm).

      Please test the following END-TO-END.

      BACKEND
        1. PUT /api/auth/profile (admin token, {shop_name:"مشرف دفتري", phone:"0926609606"}) →
           returns updated UserPublic with the new fields. Verify persisted in Mongo.
        2. Same endpoint with owner token (testuser) → also works for own account (self-service is
           allowed for all authenticated users; frontend gate is what restricts admin-only UI).
        3. Passing an empty shop_name string clears it to null; whitespace-only is treated as empty.
        4. Endpoint requires a valid Bearer token (401 without).
        5. Endpoint does NOT require an active subscription — a locked owner must still be able
           to call it (still authenticated via get_current_user only).

      FRONTEND
        1. Sign in as testuser (test1234). Seed 10 customers via API so the user hits the lock
           screen. Open the app in the web preview — confirm `signout-lock-button` opens the
           `signout-lock-confirm` dialog and tapping "تسجيل الخروج" now takes the user back to
           /sign-in (previously it was unresponsive). Delete the extra 9 seeded customers to
           restore testuser to its clean state at the end.
        2. Sign in as admin/admin1234. Confirm the new `admin-profile-open` button appears in the
           dashboard header (person-circle-outline icon).
        3. Tap it → `admin-profile-screen` renders with the current name (shop_name) and phone
           prefilled. Change the name to "مشرف دفتري" and phone to "0926609606", tap
           `admin-profile-info-save`, and observe the success text + verify refreshUser reflects
           the change on next `/auth/me`.
        4. Empty name → shows error "الرجاء إدخال اسم المشرف".
        5. Password card: fill current wrong password → error "كلمة المرور الحالية غير صحيحة".
           Fill correct current password, new pw "admin1234", confirm mismatch → mismatch error.
           Fill correctly (keep password = admin1234 for future test runs) → success text.
        6. Attempt to visit /admin-profile as testuser (owner) — screen must NOT render; user is
           bounced back to /home.
        7. Cleanup: ensure admin login credentials still admin/admin1234 at the end.

      Files changed:
        - /app/backend/server.py (added ProfileUpdateRequest and PUT /auth/profile)
        - /app/frontend/src/utils/api.ts (added updateProfile)
        - /app/frontend/app/subscription-lock.tsx (sign-out redirect fix)
        - /app/frontend/app/(app)/admin.tsx (profile header button)
        - /app/frontend/app/(app)/admin-profile.tsx (new screen)

      Credentials: /app/memory/test_credentials.md.

  - agent: "main"
    message: |
      Iteration 6 — Subscription overhaul. Please retest the following END-TO-END.

      BACKEND
        - POST /api/auth/login (testuser/test1234) must now return the extra fields:
          `subscription_expires_at`, `customer_count`, `is_locked`, `free_tier_limit=10`.
        - POST /api/auth/register (new owner): must return is_active=true, subscription_expires_at=null,
          customer_count=0 REGARDLESS of how many owners already exist (the global 11th-user gate is gone).
        - Free-tier lock behavior (fresh owner):
          - Create 9 customers in store A → GET /api/auth/me returns is_active=true, is_locked=false, customer_count=9.
          - Create 10th customer → GET /api/auth/me returns is_active=false, is_locked=true, customer_count=10.
          - Any protected write (POST /api/customers, POST /api/transactions, etc.) must 403 with detail
            "الاشتراك غير مفعّل" until subscription is activated.
        - Multi-store: locked count must be the MAX across an owner's stores (per-store threshold).
          - Store B has 5 customers while store A has 10 → still locked because at least one store hit the limit.
        - Only party_type='customer' counts. Adding 10 suppliers does NOT trigger the lock.
        - PUT /api/admin/users/{owner_id}/activate (admin auth) sets subscription_expires_at ~= now+30d
          and is_active=true. Next /auth/me for the owner returns is_active=true with the new expiry.
        - PUT /api/admin/users/{owner_id}/extend {days:30} extends by 30 days on top of current expiry
          (or from now if expired). Owner without any prior subscription should also work (base=now).
        - PUT /api/admin/users/{owner_id}/deactivate clears subscription_expires_at and sets is_active=false.
        - Simulated expiry: manually update subscription_expires_at to a past ISO in Mongo, then
          /auth/me for that owner returns is_active=false and is_locked=true when count>=10.
        - GET /api/admin/users list must include the new fields for each owner.

      FRONTEND
        - Sign in as testuser (test1234); customer_count=1 → home loads normally.
        - Create 9 additional customers via UI (add-customer.tsx). On the 10th create, add-customer calls
          refreshUser and app should navigate back → subscription-lock screen (redirect via _layout).
          Testers may seed customers via API to save time, but verify at least one create-through-UI ends
          up on the lock screen when count reaches 10.
        - Lock screen shows the new copy ("وصلت إلى X زبون..."), price "20 دينار", "يُجدَّد كل 30 يوماً".
        - Sign in as admin/admin1234, expand a user card:
          - Card shows `زبائن: X / 10` for owners, and a sub-status row like "الاشتراك ساري (30 يوم متبقٍ)".
          - Tapping `admin-extend-<id>` calls PUT /admin/users/{id}/extend and updates the display.
          - "تفعيل" now grants 30 days automatically.
          - "إلغاء التفعيل" now clears expiry.
        - After admin extends the locked test owner, owner's next /auth/me returns is_active=true and
          the lock screen is left (tap "تحقق من حالة التفعيل").
        - Cleanup: restore testuser to a clean state (delete extra seed customers) so future test runs pass.

      Files changed:
        - /app/backend/server.py
        - /app/frontend/app/subscription-lock.tsx
        - /app/frontend/app/(app)/admin.tsx
        - /app/frontend/app/(app)/add-customer.tsx
        - /app/frontend/src/utils/api.ts

      Credentials in /app/memory/test_credentials.md.

  - agent: "main"
    message: |
      Please run full backend + frontend testing for this iteration.
      Focus areas:
        1) Backend: exercise POST /api/auth/forgot-pin (owner username), verify a doc appears in
           reset_codes and the response does NOT include the code. Then log in as super_admin
           and hit GET /api/admin/reset-codes to confirm the code is visible with username/phone/expires_at.
           Then POST /api/auth/reset-pin with the code + a new password and confirm the owner
           can log in with the new password. Also confirm employees are NOT allowed to use
           forgot-pin (server should silently return ok without creating a code).
        2) Backend: create a legacy-looking customer (insert directly or via API without party_type)
           and verify GET /api/customers, GET /api/customers/{id}, and GET /api/transactions/{id}
           all succeed with default party_type='customer'.
        3) Frontend: sign in as super_admin (admin / admin1234), open Admin Dashboard, tap
           "رموز استعادة كلمة المرور المعلّقة" bar to expand pending codes, verify empty state
           renders, then trigger forgot-pin from another session and re-open the bar to see the
           new code appear; tap WhatsApp share and verify a wa.me URL opens with the code in the
           message body.
        4) Frontend: sign in as owner (testuser / test1234), open a customer, tap edit, and back
           several times; ensure no crash occurs for legacy or newly-created customers.
      Credentials are in /app/memory/test_credentials.md.
