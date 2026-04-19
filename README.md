# Hackathon-Goa---Team-14

## AI-Powered PR Workflow Agent for SAP GitHub Repos

An agentic PR workflow automation system that runs on GitHub Actions, providing:

1. **📝 PR Auto-Summarizer** — SAP-aware PR summaries (CAP, CDS, OData, UI5)
2. **👥 Reviewer Recommender** — Smart reviewer assignment based on CODEOWNERS + git blame
3. **🔍 Code Reviewer** — Deep code analysis with **inline comments** (like Hyperspace bot!) 🎯
   - ✨ **Syntax & import error detection** (catches issues before CI!)
   - 💡 One-click fix suggestions
   - 🔒 Security vulnerability scanning
   - ⚡ Performance optimization tips
4. **🔐 Compliance Pre-Check** — Security, licensing & privacy validation ✅ **NEW!**
   - 🔑 Secret detection (API keys, passwords, tokens)
   - ⚠️ Banned function checking (`eval`, `innerHTML`, `exec`)
   - 📋 License compliance (GPL/AGPL warnings)
   - 👤 PII logging detection (AI-powered)
5. **⏳ CI Failure Triage** — Automated root cause analysis (planned)

### ✨ Latest Features

**🔐 Compliance Pre-Check** - Security & privacy validation ([docs](docs/COMPLIANCE.md)):
- Secret detection (API keys, passwords, AWS keys)
- Banned functions (`eval`, `innerHTML`, `exec`)
- License checking (GPL/AGPL warnings)
- PII logging detection (AI-powered)

Prevents security issues before they reach production!

**🔴 Pre-Flight Validation** - Catches errors before CI runs ([docs](docs/SYNTAX_VALIDATION.md)):
- Syntax errors with exact line numbers
- Import/export errors with one-click fixes
- Missing module detection

Just like the error we saw in the pipeline - now it posts as an inline comment with a fix!

**💬 Inline Code Review Comments** ([docs](docs/INLINE_COMMENTS.md)):

The agent posts inline comments directly on specific lines in the diff, just like Hyperspace bot:

- 🔴 **Critical issues** appear exactly where they occur
- 🔒 **Security vulnerabilities** highlighted inline
- 🐛 **Bugs** pointed out with fixes

[Full features →](CODE_REVIEW_FEATURES.md)

### Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up GitHub Secrets:**
   - Navigate to **Settings → Secrets and variables → Actions**
   - Add `ANTHROPIC_API_KEY` (get from https://console.anthropic.com)

3. **Enable workflow permissions:**
   - Go to **Settings → Actions → General**
   - Enable "Read and write permissions"
   - Enable "Allow GitHub Actions to create and approve pull requests"

4. **Test the agent:**
   - Create a branch and open a PR
   - Watch the agent post summary and reviewer suggestions

### Architecture

```
Pull Request → GitHub Actions → PR Agent → MCP Server → LLM (Claude/GPT-4)
                                    ↓
                            GitHub API (comments, reviewers)
```

### Documentation

- [**PLAYBOOK.md**](PLAYBOOK.md) — Detailed architecture and implementation guide
- [**CLAUDE.md**](CLAUDE.md) — Project instructions for Claude Code
- [**.github/workflows/README.md**](.github/workflows/README.md) — GitHub Actions configuration guide

### Project Structure

```
.github/
  workflows/
    pr-agent.yml         # Main PR workflow
  CODEOWNERS            # Reviewer assignment rules

src/
  agent/
    index.js            # Main orchestrator
    summarizer.js       # Module 1: PR summary
    reviewer.js         # Module 2: Reviewer recommender

  mcp-server/
    index.js            # MCP server for LLM access

  github/
    client.js           # GitHub API wrapper

  llm/
    mcp-client.js       # MCP client
    prompts.js          # SAP-aware prompts

package.json           # Dependencies
```

### Available Scripts

```bash
npm start              # Run agent locally (requires env vars)
npm test               # Run tests
./test-local.sh        # Test agent with mock PR
./test-mcp-server.sh   # Test MCP server connectivity
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub API token | Yes |
| `PR_NUMBER` | Pull request number | Yes |
| `REPO_OWNER` | Repository owner | Yes |
| `REPO_NAME` | Repository name | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes* |
| `OPENAI_API_KEY` | OpenAI API key | Yes* |
| `LLM_PROVIDER` | `anthropic` or `openai` | No (default: anthropic) |
| `LLM_MODEL` | Model name | No (default: claude-sonnet-4-6) |

\* Either Anthropic or OpenAI key required

### Features

#### Module 1: PR Auto-Summarizer
- Generates SAP-aware summaries using CAP/CDS/OData/UI5 terminology
- Understands `.cds` models, Fiori manifests, service handlers
- Posts formatted markdown comment with file statistics
- Updates existing comment on new commits (no duplicates)

#### Module 2: Reviewer Recommender
- Reads `.github/CODEOWNERS` for mandatory reviewers
- Analyzes git commit history for top contributors
- Uses LLM to suggest appropriate reviewers
- Auto-requests reviewers via GitHub API
- Posts explanation with change analysis

### Status

✅ Module 1: PR Auto-Summarizer — **COMPLETE**
✅ Module 2: Reviewer Recommender — **COMPLETE**
✅ Module 3: Code Reviewer — **COMPLETE** (with inline comments!)
🚧 Module 4: CI Failure Triage — Coming soon
🚧 Module 5: Compliance Pre-Check — Coming soon

### Contributing

This is a hackathon project for **SAP Innovation Camp CLI Hackathon 2026**.

**Team 14** — Building the future of PR automation 🚀