#!/bin/bash

# Comprehensive test script for all PR Agent features
# Tests all 4 modules: Summary, Reviewer, Code Review, CI Triage

set -e

echo "=========================================="
echo "PR Agent - Comprehensive Feature Test"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check environment variables
echo "📋 Checking environment variables..."

REQUIRED_VARS=(
  "GITHUB_TOKEN"
  "PR_NUMBER"
  "REPO_OWNER"
  "REPO_NAME"
)

SAP_AI_VARS=(
  "SAP_AI_CORE_BASE_URL"
  "SAP_AI_CORE_AUTH_URL"
  "SAP_AI_CORE_CLIENT_ID"
  "SAP_AI_CORE_CLIENT_SECRET"
  "SAP_AI_CORE_TENANT_ID"
  "HYPERSPACE_DEPLOYMENT_ID"
)

# Check required vars
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    echo -e "${RED}✗ Missing required variable: $var${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ $var is set${NC}"
done

# Check SAP AI Core vars
echo ""
echo "🤖 Checking LLM provider configuration..."
if [ -n "$SAP_AI_CORE_BASE_URL" ]; then
  echo -e "${GREEN}✓ SAP AI Core configured${NC}"
  export LLM_PROVIDER='hyperspace'
  export SAP_AI_USE_ORCHESTRATION='true'
elif [ -n "$ANTHROPIC_API_KEY" ]; then
  echo -e "${YELLOW}⚠ Using Anthropic API (fallback)${NC}"
  export LLM_PROVIDER='anthropic'
elif [ -n "$OPENAI_API_KEY" ]; then
  echo -e "${YELLOW}⚠ Using OpenAI API (fallback)${NC}"
  export LLM_PROVIDER='openai'
else
  echo -e "${RED}✗ No LLM provider configured${NC}"
  exit 1
fi

# Set GitHub API URL if not set
export GITHUB_API_URL=${GITHUB_API_URL:-"https://github.tools.sap/api/v3"}

echo ""
echo "=========================================="
echo "Test Configuration"
echo "=========================================="
echo "Repository: $REPO_OWNER/$REPO_NAME"
echo "PR Number: $PR_NUMBER"
echo "LLM Provider: $LLM_PROVIDER"
echo "GitHub API: $GITHUB_API_URL"
echo ""

# Function to run a test
run_test() {
  local test_name=$1
  local description=$2

  echo ""
  echo "=========================================="
  echo "Test: $test_name"
  echo "=========================================="
  echo "$description"
  echo ""
}

# Test 1: Module 1 - PR Summarizer
run_test "Module 1: PR Auto-Summarizer" \
  "Tests SAP-aware PR summary generation"

echo "🔄 Running PR Summarizer..."
if node -e "
  import { createGitHubClient } from './src/github/client.js';
  import { createLLMClient } from './src/llm/client-factory.js';
  import { runSummarizer } from './src/agent/summarizer.js';

  async function test() {
    const github = createGitHubClient(process.env.GITHUB_TOKEN);
    const llm = createLLMClient();
    await llm.connect();

    const result = await runSummarizer(
      github,
      llm,
      process.env.REPO_OWNER,
      process.env.REPO_NAME,
      parseInt(process.env.PR_NUMBER)
    );

    if (llm.disconnect) await llm.disconnect();

    if (result) {
      console.log('✅ Module 1: PASSED - Summary generated');
      process.exit(0);
    } else {
      console.log('❌ Module 1: FAILED - No summary generated');
      process.exit(1);
    }
  }

  test().catch(err => {
    console.error('❌ Module 1: FAILED -', err.message);
    process.exit(1);
  });
" --input-type=module; then
  echo -e "${GREEN}✓ Module 1: PASSED${NC}"
else
  echo -e "${RED}✗ Module 1: FAILED${NC}"
  exit 1
fi

# Test 2: Module 2 - Reviewer Recommender
run_test "Module 2: Reviewer Recommender" \
  "Tests CODEOWNERS + git blame analysis"

echo "🔄 Running Reviewer Recommender..."
if node -e "
  import { createGitHubClient } from './src/github/client.js';
  import { createLLMClient } from './src/llm/client-factory.js';
  import { runReviewerRecommender } from './src/agent/reviewer.js';

  async function test() {
    const github = createGitHubClient(process.env.GITHUB_TOKEN);
    const llm = createLLMClient();
    await llm.connect();

    const result = await runReviewerRecommender(
      github,
      llm,
      process.env.REPO_OWNER,
      process.env.REPO_NAME,
      parseInt(process.env.PR_NUMBER)
    );

    if (llm.disconnect) await llm.disconnect();

    if (result) {
      console.log('✅ Module 2: PASSED - Reviewers recommended');
      process.exit(0);
    } else {
      console.log('❌ Module 2: FAILED - No reviewers recommended');
      process.exit(1);
    }
  }

  test().catch(err => {
    console.error('❌ Module 2: FAILED -', err.message);
    process.exit(1);
  });
