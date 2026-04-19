# 📋 Phase 3 & 4 Analysis and Implementation Plan

## Current Status

### ✅ Completed (Phases 1 & 2 + Enhancements)

| Module | Status | Features |
|--------|--------|----------|
| **Module 1: PR Summarizer** | ✅ Complete | SAP-aware summaries, file breakdown, architectural layer analysis |
| **Module 2: Reviewer Recommender** | ✅ Complete | CODEOWNERS, git blame, auto-assignment, expertise matching |
| **Module 3: Code Reviewer** | ✅ Complete + Enhanced | Inline comments, syntax validation, suggested changes, security/performance/bug detection |

### 🔧 To Implement (Phases 3 & 4)

| Module | Status | Required Features |
|--------|--------|-------------------|
| **Module 3 (Playbook): CI Failure Triage** | ⏳ Not Started | Log parsing, root cause analysis, fix suggestions |
| **Module 4: Compliance Pre-Check** | ⏳ Not Started | Secret scanning, license checking, PII detection, auth validation |

---

## Phase 3: CI Failure Triage

### Requirements (from PLAYBOOK.md)

**Trigger**: `check_suite` (completed, conclusion: failure) or `workflow_run`

**What it does**:
1. Fetches failed job logs via GitHub Checks API
2. Sends log excerpt + recent commit list to LLM for root cause analysis
3. Categorizes failure: `env-drift` | `test-fixture` | `dependency` | `actual-bug`
4. Posts structured diagnosis + suggested fix as PR comment

**Output format**:
```markdown
## CI Triage Report

**Failed Job:** unit-tests
**Root Cause:** NullPointerException in OrderService.test.js — field `OrderDate` not initialized in test fixture.
**Category:** test-fixture (not a code regression)
**Suggested Fix:** Add default value for `OrderDate` in test data setup.
**Confidence:** High
```

### Current Implementation Gap

We have **NO** CI triage module yet. The playbook lists it as a separate module, but we haven't implemented it.

**However**, our **syntax-validator.js** is similar in spirit - it catches errors before CI runs!

### Implementation Plan

#### Option 1: Full CI Triage (2-3 hours)

Create `src/agent/ci-triage.js` with:

```javascript
/**
 * Module 3 (Playbook): CI Failure Triage
 * Analyzes failed CI runs and provides root cause + fix suggestions
 */
export async function runCITriage(github, llm, owner, repo, prNumber, checkSuite) {
  // 1. Get failed check runs
  const failedRuns = checkSuite.check_runs.filter(r => r.conclusion === 'failure');

  // 2. Fetch logs for each failed run
  const logs = await Promise.all(
    failedRuns.map(run => github.getWorkflowRunLogs(owner, repo, run.id))
  );

  // 3. Parse error messages from logs
  const errors = parseFailureLogs(logs);

  // 4. Categorize with LLM
  const analysis = await llm.complete(
    buildCITriagePrompt(errors, prDetails),
    { maxTokens: 1024, useOrchestration: true }
  );

  // 5. Post triage report
  await github.postComment(owner, repo, prNumber, formatTriageReport(analysis));
}
```

**Workflow changes needed**:
- New workflow file: `.github/workflows/pr-ci-triage.yml`
- Triggered on: `check_suite.completed` (conclusion: failure)

**Complexity**: Medium-High
- Need to parse different log formats (npm, jest, eslint, etc.)
- Need to handle large logs (truncation strategy)
- Need separate workflow trigger

#### Option 2: Enhance Syntax Validator (1 hour)

Extend our existing **syntax-validator.js** to catch more pre-CI errors:

```javascript
// Add ESLint integration
async function runLintValidation(filePath) {
  const eslint = new ESLint();
  const results = await eslint.lintFiles([filePath]);
  return results.flatMap(r => r.messages);
}

// Add TypeScript type checking
async function runTypeCheck(filePath) {
  const proc = spawn('tsc', ['--noEmit', filePath]);
  // Parse tsc errors
}
```

**Advantages**:
- ✅ Builds on existing code
- ✅ Prevents CI failures (better than reacting to them)
- ✅ No new workflow needed

