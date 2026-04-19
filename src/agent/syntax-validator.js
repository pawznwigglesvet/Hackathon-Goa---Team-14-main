import { spawn } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execFile = promisify(spawn);

/**
 * Pre-flight Code Validation
 * Catches syntax errors, import issues, and common mistakes before CI runs
 */
export async function runSyntaxValidation(github, owner, repo, prNumber) {
  console.log(`[SyntaxValidator] Starting for PR #${prNumber}`);

  try {
    // Get changed files
    const changedFiles = await github.getChangedFiles(owner, repo, prNumber);

    // Filter for JavaScript/TypeScript files
    const codeFiles = changedFiles.filter(f =>
      f.filename.match(/\.(js|ts|mjs|cjs)$/) &&
      !f.filename.includes('node_modules') &&
      f.status !== 'removed'
    );

    if (codeFiles.length === 0) {
      console.log('[SyntaxValidator] No code files to validate');
      return { errors: [] };
    }

    console.log(`[SyntaxValidator] Validating ${codeFiles.length} file(s)`);

    const errors = [];

    // Validate each file
    for (const file of codeFiles) {
      const fileErrors = await validateFile(file.filename);
      if (fileErrors.length > 0) {
        errors.push({
          file: file.filename,
          errors: fileErrors,
        });
      }
    }

    console.log(`[SyntaxValidator] Found ${errors.length} file(s) with errors`);

    return { errors };
  } catch (error) {
    console.log(`[SyntaxValidator] Validation failed: ${error.message}`);
    return { errors: [] };
  }
}

/**
 * Validate a single file for syntax and import errors
 */
async function validateFile(filePath) {
  const errors = [];

  try {
    // Run Node.js syntax check
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      const proc = spawn('node', ['--check', filePath]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({ stdout, stderr, code });
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });

    // Parse errors from stderr
    if (stderr) {
      const parsedErrors = parseSyntaxError(stderr, filePath);
      errors.push(...parsedErrors);
    }
  } catch (err) {
    // File might not exist locally (new file in PR)
    console.log(`[SyntaxValidator] Could not validate ${filePath}: ${err.message}`);
  }

  return errors;
}

/**
 * Parse Node.js syntax error output
 */
function parseSyntaxError(stderr, filePath) {
  const errors = [];

  // Pattern 1: SyntaxError with line number
  // Example: file:///path/to/file.js:1
  // SyntaxError: The requested module '../llm/prompts.js' does not provide an export named 'buildInlineReviewPrompt'
  const syntaxMatch = stderr.match(/file:\/\/.*?:(\d+)[\s\S]*?(SyntaxError|Error|ReferenceError|TypeError): (.+?)(?:\n|$)/);
  if (syntaxMatch) {
    errors.push({
      type: 'syntax',
      line: parseInt(syntaxMatch[1], 10),
      severity: 'critical',
      errorType: syntaxMatch[2],
      message: syntaxMatch[3].trim(),
    });
  }

  // Pattern 2: Import/export errors
  if (stderr.includes('does not provide an export')) {
    const exportMatch = stderr.match(/does not provide an export named '(.+?)'/);
    const moduleMatch = stderr.match(/module '(.+?)'/);

    if (exportMatch) {
      errors.push({
        type: 'import',
        line: syntaxMatch ? parseInt(syntaxMatch[1], 10) : 1,
        severity: 'critical',
        errorType: 'ImportError',
        message: `Missing export '${exportMatch[1]}' in module '${moduleMatch ? moduleMatch[1] : 'unknown'}'`,
        exportName: exportMatch[1],
        modulePath: moduleMatch ? moduleMatch[1] : null,
      });
    }
  }

  // Pattern 3: Cannot find module
  if (stderr.includes('Cannot find module')) {
    const moduleMatch = stderr.match(/Cannot find module '(.+?)'/);
    if (moduleMatch) {
      errors.push({
        type: 'import',
        line: 1,
        severity: 'critical',
        errorType: 'ModuleNotFoundError',
        message: `Cannot find module '${moduleMatch[1]}'`,
        modulePath: moduleMatch[1],
      });
    }
  }

  return errors;
}

/**
 * Format validation errors as inline comments
 */
export function formatValidationErrors(errors) {
  const inlineComments = [];

  for (const fileError of errors) {
    for (const error of fileError.errors) {
      const comment = formatValidationComment(error, fileError.file);

      inlineComments.push({
        path: fileError.file,
        line: error.line,
        side: 'RIGHT',
        body: comment,
      });
    }
  }

  return inlineComments;
}

/**
 * Format a single validation error as inline comment
 */
function formatValidationComment(error, filePath) {
  const severityEmoji = {
    critical: '🔴',
    error: '❌',
    warning: '⚠️',
  }[error.severity] || '❌';

  let body = `${severityEmoji} **${error.errorType}**: Syntax/Import Error Detected\n\n`;

  if (error.type === 'import') {
    body += `**Problem**: ${error.message}\n\n`;
    body += `**Impact**: This code will fail when executed in CI/production\n\n`;

    if (error.exportName && error.modulePath) {
      body += `**Fix**: Check that \`${error.modulePath}\` exports \`${error.exportName}\`. Either:\n`;
      body += `1. Add the export to \`${error.modulePath}\`\n`;
      body += `2. Remove \`${error.exportName}\` from the import statement\n`;
      body += `3. Fix the import path if it's incorrect\n\n`;

      body += `**Example Fix**:\n`;
      body += '```suggestion\n';
      body += `// Remove the unused import:\nimport { buildCodeReviewPrompt } from '${error.modulePath}';\n`;
      body += '```';
    } else if (error.modulePath) {
      body += `**Fix**: Ensure module \`${error.modulePath}\` exists or install it via npm\n`;
    }
  } else if (error.type === 'syntax') {
    body += `**Problem**: ${error.message}\n\n`;
    body += `**Impact**: Code will not run - syntax error must be fixed\n\n`;
    body += `**Fix**: Review the syntax at this line and correct the error\n`;
  }

  body += `\n\n---\n`;
  body += `🤖 This error was caught by pre-flight validation before CI ran`;

  return body;
}

/**
 * Generate summary of validation errors for main comment
 */
export function generateValidationSummary(errors) {
  if (errors.length === 0) {
    return null;
  }

  let summary = `## 🔴 Syntax/Import Errors Detected\n\n`;
  summary += `Found ${errors.length} file(s) with errors that will cause CI to fail:\n\n`;

  for (const fileError of errors) {
    summary += `### \`${fileError.file}\`\n\n`;
    for (const error of fileError.errors) {
      summary += `- **${error.errorType}** (line ${error.line}): ${error.message}\n`;
    }
    summary += '\n';
  }

  summary += `**⚠️ These issues must be fixed before the code can run.**\n\n`;
  summary += `See inline comments for detailed fixes.\n`;

  return summary;
}
