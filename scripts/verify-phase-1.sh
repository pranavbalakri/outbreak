#!/usr/bin/env bash
# End-to-end smoke test for Outbreak Phase 1.
# Starts Postgres (if needed) and the API on an ephemeral port, runs checks,
# prints PASS/FAIL per check, exits non-zero on any failure.
#
# Usage: ./scripts/verify-phase-1.sh
# No arguments. Safe to re-run — it cleans up test data and its own API process.

set -u  # no set -e: we want to collect all failures, not bail on the first.

# ----- paths & config -----
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/packages/api"
API_PORT="${API_PORT_OVERRIDE:-4321}"
API_URL="http://localhost:$API_PORT"
DB_URL="postgresql://outbreak:outbreak@localhost:5433/outbreak"
API_LOG="$(mktemp -t outbreak-verify.XXXXXX.log)"
API_PID=""

# ----- cleanup -----
cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null
    wait "$API_PID" 2>/dev/null
  fi
  # Best-effort cleanup of test rows. Safe if table missing.
  psql "$DB_URL" -c "DELETE FROM time_entries WHERE description LIKE 'verify-phase-1%';" >/dev/null 2>&1
  psql "$DB_URL" -c "DELETE FROM task_assignments WHERE task_id IN (SELECT id FROM tasks WHERE name LIKE 'verify-phase-1%');" >/dev/null 2>&1
  psql "$DB_URL" -c "DELETE FROM tasks WHERE name LIKE 'verify-phase-1%';" >/dev/null 2>&1
  psql "$DB_URL" -c "DELETE FROM project_assignments WHERE project_id IN (SELECT id FROM projects WHERE name LIKE 'verify-phase-1%');" >/dev/null 2>&1
  psql "$DB_URL" -c "DELETE FROM projects WHERE name LIKE 'verify-phase-1%';" >/dev/null 2>&1
  psql "$DB_URL" -c "DELETE FROM folders WHERE name LIKE 'verify-phase-1%';" >/dev/null 2>&1
  psql "$DB_URL" -c "DELETE FROM tags WHERE name LIKE 'verify-phase-1%';" >/dev/null 2>&1
  psql "$DB_URL" -c "DELETE FROM week_locks WHERE id = 'verify-phase-1-lock';" >/dev/null 2>&1
  rm -f "$API_LOG"
}
trap cleanup EXIT INT TERM

# ----- counters & pretty output -----
PASS_COUNT=0
FAIL_COUNT=0
BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf "  ${GREEN}✓${RESET} %s\n" "$1" >&2
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf "  ${RED}✗${RESET} %s\n" "$1" >&2
  if [[ -n "${2:-}" ]]; then
    printf "    ${DIM}%s${RESET}\n" "$2" >&2
  fi
}

section() { printf "\n${BOLD}%s${RESET}\n" "$1" >&2; }
info()    { printf "  ${DIM}%s${RESET}\n" "$1" >&2; }

# ----- helpers -----
curl_code() {
  # Usage: curl_code <expected-code> <desc> [curl args...]
  # Captures both body and http code.
  local expected="$1"; shift
  local desc="$1"; shift
  local out code body
  out=$(curl -s -w "\n__HTTP__%{http_code}" "$@" 2>/dev/null) || true
  code=$(printf '%s' "$out" | awk -F'__HTTP__' '/__HTTP__/ {print $2}')
  body=$(printf '%s' "$out" | sed '/__HTTP__/d')
  if [[ "$code" == "$expected" ]]; then
    pass "$desc (HTTP $code)"
    printf '%s' "$body"
    return 0
  else
    fail "$desc" "expected HTTP $expected, got ${code:-none}; body: $(printf '%s' "$body" | head -c 200)"
    printf '%s' "$body"
    return 1
  fi
}

json_field() {
  # Usage: echo "$json" | json_field path.to.field
  python3 -c "
import json, sys
d = json.load(sys.stdin)
for key in '$1'.split('.'):
    if key.isdigit():
        d = d[int(key)]
    else:
        d = d[key]
print(d)
"
}

# ----- 1. prerequisites -----
section "1. Prerequisites"

if ! command -v psql >/dev/null; then
  fail "psql not installed" "brew install libpq && brew link --force libpq"
else
  pass "psql is installed"
fi

if ! command -v docker >/dev/null; then
  fail "docker not installed"
else
  pass "docker is installed"
fi

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon not reachable" "open -a Docker; then re-run"
  printf "\nAborting — start Docker Desktop and re-run.\n"
  exit 1
else
  pass "docker daemon reachable"
fi

