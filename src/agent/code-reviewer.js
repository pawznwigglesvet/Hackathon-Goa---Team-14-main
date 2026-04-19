import { buildCodeReviewPrompt } from '../llm/prompts.js';
import { runSyntaxValidation, formatValidationErrors, generateValidationSummary } from './syntax-validator.js';
import { runComplianceCheck, formatComplianceComments, generateComplianceSummary } from './compliance.js';
import { calculatePRConfidence } from './confidence.js';

// Marker embedded in code review comments
const CODE_REVIEW_MARKER = '<!-- PR-AI-AGENT:CODE-REVIEW -->';

/**
 * Module 3: Code Reviewer
 * Analyzes actual code changes and provides detailed feedback on:
 * - Syntax and import errors (pre-flight checks)
 * - Compliance (secrets, banned functions, licenses)
 * - Code quality & best practices
 * - Security vulnerabilities
 * - Performance issues
 * - Potential bugs
 * - Refactoring suggestions
 *
 * Posts feedback in two ways:
 * 1. Inline comments on specific lines (like Hyperspace bot)
 * 2. Summary comment with overall analysis
 */
export async function runCodeReviewer(github, llm, owner, repo, prNumber) {
  console.log(`[CodeReviewer] Starting for PR #${prNumber}`);

  // 1. Get PR details and changes
  const [prDetails, changedFiles, diffText] = await Promise.all([
    github.getPRDetails(owner, repo, prNumber),
    github.getChangedFiles(owner, repo, prNumber),
    github.getPRDiff(owner, repo, prNumber),
  ]);

  console.log(`[CodeReviewer] Analyzing ${changedFiles.length} changed files`);

  // 2. Run syntax validation first (catches issues before CI)
  const validationResult = await runSyntaxValidation(github, owner, repo, prNumber);
  const syntaxErrors = validationResult.errors || [];

  // 3. Run compliance checks (secrets, banned functions, licenses)
  const complianceResult = await runComplianceCheck(github, owner, repo, prNumber);

  // 4. Filter for code files only (skip docs, configs unless needed)
  const codeFiles = changedFiles.filter(f =>
    f.filename.match(/\.(js|ts|cds|xml|json|java|py|go|cs)$/) &&
    !f.filename.includes('node_modules') &&
    !f.filename.includes('package-lock') &&
    f.additions + f.deletions > 0  // Skip files with no changes
  );

  console.log(`[CodeReviewer] Reviewing ${codeFiles.length} code files`);

  if (codeFiles.length === 0 && syntaxErrors.length === 0 && !hasComplianceIssues(complianceResult)) {
    console.log('[CodeReviewer] No code files to review');
    return null;
  }

  let reviewText = '';
  let issues = [];

  // 5. Only run LLM review if there are code files (skip if only syntax/compliance errors)
  if (codeFiles.length > 0) {
    // Generate overall code review using LLM
    const { system, user } = buildCodeReviewPrompt(prDetails, codeFiles, diffText);
    const response = await llm.complete(system, user, { maxTokens: 2048, useOrchestration: true });

    // Handle both object and string responses
    reviewText = typeof response === 'object' && response.text ? response.text : response;

    console.log('[CodeReviewer] Generated code review');
    console.log(`[CodeReviewer] Review text type: ${typeof reviewText}, length: ${reviewText?.length || 0}`);

    // Validate reviewText before parsing
    if (!reviewText || typeof reviewText !== 'string') {
      console.warn('[CodeReviewer] Invalid review text received from LLM');
      reviewText = '';
    }

    // Parse issues/suggestions from LLM response
    issues = parseReviewIssues(reviewText, codeFiles);
    console.log(`[CodeReviewer] Found ${issues.length} issue(s)/suggestion(s)`);
  }

  // 6. Aggregate file-level issue statistics for confidence calculation
  const fileIssues = aggregateFileIssues(issues, syntaxErrors, complianceResult);

  // 7. Combine inline comments from all sources
  let inlineComments = [];

  // Add syntax error comments first (highest priority)
  if (syntaxErrors.length > 0) {
    const syntaxComments = formatValidationErrors(syntaxErrors);
    inlineComments.push(...syntaxComments);
    console.log(`[CodeReviewer] Added ${syntaxComments.length} syntax error comment(s)`);
  }

  // Add compliance violation comments (high priority)
  if (hasComplianceIssues(complianceResult)) {
    const complianceComments = formatComplianceComments(complianceResult);
    inlineComments.push(...complianceComments);
    console.log(`[CodeReviewer] Added ${complianceComments.length} compliance violation comment(s)`);
  }

  // Add code review comments
  if (issues.length > 0) {
    const reviewComments = await generateInlineComments(github, llm, prDetails, issues, codeFiles);
    inlineComments.push(...reviewComments);
  }

  // Post inline comments (limit to 15 total)
  if (inlineComments.length > 0) {
    const commentsToPost = inlineComments.slice(0, 15);
    try {
      await github.createReview(
        owner,
        repo,
        prNumber,
        prDetails.head.sha,
        commentsToPost,
        '🔍 **AI Code Review** - See inline comments for detailed feedback',
        'COMMENT'
      );
      console.log(`[CodeReviewer] Posted ${commentsToPost.length} inline comment(s)`);
    } catch (err) {
      console.log(`[CodeReviewer] Could not post inline comments: ${err.message}`);
      // Continue to post summary comment
    }
  }

  // 7. Calculate confidence score for code review comment
  let confidence = null;
  try {
    const prAuthor = prDetails.user.login;

    const codeReviewForConfidence = {
      inlineComments: inlineComments.length,
      syntaxErrors: syntaxErrors.length,
      issues,
      fileIssues,
    };

    confidence = await calculatePRConfidence(
      github,
      reviewText, // Code review text
      prAuthor,
      owner,
      repo,
      {
        codeReview: codeReviewForConfidence,
        compliance: complianceResult,
      }
    );

    if (confidence) {
      console.log(`[CodeReviewer] PR Confidence score: ${confidence.score}%`);
    }
  } catch (error) {
    console.warn('[CodeReviewer] Could not calculate confidence:', error.message);
  }

  // 8. Format and post summary comment (include syntax errors, compliance, and confidence)
  const validationSummary = syntaxErrors.length > 0 ? generateValidationSummary(syntaxErrors) : null;
  const complianceSummary = hasComplianceIssues(complianceResult) ? generateComplianceSummary(complianceResult) : null;

  const commentBody = formatCodeReviewComment(
    reviewText,
    codeFiles,
    issues,
    prDetails,
    inlineComments.length,
    validationSummary,
    complianceSummary,
    confidence
  );

  const existing = await github.findAgentComment(owner, repo, prNumber, CODE_REVIEW_MARKER);
  if (existing) {
    await github.updateComment(owner, repo, existing.id, commentBody);
    console.log(`[CodeReviewer] Updated existing summary comment #${existing.id}`);
  } else {
    await github.postComment(owner, repo, prNumber, commentBody);
    console.log('[CodeReviewer] Posted new summary comment');
  }

  return {
    reviewText,
    issues,
    inlineComments: inlineComments.length,
    syntaxErrors: syntaxErrors.length,
    fileIssues,
    compliance: complianceResult,
  };
}