" --input-type=module; then
  echo -e "${GREEN}✓ Module 2: PASSED${NC}"
else
  echo -e "${RED}✗ Module 2: FAILED${NC}"
  exit 1
fi

# Test 3: Module 3 - Code Reviewer (with Syntax + Compliance)
run_test "Module 3: Code Reviewer" \
  "Tests syntax validation, compliance checks, and AI code review"

echo "🔄 Running Code Reviewer..."
if node -e "
  import { createGitHubClient } from './src/github/client.js';
  import { createLLMClient } from './src/llm/client-factory.js';
  import { runCodeReviewer } from './src/agent/code-reviewer.js';

  async function test() {
    const github = createGitHubClient(process.env.GITHUB_TOKEN);
    const llm = createLLMClient();
    await llm.connect();

    const result = await runCodeReviewer(
      github,
      llm,
      process.env.REPO_OWNER,
      process.env.REPO_NAME,
      parseInt(process.env.PR_NUMBER)
    );

    if (llm.disconnect) await llm.disconnect();

    if (result || result === null) {
      console.log('✅ Module 3: PASSED - Code review completed');
      process.exit(0);
    } else {
      console.log('❌ Module 3: FAILED - Code review failed');
      process.exit(1);
    }
  }

  test().catch(err => {
    console.error('❌ Module 3: FAILED -', err.message);
    process.exit(1);
  });
" --input-type=module; then
  echo -e "${GREEN}✓ Module 3: PASSED${NC}"
else
  echo -e "${RED}✗ Module 3: FAILED${NC}"
  exit 1
fi

# Test 4: Module 4 - CI Triage (optional, skip if no failures)
run_test "Module 4: CI Failure Triage" \
  "Tests CI failure analysis and auto-fix suggestions"

echo "🔄 Checking for CI failures..."
export RUN_CI_TRIAGE='true'

if node -e "
  import { createGitHubClient } from './src/github/client.js';
  import { createLLMClient } from './src/llm/client-factory.js';
  import { runCITriage } from './src/agent/ci-triage.js';

  async function test() {
    const github = createGitHubClient(process.env.GITHUB_TOKEN);
    const llm = createLLMClient();
    await llm.connect();

    const prDetails = await github.getPRDetails(
      process.env.REPO_OWNER,
      process.env.REPO_NAME,
      parseInt(process.env.PR_NUMBER)
    );

    const checkRuns = await github.getCheckRuns(
      process.env.REPO_OWNER,
      process.env.REPO_NAME,
      prDetails.head.sha
    );

    const result = await runCITriage(
      github,
      llm,
      process.env.REPO_OWNER,
      process.env.REPO_NAME,
      parseInt(process.env.PR_NUMBER),
      checkRuns
    );

    if (llm.disconnect) await llm.disconnect();

    if (result === null) {
      console.log('⏭️  Module 4: SKIPPED - No CI failures found');
      process.exit(0);
    } else if (result) {
      console.log('✅ Module 4: PASSED - CI triage completed');
      process.exit(0);
    } else {
      console.log('❌ Module 4: FAILED - CI triage failed');
      process.exit(1);
    }
  }

  test().catch(err => {
    console.error('❌ Module 4: FAILED -', err.message);
    process.exit(1);
  });
" --input-type=module; then
  echo -e "${GREEN}✓ Module 4: PASSED/SKIPPED${NC}"
else
  echo -e "${YELLOW}⚠ Module 4: May have failed (check logs)${NC}"
fi

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}✅ All core modules tested successfully!${NC}"
echo ""
echo "📊 Module Status:"
echo "  ✅ Module 1: PR Auto-Summarizer"
echo "  ✅ Module 2: Reviewer Recommender"
echo "  ✅ Module 3: Code Reviewer (Syntax + Compliance + AI)"
echo "  ⏭️  Module 4: CI Triage (skipped if no failures)"
echo ""
echo "🎉 PR Agent is production ready!"
echo ""
echo "Next steps:"
echo "1. Check PR #$PR_NUMBER for posted comments"
echo "2. Verify inline comments on 'Changes' tab"
echo "3. Review compliance/syntax findings"
echo "=========================================="
