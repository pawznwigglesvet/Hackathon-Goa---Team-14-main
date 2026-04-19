/**
 * User Trust Score Calculator
 *
 * Calculates user reputation based on their commit history:
 * 1. PR approval rate (25%)
 * 2. Reverts/rollbacks (25%)
 * 3. CI/CD success rate (25%)
 * 4. Review feedback count (25%)
 *
 * Analyzes last 10 commits by default
 */

const DEFAULT_LOOKBACK_COMMITS = 10;

/**
 * Calculate user trust score based on commit history
 *
 * @param {object} github - GitHub client instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - User to analyze
 * @param {object} options - Configuration options
 * @returns {Promise<object>} Trust score and breakdown
 */
export async function calculateUserTrustScore(github, owner, repo, username, options = {}) {
  const lookbackCount = options.lookbackCount || DEFAULT_LOOKBACK_COMMITS;

  try {
    console.log(`[User Trust] Analyzing last ${lookbackCount} commits for @${username}`);

    // Fetch user's recent commits
    const commits = await getUserRecentCommits(github, owner, repo, username, lookbackCount);

    if (commits.length === 0) {
      console.log(`[User Trust] No commits found for @${username}, using default score`);
      return createDefaultTrustScore('No commit history found');
    }

    console.log(`[User Trust] Found ${commits.length} commits to analyze`);

    // Calculate individual factors
    const [
      approvalRate,
      revertRate,
      ciSuccessRate,
      reviewFeedbackScore,
    ] = await Promise.all([
      calculatePRApprovalRate(github, owner, repo, commits),
      calculateRevertRate(github, owner, repo, commits),
      calculateCISuccessRate(github, owner, repo, commits),
      calculateReviewFeedbackScore(github, owner, repo, commits),
    ]);

    // Weighted average (25% each)
    const trustScore = Math.round(
      approvalRate.score * 0.25 +
      revertRate.score * 0.25 +
      ciSuccessRate.score * 0.25 +
      reviewFeedbackScore.score * 0.25
    );

    return {
      success: true,
      score: trustScore,
      breakdown: {
        approvalRate,
        revertRate,
        ciSuccessRate,
        reviewFeedbackScore,
      },
      commitsAnalyzed: commits.length,
      details: formatTrustScoreDetails(trustScore, {
        approvalRate,
        revertRate,
        ciSuccessRate,
        reviewFeedbackScore,
      }),
    };
  } catch (error) {
    console.error('[User Trust] Error calculating trust score:', error);
    return createDefaultTrustScore(error.message);
  }
}

/**
 * Get user's recent commits from repository
 *
 * @param {object} github - GitHub client
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @param {string} username - User to analyze
 * @param {number} count - Number of commits to fetch
 * @returns {Promise<Array>} Recent commits
 */
async function getUserRecentCommits(github, owner, repo, username, count) {
  try {
    const commits = await github.octokit.repos.listCommits({
      owner,
      repo,
      author: username,
      per_page: count,
    });

    return commits.data;
  } catch (error) {
    console.warn(`[User Trust] Could not fetch commits for @${username}:`, error.message);
    return [];
  }
}

/**
 * Calculate PR approval rate
 * % of user's PRs that were approved/merged without major changes
 *
 * @returns {Promise<object>} Approval rate score and details
 */
async function calculatePRApprovalRate(github, owner, repo, commits) {
  try {
    // Get PRs associated with these commits
    const prs = await Promise.all(
      commits.slice(0, 5).map(async (commit) => {
        try {
          const associated = await github.octokit.repos.listPullRequestsAssociatedWithCommit({
            owner,
            repo,
            commit_sha: commit.sha,
          });
          return associated.data[0]; // Get first associated PR
        } catch {
          return null;
        }
      })
    );

    const validPRs = prs.filter((pr) => pr !== null);

    if (validPRs.length === 0) {
      return { score: 75, approved: 0, total: 0, rate: 'N/A' }; // Default moderate score
    }

    // Count approved/merged PRs
    const approvedPRs = validPRs.filter(
      (pr) => pr.state === 'closed' && pr.merged_at !== null
    );

    const rate = (approvedPRs.length / validPRs.length) * 100;

    return {
      score: Math.round(rate),
      approved: approvedPRs.length,
      total: validPRs.length,
      rate: `${approvedPRs.length}/${validPRs.length}`,
    };
  } catch (error) {
    console.warn('[User Trust] PR approval rate calculation failed:', error.message);
    return { score: 75, approved: 0, total: 0, rate: 'N/A' };
  }
}

/**
 * Calculate revert rate
 * Penalize if user's commits were reverted due to bugs
 * Lower reverts = higher score
 *
 * @returns {Promise<object>} Revert rate score and details
 */
async function calculateRevertRate(github, owner, repo, commits) {
  try {
    // Check commit messages for "Revert" or "Rollback"
    const revertCommits = commits.filter((commit) => {
      const message = commit.commit.message.toLowerCase();
      return message.includes('revert') || message.includes('rollback');
    });

    const revertRate = (revertCommits.length / commits.length) * 100;

    // Invert score: 0 reverts = 100 score, all reverts = 0 score
    const score = Math.round(100 - revertRate);

    return {
      score,
      reverts: revertCommits.length,
      total: commits.length,
      rate: `${revertCommits.length}/${commits.length}`,
    };
  } catch (error) {
    console.warn('[User Trust] Revert rate calculation failed:', error.message);
    return { score: 90, reverts: 0, total: commits.length, rate: '0/' + commits.length };
  }
}

