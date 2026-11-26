#!/usr/bin/env bash
# Checks a running `docker compose up` stack the way a reviewer would:
# the seeded documents get extracted, a Redis FLUSHALL plus a restart loses
# nothing, and a new version is extracted after it. Needs curl and node.
set -euo pipefail

API=${API:-http://localhost:3001}
WEB=${WEB:-http://localhost:3000}

json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const d=JSON.parse(s);console.log($1)})"; }

wait_for() { # wait_for <description> <command>
  for _ in $(seq 1 90); do
    if eval "$2" >/dev/null 2>&1; then echo "ok: $1"; return 0; fi
    sleep 2
  done
  echo "timed out: $1" >&2
  return 1
}

statuses() { curl -fsS "$API/documents" | json "d.map(x=>x.status).sort().join(',')"; }

wait_for "api is healthy" "curl -fsS $API/health"
wait_for "web answers" "curl -fsS $WEB"
wait_for "the web app proxies the api" "curl -fsS $WEB/api/documents"

count=$(curl -fsS "$API/documents" | json "d.length")
[ "$count" = 3 ] || { echo "expected 3 seeded documents, got $count" >&2; exit 1; }
echo "ok: 3 documents seeded"

wait_for "all seeded documents extracted" "[ \"\$(statuses)\" = 'extracted,extracted,extracted' ]"
values=$(curl -fsS "$API/documents/doc-invoice-001" | json "d.values.length")
[ "$values" = 5 ] || { echo "expected 5 invoice values, got $values" >&2; exit 1; }
echo "ok: invoice has 5 values"

echo "--- FLUSHALL and restart"
docker compose exec -T redis redis-cli FLUSHALL
docker compose restart
wait_for "api is healthy again" "curl -fsS $API/health"
[ "$(statuses)" = "extracted,extracted,extracted" ] || { echo "statuses changed after FLUSHALL: $(statuses)" >&2; exit 1; }
values=$(curl -fsS "$API/documents/doc-invoice-001" | json "d.values.length")
[ "$values" = 5 ] || { echo "values lost after FLUSHALL: $values" >&2; exit 1; }
echo "ok: nothing lost after FLUSHALL and restart"

echo "--- new version after the flush"
code=$(curl -s -o /dev/null -w "%{http_code}" -F file=@fixtures/documents/invoice-001.v2.pdf "$API/documents/doc-invoice-001/versions")
[ "$code" = 202 ] || { echo "upload returned $code" >&2; exit 1; }
wait_for "version 2 extracted" "[ \"\$(curl -fsS $API/documents/doc-invoice-001 | json 'd.currentVersion.number+\":\"+d.currentVersion.status')\" = '2:extracted' ]"
duplicates=$(docker compose exec -T postgres psql -U app -d app -tA -c \
  'SELECT count(*) FROM (SELECT 1 FROM "ExtractedValue" GROUP BY "versionId", field HAVING count(*) > 1) d')
[ "$duplicates" = 0 ] || { echo "found $duplicates duplicated values" >&2; exit 1; }
echo "ok: version 2 extracted, no duplicated values"
