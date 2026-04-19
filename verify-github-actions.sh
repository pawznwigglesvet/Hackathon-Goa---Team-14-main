#!/usr/bin/env bash
# Verification script for GitHub Actions configuration

echo "🔍 Verifying GitHub Actions Configuration..."
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        return 0
    else
        echo -e "${RED}✗${NC} Missing: $1"
        return 1
    fi
}

echo "📁 Checking directory structure..."
check_dir ".github" || ((ERRORS++))
check_dir ".github/workflows" || ((ERRORS++))
check_dir "src/agent" || ((ERRORS++))
check_dir "src/mcp-server" || ((ERRORS++))
check_dir "src/github" || ((ERRORS++))
check_dir "src/llm" || ((ERRORS++))
echo ""

echo "📄 Checking workflow files..."
check_file ".github/workflows/pr-agent.yml" || ((ERRORS++))
check_file ".github/workflows/README.md" || ((ERRORS++))
check_file ".github/CODEOWNERS" || ((ERRORS++))
echo ""

echo "🔧 Checking source files..."
check_file "src/agent/index.js" || ((ERRORS++))
check_file "src/agent/summarizer.js" || ((ERRORS++))
check_file "src/agent/reviewer.js" || ((ERRORS++))
check_file "src/mcp-server/index.js" || ((ERRORS++))
check_file "src/github/client.js" || ((ERRORS++))
check_file "src/llm/mcp-client.js" || ((ERRORS++))
check_file "src/llm/prompts.js" || ((ERRORS++))
echo ""

echo "📦 Checking dependencies..."
if [ -f "package.json" ]; then
    echo -e "${GREEN}✓${NC} Found: package.json"
    if grep -q "@anthropic-ai/sdk" package.json; then
        echo -e "${GREEN}✓${NC} Found dependency: @anthropic-ai/sdk"
    else
        echo -e "${RED}✗${NC} Missing dependency: @anthropic-ai/sdk"
        ((ERRORS++))
    fi
    if grep -q "@modelcontextprotocol/sdk" package.json; then
        echo -e "${GREEN}✓${NC} Found dependency: @modelcontextprotocol/sdk"
    else
        echo -e "${RED}✗${NC} Missing dependency: @modelcontextprotocol/sdk"
        ((ERRORS++))
    fi
    if grep -q "@octokit/rest" package.json; then
        echo -e "${GREEN}✓${NC} Found dependency: @octokit/rest"
    else
        echo -e "${RED}✗${NC} Missing dependency: @octokit/rest"
        ((ERRORS++))
    fi
else
    echo -e "${RED}✗${NC} Missing: package.json"
    ((ERRORS++))
fi
echo ""

echo "🔐 Environment Configuration Notes:"
echo -e "${YELLOW}⚠${NC}  Add these secrets in GitHub Settings → Secrets:"
echo "    • ANTHROPIC_API_KEY (or OPENAI_API_KEY)"
echo ""
echo -e "${YELLOW}⚠${NC}  Enable in Settings → Actions → General:"
echo "    • Read and write permissions"
echo "    • Allow GitHub Actions to create and approve pull requests"
echo ""

echo "✅ Verification Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓${NC} All checks passed!"
    echo ""
    echo "Next steps:"
    echo "1. Add ANTHROPIC_API_KEY to repository secrets"
    echo "2. Enable workflow permissions"
    echo "3. Create a test PR"
    echo "4. Check Actions tab"
    exit 0
else
    echo -e "${RED}✗${NC} Found $ERRORS error(s)"
    exit 1
fi
