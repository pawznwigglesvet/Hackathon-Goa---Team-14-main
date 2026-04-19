/**
 * Enhanced PR Confidence Scoring Module
 *
 * Calculates confidence score based on PR/code quality with inline review integration.
 *
 * Factors (configurable weights):
 * 1. Code Quality Score (40%) - Reviewer-identified issues (severity-weighted)
 * 2. User Trust Score (30%) - PR author's commit history
 * 3. Code Review Depth (20%) - Inline comments and issue distribution
 * 4. Compliance Score (10%) - Secrets, banned functions, licenses
 *
 * Architecture: Strategy pattern with configurable weights
 */

import { analyzePRQuality } from './pr-quality-analyzer.js';
import { calculateUserTrustScore } from './user-trust-calculator.js';

/**
 * Enhanced PR confidence calculator with inline review integration
 *
 * Scoring factors:
 * 1. Code Quality (default 40%) - Issue-based scoring
 * 2. User Trust (default 30%) - Commit history
 * 3. Code Review Depth (default 20%) - Inline comments analysis
 * 4. Compliance (default 10%) - Security & compliance
 *
 * Weights can be overridden via environment variables:
 * - CONFIDENCE_WEIGHT_CODE_QUALITY (default: 40)
 * - CONFIDENCE_WEIGHT_USER_TRUST (default: 30)
 * - CONFIDENCE_WEIGHT_CODE_REVIEW (default: 20)
 * - CONFIDENCE_WEIGHT_COMPLIANCE (default: 10)
 */
export class EnhancedPRConfidenceCalculator {
  constructor() {
    // Read weights from environment variables with defaults
    this.weights = {
      codeQuality: parseInt(process.env.CONFIDENCE_WEIGHT_CODE_QUALITY || '40', 10),
      userTrust: parseInt(process.env.CONFIDENCE_WEIGHT_USER_TRUST || '30', 10),
      codeReview: parseInt(process.env.CONFIDENCE_WEIGHT_CODE_REVIEW || '20', 10),
      compliance: parseInt(process.env.CONFIDENCE_WEIGHT_COMPLIANCE || '10', 10),
    };

    // Validate weights sum to 100
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (total !== 100) {
      console.warn(`[PR Confidence] Weight sum is ${total}, not 100. Normalizing weights.`);
      const factor = 100 / total;
      Object.keys(this.weights).forEach(key => {
        this.weights[key] = Math.round(this.weights[key] * factor);
      });
    }
  }

  /**
   * Calculate enhanced PR confidence score
   *
   * @param {object} codeQuality - Code quality analysis result
   * @param {object} userTrust - User trust score result
   * @param {object} codeReview - Code review analysis result
   * @param {object} compliance - Compliance check result
   * @param {object} options - Additional options
   * @returns {object} Confidence result with score, breakdown, badge, details
   */
  calculate(codeQuality, userTrust, codeReview, compliance, options = {}) {
    if (!codeQuality || !userTrust) {
      return this._createNullResult('Missing required data (code quality or user trust)');
    }

    // Calculate individual scores
    const codeQualityScore = codeQuality.score || 0;
    const userTrustScore = userTrust.score || 0;
    const codeReviewScore = codeReview ? this._calculateCodeReviewScore(codeReview) : 100;
    const complianceScore = compliance ? this._calculateComplianceScore(compliance) : 100;

    // Calculate weighted scores
    const codeQualityWeighted = Math.round((codeQualityScore / 100) * this.weights.codeQuality);
    const userTrustWeighted = Math.round((userTrustScore / 100) * this.weights.userTrust);
    const codeReviewWeighted = Math.round((codeReviewScore / 100) * this.weights.codeReview);
    const complianceWeighted = Math.round((complianceScore / 100) * this.weights.compliance);

    const totalScore = codeQualityWeighted + userTrustWeighted + codeReviewWeighted + complianceWeighted;

    return {
      score: totalScore,
      breakdown: {
        codeQuality: {
          score: codeQualityScore,
          weighted: codeQualityWeighted,
          issues: codeQuality.totalIssues,
          details: codeQuality.breakdown,
        },
        userTrust: {
          score: userTrustScore,
          weighted: userTrustWeighted,
          commitsAnalyzed: userTrust.commitsAnalyzed,
          details: userTrust.breakdown,
        },
        codeReview: {
          score: codeReviewScore,
          weighted: codeReviewWeighted,
          inlineComments: codeReview?.inlineComments || 0,
          issues: codeReview?.issues || [],
          syntaxErrors: codeReview?.syntaxErrors || 0,
          details: codeReview || {},
        },
        compliance: {
          score: complianceScore,
          weighted: complianceWeighted,
          violations: compliance ? this._countViolations(compliance) : 0,
          details: compliance || {},
        },
      },
      badge: formatConfidenceBadge(totalScore),
      details: formatEnhancedConfidenceDetails(totalScore, {
        codeQuality,
        userTrust,
        codeReview,
        compliance,
        weights: this.weights,
        weighted: {
          codeQuality: codeQualityWeighted,
          userTrust: userTrustWeighted,
          codeReview: codeReviewWeighted,
          compliance: complianceWeighted,
        },
      }),
    };
  }

