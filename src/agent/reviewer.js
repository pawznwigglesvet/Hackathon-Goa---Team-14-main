import { buildReviewerPrompt } from '../llm/prompts.js';
import { calculatePRConfidence } from './confidence.js';

// Marker embedded in reviewer comments
const REVIEWER_MARKER = '<!-- PR-AI-AGENT:REVIEWER -->';

// Module 2: Reviewer Recommender
// Analyzes changed files and suggests appropriate reviewers
export async function runReviewerRecommender(github, llm, owner, repo, prNumber, codeReviewData = null) {
  console.log(`[Reviewer] Starting for PR #${prNumber}`);

  // 1. Get changed files and PR details
  const [changedFiles, prDetails] = await Promise.all([
    github.getChangedFiles(owner, repo, prNumber),
    github.getPRDetails(owner, repo, prNumber),
  ]);

  console.log(`[Reviewer] Analyzing ${changedFiles.length} changed files`);

  // 2. Get CODEOWNERS (if exists)
  let codeowners = null;
  try {
    const { data } = await github.octokit.repos.getContent({
      owner,
      repo,
      path: '.github/CODEOWNERS'
    });
    codeowners = Buffer.from(data.content, 'base64').toString();
    console.log('[Reviewer] Found CODEOWNERS file');
  } catch {
    try {
      // Try root CODEOWNERS
      const { data } = await github.octokit.repos.getContent({
        owner,
        repo,
        path: 'CODEOWNERS'
      });
      codeowners = Buffer.from(data.content, 'base64').toString();
      console.log('[Reviewer] Found CODEOWNERS file (root)');
    } catch {
      console.log('[Reviewer] No CODEOWNERS file found');
    }
  }

  // 3. Get top contributors for each file (limit to 10 files for performance)
  const contributors = {};
  const filesToAnalyze = changedFiles.slice(0, 10);

  for (const file of filesToAnalyze) {
    try {
      const topContribs = await github.getTopContributors(owner, repo, file.filename, 3);
      if (topContribs.length > 0) {
        contributors[file.filename] = topContribs;
      }
    } catch (err) {
      console.log(`[Reviewer] Could not get contributors for ${file.filename}`);
    }
  }

  console.log(`[Reviewer] Collected contributor data for ${Object.keys(contributors).length} files`);

  // 4. Use LLM to suggest reviewers
  const { system, user } = buildReviewerPrompt(changedFiles, codeowners, contributors);

  const maxTokens = 768;
  let suggestion;

  // Get LLM response
  try {
    const response = await llm.complete(system, user, maxTokens);
    suggestion = typeof response === 'object' && response.text ? response.text : response;
  } catch (error) {
    console.error('[Reviewer] Error during LLM call:', error);
    throw error;
  }

  console.log('[Reviewer] Generated reviewer suggestions');

  // 5. Parse suggested reviewers from LLM response
  const reviewers = extractReviewers(suggestion);
  console.log(`[Reviewer] Extracted reviewers: ${reviewers.join(', ') || 'none'}`);

  // 5.5 Calculate PR confidence score with enhanced inline review data
  let confidence = null;
  try {
    const prAuthor = prDetails.user.login; // Get PR author from details

    // Prepare code review data for confidence calculation
    const codeReviewForConfidence = codeReviewData ? {
      inlineComments: codeReviewData.inlineComments || 0,
      syntaxErrors: codeReviewData.syntaxErrors || 0,
      issues: codeReviewData.issues || [],
      fileIssues: codeReviewData.fileIssues || {},
    } : null;

    // Prepare compliance data
    const complianceForConfidence = codeReviewData?.compliance || null;

    confidence = await calculatePRConfidence(
      github,
      suggestion, // Reviewer text with issues/suggestions
      prAuthor,
      owner,
      repo,
      {
        codeReview: codeReviewForConfidence,
        compliance: complianceForConfidence,
      }
    );

    if (confidence) {
      console.log(`[Reviewer] Enhanced PR Confidence score: ${confidence.score}%`);
      console.log(`[Reviewer] - Code Quality: ${confidence.breakdown.codeQuality?.score || 0}%`);
      console.log(`[Reviewer] - User Trust: ${confidence.breakdown.userTrust?.score || 0}%`);
      console.log(`[Reviewer] - Code Review: ${confidence.breakdown.codeReview?.score || 100}%`);
      console.log(`[Reviewer] - Compliance: ${confidence.breakdown.compliance?.score || 100}%`);
    }
  } catch (error) {
    console.warn('[Reviewer] Could not calculate PR confidence:', error.message);
  }

  // 6. Request reviewers via GitHub API
  if (reviewers.length > 0) {
    try {
      await github.requestReviewers(owner, repo, prNumber, reviewers);
      console.log(`[Reviewer] Requested reviewers: ${reviewers.join(', ')}`);
    } catch (err) {
      console.log(`[Reviewer] Could not request reviewers: ${err.message}`);
      // Continue to post comment even if request fails
    }
  }

  // 7. Post or update explanation comment
  const commentBody = formatReviewerComment(suggestion, changedFiles, reviewers, confidence);

  const existing = await github.findAgentComment(owner, repo, prNumber, REVIEWER_MARKER);
  if (existing) {
    await github.updateComment(owner, repo, existing.id, commentBody);
    console.log(`[Reviewer] Updated existing comment #${existing.id}`);
  } else {
    await github.postComment(owner, repo, prNumber, commentBody);
    console.log('[Reviewer] Posted new reviewer recommendation');
  }

  return { suggestion, reviewers };
}

