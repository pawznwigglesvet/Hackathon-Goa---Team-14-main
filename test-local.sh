#!/bin/bash
# Local test script for PR AI Agent
# Run this to test the agent on your machine without GitHub Actions

set -e

echo "🤖 Testing PR AI Agent Locally"
echo "================================"
echo ""

# Check for required environment variables
if [ -z "$GITHUB_TOKEN" ]; then
  echo "Setting GITHUB_TOKEN from gh CLI..."
  export GITHUB_TOKEN=$(gh auth token)
  if [ -z "$GITHUB_TOKEN" ]; then
    echo "❌ Failed. Please run: gh auth login"
    exit 1
  fi
  echo "✓ GITHUB_TOKEN set from gh CLI"
fi

# Check for LLM API key (required by MCP server backend)
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ Error: No LLM API key set"
  echo ""
  echo "The agent uses MCP (Model Context Protocol) server as middleware."
  echo "The MCP server needs a backend LLM provider."
  echo ""
  echo "Set one of the following:"
  echo ""
  echo "Option 1: Anthropic Claude (Recommended)"
  echo "  export ANTHROPIC_API_KEY='sk-ant-your-key-here'"
  echo "  Get a FREE key from: https://console.anthropic.com/"
  echo ""
  echo "Option 2: OpenAI"
  echo "  export OPENAI_API_KEY='sk-...'"
  echo ""
  echo "Then run: ./test-local.sh"
  exit 1
else
  echo "✓ MCP Server configured"
  if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "  Backend: Anthropic Claude"
  elif [ -n "$OPENAI_API_KEY" ]; then
    echo "  Backend: OpenAI"
  fi
fi

# PR details - modify these if testing a different PR
export PR_NUMBER=4
export REPO_OWNER="I572571"
export REPO_NAME="Hackathon-Goa---Team-14"

echo "📋 Configuration:"
echo "  Repository: $REPO_OWNER/$REPO_NAME"
echo "  PR Number: $PR_NUMBER"
echo "  GitHub API: https://github.tools.sap/api/v3"
echo "  LLM Architecture: MCP Server (middleware)"
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "  MCP Backend: Anthropic Claude"
  echo "  Model: ${MCP_MODEL:-claude-sonnet-4-6}"
elif [ -n "$OPENAI_API_KEY" ]; then
  echo "  MCP Backend: OpenAI"
  echo "  Model: ${MCP_MODEL:-gpt-4o}"
fi
echo ""

echo "🚀 Running agent..."
echo ""

node src/agent/index.js

echo ""
echo "✅ Done! Check PR #$PR_NUMBER for the AI comment:"
echo "   https://github.tools.sap/$REPO_OWNER/$REPO_NAME/pull/$PR_NUMBER"
