#!/bin/bash
# Deploy admin.propia.dev to AWS Lambda — and PROVE it landed.
#
# Stack: Lambda "propia-admin" (Node 22 arm64 + Lambda Web Adapter layer)
#        ← API Gateway l2ergwrv7j ← CloudFront E2C70OEAOEPF0Y ← admin.propia.dev
# Env (Supabase/R2/passwords/session secret) lives on the Lambda itself —
# this script only ships code. AWS creds come from ~/Developer/.env.work.
#
# 2026-09-03: two "deploys" ran without ever reaching Lambda — under set -e
# the old script just stopped at the first failing step and nobody noticed.
# Now every step is checked and the LAST LINE says which commit
# admin.propia.dev serves. If it doesn't say "✓ LIVE", it did not deploy.
set -euo pipefail
cd "$(dirname "$0")"

FN=propia-admin
REGION=us-east-1
DIST=E2C70OEAOEPF0Y
URL=https://admin.propia.dev

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ DEPLOY FAILED — %s\033[0m\n' "$*" >&2; exit 1; }
trap 'printf "\n\033[31m✗ DEPLOY FAILED at line %s — admin.propia.dev was NOT updated\033[0m\n" "$LINENO" >&2' ERR

step "Preflight"
command -v aws >/dev/null || fail "aws CLI not on PATH (brew install awscli)"
[ -f ~/Developer/.env.work ] || fail "~/Developer/.env.work missing (AWS creds)"
[ -f .env.local ] || fail ".env.local missing (the build needs the public keys)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  fail "uncommitted changes — commit first (a dirty tree would ship to prod)"
fi
git fetch -q origin main
HEAD_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/main)
if ! git merge-base --is-ancestor "$REMOTE_SHA" "$HEAD_SHA"; then
  fail "this checkout is BEHIND origin/main — run: git pull"
fi
[ "$HEAD_SHA" = "$REMOTE_SHA" ] || echo "⚠ deploying commits that are not pushed yet"
COMMIT=$(git rev-parse --short HEAD)
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "commit $COMMIT · $(git log -1 --format=%s)"

step "Build ($COMMIT)"
NEXT_PUBLIC_BUILD_COMMIT="$COMMIT" NEXT_PUBLIC_BUILD_TIME="$BUILT_AT" npm run build

step "Package"
rm -rf lambda-pkg propia-admin-lambda.zip
mkdir lambda-pkg
cp -r .next/standalone/ lambda-pkg/
rm -rf lambda-pkg/.env.local lambda-pkg/.next/static
mkdir -p lambda-pkg/.next
cp -r .next/static lambda-pkg/.next/static
cp -r public lambda-pkg/public
printf '#!/bin/bash\nexec node server.js\n' > lambda-pkg/run.sh
chmod +x lambda-pkg/run.sh
(cd lambda-pkg && zip -qr ../propia-admin-lambda.zip .)
LOCAL_SHA=$(openssl dgst -sha256 -binary propia-admin-lambda.zip | base64)
echo "zip $(du -h propia-admin-lambda.zip | cut -f1) · sha256 $LOCAL_SHA"

step "Lambda update"
set -a; source ~/Developer/.env.work; set +a
aws lambda update-function-code --region "$REGION" --function-name "$FN" \
  --zip-file fileb://propia-admin-lambda.zip --query LastUpdateStatus --output text
aws lambda wait function-updated --region "$REGION" --function-name "$FN"
REMOTE_CODE_SHA=$(aws lambda get-function-configuration --region "$REGION" --function-name "$FN" \
  --query CodeSha256 --output text)
[ "$REMOTE_CODE_SHA" = "$LOCAL_SHA" ] || fail "Lambda code hash differs from the zip just built"
echo "Lambda code = this build ✓"

step "CloudFront invalidation"
INV=$(aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" \
  --query 'Invalidation.Id' --output text)
aws cloudfront wait invalidation-completed --distribution-id "$DIST" --id "$INV"
echo "invalidation $INV completed ✓"

step "Live check"
LIVE=""
for _ in 1 2 3 4 5 6; do
  LIVE=$(curl -sf --max-time 20 "$URL/api/version" || true)
  if printf '%s' "$LIVE" | grep -q "\"commit\":\"$COMMIT\""; then
    printf '\n\033[32m✓ LIVE — %s serves %s (%s)\033[0m\n' "$URL" "$COMMIT" "$(TZ=America/Mexico_City date '+%H:%M CDMX')"
    exit 0
  fi
  sleep 5
done
fail "$URL/api/version does not report $COMMIT (got: ${LIVE:-nothing}) — check again in a minute: curl $URL/api/version"
