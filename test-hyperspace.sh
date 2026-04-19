#!/bin/bash

# Test Hyperspace connectivity and configuration
# Usage: ./test-hyperspace.sh

set -e

echo "🧪 SAP Hyperspace Connectivity Test"
echo "===================================="
echo ""

# Check if LLM_PROVIDER is set to hyperspace
if [ "$LLM_PROVIDER" != "hyperspace" ]; then
  echo "⚠️  Warning: LLM_PROVIDER is not set to 'hyperspace'"
  echo "   Current value: ${LLM_PROVIDER:-not set}"
  echo "   Set it with: export LLM_PROVIDER=hyperspace"
  echo ""
fi

# Check required environment variables
echo "📋 Checking configuration..."
required_vars=(
  "SAP_AI_CORE_BASE_URL"
  "SAP_AI_CORE_AUTH_URL"
  "SAP_AI_CORE_CLIENT_ID"
  "SAP_AI_CORE_CLIENT_SECRET"
  "HYPERSPACE_DEPLOYMENT_ID"
)

missing=0
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "   ❌ $var is not set"
    missing=$((missing + 1))
  else
    # Mask sensitive values
    if [[ "$var" == *"SECRET"* ]] || [[ "$var" == *"CLIENT_ID"* ]]; then
      echo "   ✅ $var is set (masked)"
    else
      echo "   ✅ $var = ${!var}"
    fi
  fi
done

if [ $missing -gt 0 ]; then
  echo ""
  echo "❌ $missing required variable(s) missing"
  echo "   See docs/HYPERSPACE_SETUP.md for configuration details"
  exit 1
fi

echo ""
echo "✅ All required variables are set"
echo ""

# Test OAuth2 authentication
echo "🔐 Testing OAuth2 authentication..."
auth_response=$(curl -s -w "\n%{http_code}" -X POST "$SAP_AI_CORE_AUTH_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$SAP_AI_CORE_CLIENT_ID" \
  -d "client_secret=$SAP_AI_CORE_CLIENT_SECRET")

http_code=$(echo "$auth_response" | tail -n 1)
response_body=$(echo "$auth_response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo "   ✅ OAuth2 authentication successful"
  access_token=$(echo "$response_body" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
  token_type=$(echo "$response_body" | grep -o '"token_type":"[^"]*"' | cut -d'"' -f4)
  expires_in=$(echo "$response_body" | grep -o '"expires_in":[0-9]*' | cut -d':' -f2)
  echo "   Token type: $token_type"
  echo "   Expires in: ${expires_in}s"
else
  echo "   ❌ OAuth2 authentication failed (HTTP $http_code)"
  echo "   Response: $response_body"
  exit 1
fi

echo ""

# Test deployment accessibility
echo "🚀 Testing deployment accessibility..."
resource_group="${SAP_AI_CORE_RESOURCE_GROUP:-default}"
inference_url="${SAP_AI_CORE_BASE_URL}/v2/inference/deployments/${HYPERSPACE_DEPLOYMENT_ID}/chat/completions"

deployment_response=$(curl -s -w "\n%{http_code}" -X POST "$inference_url" \
  -H "Authorization: Bearer $access_token" \
  -H "AI-Resource-Group: $resource_group" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "You are a test assistant."},
      {"role": "user", "content": "Reply with exactly: TEST OK"}
    ],
    "max_tokens": 10,
    "temperature": 0
  }')

http_code=$(echo "$deployment_response" | tail -n 1)
response_body=$(echo "$deployment_response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo "   ✅ Deployment is accessible and responding"

  # Try to extract the response content
  if command -v jq &> /dev/null; then
    content=$(echo "$response_body" | jq -r '.choices[0].message.content' 2>/dev/null || echo "")
    if [ -n "$content" ]; then
      echo "   Response: $content"
    fi
  fi
else
  echo "   ❌ Deployment test failed (HTTP $http_code)"
  echo "   URL: $inference_url"
  echo "   Response: $response_body"

  if [ "$http_code" = "404" ]; then
    echo ""
    echo "   💡 Possible issues:"
    echo "      - Deployment ID is incorrect"
    echo "      - Deployment is not in RUNNING state"
    echo "      - Resource group mismatch"
  elif [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
    echo ""
    echo "   💡 Possible issues:"
    echo "      - Token expired (unlikely, just obtained)"
    echo "      - Insufficient permissions"
    echo "      - Resource group access denied"
  fi

  exit 1
fi

echo ""

# Test Node.js integration
echo "🧪 Testing Node.js client integration..."
node -e "
import('./src/llm/hyperspace-client.js').then(async (module) => {
  try {
    const client = module.createHyperspaceClient();
    await client.connect();
    console.log('   ✅ Client initialized successfully');

    const health = await client.health();
    console.log('   Health check:', JSON.stringify(health, null, 2).split('\n').map((line, i) => i > 0 ? '      ' + line : '      ' + line).join('\n').trim());

    await client.disconnect();
    console.log('   ✅ Client disconnected');
  } catch (error) {
    console.error('   ❌ Node.js client test failed:', error.message);
    process.exit(1);
  }
}).catch((error) => {
  console.error('   ❌ Failed to load client:', error.message);
  process.exit(1);
});
"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ All tests passed!"
  echo ""
  echo "🎉 Your Hyperspace integration is ready to use"
  echo "   Run 'npm start' to execute the PR agent with Hyperspace"
else
  echo ""
  echo "❌ Node.js client test failed"
  echo "   Check the error messages above for details"
  exit 1
fi