/**
 * Check if compliance results contain any issues
 */
function hasComplianceIssues(complianceResult) {
  return (
    complianceResult.secrets.length > 0 ||
    complianceResult.bannedFunctions.length > 0 ||
    complianceResult.licenses.length > 0
  );
}

/**
 * Aggregate file-level issue statistics for confidence calculation
 */
function aggregateFileIssues(issues, syntaxErrors, complianceResult) {
  const fileStats = {};

  // Add issues from code review
  issues.forEach(issue => {
    if (issue.file) {
      if (!fileStats[issue.file]) {
        fileStats[issue.file] = { count: 0, critical: 0, warnings: 0, suggestions: 0 };
      }
      fileStats[issue.file].count++;

      if (issue.severity === 'critical' || issue.severity === 'security') {
        fileStats[issue.file].critical++;
      } else if (issue.severity === 'warning' || issue.severity === 'bug') {
        fileStats[issue.file].warnings++;
      } else {
        fileStats[issue.file].suggestions++;
      }
    }
  });

  // Add syntax errors
  syntaxErrors.forEach(error => {
    const file = error.file || error.path;
    if (file) {
      if (!fileStats[file]) {
        fileStats[file] = { count: 0, critical: 0, warnings: 0, suggestions: 0 };
      }
      fileStats[file].count++;
      fileStats[file].critical++; // Syntax errors are critical
    }
  });

  // Add compliance violations
  if (complianceResult) {
    // Secrets
    (complianceResult.secrets || []).forEach(secret => {
      const file = secret.file;
      if (file) {
        if (!fileStats[file]) {
          fileStats[file] = { count: 0, critical: 0, warnings: 0, suggestions: 0 };
        }
        fileStats[file].count++;
        fileStats[file].critical++; // Secrets are critical
      }
    });

    // Banned functions
    (complianceResult.bannedFunctions || []).forEach(ban => {
      const file = ban.file;
      if (file) {
        if (!fileStats[file]) {
          fileStats[file] = { count: 0, critical: 0, warnings: 0, suggestions: 0 };
        }
        fileStats[file].count++;
        fileStats[file].warnings++; // Banned functions are warnings
      }
    });
  }

  return fileStats;
}

