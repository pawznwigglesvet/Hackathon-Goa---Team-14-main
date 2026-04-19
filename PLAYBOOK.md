# PR Workflow Automation — Hackathon Playbook

## Problem Statement

Across SAP LoBs (BTP, SuccessFactors, DMC, Ariba, Commerce Cloud), **PR latency—not coding—is the dominant bottleneck**. Internal data points to a **3–7 day P90 shipping latency** caused by:

| Root Cause                                                  | Impact                                       |
| ----------------------------------------------------------- | -------------------------------------------- |
| Multi-repo CAP + UI5 changes needing coordinated reviews    | Delays due to context-switching across teams |
| Mandatory sequential sign-offs (security, arch, compliance) | Bottleneck at each gate                      |
| CI failures from env/config drift (not real code bugs)      | Developer time wasted on triage              |
| Review cycles spanning days, not hours                      | PRs stall waiting for context                |

---

## Solution: Agentic PR Workflow (GitHub Actions + Claude/Copilot)

An AI agent embedded in GitHub that performs **4 automated functions on every pull request**:

1. **Auto-summarize** in SAP language (CAP, CDS, OData, UI5 patterns)
2. **Reviewer suggestion + routing** based on git blame / CODEOWNERS
3. **CI failure triage** (logs → root cause → suggested fix)
4. **Compliance pre-check** before human review

---

## Architecture

```
PR Opened/Updated
        │
        ▼
[Step 1] GitHub Actions Triggered
        │  (pull_request: opened, synchronize)
        │  (check_suite / workflow_run for CI results)
        ▼
[Step 2] Auto-Summary Generation
        │  Fetch PR diff + metadata via GitHub API
        │  Prompt Claude with SAP context (CAP, CDS, OData, UI5)
        │  Post summary as PR comment
        ▼
[Step 3] Reviewer Recommendation
        │  Analyze files changed + git blame + CODEOWNERS
        │  Auto-assign / @mention relevant reviewers
        ▼
[Step 4] CI Log Triage (on check_suite failure)
        │  Fetch CI logs via GitHub Checks API
        │  LLM parses stack traces → root cause → suggested fix
        │  Post diagnosis as PR comment
        ▼
[Step 5] Compliance Pre-Check
        │  Static analysis pass (secrets, banned functions, license headers)
        │  AI-powered pass (PII exposure, data flow, auth bypass risks)
        │  Attach structured compliance report to PR
        ▼
[Step 6] Developer & Reviewer Actions
           Reviewers receive pre-digested context
           Developers get immediate, actionable feedback
```

---

## Module Breakdown

### Module 1 — PR Auto-Summarizer

**Trigger:** `pull_request` (opened, synchronize)

**What it does:**

- Fetches PR diff, file list, linked issue, commit messages via GitHub REST API
- Sends to LLM with SAP-context system prompt
- Posts a structured comment: functional change summary, impacted entities, reviewer guidance

**SAP-aware system prompt:**

```
You are an expert SAP developer assistant familiar with CAP (CDS, Node.js/Java runtime),
SAPUI5/Fiori Elements, and OData V4. Summarize the following code diff in terms of
functional changes using SAP-specific terminology.
- .cds files = data model changes; mention OData entities and service definitions
- .xml/.json in app/ = Fiori UI configuration changes
- srv/ changes = service logic / handler changes
- annotations = UI/auth behavior changes
```

**Output format:**

```markdown
## AI PR Summary

**Functional Change:** Adds a new OData entity projection in the CAP CDS model and
updates the corresponding Fiori Elements list report configuration.

**Files Changed:** `db/schema.cds`, `srv/cat-service.cds`, `app/.../manifest.json`
**Impact:** Data model layer + UI layer
**Suggested Focus for Review:** CDS projection correctness, annotation completeness
```

---

### Module 2 — Reviewer Recommender

**Trigger:** `pull_request` (opened)

**What it does:**

- Reads `CODEOWNERS` file for file-level ownership rules
- Runs `git log --follow` / blame analysis on changed files
- Identifies top contributors (by commit count) per changed path
- Calls GitHub API to request reviewers or post @mentions

**Logic:**

```
changed_files → CODEOWNERS lookup → mandatory reviewers
changed_files → git blame top-3 contributors → suggested reviewers
if .xsuaa or security-related → always include security lead
if .cds model change → include architecture reviewer
```

---

### Module 3 — CI Failure Triage

**Trigger:** `check_suite` (completed, conclusion: failure) or `workflow_run`

**What it does:**

- Fetches failed job logs via GitHub Checks API
- Sends log excerpt + recent commit list to LLM for root cause analysis
- Categorizes failure: `env-drift` | `test-fixture` | `dependency` | `actual-bug`
- Posts structured diagnosis + suggested fix as PR comment

**Output format:**

```markdown
## CI Triage Report

**Failed Job:** unit-tests
**Root Cause:** NullPointerException in OrderService.test.js — field `OrderDate`
not initialized in test fixture.
**Category:** test-fixture (not a code regression)
**Suggested Fix:** Add default value for `OrderDate` in test data setup.
**Confidence:** High
```

---

### Module 4 — Compliance Pre-Check

**Trigger:** `pull_request` (opened, synchronize) — runs before human review

**Two-pass approach:**

**Pass 1 — Deterministic (fast, high-confidence):**