  /**
   * Calculate code review depth score
   * More inline comments = more thorough review = potentially lower confidence in code
   * @private
   */
  _calculateCodeReviewScore(codeReview) {
    const inlineCount = codeReview.inlineComments || 0;
    const syntaxErrors = codeReview.syntaxErrors || 0;
    const issues = codeReview.issues || [];

    let score = 100;

    // Penalize for inline comments (indicates issues found)
    // 0 comments = 100, 5 comments = 80, 10 comments = 60, 15+ comments = 40
    if (inlineCount > 0) {
      const penalty = Math.min(60, inlineCount * 4);
      score -= penalty;
    }

    // Penalize heavily for syntax errors (blocks CI)
    if (syntaxErrors > 0) {
      const penalty = Math.min(40, syntaxErrors * 20);
      score -= penalty;
    }

    // Additional penalty for critical issues in inline review
    const criticalIssues = issues.filter(i => i.severity === 'critical' || i.severity === 'security').length;
    if (criticalIssues > 0) {
      score -= criticalIssues * 10;
    }

    return Math.max(0, score);
  }

  /**
   * Calculate compliance score
   * @private
   */
  _calculateComplianceScore(compliance) {
    if (!compliance) return 100;

    const secrets = compliance.secrets?.length || 0;
    const bannedFunctions = compliance.bannedFunctions?.length || 0;
    const licenses = compliance.licenses?.length || 0;

    let score = 100;

    // Secrets are critical - heavy penalty
    if (secrets > 0) {
      score -= secrets * 30; // Each secret: -30 points
    }

    // Banned functions are serious
    if (bannedFunctions > 0) {
      score -= bannedFunctions * 15; // Each banned function: -15 points
    }

    // License issues are moderate
    if (licenses > 0) {
      score -= licenses * 5; // Each license issue: -5 points
    }

    return Math.max(0, score);
  }

  /**
   * Count total compliance violations
   * @private
   */
  _countViolations(compliance) {
    return (
      (compliance.secrets?.length || 0) +
      (compliance.bannedFunctions?.length || 0) +
      (compliance.licenses?.length || 0)
    );
  }

  /**
   * Create null result for error cases
   * @private
   */
  _createNullResult(reason) {
    return {
      score: null,
      breakdown: null,
      badge: null,
      details: null,
      error: reason,
    };
  }
}

/**
 * Format confidence badge with emoji and label
 *
 * @param {number} score - Confidence score (0-100)
 * @returns {string} Formatted badge markdown
 */
export function formatConfidenceBadge(score) {
  if (score === null || score === undefined) {
    return null;
  }

  if (score >= 85) {
    return `✅ **PR Confidence: ${score}%** (High)`;
  } else if (score >= 70) {
    return `✓ **PR Confidence: ${score}%** (Good)`;
  } else if (score >= 50) {
    return `⚠️ **PR Confidence: ${score}%** (Moderate)`;
  } else {
    return `⚠️ **PR Confidence: ${score}%** (Low)`;
  }
}

