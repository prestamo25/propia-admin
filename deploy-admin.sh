#!/bin/bash
# Deploy admin.propia.dev to AWS Lambda.
#
# Stack: Lambda "propia-admin" (Node 22 arm64 + Lambda Web Adapter layer)
#        ← API Gateway l2ergwrv7j ← CloudFront E2C70OEAOEPF0Y ← admin.propia.dev
# Env (Supabase/R2/passwords/session secret) lives on the Lambda itself —
# this script only ships code. AWS creds come from ~/Developer/.env.work.
set -euo pipefail
cd "$(dirname "$0")"

npm run build

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

set -a; source ~/Developer/.env.work; set +a
aws lambda update-function-code --region us-east-1 --function-name propia-admin \
  --zip-file fileb://propia-admin-lambda.zip --query LastUpdateStatus --output text
aws lambda wait function-updated --region us-east-1 --function-name propia-admin

aws cloudfront create-invalidation --distribution-id E2C70OEAOEPF0Y \
  --paths "/*" --query 'Invalidation.Status' --output text

echo "✓ deployed — https://admin.propia.dev"
