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
  version: "1.1"
  test_sequence: 5
  run_ui: true

test_plan:
  current_focus:
    - "Manual OTP password reset endpoints"
    - "Admin dashboard shows pending manual OTP reset codes with WhatsApp share"
    - "Customer details & edit screens tolerant of legacy records"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
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