/**
 * Parse issues/suggestions from LLM response
 * Extracts file path and line number if mentioned
 */
function parseReviewIssues(reviewText, codeFiles) {
  const issues = [];

  // Handle empty or invalid reviewText
  if (!reviewText || typeof reviewText !== 'string') {
    console.warn('[CodeReviewer] Invalid reviewText provided to parseReviewIssues');
    return issues;
  }

  const lines = reviewText.split('\n');

  let currentIssue = null;

  for (const line of lines) {
    // Match severity markers
    if (line.match(/^(🔴|⚠️|💡|🔒|⚡|🐛|📦)/)) {
      if (currentIssue) {
        issues.push(currentIssue);
      }
      currentIssue = {
        severity: getSeverity(line),
        text: line,
        file: null,
        line: null,
      };
    } else if (currentIssue && line.trim()) {
      currentIssue.text += '\n' + line;

      // Try to extract file path and line number
      // Pattern: **File**: `path/to/file.js` (line 42)
      const fileMatch = line.match(/\*\*File\*\*:\s*`([^`]+)`\s*\(line\s+(\d+)\)/i);
      if (fileMatch) {
        currentIssue.file = fileMatch[1];
        currentIssue.line = parseInt(fileMatch[2], 10);
      }
    }
  }

  if (currentIssue) {
    issues.push(currentIssue);
  }

  return issues;
}

/**
 * Generate inline comments for issues with file/line information
 */
async function generateInlineComments(github, llm, prDetails, issues, codeFiles) {
  const inlineComments = [];

  // Only post inline comments for critical/security/bug issues
  const criticalIssues = issues.filter(i =>
    ['critical', 'security', 'bug'].includes(i.severity) &&
    i.file &&
    i.line
  );

  for (const issue of criticalIssues) {
    // Find the file in changedFiles to verify it exists
    const file = codeFiles.find(f => f.filename === issue.file);
    if (!file) continue;

    // Extract the main message (first line of issue.text)
    const mainMessage = issue.text.split('\n')[0];

    // Format inline comment body
    const body = formatInlineComment(issue);

    inlineComments.push({
      path: issue.file,
      line: issue.line,
      side: 'RIGHT',
      body,
    });

    // Limit to 10 inline comments to avoid spam
    if (inlineComments.length >= 10) break;
  }

  return inlineComments;
}

/**
 * Format inline comment with severity badge and GitHub suggested changes
 */
function formatInlineComment(issue) {
  const severityLabel = {
    critical: '🔴 **Critical**',
    security: '🔒 **Security**',
    bug: '🐛 **Bug**',
    performance: '⚡ **Performance**',
    warning: '⚠️ **Warning**',
    suggestion: '💡 **Suggestion**',
  }[issue.severity] || '**Issue**';

  // Extract Problem/Impact/Fix sections if present
  const sections = issue.text.split('\n').filter(l => l.trim());

  // Try to extract code fix for GitHub suggested changes
  const fixMatch = extractFixCode(issue.text);

  let body = `${severityLabel}\n\n`;

  // Add sections (skip first line which is the severity)
  for (let i = 1; i < sections.length; i++) {
    const line = sections[i];

    // If this is the Fix section and we have code, format as suggestion
    if (line.startsWith('**Fix**:') && fixMatch) {
      body += `${line}\n\n\`\`\`suggestion\n${fixMatch}\n\`\`\`\n`;
      continue;
    }

    body += `${line}\n`;
  }

  return body.trim();
}

/**
 * Extract code fix from LLM response for GitHub suggested changes
 * Looks for code blocks or inline code in the Fix section
 */
