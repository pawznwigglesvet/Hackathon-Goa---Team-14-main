import { Octokit } from '@octokit/rest';

// GitHub API client for SAP GitHub Enterprise Server
export function createGitHubClient(token) {
  const octokit = new Octokit({
    auth: token,
    baseUrl: process.env.GITHUB_API_URL || 'https://github.tools.sap/api/v3',
  });

  return {
    // Fetch PR metadata: title, body, author, base/head branches
    async getPRDetails(owner, repo, prNumber) {
      const { data } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });
      return data;
    },

    // Fetch list of files changed in the PR with status and patch
    async getChangedFiles(owner, repo, prNumber) {
      const files = await octokit.paginate(octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
      return files;
    },

    // Fetch the unified diff of the PR (raw patch text)
    async getPRDiff(owner, repo, prNumber) {
      const { data } = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: 'diff' },
      });
      return data;
    },

    // Fetch recent commits on the PR (for CI triage context)
    async getPRCommits(owner, repo, prNumber) {
      const { data } = await octokit.pulls.listCommits({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 20,
      });
      return data;
    },

    // Post a comment on the PR — used by all 4 agent modules
    async postComment(owner, repo, prNumber, body) {
      const { data } = await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });
      return data;
    },

    // Update an existing comment (to avoid duplicate posts on re-runs)
    async updateComment(owner, repo, commentId, body) {
      const { data } = await octokit.issues.updateComment({
        owner,
        repo,
        comment_id: commentId,
        body,
      });
      return data;
    },

    // Find an existing agent comment by the marker tag (avoids duplicates on synchronize)
    async findAgentComment(owner, repo, prNumber, markerTag) {
      const comments = await octokit.paginate(octokit.issues.listComments, {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
      });
      return comments.find((c) => c.body.includes(markerTag)) || null;
    },

    // Request reviewers on the PR (Module 2)
    async requestReviewers(owner, repo, prNumber, reviewers) {
      const { data } = await octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers,
      });
      return data;
    },

    // Fetch git blame-style contributor info via commit history for a file path
    async getTopContributors(owner, repo, filePath, limit = 3) {
      const { data } = await octokit.repos.listCommits({
        owner,
        repo,
        path: filePath,
        per_page: 20,
      });

      const counts = {};
      for (const commit of data) {
        const login = commit.author?.login;
        if (login) counts[login] = (counts[login] || 0) + 1;
      }

      return Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([login]) => login);
    },

    // Fetch CI check runs for the PR head SHA (Module 3 — CI triage)
    async getCheckRuns(owner, repo, headSha) {
      const { data } = await octokit.checks.listForRef({
        owner,
        repo,
        ref: headSha,
        per_page: 50,
      });
      return data.check_runs;
    },

    // Fetch logs for a specific workflow run job (Module 3)
    async getWorkflowRunLogs(owner, repo, runId) {
      try {
        const { data } = await octokit.actions.downloadWorkflowRunLogs({
          owner,
          repo,
          run_id: runId,
        });
        return data;
      } catch {
        return null;
      }
    },

    // Create or update a commit status check on the PR head SHA
    async setCommitStatus(owner, repo, sha, state, description, context) {
      const { data } = await octokit.repos.createCommitStatus({
        owner,
        repo,
        sha,
        state,          // 'pending' | 'success' | 'failure' | 'error'
        description,
        context,        // e.g. 'PR-AI-Agent / Summary'
      });
      return data;
    },

    // Create a PR review with inline comments (like Hyperspace bot)
    async createReview(owner, repo, prNumber, commitSha, comments, body, event = 'COMMENT') {
      const { data } = await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitSha,
        body,
        event,  // 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'
        comments: comments.map(c => ({
          path: c.path,
          line: c.line,
          side: c.side || 'RIGHT',
          body: c.body,
        })),
      });
      return data;
    },

    // List existing reviews on the PR
    async listReviews(owner, repo, prNumber) {
      const { data } = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
      });
      return data;
    },

    // Expose raw octokit for advanced use cases
    octokit,
  };
}