/**
 * Format enhanced confidence details with inline review integration
 *
 * @param {number} totalScore - Total confidence score
 * @param {object} data - All data components
 * @returns {string} Formatted details markdown
 */
export function formatEnhancedConfidenceDetails(totalScore, data) {
  const { codeQuality, userTrust, codeReview, compliance, weights, weighted } = data;

  if (!codeQuality || !userTrust) {
    return null;
  }

  // Build top files list
  const topFilesSection = codeReview?.fileIssues ? formatTopFilesWithIssues(codeReview.fileIssues) : '';

  // Build issue type breakdown
  const issueBreakdown = codeReview?.issues ? formatIssueTypeBreakdown(codeReview.issues) : '';

  return `
<details>
<summary>📊 Enhanced PR Confidence Breakdown</summary>

### Overall Confidence: ${totalScore}/100

| Factor | Score | Weight | Contribution |
|--------|-------|--------|--------------|
| 🔍 Code Quality | ${codeQuality.score || 0}/100 | ${weights.codeQuality}% | ${weighted.codeQuality} points |
| 👤 User Trust | ${userTrust.score || 0}/100 | ${weights.userTrust}% | ${weighted.userTrust} points |
| 📝 Code Review Depth | ${codeReview ? (Math.round((weighted.codeReview / weights.codeReview) * 100)) : 100}/100 | ${weights.codeReview}% | ${weighted.codeReview} points |
| 🔒 Compliance | ${compliance ? (Math.round((weighted.compliance / weights.compliance) * 100)) : 100}/100 | ${weights.compliance}% | ${weighted.compliance} points |

---

### 🔍 Code Quality Analysis

${codeQuality.details || 'No issues detected'}

**Issues Found:** ${codeQuality.totalIssues || 0}
- 🔴 Critical: ${codeQuality.breakdown?.critical || 0}
- ⚠️ Warnings: ${codeQuality.breakdown?.warnings || 0}
- 💡 Suggestions: ${codeQuality.breakdown?.suggestions || 0}

---

### 📝 Code Review Depth Analysis

**Inline Comments Posted:** ${codeReview?.inlineComments || 0}
**Syntax/Build Errors:** ${codeReview?.syntaxErrors || 0}
${issueBreakdown}
${topFilesSection}

---

### 🔒 Compliance Analysis

**Total Violations:** ${compliance ? ((compliance.secrets?.length || 0) + (compliance.bannedFunctions?.length || 0) + (compliance.licenses?.length || 0)) : 0}
- 🔑 Secrets Detected: ${compliance?.secrets?.length || 0}
- 🚫 Banned Functions: ${compliance?.bannedFunctions?.length || 0}
- 📄 License Issues: ${compliance?.licenses?.length || 0}

${compliance && (compliance.secrets?.length > 0 || compliance.bannedFunctions?.length > 0 || compliance.licenses?.length > 0) ? '⚠️ **Action Required:** Review compliance violations before merging' : '✅ No compliance issues detected'}

---

### 👤 User Trust Score

${userTrust.details || 'Based on commit history analysis'}

**Commits Analyzed:** ${userTrust.commitsAnalyzed || 0}

---

**Interpretation Guide:**
- **85-100%** (High ✅): Ready to merge with confidence
- **70-84%** (Good ✓): Minor issues, review recommended
- **50-69%** (Moderate ⚠️): Several issues, careful review needed
- **0-49%** (Low ⚠️): Significant concerns, rework recommended

</details>`.trim();
}

/**
 * Format issue type breakdown
 * @private
 */