function extractFixCode(issueText) {
  // Pattern 1: Code block after "Fix:"
  const codeBlockMatch = issueText.match(/\*\*Fix\*\*:.*?```(?:\w+)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Pattern 2: Inline code in Fix section
  const inlineCodeMatch = issueText.match(/\*\*Fix\*\*:.*?`([^`]+)`/);
  if (inlineCodeMatch) {
    return inlineCodeMatch[1].trim();
  }

  // Pattern 3: Look for "// ✅ Good" examples
  const goodExampleMatch = issueText.match(/\/\/\s*✅\s*Good\s*\n(.*?)(?:\n|$)/);
  if (goodExampleMatch) {
    return goodExampleMatch[1].trim();
  }

  return null;
}

function getSeverity(line) {
  if (line.startsWith('🔴')) return 'critical';
  if (line.startsWith('⚠️')) return 'warning';
  if (line.startsWith('🔒')) return 'security';
  if (line.startsWith('⚡')) return 'performance';
  if (line.startsWith('🐛')) return 'bug';
  if (line.startsWith('💡')) return 'suggestion';
  if (line.startsWith('📦')) return 'dependency';
  return 'info';
}

/**
 * Format the code review summary comment
 */
function formatCodeReviewComment(reviewText, codeFiles, issues, prDetails, inlineCount, validationSummary = null, complianceSummary = null, confidence = null) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  // Count by severity
  const severityCounts = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});

  const summaryBadges = [];
  if (severityCounts.critical) summaryBadges.push(`🔴 ${severityCounts.critical} Critical`);
  if (severityCounts.security) summaryBadges.push(`🔒 ${severityCounts.security} Security`);
  if (severityCounts.warning) summaryBadges.push(`⚠️ ${severityCounts.warning} Warnings`);
  if (severityCounts.bug) summaryBadges.push(`🐛 ${severityCounts.bug} Bugs`);
  if (severityCounts.performance) summaryBadges.push(`⚡ ${severityCounts.performance} Performance`);
  if (severityCounts.suggestion) summaryBadges.push(`💡 ${severityCounts.suggestion} Suggestions`);

  // Determine overall status (compliance/syntax errors override)
  const overallStatus = complianceSummary ? '🔐 **Compliance Issues - Must Fix**' :
                       validationSummary ? '🔴 **Build Errors - Must Fix**' :
                       severityCounts.critical > 0 ? '🔴 **Needs Attention**' :
                       severityCounts.security > 0 ? '🔒 **Security Review Required**' :
                       severityCounts.warning > 0 ? '⚠️ **Minor Issues Found**' :
                       '✅ **Looks Good**';

  const inlineNote = inlineCount > 0
    ? `\n\n> 💬 ${inlineCount} inline comment(s) posted on specific lines (see "Changes" tab)`
    : '';

  // Build the comment
  let comment = `${CODE_REVIEW_MARKER}
# 🔍 AI Code Review

${overallStatus}
${confidence && confidence.badge ? `\n${confidence.badge}\n` : ''}

${summaryBadges.length > 0 ? summaryBadges.join(' · ') : 'No issues found'}${inlineNote}

---
`;

  // Add compliance summary if present (highest priority)
  if (complianceSummary) {
    comment += `\n${complianceSummary}\n---\n\n`;
  }

  // Add syntax validation summary if present (high priority)
  if (validationSummary) {
    comment += `\n${validationSummary}\n---\n\n`;
  }

  // Add detailed analysis from LLM
  if (reviewText) {
    comment += `## 📋 Detailed Analysis

${reviewText}

---

`;
  }

  // Add review summary
  comment += `### 📊 Review Summary

**Files Reviewed:** ${codeFiles.length}
**Total Changes:** +${codeFiles.reduce((sum, f) => sum + f.additions, 0)} -${codeFiles.reduce((sum, f) => sum + f.deletions, 0)}
**Focus Areas:** ${complianceSummary ? 'Compliance, ' : ''}${validationSummary ? 'Syntax Errors, ' : ''}Security, Performance, Code Quality, Best Practices

<details>
<summary>📁 Reviewed Files</summary>

${codeFiles.map(f => `- \`${f.filename}\` (+${f.additions} -${f.deletions})`).join('\n')}

</details>

---
`;

  // Add confidence details if available
  if (confidence && confidence.details) {
    comment += `\n${confidence.details}\n\n---\n`;
  }

  comment += `\n<sub>🤖 Generated by SAP-Copilot-Agent · ${timestamp} · Module 3: Code Reviewer · Commit \`${prDetails.head.sha.slice(0, 7)}\`</sub>`;

  return comment;
}
