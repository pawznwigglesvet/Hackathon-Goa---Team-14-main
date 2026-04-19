import { createGitHubClient } from '../github/client.js';
import { createLLMClient, validateLLMConfig } from '../llm/client-factory.js';
import { runSummarizer } from './summarizer.js';
import { runReviewerRecommender } from './reviewer.js';
import { runCodeReviewer } from './code-reviewer.js';
import { runCITriage } from './ci-triage.js';

async function main() {
  const config = loadConfig();
  console.log(`[Agent] PR #${config.prNumber} in ${config.owner}/${config.repo}`);

  // Validate LLM configuration before creating client
  validateLLMConfig();

  const github = createGitHubClient(config.githubToken);
  const llm = createLLMClient();

  console.log('[Agent] Connecting to LLM provider...');
  await llm.connect();

  const results = { summary: null, reviewers: null, codeReview: null, ciTriage: null, errors: [] };

  try {
    console.log('[Agent] ========================================');
    console.log('[Agent] Starting 4-module PR analysis workflow');
    console.log('[Agent] ========================================\n');

    // Module 1: PR Auto-Summarizer
    try {
      console.log('[Agent] Module 1: PR Summarizer - STARTING');
      results.summary = await runSummarizer(
        github,
        llm,
        config.owner,
        config.repo,
        config.prNumber
      );
      console.log('[Agent] Module 1: PR Summarizer - ✅ DONE');
      console.log('[Agent] → Posted/Updated comment with marker: PR-AI-AGENT:SUMMARY\n');
    } catch (err) {
      console.error('[Agent] Module 1: PR Summarizer - ❌ FAILED', err.message);
      results.errors.push(`Summarizer: ${err.message}`);
    }

    // Module 2: Code Reviewer (run before Reviewer Recommender to get inline data)
    try {
      console.log('[Agent] Module 2: Code Reviewer - STARTING');
      results.codeReview = await runCodeReviewer(
        github,
        llm,
        config.owner,
        config.repo,
        config.prNumber
      );
      console.log('[Agent] Module 2: Code Reviewer - ✅ DONE');
      console.log('[Agent] → Posted/Updated comment with marker: PR-AI-AGENT:CODE-REVIEW\n');
    } catch (err) {
      console.error('[Agent] Module 2: Code Reviewer - ❌ FAILED', err.message);
      results.errors.push(`Code Reviewer: ${err.message}`);
    }

    // Module 3: Reviewer Recommender (with code review data for confidence)
    try {
      console.log('[Agent] Module 3: Reviewer Recommender - STARTING');
      results.reviewers = await runReviewerRecommender(
        github,
        llm,
        config.owner,
        config.repo,
        config.prNumber,
        results.codeReview // Pass code review data for confidence calculation
      );
      console.log('[Agent] Module 3: Reviewer Recommender - ✅ DONE');
      console.log('[Agent] → Posted/Updated comment with marker: PR-AI-AGENT:REVIEWER\n');
    } catch (err) {
      console.error('[Agent] Module 3: Reviewer Recommender - ❌ FAILED', err.message);
      results.errors.push(`Reviewer: ${err.message}`);
    }

    // Module 4: CI Failure Triage (optional - only runs if CI_FAILED or RUN_CI_TRIAGE is set)
    if (process.env.CI_FAILED === 'true' || process.env.RUN_CI_TRIAGE === 'true') {
      try {
        console.log('[Agent] Module 4: CI Failure Triage - STARTING');

        // Get PR details to fetch check runs
        const prDetails = await github.getPRDetails(config.owner, config.repo, config.prNumber);
        const checkRuns = await github.getCheckRuns(config.owner, config.repo, prDetails.head.sha);

        results.ciTriage = await runCITriage(
          github,
          llm,
          config.owner,
          config.repo,
          config.prNumber,
          checkRuns
        );

        if (results.ciTriage) {
          console.log('[Agent] Module 4: CI Failure Triage - ✅ DONE');
          console.log('[Agent] → Posted/Updated comment with marker: PR-AI-AGENT:CI-TRIAGE\n');
        } else {
          console.log('[Agent] Module 4: CI Failure Triage - ⏭️ SKIPPED (no failures)\n');
        }
      } catch (err) {
        console.error('[Agent] Module 4: CI Failure Triage - ❌ FAILED', err.message);
        results.errors.push(`CI Triage: ${err.message}`);
      }
    }

    console.log('[Agent] ========================================');
    if (results.errors.length > 0) {
      console.error('[Agent] ❌ Completed with errors:', results.errors);
      console.log('[Agent] ========================================');
      process.exit(1);
    }

    const completedModules = [
      results.summary && 'Summary',
      results.reviewers && 'Reviewers',
      results.codeReview && 'Code Review',
      results.ciTriage && 'CI Triage',
    ].filter(Boolean);

    console.log(`[Agent] ✅ ${completedModules.length} module(s) completed successfully`);
    console.log(`[Agent] → Modules: ${completedModules.join(', ')}`);
    console.log('[Agent] ========================================');
  } finally {
    if (llm.disconnect) {
      await llm.disconnect();
    }
  }
}

function loadConfig() {
  const required = ['GITHUB_TOKEN', 'PR_NUMBER', 'REPO_OWNER', 'REPO_NAME'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    githubToken: process.env.GITHUB_TOKEN,
    prNumber: parseInt(process.env.PR_NUMBER, 10),
    owner: process.env.REPO_OWNER,
    repo: process.env.REPO_NAME,
  };
}

main().catch((err) => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});