function formatIssueTypeBreakdown(issues) {
  if (!issues || issues.length === 0) return '';

  const breakdown = issues.reduce((acc, issue) => {
    const severity = issue.severity || 'info';
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});

  const lines = [];
  if (breakdown.critical || breakdown.security) {
    lines.push(`- 🔴 Critical/Security: ${(breakdown.critical || 0) + (breakdown.security || 0)}`);
  }
  if (breakdown.bug) {
    lines.push(`- 🐛 Bugs: ${breakdown.bug}`);
  }
  if (breakdown.performance) {
    lines.push(`- ⚡ Performance: ${breakdown.performance}`);
  }
  if (breakdown.warning) {
    lines.push(`- ⚠️ Warnings: ${breakdown.warning}`);
  }
  if (breakdown.suggestion) {
    lines.push(`- 💡 Suggestions: ${breakdown.suggestion}`);
  }

  return lines.length > 0 ? `\n**Issue Type Breakdown:**\n${lines.join('\n')}` : '';
}

/**
 * Format top files with most issues
 * @private
 */
function formatTopFilesWithIssues(fileIssues) {
  if (!fileIssues || Object.keys(fileIssues).length === 0) return '';

  // Sort files by issue count
  const sortedFiles = Object.entries(fileIssues)
    .map(([file, data]) => ({
      file,
      count: data.count || 0,
      critical: data.critical || 0,
      warnings: data.warnings || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5

  if (sortedFiles.length === 0) return '';

  const lines = sortedFiles.map(f => {
    const criticalBadge = f.critical > 0 ? `🔴 ${f.critical}` : '';
    const warningBadge = f.warnings > 0 ? `⚠️ ${f.warnings}` : '';
    const badges = [criticalBadge, warningBadge].filter(Boolean).join(' ');
    return `- \`${f.file}\` (${f.count} issue${f.count !== 1 ? 's' : ''}) ${badges}`;
  });

  return `\n**Files with Most Issues:**\n${lines.join('\n')}`;
}

/**
 * Calculate enhanced PR confidence score (main entry point)
 *
 * @param {object} github - GitHub client instance
 * @param {string} reviewerText - Reviewer LLM response text
 * @param {string} prAuthor - PR author username
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @param {object} options - Additional options
 * @param {object} options.codeReview - Code review analysis data
 * @param {object} options.compliance - Compliance check data
 * @param {object} options.calculator - Custom calculator (optional)
 * @returns {Promise<object|null>} Confidence result or null on error
 */
export async function calculatePRConfidence(
  github,
  reviewerText,
  prAuthor,
  owner,
  repo,
  options = {}
) {
  try {
    console.log('[PR Confidence] Starting enhanced confidence calculation');

    // 1. Analyze code quality from reviewer suggestions
    const codeQuality = analyzePRQuality(reviewerText);
    console.log(`[PR Confidence] Code quality score: ${codeQuality.score}/100`);

    // 2. Calculate user trust score from commit history
    const userTrust = await calculateUserTrustScore(github, owner, repo, prAuthor, options);
    console.log(`[PR Confidence] User trust score: ${userTrust.score}/100`);

    // 3. Get code review data (if provided)
    const codeReview = options.codeReview || null;
    if (codeReview) {
      console.log(`[PR Confidence] Code review data: ${codeReview.inlineComments} inline comments, ${codeReview.syntaxErrors || 0} syntax errors`);
    }

    // 4. Get compliance data (if provided)
    const compliance = options.compliance || null;
    if (compliance) {
      const violations = (compliance.secrets?.length || 0) + (compliance.bannedFunctions?.length || 0) + (compliance.licenses?.length || 0);
      console.log(`[PR Confidence] Compliance data: ${violations} violation(s)`);
    }

    // 5. Combine scores using enhanced calculator
    const calculator = options.calculator || new EnhancedPRConfidenceCalculator();
    const result = calculator.calculate(codeQuality, userTrust, codeReview, compliance, options);

    if (result.error) {
      console.warn(`[PR Confidence] Calculation failed: ${result.error}`);
      return null;
    }

    console.log(`[PR Confidence] Final confidence score: ${result.score}/100`);
    return result;
  } catch (error) {
    console.error('[PR Confidence] Unexpected error during calculation:', error);
    return null;
  }
}

/**
 * HTML marker for confidence-only comments
 */
export const CONFIDENCE_MARKER = '<!-- PR-AI-AGENT:CONFIDENCE -->';

// Export both calculators for backward compatibility
export { EnhancedPRConfidenceCalculator as DefaultPRConfidenceCalculator };
