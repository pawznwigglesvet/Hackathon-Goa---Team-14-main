import { buildCITriagePrompt } from '../llm/prompts.js';

// Marker for CI triage comments
const CI_TRIAGE_MARKER = '<!-- PR-AI-AGENT:CI-TRIAGE -->';

/**
 * Module 3 (Playbook): CI Failure Triage
 * Analyzes failed CI runs and provides:
 * - Root cause identification
 * - Failure categorization
 * - Auto-fix suggestions
 * - Confidence rating
 */
export async function runCITriage(github, llm, owner, repo, prNumber, checkRuns) {
  console.log(`[CITriage] Starting for PR #${prNumber}`);

  // Filter for failed check runs
  const failedRuns = checkRuns.filter(run =>
    run.conclusion === 'failure' || run.conclusion === 'timed_out'
  );

  if (failedRuns.length === 0) {
    console.log('[CITriage] No failed CI runs to analyze');
    return null;
  }

  console.log(`[CITriage] Analyzing ${failedRuns.length} failed run(s)`);

  const triageReports = [];

  // Analyze each failed run
  for (const run of failedRuns.slice(0, 3)) {  // Limit to 3 to avoid overwhelming
    try {
      const report = await analyzeFailedRun(github, llm, owner, repo, run);
      if (report) {
        triageReports.push(report);
      }
    } catch (err) {
      console.log(`[CITriage] Error analyzing ${run.name}: ${err.message}`);
    }
  }

  if (triageReports.length === 0) {
    console.log('[CITriage] No triage reports generated');
    return null;
  }

  // Post triage report as comment
  const commentBody = formatTriageComment(triageReports);

  const existing = await github.findAgentComment(owner, repo, prNumber, CI_TRIAGE_MARKER);
  if (existing) {
    await github.updateComment(owner, repo, existing.id, commentBody);
    console.log(`[CITriage] Updated existing comment #${existing.id}`);
  } else {
    await github.postComment(owner, repo, prNumber, commentBody);
    console.log('[CITriage] Posted new CI triage comment');
  }

  return { reports: triageReports };
}

/**
 * Analyze a single failed CI run
 */
async function analyzeFailedRun(github, llm, owner, repo, run) {
  console.log(`[CITriage] Analyzing failed run: ${run.name}`);

  // Get run details and logs
  let logs = '';

  try {
    // For GitHub Actions, get job logs
    if (run.html_url?.includes('/actions/runs/')) {
      const runId = extractRunId(run.html_url);
      if (runId) {
        const logData = await github.getWorkflowRunLogs(owner, repo, runId);
        logs = logData ? parseLogData(logData) : '';
      }
    }

    // If we couldn't get logs, use the output from the check run
    if (!logs && run.output?.text) {
      logs = run.output.text;
    }

    if (!logs) {
      console.log(`[CITriage] No logs available for ${run.name}`);
      return null;
    }

    // Extract relevant error information
    const errorInfo = extractErrors(logs, run);

    // Use LLM to analyze and categorize
    const { system, user } = buildCITriagePrompt(run, errorInfo);
    const analysis = await llm.complete(system, user, { maxTokens: 1024, useOrchestration: true });

    return {
      jobName: run.name,
      status: run.conclusion,
      url: run.html_url,
      errors: errorInfo,
      analysis,
    };
  } catch (err) {
    console.log(`[CITriage] Error analyzing ${run.name}: ${err.message}`);
    return null;
  }
}

/**
 * Extract run ID from GitHub Actions URL
 */
