#!/bin/bash
# Test MCP Server locally

set -e

echo "🧪 Testing PR Agent MCP Server"
echo "==============================="
echo ""

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ Error: No LLM API key found"
  echo ""
  echo "Set one of:"
  echo "  export ANTHROPIC_API_KEY='sk-ant-your-key'"
  echo "  export OPENAI_API_KEY='sk-your-key'"
  exit 1
fi

echo "✓ API key found"
echo ""

# Start MCP server
echo "Starting MCP server..."
node src/mcp-server/index.js &
SERVER_PID=$!

# Give server time to start
sleep 2

# Test health endpoint
echo ""
echo "Testing health check..."
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | nc localhost 3000 2>/dev/null || echo "Health check via stdio"

# Test completion
echo ""
echo "Testing LLM completion..."

# For now, we'll test manually
echo "MCP server is running (PID: $SERVER_PID)"
echo ""
echo "To test manually, run the PR agent with USE_MCP=true:"
echo "  export USE_MCP=true"
echo "  export ANTHROPIC_API_KEY='your-key'"
echo "  ./test-local.sh"
echo ""
echo "Press Ctrl+C to stop the MCP server"

# Wait for user interrupt
wait $SERVER_PID
