#!/bin/bash
# Test script to find the correct SAP Hyperspace endpoint

set -e

echo "🔍 Testing SAP Hyperspace Endpoints"
echo "===================================="
echo ""

# Get GitHub token
GITHUB_TOKEN=${GITHUB_TOKEN:-$(gh auth token 2>/dev/null)}

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN not found"
  exit 1
fi

echo "✓ Using GitHub token from gh CLI"
echo ""

# List of common SAP Hyperspace endpoints
declare -a ENDPOINTS=(
  "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2/inference/deployments/d123/chat/completions"
  "https://api.ai.prod.us-east-1.aws.ml.hana.ondemand.com/v2/inference/deployments/d123/chat/completions"
  "https://devops-insights-pr-bot.cfapps.eu10-004.hana.ondemand.com/api/v1/chat/completions"
)

TEST_PAYLOAD='{
  "messages": [
    {"role": "user", "content": "Say hello"}
  ],
  "max_tokens": 10
}'

echo "Testing endpoints (this may take a minute)..."
echo ""

for endpoint in "${ENDPOINTS[@]}"; do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Endpoint: $endpoint"
  echo ""

  # Try with Authorization: Bearer token
  echo "Testing with: Authorization: Bearer \$GITHUB_TOKEN"
  STATUS=$(curl -s -o /tmp/hyperspace_test.out -w "%{http_code}" \
    -X POST "$endpoint" \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$TEST_PAYLOAD" \
    --max-time 5 \
    2>/dev/null || echo "000")

  echo "HTTP Status: $STATUS"

  if [ "$STATUS" = "200" ]; then
    echo "✅ SUCCESS!"
    cat /tmp/hyperspace_test.out | head -20
    echo ""
    echo "Use this endpoint:"
    echo "  export LLM_BASE_URL=\"${endpoint%/chat/completions}\""
    echo "  export ANTHROPIC_API_KEY=\"\$GITHUB_TOKEN\""
    exit 0
  elif [ "$STATUS" = "401" ]; then
    echo "❌ Unauthorized - wrong token or endpoint"
  elif [ "$STATUS" = "404" ]; then
    echo "❌ Not Found - wrong URL or deployment ID"
  elif [ "$STATUS" = "000" ]; then
    echo "❌ Connection Failed - endpoint unreachable"
  else
    echo "Response:"
    cat /tmp/hyperspace_test.out | head -10
  fi
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  None of the common endpoints worked."
echo ""
echo "Next steps:"
echo ""
echo "1. Ask your team:"
echo "   \"What's our SAP AI Core / Hyperspace LLM endpoint?\""
echo ""
echo "2. Check SAP BTP Cockpit:"
echo "   - Log in to BTP cockpit"
echo "   - Go to AI Core instance"
echo "   - Find deployment details"
echo ""
echo "3. Or use Anthropic directly (quick):"
echo "   Get free key from https://console.anthropic.com/"
echo "   export ANTHROPIC_API_KEY='sk-ant-your-key'"
echo "   ./test-local.sh"
echo ""
