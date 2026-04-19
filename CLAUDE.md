# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hackathon Goa - Team 14**: AI-Powered PR Workflow Agent for SAP GitHub Repositories

An agentic PR workflow automation system that runs on GitHub Actions, providing:

1. PR Auto-Summarizer (SAP-aware summaries using CAP/CDS/OData/UI5 terminology)
2. Reviewer Recommender (smart reviewer assignment based on CODEOWNERS + git blame)
3. CI Failure Triage (coming soon)
4. Compliance Pre-Check (coming soon)

**Status:** ✅ Modules 1 & 2 complete with GitHub Actions integration

## Development Setup

```bash
# Install dependencies
npm install

# Set up environment variables (for local testing)
export GITHUB_TOKEN="your-github-token"
export ANTHROPIC_API_KEY="your-anthropic-key"
export PR_NUMBER="123"
export REPO_OWNER="owner"
export REPO_NAME="repo"

# Run agent locally
npm start

# Test MCP server
./test-mcp-server.sh

# Verify GitHub Actions config
./verify-github-actions.sh
```

## Key Commands

```bash
npm start                  # Run PR agent
npm test                   # Run tests
./test-local.sh           # Local integration test
./test-mcp-server.sh      # Test MCP server connectivity
./verify-github-actions.sh # Verify GitHub Actions setup
```

## Architecture

### High-Level Flow

```
PR Event → GitHub Actions → Agent → MCP Client → MCP Server → LLM → GitHub API
```

### Key Modules

1. **Agent Layer** (`src/agent/`)
   - `index.js` — Main orchestrator
   - `summarizer.js` — Module 1: PR summary generation
   - `reviewer.js` — Module 2: Reviewer recommendation

2. **MCP Server** (`src/mcp-server/`)
   - `index.js` — Model Context Protocol server for LLM access
   - Spawned as subprocess by MCP client
   - Supports Anthropic Claude and OpenAI

3. **LLM Integration** (`src/llm/`)
   - `mcp-client.js` — MCP client that spawns server via stdio
   - `prompts.js` — SAP-aware system prompts

4. **GitHub Integration** (`src/github/`)
   - `client.js` — GitHub API wrapper (Octokit)
   - Handles: PRs, comments, reviewers, git blame

5. **GitHub Actions** (`.github/workflows/`)
   - `pr-agent.yml` — Main workflow triggered on PR events
   - Runs both summarizer and reviewer modules

### Design Patterns

- **Model Context Protocol (MCP)**: Abstraction layer for LLM access
- **Modular agent design**: Each module (summarizer, reviewer) is independent
- **SAP-aware prompting**: System prompts include CAP, CDS, OData, UI5 context
- **Idempotent updates**: Comments use markers to update instead of duplicate

## Important Notes

### For Development

- This is a hackathon project - prioritize working functionality over perfect architecture
- Always test MCP server connectivity before running the agent
- Use `.github/CODEOWNERS` for reviewer automation

### For GitHub Actions

- Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` secret
- Requires "Read and write permissions" enabled
- Workflow triggers on: `pull_request` (opened, reopened, synchronize)
- Full git history fetched for git blame analysis

### For LLM Integration

- MCP server spawned as subprocess (stdio transport)
- Supports multiple providers: Anthropic Claude, OpenAI, SAP Hyperspace
- Default model: `claude-sonnet-4-6`
- Configurable via environment variables

## Project Structure

```
.github/
  workflows/
    pr-agent.yml          # Main PR workflow
  CODEOWNERS             # Reviewer assignment rules

src/
  agent/
    index.js             # Main orchestrator
    summarizer.js        # Module 1: PR summary
    reviewer.js          # Module 2: Reviewer recommender

  mcp-server/
    index.js             # MCP server for LLM access

  github/
    client.js            # GitHub API wrapper

  llm/
    mcp-client.js        # MCP client
    prompts.js           # SAP-aware prompts

package.json            # Dependencies
```

## Key Files to Know

- [PLAYBOOK.md](PLAYBOOK.md) — Detailed architecture and implementation guide
- [GITHUB_ACTIONS_SETUP.md](GITHUB_ACTIONS_SETUP.md) — Complete GitHub Actions setup guide
- [.github/workflows/README.md](.github/workflows/README.md) — Workflow configuration details
- [README.md](README.md) — Quick start guide

## SAP-Specific Context

The agent understands SAP technology stacks:

- **CAP (Cloud Application Programming Model)**: CDS models, OData services
- **SAPUI5/Fiori Elements**: UI annotations, manifest.json, XML views
- **BTP**: Deployment configs, XSUAA, service bindings

File pattern context:

- `db/*.cds` → CDS data model (entities, associations)
- `srv/*.cds` → OData service definitions
- `srv/*.js` → CAP service handlers
- `app/**/manifest.json` → Fiori app configuration
- `xs-security.json` → XSUAA OAuth2 configuration