function extractRunId(url) {
  const match = url.match(/\/runs\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse log data (could be binary or text)
 */
function parseLogData(logData) {
  if (typeof logData === 'string') {
    return logData;
  }

  // If it's a Buffer or binary data, convert to string
  if (Buffer.isBuffer(logData)) {
    return logData.toString('utf-8');
  }

  return '';
}

/**
 * Extract error messages and stack traces from logs
 */
function extractErrors(logs, run) {
  const errors = [];
  const lines = logs.split('\n');

  // Common error patterns
  const errorPatterns = [
    // npm/node errors
    { pattern: /Error: (.+)/, type: 'error' },
    { pattern: /TypeError: (.+)/, type: 'error' },
    { pattern: /ReferenceError: (.+)/, type: 'error' },
    { pattern: /SyntaxError: (.+)/, type: 'error' },

    // Test failures
    { pattern: /FAIL (.+)/, type: 'test-failure' },
    { pattern: /✕ (.+)/, type: 'test-failure' },
    { pattern: /Expected .+ but received .+/, type: 'assertion' },

    // Build failures
    { pattern: /ERROR in (.+)/, type: 'build-error' },
    { pattern: /Module not found: (.+)/, type: 'dependency' },
    { pattern: /Cannot find module '(.+)'/, type: 'dependency' },

    // Linting errors
    { pattern: /(.+):\d+:\d+: error (.+)/, type: 'lint-error' },

    // Exit codes
    { pattern: /Process completed with exit code (\d+)/, type: 'exit-code' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const { pattern, type } of errorPatterns) {
      const match = line.match(pattern);
      if (match) {
        // Get context (previous 2 lines and next 2 lines)
        const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join('\n');

        errors.push({
          type,
          message: match[0],
          line: i + 1,
          context: context.substring(0, 500), // Limit context length
        });

        break;
      }
    }

    // Limit to first 10 errors
    if (errors.length >= 10) break;
  }

  // If no specific errors found, get the last 50 lines (usually where errors are)
  if (errors.length === 0 && lines.length > 0) {
    const lastLines = lines.slice(-50).join('\n');
    errors.push({
      type: 'unknown',
      message: 'CI failed - see context',
      context: lastLines.substring(0, 1000),
    });
  }

  return errors;
}

/**
 * Format triage comment
 */
function formatTriageComment(triageReports) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  let comment = `${CI_TRIAGE_MARKER}
# 🔧 CI Failure Triage Report

**Status**: ${triageReports.length} failed job(s) analyzed

---

`;

  for (const report of triageReports) {
    comment += formatSingleReport(report);
    comment += '\n---\n\n';
  }

  comment += `<sub>🤖 Generated by SAP-Copilot-Agent · ${timestamp} · CI Failure Triage</sub>`;

  return comment;
}

/**
 * Format a single triage report
 */
function formatSingleReport(report) {
  const { jobName, status, url, errors, analysis } = report;

  // Determine icon based on failure type
  const icon = status === 'timed_out' ? '⏱️' : '❌';

  let section = `## ${icon} ${jobName}\n\n`;
  section += `**Status**: ${status}\n`;
  section += `**Job URL**: [View logs](${url})\n\n`;

  // Add error summary
  if (errors.length > 0) {
    section += `### 🔍 Errors Found\n\n`;

    const errorTypes = {};
    errors.forEach(e => {
      errorTypes[e.type] = (errorTypes[e.type] || 0) + 1;
    });

    for (const [type, count] of Object.entries(errorTypes)) {
      section += `- **${type}**: ${count} occurrence(s)\n`;
    }

    section += `\n`;
  }

  // Add LLM analysis
  section += `### 💡 Analysis\n\n`;
  section += analysis;
  section += `\n\n`;

  // Add key error details
  if (errors.length > 0 && errors[0].message) {
    section += `<details>\n`;
    section += `<summary>📋 Error Details</summary>\n\n`;
    section += `\`\`\`\n${errors[0].context || errors[0].message}\n\`\`\`\n\n`;
    section += `</details>\n\n`;
  }

  return section;
}

/**
 * Categorize failure type for quick filtering
 */
export function categorizeFailure(errors) {
  if (errors.some(e => e.type === 'dependency' || e.message.includes('Module not found'))) {
    return 'dependency';
  }
  if (errors.some(e => e.type === 'test-failure' || e.type === 'assertion')) {
    return 'test-fixture';
  }
  if (errors.some(e => e.type === 'lint-error')) {
    return 'code-quality';
  }
  if (errors.some(e => e.type === 'build-error')) {
    return 'build-config';
  }
  if (errors.some(e => e.type === 'exit-code' && e.message.includes('137'))) {
    return 'out-of-memory';
  }
  if (errors.some(e => e.type === 'exit-code' && e.message.includes('143'))) {
    return 'timeout';
  }

  return 'unknown';
}
