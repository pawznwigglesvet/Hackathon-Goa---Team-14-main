# GitHub Actions Configuration for PR Agent

This document explains how to configure GitHub Actions workflows for the PR Agent (Summary + Reviewer modules).

## Quick Start

### 1. Add Required Secrets

Navigate to your repository settings: **Settings → Secrets and variables → Actions**

Add the following repository secrets:

| Secret Name | Description | Required | Example |
|------------|-------------|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Yes (Option 1) | `sk-ant-...` |
| `OPENAI_API_KEY` | OpenAI API key | Yes (Option 2) | `sk-...` |
| `GITHUB_TOKEN` | Auto-provided by GitHub | Auto | N/A |
| `GITHUB_API_URL` | SAP GitHub Enterprise URL | For SAP repos | `https://github.tools.sap/api/v3` |
| `SAP_LLM_PROXY_URL` | SAP Hyperspace LLM Proxy | For on-prem | `https://llm-proxy.sap.corp` |

### 2. Choose LLM Provider

Edit [`.github/workflows/pr-agent.yml`](.github/workflows/pr-agent.yml) and uncomment one of these options:

**Option 1: Anthropic Claude (Recommended)**
```yaml
ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
LLM_PROVIDER: 'anthropic'
LLM_MODEL: 'claude-sonnet-4-6'
```

**Option 2: OpenAI GPT-4**
```yaml
OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
LLM_PROVIDER: 'openai'
LLM_MODEL: 'gpt-4-turbo-preview'
```

**Option 3: SAP Hyperspace (On-prem)**
```yaml
LLM_BASE_URL: ${{ secrets.SAP_LLM_PROXY_URL }}
ANTHROPIC_API_KEY: ${{ secrets.SAP_LLM_API_KEY }}
LLM_PROVIDER: 'anthropic'
LLM_MODEL: 'claude-sonnet-4-6'
```

### 3. Enable Workflow Permissions

Ensure the workflow has proper permissions:

1. Go to **Settings → Actions → General**
2. Under "Workflow permissions", select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**

### 4. Test the Workflow

1. Create a new branch: `git checkout -b test-pr-agent`
2. Make a small change (e.g., update README)
3. Push and open a PR
4. Check the **Actions** tab to see the workflow running

## Workflow Details

### PR Agent Workflow

**File:** `.github/workflows/pr-agent.yml`

**Triggers:**
- `pull_request` events: `opened`, `reopened`, `synchronize`

**What it does:**
1. **Module 1: PR Auto-Summarizer**
   - Fetches PR diff and metadata
   - Generates SAP-aware summary using LLM
   - Posts/updates summary as PR comment

2. **Module 2: Reviewer Recommender**
   - Analyzes changed files
   - Reads `CODEOWNERS` (if exists)
   - Gets git blame data for contributors
   - Suggests and requests reviewers
   - Posts explanation comment

**Expected Output:**
- 🤖 **AI PR Summary** comment with change analysis
- 👥 **Reviewer Recommendation** comment with suggestions
- Reviewers automatically requested via GitHub API

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub API authentication | Auto-provided |
| `PR_NUMBER` | Pull request number | Auto-provided |
| `REPO_OWNER` | Repository owner | Auto-provided |
| `REPO_NAME` | Repository name | Auto-provided |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key | Required for Claude |
| `OPENAI_API_KEY` | OpenAI API key | Required for OpenAI |
| `LLM_PROVIDER` | LLM provider name | `anthropic` |
| `LLM_MODEL` | Model name | `claude-sonnet-4-6` |
| `LLM_BASE_URL` | Custom LLM endpoint | Optional |
| `GITHUB_API_URL` | GitHub API base URL | `https://github.tools.sap/api/v3` |

## Troubleshooting

### Workflow fails with "Missing required environment variable"

**Solution:** Ensure all required secrets are added in repository settings.

### LLM API errors (401, 403)

**Solution:** Verify your API key is valid and has sufficient quota.

### "Permission denied" errors

**Solution:** Check workflow permissions in Settings → Actions → General.

### No comments posted on PR

**Possible causes:**
1. Workflow permissions not set correctly
2. `GITHUB_TOKEN` doesn't have write access to pull requests
3. Branch protection rules blocking bot comments

### MCP Server connection issues

**Solution:** Check that all dependencies are installed:
```bash
npm ci
```

## Architecture

```
PR Event (opened/synchronize)
        │
        ▼
GitHub Actions Workflow Triggered
        │
        ▼
Setup Environment (Node.js, Dependencies)
        │
        ▼
Run src/agent/index.js
        │
        ├─► Module 1: Summarizer
        │   ├─ Connect to MCP Server
        │   ├─ Fetch PR diff via GitHub API
        │   ├─ Generate summary via LLM
        │   └─ Post comment to PR
        │
        └─► Module 2: Reviewer
            ├─ Connect to MCP Server
            ├─ Analyze changed files
            ├─ Get CODEOWNERS + git blame
            ├─ Generate suggestions via LLM
            ├─ Request reviewers via GitHub API
            └─ Post comment to PR
```

## MCP Server Architecture

The agent uses a **Model Context Protocol (MCP) server** to communicate with LLM providers:

```
Agent (index.js)
    │
    └─► MCP Client (mcp-client.js)
            │ stdio transport
            ▼
        MCP Server (mcp-server/index.js)
            │
            ├─► Anthropic SDK
            └─► OpenAI SDK
```

**Benefits:**
- Single point of configuration for LLM access
- Swappable providers without changing agent code
- Health checks and error handling
- Support for multiple LLM backends

## Advanced Configuration

### Custom GitHub Enterprise Server

If using SAP GitHub Enterprise or custom GitHub instance:

```yaml
env:
  GITHUB_API_URL: 'https://your-github-instance.com/api/v3'
```

### Rate Limiting

The agent respects GitHub API rate limits. For high-volume repos, consider:

1. Using a GitHub App token (higher rate limits)
2. Implementing request throttling
3. Caching CODEOWNERS and git blame data

### SAP-Specific Features

The agent is optimized for SAP codebases:
- Recognizes `.cds` files (CAP models)
- Understands Fiori/UI5 structure
- Knows `srv/` vs `db/` conventions
- Parses OData annotations

## Next Steps

1. ✅ Set up secrets and workflow
2. ✅ Test with a sample PR
3. ⏭️ Add `CODEOWNERS` file for reviewer automation
4. ⏭️ Implement Module 3: CI Failure Triage
5. ⏭️ Implement Module 4: Compliance Pre-Check

## Support

For issues or questions:
- Check workflow logs in the **Actions** tab
- Review agent logs in workflow output
- See [PLAYBOOK.md](../PLAYBOOK.md) for architecture details