/**
 * Calculate CI/CD success rate
 * % of commits that passed CI checks on first try
 *
 * @returns {Promise<object>} CI success rate score and details
 */
async function calculateCISuccessRate(github, owner, repo, commits) {
  try {
    // Get check runs for each commit
    const checkResults = await Promise.all(
      commits.slice(0, 5).map(async (commit) => {
        try {
          const checks = await github.octokit.checks.listForRef({
            owner,
            repo,
            ref: commit.sha,
          });

          if (checks.data.total_count === 0) {
            return null; // No checks configured
          }

          // Check if all checks passed
          const allPassed = checks.data.check_runs.every(
            (check) => check.conclusion === 'success'
          );

          return allPassed;
        } catch {
          return null;
        }
      })
    );

    const validChecks = checkResults.filter((result) => result !== null);

    if (validChecks.length === 0) {
      return { score: 80, passed: 0, total: 0, rate: 'N/A' }; // Default good score if no CI
    }

    const passedChecks = validChecks.filter((result) => result === true);
    const rate = (passedChecks.length / validChecks.length) * 100;

    return {
      score: Math.round(rate),
      passed: passedChecks.length,
      total: validChecks.length,
      rate: `${passedChecks.length}/${validChecks.length}`,
    };
  } catch (error) {
    console.warn('[User Trust] CI success rate calculation failed:', error.message);
    return { score: 80, passed: 0, total: 0, rate: 'N/A' };
  }
}

/**
 * Calculate review feedback score
 * Fewer review comments/change requests = higher score
 *
 * @returns {Promise<object>} Review feedback score and details
 */
async function calculateReviewFeedbackScore(github, owner, repo, commits) {
  try {
    // Get PRs and count review comments
    const feedbackCounts = await Promise.all(
      commits.slice(0, 5).map(async (commit) => {
        try {
          const prs = await github.octokit.repos.listPullRequestsAssociatedWithCommit({
            owner,
            repo,
            commit_sha: commit.sha,
          });

          if (prs.data.length === 0) return null;

          const pr = prs.data[0];

          // Get review comments
          const reviews = await github.octokit.pulls.listReviews({
            owner,
            repo,
            pull_number: pr.number,
          });

          const comments = await github.octokit.pulls.listReviewComments({
            owner,
            repo,
            pull_number: pr.number,
          });

          // Count change requests and total comments
          const changeRequests = reviews.data.filter((r) => r.state === 'CHANGES_REQUESTED').length;
          const commentCount = comments.data.length;

          return { changeRequests, commentCount };
        } catch {
          return null;
        }
      })
    );

    const validFeedback = feedbackCounts.filter((fb) => fb !== null);

    if (validFeedback.length === 0) {
      return { score: 85, avgComments: 0, changeRequests: 0 };
    }

    const totalComments = validFeedback.reduce((sum, fb) => sum + fb.commentCount, 0);
    const totalChangeRequests = validFeedback.reduce((sum, fb) => sum + fb.changeRequests, 0);
    const avgComments = totalComments / validFeedback.length;

    // Score: fewer comments = higher score
    // 0-2 comments avg = 100, 3-5 = 80, 6-10 = 60, 11+ = 40
    let score = 100;
    if (avgComments > 10) score = 40;
    else if (avgComments > 5) score = 60;
    else if (avgComments > 2) score = 80;

    // Penalize change requests (each -10 points)
    score -= totalChangeRequests * 10;
    score = Math.max(0, score);

    return {
      score,
      avgComments: Math.round(avgComments * 10) / 10,
      changeRequests: totalChangeRequests,
    };
  } catch (error) {
    console.warn('[User Trust] Review feedback calculation failed:', error.message);
    return { score: 85, avgComments: 0, changeRequests: 0 };
  }
}

/**
 * Create default trust score for error cases
 */
function createDefaultTrustScore(reason) {
  return {
    success: false,
    score: 70, // Moderate default score
    breakdown: {
      approvalRate: { score: 70, rate: 'N/A' },
      revertRate: { score: 70, rate: 'N/A' },
      ciSuccessRate: { score: 70, rate: 'N/A' },
      reviewFeedbackScore: { score: 70, avgComments: 0 },
    },
    commitsAnalyzed: 0,
    error: reason,
    details: `**User Trust Score:** ⚠️ 70/100 (Default - ${reason})`,
  };
}

/**
 * Format trust score details as markdown
 */
function formatTrustScoreDetails(score, breakdown) {
  const emoji = score >= 80 ? '✅' : score >= 60 ? '✓' : '⚠️';

  return `
**User Trust Score:** ${emoji} ${score}/100

| Factor | Score | Details |
|--------|-------|---------|
| PR Approval Rate | ${breakdown.approvalRate.score}/100 | ${breakdown.approvalRate.rate} merged |
| Revert Rate | ${breakdown.revertRate.score}/100 | ${breakdown.revertRate.rate} reverts |
| CI/CD Success | ${breakdown.ciSuccessRate.score}/100 | ${breakdown.ciSuccessRate.rate} passed |
| Review Feedback | ${breakdown.reviewFeedbackScore.score}/100 | Avg ${breakdown.reviewFeedbackScore.avgComments} comments/PR |
`.trim();
}
