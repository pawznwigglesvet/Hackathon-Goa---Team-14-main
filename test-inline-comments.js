#!/usr/bin/env node

/**
 * Test script to verify inline code review comments work
 * This simulates what the code reviewer does with inline comments
 */

import { createGitHubClient } from './src/github/client.js';

const owner = process.env.REPO_OWNER || 'AI-Innovation-Camp-CLI-Hackathon-2026';
const repo = process.env.REPO_NAME || 'Hackathon-Goa---Team-14';
const prNumber = parseInt(process.env.PR_NUMBER || '5', 10);
const token = process.env.GITHUB_TOKEN;

if (!token) {
  console.error('❌ GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

async function main() {
  console.log(`Testing inline comments on PR #${prNumber}...\n`);

  const github = createGitHubClient(token);

  try {
    // 1. Get PR details
    const prDetails = await github.getPRDetails(owner, repo, prNumber);
    console.log(`✅ PR Found: "${prDetails.title}"`);
    console.log(`   Author: ${prDetails.user.login}`);
    console.log(`   Commit: ${prDetails.head.sha.slice(0, 7)}\n`);

    // 2. Get changed files
    const changedFiles = await github.getChangedFiles(owner, repo, prNumber);
    console.log(`✅ Changed Files: ${changedFiles.length}`);
    changedFiles.forEach(f => {
      console.log(`   - ${f.filename} (+${f.additions} -${f.deletions})`);
    });
    console.log('');

    // 3. Create a test inline comment
    const testFile = changedFiles[0];
    if (!testFile) {
      console.log('⚠️  No files to comment on');
      return;
    }

    // Find a line to comment on (first added line)
    const patch = testFile.patch || '';
    const addedLines = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'));

    if (addedLines.length === 0) {
      console.log('⚠️  No added lines found to comment on');
      return;
    }

    // Calculate line number (approximate - real implementation parses patch headers)
    const testLine = 1; // Simplified for test

    console.log(`Creating test review with inline comment on ${testFile.filename}...\n`);

    const inlineComments = [
      {
        path: testFile.filename,
        line: testLine,
        side: 'RIGHT',
        body: `🔍 **Test Inline Comment**\n\nThis is a test comment to verify that inline code review comments work like Hyperspace bot!\n\n- ✅ File: \`${testFile.filename}\`\n- ✅ Line: ${testLine}\n- ✅ Posted via GitHub Review API`,
      },
    ];

    await github.createReview(
      owner,
      repo,
      prNumber,
      prDetails.head.sha,
      inlineComments,
      '🧪 **Test Review** - Testing inline comment functionality',
      'COMMENT'
    );

    console.log('✅ Success! Test inline comment posted');
    console.log('   Check the PR "Changes" tab to see it\n');

    // 4. List all reviews to confirm
    const reviews = await github.listReviews(owner, repo, prNumber);
    console.log(`✅ Total Reviews on PR: ${reviews.length}`);
    reviews.slice(-3).forEach(r => {
      console.log(`   - ${r.user.login}: ${r.state} (${r.body?.slice(0, 50) || 'no body'}...)`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('   GitHub API Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
