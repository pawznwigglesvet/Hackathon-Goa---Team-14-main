/**
 * Merge Conflict Resolver Agent
 * 
 * A standalone agent that detects merge conflicts in PRs and provides
 * AI-powered resolution suggestions.
 * 
 * Features:
 * - Detects when a PR has merge conflicts
 * - Analyzes conflicting files and both versions
 * - Uses LLM to suggest resolutions
 * - Posts detailed resolution suggestions as PR comment
 * - Supports human approval workflow for auto-resolution
 */

import { createGitHubClient } from '../github/client.js';
import { createLLMClient, validateLLMConfig } from '../llm/client-factory.js';
import { runConflictResolver } from './resolver.js';

async function main() {
  const config = loadConfig();
  console.log(`[Conflict Resolver] PR #${config.prNumber} in ${config.owner}/${config.repo}`);

  // Validate LLM configuration before creating client
  validateLLMConfig();

  const github = createGitHubClient(config.githubToken);
  const llm = createLLMClient();

  console.log('[Conflict Resolver] Connecting to LLM provider...');
  await llm.connect();

  try {
    console.log('[Conflict Resolver] ========================================');
    console.log('[Conflict Resolver] Starting Merge Conflict Analysis');
    console.log('[Conflict Resolver] ========================================\n');

    const result = await runConflictResolver(
      github,
      llm,
      config.owner,
      config.repo,
      config.prNumber
    );

    if (result.hasConflicts) {
      console.log('[Conflict Resolver] ✅ Analysis complete');
      console.log(`[Conflict Resolver] → Found ${result.conflictCount} conflicting file(s)`);
      console.log('[Conflict Resolver] → Posted resolution suggestions to PR');
    } else {
      console.log('[Conflict Resolver] ✅ No merge conflicts detected');
      console.log('[Conflict Resolver] → PR is ready to merge');
    }

    console.log('[Conflict Resolver] ========================================');
  } catch (err) {
    console.error('[Conflict Resolver] ❌ FAILED:', err.message);
    console.error(err);
    process.exit(1);
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
  console.error('[Conflict Resolver] Fatal error:', err);
  process.exit(1);
});