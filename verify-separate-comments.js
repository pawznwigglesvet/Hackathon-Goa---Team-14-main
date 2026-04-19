#!/usr/bin/env node

/**
 * Verify that all 3 modules post separate comments
 * This checks that the markers are unique and comments don't overlap
 */

import { createGitHubClient } from './src/github/client.js';

const MARKERS = {
  summary: '<!-- PR-AI-AGENT:SUMMARY -->',
  reviewer: '<!-- PR-AI-AGENT:REVIEWER -->',
  codeReview: '<!-- PR-AI-AGENT:CODE-REVIEW -->',
};

async function main() {
  console.log('🔍 Verifying PR Agent Comment Separation\n');

  // Check environment
  const required = ['GITHUB_TOKEN', 'PR_NUMBER', 'REPO_OWNER', 'REPO_NAME'];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ Missing environment variable: ${key}`);
      console.log('\nSet these variables:');
      console.log('export GITHUB_TOKEN=your-token');
      console.log('export PR_NUMBER=5');
      console.log('export REPO_OWNER=your-org');
      console.log('export REPO_NAME=your-repo');
      process.exit(1);
    }
  }

  const config = {
    token: process.env.GITHUB_TOKEN,
    prNumber: parseInt(process.env.PR_NUMBER, 10),
    owner: process.env.REPO_OWNER,
    repo: process.env.REPO_NAME,
  };

  console.log(`Checking PR #${config.prNumber} in ${config.owner}/${config.repo}\n`);

  const github = createGitHubClient(config.token);

  try {
    // Find all comments on the PR
    const allComments = await github.octokit.paginate(github.octokit.issues.listComments, {
      owner: config.owner,
      repo: config.repo,
      issue_number: config.prNumber,
      per_page: 100,
    });

    console.log(`Found ${allComments.length} total comment(s) on PR\n`);

    // Check for each agent comment
    const agentComments = {
      summary: allComments.find(c => c.body.includes(MARKERS.summary)),
      reviewer: allComments.find(c => c.body.includes(MARKERS.reviewer)),
      codeReview: allComments.find(c => c.body.includes(MARKERS.codeReview)),
    };

    console.log('='.repeat(60));
    console.log('Agent Comment Status:');
    console.log('='.repeat(60));

    // Check Summary
    if (agentComments.summary) {
      console.log('✅ Summary Comment Found');
      console.log(`   ID: ${agentComments.summary.id}`);
      console.log(`   Marker: ${MARKERS.summary}`);
      console.log(`   Title: ${agentComments.summary.body.split('\n')[1] || 'N/A'}`);
    } else {
      console.log('❌ Summary Comment NOT Found');
      console.log(`   Expected marker: ${MARKERS.summary}`);
    }

    console.log('');

    // Check Reviewer
    if (agentComments.reviewer) {
      console.log('✅ Reviewer Comment Found');
      console.log(`   ID: ${agentComments.reviewer.id}`);
      console.log(`   Marker: ${MARKERS.reviewer}`);
      console.log(`   Title: ${agentComments.reviewer.body.split('\n')[1] || 'N/A'}`);
    } else {
      console.log('❌ Reviewer Comment NOT Found');
      console.log(`   Expected marker: ${MARKERS.reviewer}`);
    }

    console.log('');

    // Check Code Review
    if (agentComments.codeReview) {
      console.log('✅ Code Review Comment Found');
      console.log(`   ID: ${agentComments.codeReview.id}`);
      console.log(`   Marker: ${MARKERS.codeReview}`);
      console.log(`   Title: ${agentComments.codeReview.body.split('\n')[1] || 'N/A'}`);
    } else {
      console.log('❌ Code Review Comment NOT Found');
      console.log(`   Expected marker: ${MARKERS.codeReview}`);
    }

    console.log('='.repeat(60));

    // Verify they're all different comments
    const commentIds = [
      agentComments.summary?.id,
      agentComments.reviewer?.id,
      agentComments.codeReview?.id,
    ].filter(Boolean);

    const uniqueIds = new Set(commentIds);

    if (commentIds.length === 3 && uniqueIds.size === 3) {
      console.log('\n✅ SUCCESS: All 3 comments are separate and unique!');
      console.log(`   Comment IDs: ${Array.from(uniqueIds).join(', ')}`);
    } else if (commentIds.length > 0 && uniqueIds.size < commentIds.length) {
      console.log('\n⚠️  WARNING: Some comments have the same ID (overlapping!)');
      console.log(`   Found ${commentIds.length} comments but only ${uniqueIds.size} unique IDs`);
      console.log('   This means some modules are updating the same comment');
    } else {
      console.log('\n⚠️  Not all agent comments found yet');
      console.log(`   Found ${commentIds.length}/3 comments`);
      console.log('   The agent may not have run yet, or some modules failed');
    }

    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
