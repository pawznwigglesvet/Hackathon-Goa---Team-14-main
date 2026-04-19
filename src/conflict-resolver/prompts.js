/**
 * Prompts for Merge Conflict Resolution
 * 
 * SAP-aware prompts that help the LLM understand and resolve merge conflicts
 * in CAP, CDS, Fiori, and other SAP technology files.
 */

export const CONFLICT_RESOLVER_SYSTEM_PROMPT = `You are an expert SAP developer assistant specializing in resolving merge conflicts. You have deep knowledge of:

- **CAP (Cloud Application Programming Model)**: CDS data modeling, OData service definitions, Node.js and Java runtimes
- **CDS (Core Data Services)**: Entity definitions, associations, aspects, annotations
- **SAPUI5 / Fiori Elements**: UI annotations, manifest.json, XML views, controllers
- **OData V4**: Entity sets, navigation properties, function imports
- **BTP (Business Technology Platform)**: XSUAA, service bindings, MTA descriptors
- **General programming**: JavaScript, TypeScript, Java, JSON, YAML, Markdown

When resolving merge conflicts, you should:
1. Understand the intent of BOTH changes (base and head branches)
2. Preserve functionality from both sides when possible
3. Identify semantic conflicts vs. simple textual conflicts
4. Provide clear explanations of what each side changed
5. Suggest the best resolution strategy
6. Flag any potential issues or risks with the resolution

File pattern context:
- \`db/*.cds\` → CDS data model: entities, types, associations, aspects
- \`srv/*.cds\` → OData service definition: projections, actions, annotations
- \`srv/*.js\` / \`*.ts\` → CAP service handler: event hooks
- \`app/**/manifest.json\` → Fiori Elements app config
- \`app/**/*.xml\` → Fiori XML views or fragments
- \`package.json\` → Dependencies and scripts
- \`*.md\` → Documentation files`;

/**
 * Build the prompt for conflict resolution
 */
export function buildConflictResolutionPrompt(
  filename,
  baseContent,
  headContent,
  baseRef,
  headRef,
  conflictMarkers
) {
  const fileExtension = filename.split('.').pop()?.toLowerCase() || '';
  const fileType = getFileType(filename, fileExtension);

  // Truncate content if too long
  const maxContentLength = 3000;
  const truncatedBase = truncateContent(baseContent, maxContentLength);
  const truncatedHead = truncateContent(headContent, maxContentLength);

  let userPrompt = `Analyze and suggest a resolution for the merge conflict in the following file.

## File Information
- **Filename**: \`${filename}\`
- **File Type**: ${fileType}
- **Base Branch**: \`${baseRef}\`
- **Head Branch**: \`${headRef}\`

## Content from Base Branch (\`${baseRef}\`)
\`\`\`${fileExtension}
${truncatedBase || '(File does not exist or is empty)'}
\`\`\`

## Content from Head Branch (\`${headRef}\`)
\`\`\`${fileExtension}
${truncatedHead || '(File does not exist or is empty)'}
\`\`\`
`;

  // Add conflict markers if available
  if (conflictMarkers && conflictMarkers.length > 0) {
    userPrompt += `
## Conflict Markers Found
The following conflict markers were detected:

\`\`\`
${conflictMarkers.slice(0, 3).join('\n\n---\n\n')}
\`\`\`
`;
  }

  userPrompt += `
## Your Task

Please provide:

1. **What Changed in Base Branch**: Briefly describe what changes were made in the base branch (\`${baseRef}\`)

2. **What Changed in Head Branch**: Briefly describe what changes were made in the head branch (\`${headRef}\`)

3. **Conflict Analysis**: Explain why these changes conflict and whether it's a:
   - **Textual conflict**: Same lines modified differently
   - **Semantic conflict**: Changes that may work individually but conflict logically
   - **Additive conflict**: Both sides added different things that can coexist

4. **Suggested Resolution**: Provide the complete resolved file content in a code block. The resolution should:
   - Preserve the intent of both changes when possible
   - Follow best practices for ${fileType}
   - Be syntactically correct and ready to use

5. **Confidence Level**: Rate your confidence in this resolution:
   - **High** ✅: Clear resolution, low risk
   - **Medium** ⚠️: Reasonable resolution, some review needed
   - **Low** ❌: Complex conflict, manual review strongly recommended

6. **Potential Risks**: List any potential issues or things the developer should verify after applying this resolution.

Format your response clearly with markdown headers for each section.`;

  return {
    system: CONFLICT_RESOLVER_SYSTEM_PROMPT,
    user: userPrompt,
  };
}

/**
 * Determine file type based on filename and extension
 */
function getFileType(filename, extension) {
  const lowerFilename = filename.toLowerCase();

  // SAP-specific files
  if (extension === 'cds') {
    if (lowerFilename.includes('db/')) return 'CDS Data Model';
    if (lowerFilename.includes('srv/')) return 'CDS Service Definition';
    return 'CDS File';
  }

  // Fiori/UI5 files
  if (lowerFilename.includes('app/') && extension === 'json') {
    if (lowerFilename.includes('manifest.json')) return 'Fiori Manifest';
    return 'Fiori Configuration';
  }
  if (lowerFilename.includes('app/') && extension === 'xml') {
    return 'Fiori XML View/Fragment';
  }

  // Common files
  const typeMap = {
    'js': 'JavaScript',
    'ts': 'TypeScript',
    'json': 'JSON',
    'yaml': 'YAML',
    'yml': 'YAML',
    'md': 'Markdown',
    'java': 'Java',
    'xml': 'XML',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'properties': 'Properties File',
  };

  // Special filenames
  if (lowerFilename === 'package.json') return 'NPM Package Configuration';
  if (lowerFilename === 'mta.yaml') return 'MTA Deployment Descriptor';
  if (lowerFilename === 'xs-security.json') return 'XSUAA Security Configuration';
  if (lowerFilename.includes('pom.xml')) return 'Maven POM';

  return typeMap[extension] || 'Text File';
}

/**
 * Truncate content if too long
 */
function truncateContent(content, maxLength) {
  if (!content) return null;
  if (content.length <= maxLength) return content;
  
  return content.substring(0, maxLength) + '\n\n... [Content truncated for length] ...';
}