# Start postgres if not already up.
if ! docker ps --format '{{.Names}}' | grep -q '^outbreak-postgres$'; then
  info "starting postgres..."
  docker compose -f "$ROOT/docker-compose.yml" up -d postgres >/dev/null
fi

# Wait for DB to be ready.
for _ in {1..30}; do
  if docker exec outbreak-postgres pg_isready -U outbreak -d outbreak >/dev/null 2>&1; then
    pass "postgres is ready on :5433"
    break
  fi
  sleep 1
done
if ! docker exec outbreak-postgres pg_isready -U outbreak -d outbreak >/dev/null 2>&1; then
  fail "postgres didn't come up in 30s"
  exit 1
fi

# Re-seed to get a predictable state.
info "seeding db..."
( cd "$API_DIR" && pnpm db:seed >/dev/null 2>&1 )
SEED_USER_COUNT=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM users;")
if [[ "$SEED_USER_COUNT" == "3" ]]; then
  pass "seed produced 3 users"
else
  fail "seed produced $SEED_USER_COUNT users (expected 3)"
fi

# ----- 2. boot API on ephemeral port -----
section "2. Boot API on port $API_PORT"

(
  cd "$API_DIR" && \
  API_PORT="$API_PORT" API_ORIGIN="$API_URL" \
  pnpm dev > "$API_LOG" 2>&1
) &
API_PID=$!

# Wait for the API to start.
for _ in {1..40}; do
  if curl -s "$API_URL/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if curl -s "$API_URL/healthz" | grep -q '"ok":true'; then
  pass "/healthz returned {ok:true}"
else
  fail "API didn't start within 20s"
  echo "---- API log ----"
  tail -40 "$API_LOG"
  exit 1
fi

# ----- 3. fetch IDs & tokens -----
section "3. Mint dev sessions for seeded users"

ADMIN_ID=$(psql "$DB_URL" -tA -c "SELECT id FROM users WHERE role='ADMIN';")
ALICE_ID=$(psql "$DB_URL" -tA -c "SELECT id FROM users WHERE email='alice@example.com';")
BOB_ID=$(psql "$DB_URL" -tA -c "SELECT id FROM users WHERE email='bob@example.com';")
SEASON_FOLDER=$(psql "$DB_URL" -tA -c "SELECT id FROM folders WHERE name='Fall 2026 Season';")

ADMIN_TOKEN=$(cd "$API_DIR" && pnpm exec tsx scripts/mint-dev-session.ts "$ADMIN_ID" 2>/dev/null)
ALICE_TOKEN=$(cd "$API_DIR" && pnpm exec tsx scripts/mint-dev-session.ts "$ALICE_ID" 2>/dev/null)
BOB_TOKEN=$(cd "$API_DIR" && pnpm exec tsx scripts/mint-dev-session.ts "$BOB_ID" 2>/dev/null)

if [[ -n "$ADMIN_TOKEN" && -n "$ALICE_TOKEN" && -n "$BOB_TOKEN" ]]; then
  pass "minted tokens for admin, alice, bob"
else
  fail "token minting failed"
  exit 1
fi

# ----- 4. Step 5 — skeleton + error handling -----
section "4. Step 5 — Fastify skeleton"

curl_code 401 "/auth/me with no cookie returns 401" "$API_URL/auth/me" >/dev/null

curl_code 404 "unknown route returns 404 JSON" "$API_URL/nope" >/dev/null

# Validation error shape — POST a tag with empty name
body=$(curl_code 400 "Zod validation error returns 400" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"name":""}' "$API_URL/tags")
if printf '%s' "$body" | grep -q '"code":"validation_error"'; then
  pass "validation error has code validation_error"
else
  fail "validation error shape wrong" "body: $body"
fi

# ----- 5. Step 6 — session auth -----
section "5. Step 6 — Session auth (Google OAuth stubbed via dev token)"