// Extract @username mentions from LLM response
function extractReviewers(llmResponse) {
  // Match @username patterns
  const matches = llmResponse.match(/@([\w-]+)/g) || [];

  // Remove @ symbol and deduplicate
  const usernames = matches.map(m => m.slice(1));
  const unique = [...new Set(usernames)];

  // Limit to 5 reviewers max
  return unique.slice(0, 5);
}

// Format the reviewer comment
function formatReviewerComment(suggestion, changedFiles, reviewers, confidence = null) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  const fileCategories = categorizeFiles(changedFiles);
  const categoryList = Object.entries(fileCategories)
    .map(([cat, files]) => `- **${cat}**: ${files.length} file(s)`)
    .join('\n');

  // Build comment with optional confidence badge
  let comment = `${REVIEWER_MARKER}
# 👥 Recommended Reviewers
${confidence && confidence.badge ? `\n${confidence.badge}\n` : ''}
${suggestion}

---

### 📊 Change Analysis

${categoryList}

**Total files changed:** ${changedFiles.length}
**Suggested reviewers:** ${reviewers.length > 0 ? reviewers.map(r => `@${r}`).join(', ') : 'See recommendations above'}`;

  // Add confidence details if available
  if (confidence && confidence.details) {
    comment += `\n\n---\n\n${confidence.details}`;
  }

  comment += `\n\n---\n\n<sub>🤖 Generated by SAP-Copilot-Agent · ${timestamp} · Module 2: Reviewer Recommender</sub>`;

  return comment;
}

// Categorize changed files by type
function categorizeFiles(changedFiles) {
  const categories = {
    'CAP/CDS Models': [],
    'Service Logic': [],
    'UI/Fiori': [],
    'Configuration': [],
    'Tests': [],
    'Documentation': [],
    'Other': []
  };

  for (const file of changedFiles) {
    const path = file.filename;

    if (path.endsWith('.cds')) {
      if (path.includes('db/')) {
        categories['CAP/CDS Models'].push(path);
      } else if (path.includes('srv/')) {
        categories['Service Logic'].push(path);
      } else {
        categories['CAP/CDS Models'].push(path);
      }
    } else if (path.match(/\.(js|ts)$/) && path.includes('srv/')) {
      categories['Service Logic'].push(path);
    } else if (path.match(/\.(xml|json)$/) && path.includes('app/')) {
      categories['UI/Fiori'].push(path);
    } else if (path.match(/\.(yaml|yml|json)$/) && (path.includes('deployment/') || path.includes('.github/'))) {
      categories['Configuration'].push(path);
    } else if (path.includes('test') || path.endsWith('.test.js') || path.endsWith('.spec.js')) {
      categories['Tests'].push(path);
    } else if (path.endsWith('.md') || path.endsWith('.txt')) {
      categories['Documentation'].push(path);
    } else {
      categories['Other'].push(path);
    }
  }

  // Remove empty categories
  return Object.fromEntries(
    Object.entries(categories).filter(([_, files]) => files.length > 0)
  );
}
