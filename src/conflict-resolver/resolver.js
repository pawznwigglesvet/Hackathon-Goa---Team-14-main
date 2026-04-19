/**
 * Merge Conflict Resolver Module
 * 
 * Detects merge conflicts in PRs and uses LLM to suggest resolutions.
 */

import { buildConflictResolutionPrompt } from './prompts.js';

// Marker for conflict resolver comments
const CONFLICT_MARKER = '<!-- PR-AI-AGENT:CONFLICT-RESOLVER -->';
const APPROVAL_MARKER = '<!-- PR-AI-AGENT:CONFLICT-APPROVAL -->';

/**
 * Main conflict resolver function
 */
export async function runConflictResolver(github, llm, owner, repo, prNumber) {
  console.log(`[Conflict Resolver] Checking PR #${prNumber} for merge conflicts...`);

  // Step 1: Get PR details and check mergeable status
  const prDetails = await github.getPRDetails(owner, repo, prNumber);
  
  console.log(`[Conflict Resolver] PR mergeable: ${prDetails.mergeable}`);
  console.log(`[Conflict Resolver] PR mergeable_state: ${prDetails.mergeable_state}`);

  // If PR is mergeable, no conflicts to resolve
  if (prDetails.mergeable === true) {
    // Post or update comment indicating no conflicts
    await postNoConflictsComment(github, owner, repo, prNumber, prDetails);
    return { hasConflicts: false, conflictCount: 0 };
  }

  // If mergeable is null, GitHub is still computing - wait and retry
  if (prDetails.mergeable === null) {
    console.log('[Conflict Resolver] GitHub is computing mergeable status, waiting...');
    await sleep(3000);
    const retryDetails = await github.getPRDetails(owner, repo, prNumber);
    if (retryDetails.mergeable === true) {
      await postNoConflictsComment(github, owner, repo, prNumber, retryDetails);
      return { hasConflicts: false, conflictCount: 0 };
    }
    if (retryDetails.mergeable === null) {
      console.log('[Conflict Resolver] Mergeable status still computing, proceeding with conflict check...');
    }
  }

  // Step 2: Get the conflicting files by attempting a merge simulation
  console.log('[Conflict Resolver] Detecting conflicting files...');
  const conflicts = await detectConflicts(github, owner, repo, prDetails);

  if (conflicts.length === 0) {
    console.log('[Conflict Resolver] No specific conflicts detected (may be other merge issues)');
    await postNoConflictsComment(github, owner, repo, prNumber, prDetails);
    return { hasConflicts: false, conflictCount: 0 };
  }

  console.log(`[Conflict Resolver] Found ${conflicts.length} conflicting file(s)`);

  // Step 3: For each conflict, get both versions and analyze
  const resolutions = [];
  for (const conflict of conflicts) {
    console.log(`[Conflict Resolver] Analyzing conflict in: ${conflict.filename}`);
    
    try {
      // Get file content from both branches
      const baseContent = await getFileContent(github, owner, repo, prDetails.base.ref, conflict.filename);
      const headContent = await getFileContent(github, owner, repo, prDetails.head.ref, conflict.filename);
      
      // Use LLM to suggest resolution
      const { system, user } = buildConflictResolutionPrompt(
        conflict.filename,
        baseContent,
        headContent,
        prDetails.base.ref,
        prDetails.head.ref,
        conflict.conflictMarkers
      );
      
      const suggestion = await llm.complete(system, user, 2048);
      
      resolutions.push({
        filename: conflict.filename,
        baseRef: prDetails.base.ref,
        headRef: prDetails.head.ref,
        baseContent,
        headContent,
        suggestion,
        conflictMarkers: conflict.conflictMarkers,
      });
    } catch (err) {
      console.error(`[Conflict Resolver] Error analyzing ${conflict.filename}:`, err.message);
      resolutions.push({
        filename: conflict.filename,
        error: err.message,
      });
    }
  }

  // Step 4: Post resolution suggestions as PR comment
  const commentBody = formatResolutionComment(resolutions, prDetails, prNumber);
  
  const existing = await github.findAgentComment(owner, repo, prNumber, CONFLICT_MARKER);
  if (existing) {
    await github.updateComment(owner, repo, existing.id, commentBody);
    console.log(`[Conflict Resolver] Updated existing comment #${existing.id}`);
  } else {
    await github.postComment(owner, repo, prNumber, commentBody);
    console.log('[Conflict Resolver] Posted new resolution suggestions');
  }

  return {
    hasConflicts: true,
    conflictCount: conflicts.length,
    resolutions,
  };
}

/**
 * Detect conflicting files by comparing branches
 */
