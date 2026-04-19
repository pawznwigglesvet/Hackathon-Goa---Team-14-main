import { readFile } from 'fs/promises';

/**
 * Module 4: Compliance Pre-Check
 * Performs security, licensing, and privacy validation
 *
 * Two-pass approach:
 * 1. Deterministic checks (regex-based, fast)
 * 2. AI-powered checks (integrated into code review LLM)
 */

// Secret patterns (high-confidence regex)
const SECRET_PATTERNS = [
  {
    name: 'API Key',
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]([A-Za-z0-9_\-]{20,})['"]?/gi,
    severity: 'critical',
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
  },
  {
    name: 'Generic Secret',
    pattern: /(?:secret|password|token|key)\s*[=:]\s*['"]([^'"]{12,})['"]?/gi,
    severity: 'warning',
    exclude: ['process.env', 'config.', 'secrets.'],  // Likely safe patterns
  },
  {
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |DSA |EC )?PRIVATE KEY-----/g,
    severity: 'critical',
  },
  {
    name: 'Bearer Token',
    pattern: /bearer\s+[A-Za-z0-9\-._~+/]+/gi,
    severity: 'critical',
  },
  {
    name: 'GitHub Token',
    pattern: /ghp_[A-Za-z0-9]{36}/g,
    severity: 'critical',
  },
];

