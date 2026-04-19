#!/bin/bash

# Query SAP AI Core for available deployments
# This will help you find the correct HYPERSPACE_DEPLOYMENT_ID

set -e

echo "🔍 Querying SAP AI Core for available deployments..."
echo ""

# OAuth2 credentials from your service key
CLIENT_ID="sb-71982814-463f-4be7-bd6c-271eeaa319dc!b1624009|xsuaa_std!b318061"
CLIENT_SECRET="14d4ffbe-439c-4ff0-b21a-b8d1633573af\$xNHQLBZNNEvQsJfvzuQxzARkad8bIeUifZn_J2ZycOc="
AUTH_URL="https://scm-agents-157875.authentication.eu12.hana.ondemand.com/oauth/token"
BASE_URL="https://api.ai.intprod-eu12.eu-central-1.aws.ml.hana.ondemand.com"

# Get access token
echo "🔐 Getting access token..."
auth_response=$(curl -s -X POST "$AUTH_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET")

access_token=$(echo "$auth_response" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$access_token" ]; then
  echo "❌ Failed to get access token"
  echo "Response: $auth_response"
  exit 1
fi

echo "✅ Access token obtained"
echo ""

# List deployments
echo "📋 Fetching deployments..."
resource_group="${1:-default}"

deployments_response=$(curl -s -X GET "${BASE_URL}/v2/lm/deployments" \
  -H "Authorization: Bearer $access_token" \
  -H "AI-Resource-Group: $resource_group")

echo "$deployments_response" | jq '.' 2>/dev/null || echo "$deployments_response"

echo ""
echo "💡 Look for deployments with status 'RUNNING'"
echo "   Use the 'id' field as HYPERSPACE_DEPLOYMENT_ID"