async function detectConflicts(github, owner, repo, prDetails) {
  const conflicts = [];
  
  try {
    // Get the list of files changed in the PR
    const changedFiles = await github.getChangedFiles(owner, repo, prDetails.number);
    
    // For each changed file, check if it was also modified in base branch since merge-base
    // This is a simplified detection - real conflicts need merge simulation
    for (const file of changedFiles) {
      // Check if file has conflict markers in the patch (if available)
      if (file.patch && (
        file.patch.includes('<<<<<<<') ||
        file.patch.includes('=======') ||
        file.patch.includes('>>>>>>>')
      )) {
        conflicts.push({
          filename: file.filename,
          status: file.status,
          conflictMarkers: extractConflictMarkers(file.patch),
        });
      }
    }

    // If no conflicts found in patches, try to detect via merge-base comparison
    if (conflicts.length === 0 && prDetails.mergeable === false) {
      // Get commits from both branches to find potentially conflicting files
      const comparison = await github.octokit.repos.compareCommits({
        owner,
        repo,
        base: prDetails.base.ref,
        head: prDetails.head.ref,
      });

      // Files that were modified in both branches are potential conflicts
      for (const file of comparison.data.files || []) {
        if (file.status === 'modified' || file.status === 'changed') {
          // Check if this file was also modified in base since the merge-base
          try {
            const baseCommits = await github.octokit.repos.listCommits({
              owner,
              repo,
              sha: prDetails.base.ref,
              path: file.filename,
              per_page: 5,
            });
            
            if (baseCommits.data.length > 0) {
              // File was modified in base branch - potential conflict
              conflicts.push({
                filename: file.filename,
                status: file.status,
                conflictMarkers: null, // No markers available without actual merge
              });
            }
          } catch {
            // Ignore errors for individual files
          }
        }
      }
    }
  } catch (err) {
    console.error('[Conflict Resolver] Error detecting conflicts:', err.message);
  }

  return conflicts;
}

/**
 * Extract conflict markers from a patch
 */
function extractConflictMarkers(patch) {
  if (!patch) return null;
  
  const lines = patch.split('\n');
  const markers = [];
  let inConflict = false;
  let currentConflict = [];

  for (const line of lines) {
    if (line.includes('<<<<<<<')) {
      inConflict = true;
      currentConflict = [line];
    } else if (inConflict) {
      currentConflict.push(line);
      if (line.includes('>>>>>>>')) {
        inConflict = false;
        markers.push(currentConflict.join('\n'));
        currentConflict = [];
      }
    }
  }

  return markers.length > 0 ? markers : null;
}

/**
 * Get file content from a specific branch/ref
 */
async function getFileContent(github, owner, repo, ref, path) {
  try {
    const { data } = await github.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (err) {
    if (err.status === 404) {
      return null; // File doesn't exist in this branch
    }
    throw err;
  }
}

/**
 * Format the resolution suggestions as a PR comment
 */
function formatResolutionComment(resolutions, prDetails, prNumber) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  const successfulResolutions = resolutions.filter(r => !r.error);
  const failedResolutions = resolutions.filter(r => r.error);

  let comment = `${CONFLICT_MARKER}
## 🔀 Merge Conflict Resolution Suggestions

This PR has **${resolutions.length} conflicting file(s)** that need resolution before merging.

| Branch | Reference |
|--------|-----------|
| **Base** | \`${prDetails.base.ref}\` |
| **Head** | \`${prDetails.head.ref}\` |

---

`;

  // Add resolution for each file
  for (let i = 0; i < successfulResolutions.length; i++) {
    const resolution = successfulResolutions[i];
    comment += `### ${i + 1}. \`${resolution.filename}\`

${resolution.suggestion}

---

`;
  }

  // Add failed resolutions
  if (failedResolutions.length > 0) {
    comment += `### ⚠️ Files that could not be analyzed

`;
    for (const resolution of failedResolutions) {
      comment += `- \`${resolution.filename}\`: ${resolution.error}\n`;
    }
    comment += '\n---\n\n';
  }

  // Add approval workflow instructions
  comment += `## 🤖 Auto-Resolution (Optional)

If you'd like me to automatically apply these suggested resolutions, reply with:

\`\`\`
/resolve-conflicts approve
\`\`\`

**Note**: This will create a new commit on your branch with the resolved conflicts. Please review the suggestions carefully before approving.

Alternatively, you can resolve the conflicts manually using:
\`\`\`bash
git checkout ${prDetails.head.ref}
git merge ${prDetails.base.ref}
# Resolve conflicts manually
git add .
git commit -m "Resolve merge conflicts"
git push
\`\`\`

---

<sub>Generated by PR-AI-Agent (Conflict Resolver) · ${timestamp} · PR #${prNumber}</sub>`;

  return comment;
}

/**
 * Post a comment indicating no conflicts
 */
async function postNoConflictsComment(github, owner, repo, prNumber, prDetails) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  
  const commentBody = `${CONFLICT_MARKER}
## ✅ No Merge Conflicts Detected

This PR has no merge conflicts and is ready to be merged.

| Status | Value |
|--------|-------|
| **Mergeable** | ${prDetails.mergeable ? '✅ Yes' : '❓ Unknown'} |
| **Mergeable State** | \`${prDetails.mergeable_state || 'unknown'}\` |
| **Base Branch** | \`${prDetails.base.ref}\` |
| **Head Branch** | \`${prDetails.head.ref}\` |

---

<sub>Generated by PR-AI-Agent (Conflict Resolver) · ${timestamp} · PR #${prNumber}</sub>`;

  const existing = await github.findAgentComment(owner, repo, prNumber, CONFLICT_MARKER);
  if (existing) {
    await github.updateComment(owner, repo, existing.id, commentBody);
    console.log(`[Conflict Resolver] Updated existing comment #${existing.id}`);
  } else {
    await github.postComment(owner, repo, prNumber, commentBody);
    console.log('[Conflict Resolver] Posted no-conflicts comment');
  }
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}