// Banned functions (security risks)
const BANNED_FUNCTIONS = [
  {
    name: 'eval()',
    pattern: /\beval\s*\(/g,
    reason: 'Code injection risk - can execute arbitrary code',
    severity: 'critical',
  },
  {
    name: 'Function() constructor',
    pattern: /new\s+Function\s*\(/g,
    reason: 'Code injection risk - similar to eval',
    severity: 'critical',
  },
  {
    name: 'innerHTML assignment',
    pattern: /\.innerHTML\s*=/g,
    reason: 'XSS risk - use textContent or sanitize HTML',
    severity: 'warning',
  },
  {
    name: 'dangerouslySetInnerHTML',
    pattern: /dangerouslySetInnerHTML\s*=/g,
    reason: 'XSS risk - ensure content is sanitized',
    severity: 'warning',
  },
  {
    name: 'exec() with user input',
    pattern: /\bexec\s*\(/g,
    reason: 'Command injection risk - validate/sanitize input',
    severity: 'critical',
  },
];

// License allowlist
const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  '0BSD',
  'Unlicense',
];

const WARNED_LICENSES = [
  'GPL-2.0',
  'GPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'AGPL-3.0',
];

/**
 * Run all compliance checks on changed files
 */
export async function runComplianceCheck(github, owner, repo, prNumber) {
  console.log(`[Compliance] Starting for PR #${prNumber}`);

  const changedFiles = await github.getChangedFiles(owner, repo, prNumber);

  const results = {
    secrets: [],
    bannedFunctions: [],
    licenses: [],
  };

  // Check each changed file
  for (const file of changedFiles) {
    if (file.status === 'removed') continue;  // Skip deleted files

    try {
      // Read file content (for local testing, in GH Actions this reads from checkout)
      let content = '';
      try {
        content = await readFile(file.filename, 'utf-8');
      } catch {
        // File might not exist locally, skip
        console.log(`[Compliance] Could not read ${file.filename}`);
        continue;
      }

      // Check for secrets
      const secretFindings = checkSecrets(file.filename, content);
      if (secretFindings.length > 0) {
        results.secrets.push({ file: file.filename, findings: secretFindings });
      }

      // Check for banned functions
      const bannedFindings = checkBannedFunctions(file.filename, content);
      if (bannedFindings.length > 0) {
        results.bannedFunctions.push({ file: file.filename, findings: bannedFindings });
      }

      // Check licenses if package.json
      if (file.filename.endsWith('package.json')) {
        const licenseFindings = await checkLicenses(content);
        if (licenseFindings.length > 0) {
          results.licenses.push({ file: file.filename, findings: licenseFindings });
        }
      }
    } catch (err) {
      console.log(`[Compliance] Error checking ${file.filename}: ${err.message}`);
    }
  }

  const totalIssues =
    results.secrets.length +
    results.bannedFunctions.length +
    results.licenses.length;

  console.log(`[Compliance] Found ${totalIssues} compliance issue(s)`);

  return results;
}

/**
 * Check for hardcoded secrets
 */
function checkSecrets(filename, content) {
  const findings = [];

  // Skip certain file types
  if (filename.match(/\.(md|txt|json|lock)$/)) return findings;

  for (const { name, pattern, severity, exclude } of SECRET_PATTERNS) {
    const matches = [...content.matchAll(pattern)];

    for (const match of matches) {
      const line = getLineNumber(content, match.index);
      const context = getContext(content, match.index);

      // Check exclusions (e.g., process.env.SECRET is safe)
      if (exclude && exclude.some(ex => context.includes(ex))) {
        continue;
      }

      findings.push({
        type: 'secret',
        name,
        severity,
        line,
        match: match[0].substring(0, 50), // Truncate for display
        context: context.substring(0, 100),
      });
    }
  }

  return findings;
}

/**
 * Check for banned functions
 */
function checkBannedFunctions(filename, content) {
  const findings = [];

  // Only check code files
  if (!filename.match(/\.(js|ts|jsx|tsx|mjs|cjs)$/)) return findings;

  for (const { name, pattern, reason, severity } of BANNED_FUNCTIONS) {
    const matches = [...content.matchAll(pattern)];

    for (const match of matches) {
      const line = getLineNumber(content, match.index);
      const context = getContext(content, match.index);

      findings.push({
        type: 'banned-function',
        name,
        reason,
        severity,
        line,
        match: match[0],
        context,
      });
    }
  }

  return findings;
}

/**
 * Check package.json for license compliance
 */
async function checkLicenses(content) {
  const findings = [];

  try {
    const pkg = JSON.parse(content);

    // Check dependencies
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const [name, version] of Object.entries(deps)) {
      // Note: In production, would use license-checker package or API
      // For hackathon, we'll check known problematic licenses
      if (name.includes('gpl') || version.includes('GPL')) {
        findings.push({
          type: 'license',
          name: `${name}@${version}`,
          license: 'GPL (assumed)',
          severity: 'warning',
          reason: 'GPL license may have copyleft restrictions',
        });
      }
    }
  } catch {
    // Invalid JSON, skip
  }

  return findings;
}

/**
 * Format compliance findings as inline comments
 */
export function formatComplianceComments(results) {
  const comments = [];

  // Secret findings
  for (const { file, findings } of results.secrets) {
    for (const finding of findings) {
      comments.push({
        path: file,
        line: finding.line,
        side: 'RIGHT',
        body: formatSecretComment(finding),
      });
    }
  }

  // Banned function findings
  for (const { file, findings } of results.bannedFunctions) {
    for (const finding of findings) {
      comments.push({
        path: file,
        line: finding.line,
        side: 'RIGHT',
        body: formatBannedFunctionComment(finding),
      });
    }
  }

  return comments;
}

/**
 * Format secret detection inline comment
 */
function formatSecretComment(finding) {
  const severityEmoji = finding.severity === 'critical' ? '🔴' : '⚠️';

  return `${severityEmoji} **Security**: Potential ${finding.name} Detected

**Problem**: Hardcoded secret or credential found in code
**Impact**: Credentials exposed in version control can be accessed by anyone with repo access
**Severity**: ${finding.severity}

**Fix**: Move credentials to environment variables or secret management

\`\`\`suggestion
// Use environment variables instead:
const apiKey = process.env.API_KEY;
\`\`\`

---
🔐 Detected by compliance pre-check`;
}

/**
 * Format banned function inline comment
 */
function formatBannedFunctionComment(finding) {
  const severityEmoji = finding.severity === 'critical' ? '🔴' : '⚠️';

  return `${severityEmoji} **Security**: Banned Function \`${finding.name}\`

**Problem**: ${finding.reason}
**Impact**: Security vulnerability - ${finding.name} can lead to code injection attacks
**Severity**: ${finding.severity}

**Fix**: Use safer alternatives:
${getFix(finding.name)}

---
🔐 Detected by compliance pre-check`;
}

/**
 * Get recommended fix for banned function
 */
function getFix(functionName) {
  const fixes = {
    'eval()': '- Use JSON.parse() for JSON data\n- Use function calls with known parameters\n- Avoid dynamic code execution',
    'Function() constructor': '- Use regular functions or arrow functions\n- Avoid dynamic code generation',
    'innerHTML assignment': '- Use textContent for plain text\n- Use DOM methods (createElement, appendChild)\n- Sanitize HTML with DOMPurify',
    'dangerouslySetInnerHTML': '- Use React components instead\n- Sanitize HTML with DOMPurify before use',
    'exec() with user input': '- Validate and sanitize all input\n- Use allowlists for allowed commands\n- Consider spawn() with array arguments',
  };

  return fixes[functionName] || '- Review security implications\n- Use safer alternatives';
}

/**
 * Generate compliance summary for main comment
 */
export function generateComplianceSummary(results) {
  const totalSecrets = results.secrets.reduce((sum, f) => sum + f.findings.length, 0);
  const totalBanned = results.bannedFunctions.reduce((sum, f) => sum + f.findings.length, 0);
  const totalLicenses = results.licenses.reduce((sum, f) => sum + f.findings.length, 0);

  if (totalSecrets === 0 && totalBanned === 0 && totalLicenses === 0) {
    return null;
  }

  let summary = `## 🔐 Compliance Pre-Check Report\n\n`;

  summary += `| Category | Status | Count |\n`;
  summary += `|----------|--------|-------|\n`;
  summary += `| 🔑 Secrets | ${totalSecrets > 0 ? '❌ **FAIL**' : '✅ PASS'} | ${totalSecrets} |\n`;
  summary += `| ⚠️ Banned Functions | ${totalBanned > 0 ? '❌ **FAIL**' : '✅ PASS'} | ${totalBanned} |\n`;
  summary += `| 📋 Licenses | ${totalLicenses > 0 ? '⚠️ **WARN**' : '✅ PASS'} | ${totalLicenses} |\n`;

  if (totalSecrets > 0) {
    summary += `\n### 🔑 Secret Detection\n\n`;
    for (const { file, findings } of results.secrets) {
      summary += `**${file}**:\n`;
      for (const finding of findings) {
        summary += `- Line ${finding.line}: ${finding.name} detected\n`;
      }
    }
  }

  if (totalBanned > 0) {
    summary += `\n### ⚠️ Banned Functions\n\n`;
    for (const { file, findings } of results.bannedFunctions) {
      summary += `**${file}**:\n`;
      for (const finding of findings) {
        summary += `- Line ${finding.line}: \`${finding.name}\` - ${finding.reason}\n`;
      }
    }
  }

  if (totalLicenses > 0) {
    summary += `\n### 📋 License Warnings\n\n`;
    for (const { file, findings } of results.licenses) {
      for (const finding of findings) {
        summary += `- ${finding.name}: ${finding.reason}\n`;
      }
    }
  }

  summary += `\n**⚠️ These compliance issues must be addressed before merging.**\n`;
  summary += `See inline comments for detailed fixes.\n`;

  return summary;
}

// Helper functions

function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

function getContext(content, index, contextLength = 100) {
  const start = Math.max(0, index - contextLength / 2);
  const end = Math.min(content.length, index + contextLength / 2);
  return content.substring(start, end);
}
