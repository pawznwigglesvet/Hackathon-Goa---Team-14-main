/**
 * PR Quality Analyzer
 *
 * Analyzes code review suggestions/issues to calculate a quality score
 * Based on severity-weighted scoring:
 * - Critical bugs: -20 points
 * - Warnings: -5 points
 * - Suggestions: -2 points
 */

/**
 * Issue severity levels
 */
export const IssueSeverity = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  SUGGESTION: 'suggestion',
};

/**
 * Severity weights (penalty points)
 */
const SEVERITY_WEIGHTS = {
  [IssueSeverity.CRITICAL]: 20,
  [IssueSeverity.WARNING]: 5,
  [IssueSeverity.SUGGESTION]: 2,
};

/**
 * Keywords for severity classification
 */
const SEVERITY_KEYWORDS = {
  [IssueSeverity.CRITICAL]: [
    'bug',
    'error',
    'critical',
    'security',
    'vulnerability',
    'inject',
    'xss',
    'sql injection',
    'crash',
    'fail',
    'broken',
    'unsafe',
    'memory leak',
    'null pointer',
    'race condition',
  ],
  [IssueSeverity.WARNING]: [
    'warning',
    'issue',
    'problem',
    'concern',
    'improve',
    'refactor',
    'deprecate',
    'anti-pattern',
    'code smell',
    'duplication',
    'complexity',
    'performance',
  ],
  [IssueSeverity.SUGGESTION]: [
    'suggest',
    'consider',
    'recommend',
    'could',
    'might',
    'maybe',
    'optional',
    'nit',
    'style',
    'formatting',
    'typo',
    'comment',
    'documentation',
  ],
};

/**
 * Parse reviewer suggestions/issues from LLM response
 *
 * @param {string} reviewerText - LLM response text from reviewer module
 * @returns {Array<object>} Array of issues with severity classification
 */
export function parseReviewerIssues(reviewerText) {
  if (!reviewerText || typeof reviewerText !== 'string') {
    return [];
  }

  const issues = [];
  const lines = reviewerText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and markdown headers
    if (!line || line.startsWith('#')) {
      continue;
    }

    // Check for issue indicators:
    // - Bullet points (-, *, •)
    // - Numbered lists (1., 2.)
    // - Problem indicators (:warning:, :bug:, ❌, ⚠️, 🐛)
    const isIssue =
      /^[-*•]\s/.test(line) ||
      /^\d+\.\s/.test(line) ||
      /(:warning:|:bug:|❌|⚠️|🐛|🔴|⛔)/.test(line);

    if (isIssue) {
      const severity = classifyIssueSeverity(line);
      issues.push({
        text: line,
        severity,
        weight: SEVERITY_WEIGHTS[severity],
      });
    }
  }

  return issues;
}

/**
 * Classify issue severity based on keywords
 *
 * @param {string} issueText - Issue description text
 * @returns {string} Severity level (critical/warning/suggestion)
 */
export function classifyIssueSeverity(issueText) {
  const lowerText = issueText.toLowerCase();

  // Check for critical keywords first
  for (const keyword of SEVERITY_KEYWORDS[IssueSeverity.CRITICAL]) {
    if (lowerText.includes(keyword)) {
      return IssueSeverity.CRITICAL;
    }
  }

  // Check for warning keywords
  for (const keyword of SEVERITY_KEYWORDS[IssueSeverity.WARNING]) {
    if (lowerText.includes(keyword)) {
      return IssueSeverity.WARNING;
    }
  }

  // Check for suggestion keywords
  for (const keyword of SEVERITY_KEYWORDS[IssueSeverity.SUGGESTION]) {
    if (lowerText.includes(keyword)) {
      return IssueSeverity.SUGGESTION;
    }
  }

  // Default to suggestion if no keywords matched
  return IssueSeverity.SUGGESTION;
}

/**
 * Calculate code quality score based on issues found
 *
 * Scoring:
 * - Start at 100 points
 * - Deduct points for each issue based on severity
 * - Minimum score: 0
 *
 * @param {Array<object>} issues - Array of classified issues
 * @returns {object} Quality score and breakdown
 */
export function calculateCodeQualityScore(issues) {
  if (!Array.isArray(issues)) {
    issues = [];
  }

  // Start with perfect score
  let score = 100;

  // Count issues by severity
  const breakdown = {
    critical: 0,
    warnings: 0,
    suggestions: 0,
  };

  // Deduct points for each issue
  for (const issue of issues) {
    score -= issue.weight;

    switch (issue.severity) {
      case IssueSeverity.CRITICAL:
        breakdown.critical++;
        break;
      case IssueSeverity.WARNING:
        breakdown.warnings++;
        break;
      case IssueSeverity.SUGGESTION:
        breakdown.suggestions++;
        break;
    }
  }

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  return {
    score,
    breakdown,
    totalIssues: issues.length,
    details: formatCodeQualityDetails(score, breakdown),
  };
}

/**
 * Format code quality details as markdown
 *
 * @param {number} score - Quality score (0-100)
 * @param {object} breakdown - Issue breakdown by severity
 * @returns {string} Formatted markdown
 */
function formatCodeQualityDetails(score, breakdown) {
  const emoji = score >= 80 ? '✅' : score >= 60 ? '✓' : '⚠️';

  return `
**Code Quality Score:** ${emoji} ${score}/100

| Severity | Count | Impact |
|----------|-------|--------|
| 🔴 Critical | ${breakdown.critical} | -${breakdown.critical * SEVERITY_WEIGHTS.critical} points |
| ⚠️ Warnings | ${breakdown.warnings} | -${breakdown.warnings * SEVERITY_WEIGHTS.warning} points |
| 💡 Suggestions | ${breakdown.suggestions} | -${breakdown.suggestions * SEVERITY_WEIGHTS.suggestion} points |
`.trim();
}

/**
 * Analyze PR for code quality
 * Main entry point that combines parsing and scoring
 *
 * @param {string} reviewerText - LLM response from reviewer module
 * @returns {object} Code quality analysis result
 */
export function analyzePRQuality(reviewerText) {
  try {
    const issues = parseReviewerIssues(reviewerText);
    const qualityScore = calculateCodeQualityScore(issues);

    return {
      success: true,
      issues,
      ...qualityScore,
    };
  } catch (error) {
    console.error('[PR Quality Analyzer] Error:', error);
    return {
      success: false,
      error: error.message,
      score: 50, // Default moderate score on error
      breakdown: { critical: 0, warnings: 0, suggestions: 0 },
      totalIssues: 0,
    };
  }
}
