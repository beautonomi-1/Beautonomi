#!/usr/bin/env bash
# Builds a fresh database from supabase/migrations/*.sql for the DB audit tests.
#
# Files are applied in numeric order of their leading prefix (3/4/5-digit prefixes
# are compared as integers, not strings). A migration that fails on the first pass
# is retried in up to three further passes — the repo has a handful of migrations
# whose dependencies carry a higher prefix. Anything still failing after that is a
# hard error, so a new migration that cannot be replayed from scratch fails CI.
#
# Usage: DATABASE_URL=postgres://... supabase/tests/audit/ci/apply-migrations.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point at a throwaway local/CI database}"
case "$DATABASE_URL" in
  *supabase.co*) echo "Refusing to apply migrations to a hosted Supabase URL" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG_DIR="$(cd "$HERE/../../../migrations" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

# The auth/storage schemas are owned by supabase_admin in the image; `postgres` is not a
# superuser there. Same password as POSTGRES_PASSWORD unless ADMIN_DATABASE_URL overrides.
ADMIN_URL="${ADMIN_DATABASE_URL:-$(printf '%s' "$DATABASE_URL" | sed -E 's#//[^:/@]+(:[^@]*)?@#//supabase_admin\1@#')}"

echo "== prelude (auth/storage stubs for the bare image)"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -f "$HERE/prelude.sql"

cd "$MIG_DIR"
ls ./*.sql | sed 's#^\./##' | awk -F_ '{ printf "%012d %s\n", $1, $0 }' | LC_ALL=C sort | awk '{ print $2 }' > "$WORK/order.txt"
total=$(wc -l < "$WORK/order.txt")
echo "== applying $total migrations in numeric order"

apply_list() { # $1 = list file, $2 = output list of failures
  local ok=0 fail=0 f
  : > "$2"
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    if "${PSQL[@]}" --single-transaction -f "$f" > "$WORK/one.out" 2>&1; then
      ok=$((ok + 1))
    else
      fail=$((fail + 1))
      printf '%s\n' "$f" >> "$2"
      printf 'FAIL %s :: %s\n' "$f" "$(grep -m1 -E 'ERROR|FATAL' "$WORK/one.out" | cut -c1-220)" >> "$WORK/failures.log"
    fi
  done < "$1"
  echo "   ok=$ok fail=$fail"
}

: > "$WORK/failures.log"
apply_list "$WORK/order.txt" "$WORK/fail-0.txt"
prev="$WORK/fail-0.txt"
for pass in 1 2 3; do
  [ -s "$prev" ] || break
  echo "== retry pass $pass ($(wc -l < "$prev") migrations whose dependencies carry a higher prefix):"
  sed 's/^/   - /' "$prev"
  apply_list "$prev" "$WORK/fail-$pass.txt"
  prev="$WORK/fail-$pass.txt"
done

if [ -s "$prev" ]; then
  echo "== migrations that could not be applied after retries:" >&2
  while IFS= read -r f; do grep -F "FAIL $f ::" "$WORK/failures.log" | tail -1 >&2; done < "$prev"
  exit 1
fi
echo "== all $total migrations applied"