- No hard-coded secrets / API keys (regex scan)
- No banned functions (eval, exec with untrusted input)
- License headers present on new files
- OSS license check on new `package.json` / `pom.xml` dependencies (allow-list: MIT, Apache-2.0, BSD)

**Pass 2 — AI-powered (contextual):**

- PII logging risk (customerEmail, userId logged in plain text)
- Authorization bypass patterns
- Tenant isolation violations in CAP handlers
- External data transfer without consent flow

**Output:** Structured compliance report attached to PR as a check status + comment:

```markdown
## Compliance Pre-Check Report

| Category    | Status | Finding                                                   |
| ----------- | ------ | --------------------------------------------------------- |
| Secrets     | PASS   | No hard-coded credentials found                           |
| OSS License | WARN   | `some-lib@1.2.3` uses GPL-3.0 — not on allow-list         |
| PII Logging | FAIL   | `console.log(user.email)` at srv/user-service.js:42       |
| Auth        | PASS   | Authorization annotations present on all service entities |
```

---

## Tech Stack

| Component               | Technology                                                 |
| ----------------------- | ---------------------------------------------------------- |
| Trigger & Orchestration | GitHub Actions (YAML workflows)                            |
| Agent Script            | Node.js (or Python)                                        |
| AI Backend              | Claude API (via Anthropic SDK) or SAP Hyperspace LLM Proxy |
| GitHub Integration      | GitHub REST API + Octokit SDK                              |
| CAP Domain Grounding    | `@cap-js/mcp-server` (search_model, search_docs)           |
| Static Analysis         | ESLint, detect-secrets, license-checker                    |
| CI Log Access           | GitHub Checks API                                          |

---

## Implementation Phases

### Phase 1 — Foundation (Start Here)

- [ ] Set up GitHub Actions workflow file (`.github/workflows/pr-agent.yml`)
- [ ] Implement GitHub API client (fetch PR diff, post comments, request reviewers)
- [ ] Integrate Claude API with SAP-context system prompt
- [ ] Deploy Module 1: PR Auto-Summarizer (end-to-end working)

### Phase 2 — Reviewer Intelligence

- [ ] Parse `CODEOWNERS` file
- [ ] Implement git blame analysis for changed files
- [ ] Auto-assign reviewers via GitHub API
- [ ] Deploy Module 2: Reviewer Recommender

### Phase 3 — CI Triage

- [ ] Hook `check_suite` completed event
- [ ] Fetch CI logs via GitHub Checks API
- [ ] Build LLM prompt for root cause classification
- [ ] Deploy Module 3: CI Failure Triage

### Phase 4 — Compliance

- [ ] Implement Pass 1: regex-based secret/license scanning
- [ ] Implement Pass 2: AI-powered PII/auth analysis
- [ ] Generate structured compliance report
- [ ] Deploy Module 4: Compliance Pre-Check

### Phase 5 — Polish & Demo

- [ ] End-to-end test on a real SAP CAP repo PR
- [ ] Tune verbosity (avoid noise for reviewers)
- [ ] Add `SAP-Copilot-Agent` label/author attribution to all automated comments
- [ ] Demo with a real PR showing all 4 modules firing

---

## Key Design Principles

1. **Supplement, don't replace** human review — label all AI outputs clearly
2. **Modular** — each of the 4 functions is an independent workflow step; teams adopt one at a time
3. **SAP-aware** — prompts include CAP/CDS/UI5/OData terminology, not generic code summaries
4. **Low noise** — start with high-confidence outputs only; tune false-positive rate during hackathon
5. **On-prem safe** — all code/data stays within SAP network via on-prem LLM proxy

---

## File Structure

```
.github/
  workflows/
    pr-agent.yml          # Main trigger workflow
    pr-ci-triage.yml      # CI failure hook

src/
  agent/
    index.js              # Entrypoint: orchestrates all modules
    summarizer.js         # Module 1: PR summary generation
    reviewer.js           # Module 2: Reviewer recommendation
    ci-triage.js          # Module 3: CI failure analysis
    compliance.js         # Module 4: Compliance pre-check

  github/
    client.js             # GitHub API wrapper (fetch diff, post comments, etc.)

  llm/
    client.js             # Claude / LLM API wrapper
    prompts.js            # SAP-context system prompts

  rules/
    license-allowlist.json  # Allowed OSS licenses
    banned-functions.json   # Banned function patterns
    pii-patterns.json       # PII field name patterns

package.json
```

---

## Demo Script (Hackathon)

1. Open a PR in the test repo (add a new CDS entity + Fiori annotation)
2. Show Module 1 firing → SAP-aware summary posted as comment
3. Show Module 2 firing → reviewers auto-assigned based on CODEOWNERS + blame
4. Break a CI test → show Module 3 posting root cause + fix suggestion
5. Add `console.log(user.email)` → show Module 4 flagging PII risk
6. Show the compliance report summary on the PR checks tab

**Key metric to highlight:** Time from PR open to reviewer having full context: seconds, not hours.

---

## Success Criteria

| Metric                                        | Target                                              |
| --------------------------------------------- | --------------------------------------------------- |
| PR summary accuracy (SAP terminology correct) | Reviewers find it useful, no generic summaries      |
| Reviewer suggestion relevance                 | Right person notified in ≥80% of cases              |
| CI triage classification                      | Correct root cause category in demo scenario        |
| Compliance false positives                    | ≤2 false positives in demo scenario                 |
| End-to-end latency                            | All 4 modules complete within 60 seconds of PR open |