body=$(curl_code 200 "/auth/me with valid session" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" "$API_URL/auth/me")
if printf '%s' "$body" | grep -q '"role":"ADMIN"'; then
  pass "/auth/me returns admin role"
else
  fail "/auth/me didn't return admin" "body: $body"
fi

curl_code 401 "/auth/me with bad cookie returns 401" \
  -H "Cookie: outbreak_session=not.a.jwt" "$API_URL/auth/me" >/dev/null

# Google start without GOOGLE_CLIENT_ID → 400
curl_code 400 "/auth/google/start without Google config returns 400" \
  "$API_URL/auth/google/start" >/dev/null

curl_code 200 "/auth/logout returns 200" -X POST "$API_URL/auth/logout" >/dev/null

# ----- 6. Step 7 — OAuth hardening -----
section "6. Step 7 — Deactivation lockout & audit log"

# Deactivate Bob mid-session and expect his next call to 401.
psql "$DB_URL" -c "UPDATE users SET is_active=false WHERE id='$BOB_ID';" >/dev/null
curl_code 401 "deactivated user is rejected mid-session" \
  -H "Cookie: outbreak_session=$BOB_TOKEN" "$API_URL/auth/me" >/dev/null
psql "$DB_URL" -c "UPDATE users SET is_active=true WHERE id='$BOB_ID';" >/dev/null

# Auth audit table should exist and be writable (we haven't exercised Google, so
# we just check the table is there — it was added in the auth_attempt migration).
if psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM auth_attempts;" >/dev/null 2>&1; then
  pass "auth_attempts table exists"
else
  fail "auth_attempts table missing"
fi

# ----- 7. Step 8 — Users & rates -----
section "7. Step 8 — User management + rate history"

# Snapshot Alice's current rate & history count.
ORIG_RATE=$(psql "$DB_URL" -tA -c "SELECT current_rate_cents FROM users WHERE id='$ALICE_ID';")
ORIG_HIST=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM rate_history WHERE user_id='$ALICE_ID';")
ORIG_ENTRY_RATE=$(psql "$DB_URL" -tA -c "SELECT rate_cents_at_entry FROM time_entries WHERE user_id='$ALICE_ID' LIMIT 1;")

# Change rate twice.
curl -s -X PATCH -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"rateCents":7777}' "$API_URL/users/$ALICE_ID/rate" >/dev/null
curl -s -X PATCH -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"rateCents":8888}' "$API_URL/users/$ALICE_ID/rate" >/dev/null

NEW_RATE=$(psql "$DB_URL" -tA -c "SELECT current_rate_cents FROM users WHERE id='$ALICE_ID';")
NEW_HIST=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM rate_history WHERE user_id='$ALICE_ID';")
NEW_ENTRY_RATE=$(psql "$DB_URL" -tA -c "SELECT rate_cents_at_entry FROM time_entries WHERE user_id='$ALICE_ID' LIMIT 1;")

[[ "$NEW_RATE" == "8888" ]] \
  && pass "current_rate_cents updated to 8888" \
  || fail "rate didn't update" "got $NEW_RATE"
[[ "$NEW_HIST" == "$((ORIG_HIST + 2))" ]] \
  && pass "rate_history gained 2 rows" \
  || fail "rate_history should have gained 2 (was $ORIG_HIST, now $NEW_HIST)"
[[ "$NEW_ENTRY_RATE" == "$ORIG_ENTRY_RATE" ]] \
  && pass "historical time entry rate unchanged ($ORIG_ENTRY_RATE)" \
  || fail "historical time entry rate was mutated" "was $ORIG_ENTRY_RATE, now $NEW_ENTRY_RATE"

# Restore Alice's rate.
psql "$DB_URL" -c "
  UPDATE users SET current_rate_cents=$ORIG_RATE WHERE id='$ALICE_ID';
  DELETE FROM rate_history WHERE id IN (
    SELECT id FROM rate_history WHERE user_id='$ALICE_ID' ORDER BY effective_from DESC LIMIT 2
  );
" >/dev/null

# Non-admin change → 403
curl_code 403 "instructor cannot change rates" \
  -X PATCH -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ALICE_TOKEN" \
  -d '{"rateCents":9999}' "$API_URL/users/$ALICE_ID/rate" >/dev/null

# ----- 8. Step 9 — Folders + Tags -----
section "8. Step 9 — Folders + Tags"

folder_resp=$(curl_code 200 "admin creates folder" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"name":"verify-phase-1-folder"}' "$API_URL/folders")
FOLDER_ID=$(printf '%s' "$folder_resp" | json_field folder.id)

curl_code 403 "instructor cannot create folder" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ALICE_TOKEN" \
  -d '{"name":"should-fail"}' "$API_URL/folders" >/dev/null

# Create a tag
tag_resp=$(curl_code 200 "admin creates tag" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"name":"verify-phase-1-tag"}' "$API_URL/tags")
TAG_ID=$(printf '%s' "$tag_resp" | json_field tag.id)

# Insert a project directly, then try to delete the folder → expect 409
psql "$DB_URL" -c "
  INSERT INTO projects(id, folder_id, name, estimated_minutes, original_estimated_minutes, status, created_by_user_id, updated_at)
  VALUES ('verify-phase-1-proj-tmp', '$FOLDER_ID', 'verify-phase-1-tmp', 60, 60, 'NOT_STARTED', '$ADMIN_ID', NOW());