**Tradeoff**:
- ❌ Not a true "CI triage" (doesn't analyze failed CI logs)
- ✅ But prevents failures in the first place!

### Recommendation: Option 2 (Pragmatic)

**Why**: Our syntax validator already catches errors **before** CI runs. This is actually **better** than waiting for CI to fail!

**Enhancement strategy**:
1. Add ESLint support (catches style/quality issues)
2. Add TypeScript checking (if `.ts` files exist)
3. Add basic test validation (check test files exist for code files)

This gives us **95% of the value** with 30% of the effort.

---

## Phase 4: Compliance Pre-Check

### Requirements (from PLAYBOOK.md)

**Trigger**: `pull_request` (opened, synchronize) — runs before human review

**Two-pass approach**:

**Pass 1 — Deterministic (fast, high-confidence)**:
- No hard-coded secrets / API keys (regex scan)
- No banned functions (eval, exec with untrusted input)
- License headers present on new files
- OSS license check on new `package.json` / `pom.xml` dependencies

**Pass 2 — AI-powered (contextual)**:
- PII logging risk (customerEmail, userId logged in plain text)
- Authorization bypass patterns
- Tenant isolation violations in CAP handlers
- External data transfer without consent flow

**Output**:
```markdown
## Compliance Pre-Check Report

| Category    | Status | Finding                                                   |
| ----------- | ------ | --------------------------------------------------------- |
| Secrets     | PASS   | No hard-coded credentials found                           |
| OSS License | WARN   | `some-lib@1.2.3` uses GPL-3.0 — not on allow-list         |
| PII Logging | FAIL   | `console.log(user.email)` at srv/user-service.js:42       |
| Auth        | PASS   | Authorization annotations present on all service entities |
```

### Implementation Plan

#### Pass 1: Deterministic Checks (1-2 hours)

Create `src/agent/compliance.js`:

```javascript
/**
 * Module 4: Compliance Pre-Check
 * Performs security, licensing, and privacy validation
 */
export async function runComplianceCheck(github, owner, repo, prNumber) {
  const changedFiles = await github.getChangedFiles(owner, repo, prNumber);
  const results = {
    secrets: await checkSecrets(changedFiles),
    licenses: await checkLicenses(changedFiles),
    bannedFunctions: await checkBannedFunctions(changedFiles),
    headers: await checkLicenseHeaders(changedFiles),
  };

  return formatComplianceReport(results);
}

// Regex-based secret detection
async function checkSecrets(files) {
  const patterns = [
    /['"]?[A-Za-z0-9]{32,}['"]?\s*[:=]/,  // API keys
    /password\s*[:=]\s*['"][^'"]+['"]/i,    // Passwords
    /token\s*[:=]\s*['"][^'"]+['"]/i,       // Tokens
  ];

  // Scan file contents for patterns
}

// License compatibility check
async function checkLicenses(files) {
  const packageJsonFiles = files.filter(f => f.filename === 'package.json');
  // Parse and check against allowlist
  const allowedLicenses = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause'];
}

// Banned function check
async function checkBannedFunctions(files) {
  const banned = ['eval(', 'Function(', 'exec(', 'innerHTML ='];
  // Scan for dangerous patterns
}
```

#### Pass 2: AI-Powered Checks (1 hour)

Integrate into existing LLM review:

```javascript
// In buildCodeReviewPrompt()
system: `...
Additionally, check for compliance issues:
- PII logging: console.log(), logger.info() with user emails, SSNs, etc.
- Authorization: Missing @requires/@restrict on CAP services
- Tenant isolation: Direct database queries without tenant filter
- Data transfer: External API calls without consent checks

Flag these with 🔐 **Compliance** severity.
`
```

### Implementation Complexity

| Check | Effort | Value | Priority |
|-------|--------|-------|----------|
| **Secret Detection** | 1 hour | High | Must Have |
| **License Checking** | 1 hour | Medium | Should Have |
| **Banned Functions** | 30 min | High | Must Have |
| **License Headers** | 30 min | Low | Nice to Have |
| **PII Logging** | 30 min | High | Must Have |
| **Auth Validation** | 1 hour | High | Should Have |
| **Tenant Isolation** | 1 hour | Medium | Nice to Have |

**Total effort**: 3-4 hours for core features

---

## Recommended Implementation Order

### Sprint 1: Core Compliance (2 hours)

1. **Secret Detection** (1 hour)
   - Regex patterns for common secrets
   - Inline comments on detected secrets
   - High-priority blocker

2. **Banned Functions** (30 min)
   - Check for `eval`, `exec`, `innerHTML`
   - Security best practices

3. **PII Logging** (30 min)
   - Add to LLM prompt
   - Flag `console.log(user.email)` patterns

### Sprint 2: Enhanced Pre-Flight (1 hour)

4. **ESLint Integration**
   - Run ESLint on changed files
   - Post lint errors as inline comments

5. **License Checking** (1 hour)
   - Parse package.json changes
   - Check against allowlist
   - Warn on GPL/AGPL

### Sprint 3: Advanced (Optional, 2 hours)

6. **Auth Validation**
   - Check CAP services have @requires
   - Validate XSUAA roles

7. **CI Triage** (if time allows)
   - Basic log parsing
   - Error categorization

---

## File Structure (After Implementation)

```
src/
  agent/
    index.js                  # ✅ Orchestrator (runs all modules)
    summarizer.js             # ✅ Module 1: PR summary
    reviewer.js               # ✅ Module 2: Reviewer recommender
    code-reviewer.js          # ✅ Module 3: Code review + syntax validation
    syntax-validator.js       # ✅ Pre-flight validation (syntax/imports)
    compliance.js             # 🔧 Module 4: Compliance checks (NEW)
    ci-triage.js              # ⏳ Module 3 (Playbook): CI triage (OPTIONAL)

  github/
    client.js                 # ✅ GitHub API wrapper

  llm/
    client-factory.js         # ✅ LLM client factory
    hyperspace-client.js      # ✅ SAP AI Core client
    prompts.js                # ✅ SAP-aware prompts

  rules/                      # 🔧 NEW for compliance
    secrets-patterns.json     # Regex patterns for secrets
    banned-functions.json     # Dangerous function list
    license-allowlist.json    # Allowed OSS licenses
    pii-patterns.json         # PII field patterns

.github/
  workflows/
    pr-agent.yml              # ✅ Main workflow (Modules 1, 2, 3, 4)
    pr-ci-triage.yml          # ⏳ CI triage workflow (OPTIONAL)
```

---

## Complexity Assessment

### What We Have vs What's Needed

| Capability | Current | Needed for Phases 3 & 4 | Gap |
|------------|---------|-------------------------|-----|
| **GitHub API Integration** | ✅ Complete | ✅ Sufficient | None |
| **LLM Integration** | ✅ Complete (SAP AI Core) | ✅ Sufficient | None |
| **Inline Comments** | ✅ Complete | ✅ Sufficient | None |
| **Pre-Flight Validation** | ✅ Syntax/Imports | 🔧 Add ESLint, secrets | Small |
| **CI Log Parsing** | ❌ None | 🔧 Parse logs, categorize | Medium |
| **Compliance Checks** | ❌ None | 🔧 Secrets, licenses, PII | Medium |
| **Workflow Triggers** | ✅ PR events | 🔧 Add check_suite | Small |

### Estimated Implementation Time

| Phase | Features | Effort | Risk |
|-------|----------|--------|------|
| **Phase 3 (CI Triage)** | Log parsing, categorization | 3-4 hours | Medium |
| **Phase 4 (Compliance)** | Secret/license/PII checks | 3-4 hours | Low |
| **Total** | Both phases | **6-8 hours** | Low-Medium |

---

## Recommended Approach

### Option A: Full Implementation (6-8 hours)

Implement both Phase 3 and Phase 4 as described in the playbook.

**Pros**:
- ✅ Complete solution
- ✅ All 4 modules from playbook
- ✅ Production-ready

**Cons**:
- ⏰ Time-intensive
- 🔧 Need to handle many edge cases

### Option B: Pragmatic MVP (3-4 hours) ⭐ RECOMMENDED

Focus on high-value compliance checks, skip CI triage:

1. **Secret Detection** (1 hour) - Critical security
2. **Banned Functions** (30 min) - Easy win
3. **PII Logging** (30 min) - LLM-based, low effort
4. **ESLint Integration** (1 hour) - Prevents CI failures
5. **License Checking** (1 hour) - Legal compliance

**Pros**:
- ✅ 80% of value, 40% of effort
- ✅ All high-impact features
- ✅ No separate workflow needed

**Cons**:
- ❌ No CI log triage (but we have pre-flight validation instead!)

### Option C: Hackathon Demo Focus (2 hours)

Implement just enough for a compelling demo:

1. **Secret Detection** (1 hour)
2. **PII Logging** (30 min)
3. **Update documentation** (30 min)

Show: "Our agent catches security issues before human review!"

---

## Decision Matrix

| Criteria | Option A (Full) | Option B (Pragmatic) | Option C (Demo) |
|----------|----------------|----------------------|-----------------|
| **Time to Implement** | 6-8 hours | 3-4 hours | 2 hours |
| **Feature Completeness** | 100% | 80% | 40% |
| **Production Ready** | Yes | Yes | Partial |
| **Demo Impact** | High | High | Medium |
| **Risk** | Medium | Low | Low |
| **Maintenance** | High | Medium | Low |

---

## Final Recommendation

### ⭐ Go with **Option B: Pragmatic MVP**

**Why**:
1. We already have **syntax validation** which prevents CI failures
2. **Compliance checks** (secrets, PII) are high-impact security features
3. Can be implemented in **3-4 hours** with existing infrastructure
4. No new workflows needed (runs in existing `pr-agent.yml`)
5. Provides immediate value to developers

### Implementation Steps

1. **Create compliance.js** (2 hours)
   - Secret detection with regex
   - Banned function checking
   - Package.json license validation

2. **Enhance code-reviewer.js** (1 hour)
   - Add PII detection to LLM prompt
   - Add compliance section to review

3. **Add ESLint** (1 hour)
   - Integrate ESLint into syntax-validator
   - Post lint errors as inline comments

4. **Documentation** (30 min)
   - Update README with compliance features
   - Create COMPLIANCE.md documentation

**Total**: 4.5 hours

---

## Next Steps

Would you like me to:

1. ✅ **Implement Option B** (Pragmatic MVP) - **RECOMMENDED**
   - 3-4 hours, high impact, production-ready

2. ⏰ **Implement Option A** (Full solution)
   - 6-8 hours, complete, more complex

3. 🎤 **Implement Option C** (Demo focus)
   - 2 hours, good enough for presentation

4. 📊 **Just document what we have**
   - Show that Modules 1, 2, and enhanced 3 are already production-ready
   - Position syntax validation as "better than CI triage"

My recommendation: **Option 1** (Pragmatic MVP) - gives you all the high-value features without the complexity of CI log parsing!