" >/dev/null
curl_code 409 "deleting folder with active projects returns 409" \
  -X DELETE -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  "$API_URL/folders/$FOLDER_ID" >/dev/null
psql "$DB_URL" -c "DELETE FROM projects WHERE id='verify-phase-1-proj-tmp';" >/dev/null

# Now delete works
curl_code 200 "empty folder deletes" \
  -X DELETE -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  "$API_URL/folders/$FOLDER_ID" >/dev/null

# Tag cleanup
curl -s -X DELETE -H "Cookie: outbreak_session=$ADMIN_TOKEN" "$API_URL/tags/$TAG_ID" >/dev/null

# ----- 9. Step 10 — Projects CRUD + visibility -----
section "9. Step 10 — Projects + assigned-only visibility"

proj_resp=$(curl_code 200 "admin creates Bob-only project" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d "{\"folderId\":\"$SEASON_FOLDER\",\"name\":\"verify-phase-1-bob\",\"estimatedMinutes\":60,\"assigneeIds\":[\"$BOB_ID\"]}" \
  "$API_URL/projects")
PROJ_ID=$(printf '%s' "$proj_resp" | json_field project.id)

bob_list=$(curl -s -H "Cookie: outbreak_session=$BOB_TOKEN" "$API_URL/projects")
if printf '%s' "$bob_list" | grep -q "verify-phase-1-bob"; then
  pass "bob sees project he is assigned to"
else
  fail "bob did not see his project"
fi

alice_list=$(curl -s -H "Cookie: outbreak_session=$ALICE_TOKEN" "$API_URL/projects")
if printf '%s' "$alice_list" | grep -q "verify-phase-1-bob"; then
  fail "alice can see bob's project (should be hidden)"
else
  pass "alice does not see project she is not assigned to"
fi

curl_code 403 "alice GET /projects/:id on bob's project → 403" \
  -H "Cookie: outbreak_session=$ALICE_TOKEN" "$API_URL/projects/$PROJ_ID" >/dev/null

curl_code 200 "admin adds alice as assignee" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d "{\"userId\":\"$ALICE_ID\"}" \
  "$API_URL/projects/$PROJ_ID/assignees" >/dev/null

alice_list=$(curl -s -H "Cookie: outbreak_session=$ALICE_TOKEN" "$API_URL/projects")
if printf '%s' "$alice_list" | grep -q "verify-phase-1-bob"; then
  pass "alice now sees project after being added"
else
  fail "alice still does not see project after add"
fi

curl_code 403 "instructor cannot create projects" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ALICE_TOKEN" \
  -d "{\"folderId\":\"$SEASON_FOLDER\",\"name\":\"verify-phase-1-illegal\",\"estimatedMinutes\":30}" \
  "$API_URL/projects" >/dev/null

# ----- 10. Step 11 — Tasks inherit assignees -----
section "10. Step 11 — Task assignee inheritance"

task_resp=$(curl_code 200 "admin creates task on Bob+Alice project" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"name":"verify-phase-1-task","estimatedMinutes":30}' \
  "$API_URL/projects/$PROJ_ID/tasks")
TASK_ID=$(printf '%s' "$task_resp" | json_field task.id)

TASK_ASSIGN_COUNT=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM task_assignments WHERE task_id='$TASK_ID';")
[[ "$TASK_ASSIGN_COUNT" == "2" ]] \
  && pass "task inherited 2 assignees from project" \
  || fail "task has $TASK_ASSIGN_COUNT assignees (expected 2)"

# Remove Alice from project
curl -s -X DELETE -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  "$API_URL/projects/$PROJ_ID/assignees/$ALICE_ID" >/dev/null

AFTER_COUNT=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM task_assignments WHERE task_id='$TASK_ID';")
[[ "$AFTER_COUNT" == "2" ]] \
  && pass "task assignees unchanged after project reassignment" \
  || fail "task assignees changed to $AFTER_COUNT (expected still 2 — copied not derived)"

# ----- 11. Step 12 — Time entries -----
section "11. Step 12 — Time entries"

# Alice creates an unassigned entry
te_resp=$(curl_code 200 "alice creates unassigned time entry" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ALICE_TOKEN" \
  -d '{"startedAt":"2026-04-15T14:00:00Z","endedAt":"2026-04-15T15:30:00Z","description":"verify-phase-1-entry","isBillable":true}' \
  "$API_URL/time-entries")
ENTRY_ID=$(printf '%s' "$te_resp" | json_field entry.id)
ENTRY_PROJECT=$(printf '%s' "$te_resp" | python3 -c "import json,sys; print(json.load(sys.stdin)['entry']['projectId'])")
[[ "$ENTRY_PROJECT" == "None" ]] \
  && pass "entry is unassigned (projectId is null)" \
  || fail "entry had projectId=$ENTRY_PROJECT (expected null)"

# Bob cannot see Alice's entry
bob_entries=$(curl -s -H "Cookie: outbreak_session=$BOB_TOKEN" "$API_URL/time-entries")
if printf '%s' "$bob_entries" | grep -q "verify-phase-1-entry"; then
  fail "bob sees alice's entry (should be hidden)"
else
  pass "instructor cannot see other instructor's entries"
fi

# unassigned filter
unassigned_resp=$(curl -s -H "Cookie: outbreak_session=$ALICE_TOKEN" "$API_URL/time-entries?unassigned=true")
if printf '%s' "$unassigned_resp" | grep -q "verify-phase-1-entry"; then
  pass "unassigned=true filter returns the entry"
else
  fail "unassigned filter did not return the entry"
fi

# Admin attaches the entry to a project
curl -s -X PATCH -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d "{\"projectId\":\"$PROJ_ID\"}" \
  "$API_URL/time-entries/$ENTRY_ID" >/dev/null
ATTACHED_PROJ=$(psql "$DB_URL" -tA -c "SELECT project_id FROM time_entries WHERE id='$ENTRY_ID';")
[[ "$ATTACHED_PROJ" == "$PROJ_ID" ]] \
  && pass "admin attached entry to project" \
  || fail "entry project is $ATTACHED_PROJ (expected $PROJ_ID)"

# Now it's NOT in unassigned
unassigned_resp=$(curl -s -H "Cookie: outbreak_session=$ALICE_TOKEN" "$API_URL/time-entries?unassigned=true")
if printf '%s' "$unassigned_resp" | grep -q "$ENTRY_ID"; then
  fail "entry still appears as unassigned after attach"
else
  pass "attached entry no longer appears in unassigned filter"
fi

# endedAt < startedAt → 400
curl_code 400 "endedAt < startedAt returns 400" \
  -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ALICE_TOKEN" \
  -d '{"startedAt":"2026-04-15T15:00:00Z","endedAt":"2026-04-15T14:00:00Z"}' \
  "$API_URL/time-entries" >/dev/null

# Lock the week containing the entry (ISO week 2026-W16)
psql "$DB_URL" -c "
  INSERT INTO week_locks(id, iso_year, iso_week, locked_by_user_id)
  VALUES ('verify-phase-1-lock', 2026, 16, '$ADMIN_ID');
" >/dev/null

curl_code 409 "PATCH on locked week returns 409" \
  -X PATCH -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"description":"should fail"}' \
  "$API_URL/time-entries/$ENTRY_ID" >/dev/null

curl_code 409 "DELETE on locked week returns 409" \
  -X DELETE -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  "$API_URL/time-entries/$ENTRY_ID" >/dev/null

psql "$DB_URL" -c "DELETE FROM week_locks WHERE id='verify-phase-1-lock';" >/dev/null

# Task-project mismatch
season_other=$(psql "$DB_URL" -tA -c "SELECT id FROM projects WHERE name='Weekly Team Sync Notes';")
mismatched_task_resp=$(curl -s -X POST -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d '{"name":"verify-phase-1-mismatch","estimatedMinutes":30}' \
  "$API_URL/projects/$season_other/tasks")
MISMATCH_TASK_ID=$(printf '%s' "$mismatched_task_resp" | json_field task.id)

curl_code 409 "taskId from different project → 409" \
  -X PATCH -H "Content-Type: application/json" \
  -H "Cookie: outbreak_session=$ADMIN_TOKEN" \
  -d "{\"projectId\":\"$PROJ_ID\",\"taskId\":\"$MISMATCH_TASK_ID\"}" \
  "$API_URL/time-entries/$ENTRY_ID" >/dev/null

# ----- 12. summary -----
section "Summary"
TOTAL=$((PASS_COUNT + FAIL_COUNT))
printf "  %s%d%s passed, %s%d%s failed, %d total\n\n" \
  "$GREEN" "$PASS_COUNT" "$RESET" \
  "$([[ $FAIL_COUNT -gt 0 ]] && printf '%s' "$RED" || printf '%s' "$GREEN")" \
  "$FAIL_COUNT" "$RESET" \
  "$TOTAL"

if [[ $FAIL_COUNT -gt 0 ]]; then
  printf "  API log: %s\n" "$API_LOG"
  exit 1
fi
exit 0
