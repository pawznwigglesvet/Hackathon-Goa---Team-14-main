/**
 * LLM Client Factory
 *
 * Creates the appropriate LLM client based on environment configuration.
 * Supports:
 * - Direct SAP Hyperspace (SAP AI Core)
 * - MCP-based clients (Anthropic Claude, OpenAI)
 */

import { createMCPLLMClient } from './mcp-client.js';
import { createHyperspaceClient } from './hyperspace-client.js';

/**
 * Create LLM client based on LLM_PROVIDER environment variable
 *
 * Supported providers:
 * - 'hyperspace': Direct SAP AI Core / Hyperspace integration
 * - 'anthropic': Anthropic Claude via MCP
 * - 'openai': OpenAI via MCP
 *
 * @returns {Object} LLM client with { connect, complete, health, disconnect } methods
 */
export function createLLMClient() {
  const provider = process.env.LLM_PROVIDER || 'anthropic';

  console.log(`[LLM] Creating client for provider: ${provider}`);

  switch (provider) {
    case 'hyperspace':
      return createHyperspaceClient();

    case 'anthropic':
    case 'openai':
      return createMCPLLMClient();

    default:
      throw new Error(
        `Unknown LLM_PROVIDER: ${provider}. Supported: hyperspace, anthropic, openai`
      );
  }
}

/**
 * Validate LLM configuration based on provider
 */
export function validateLLMConfig() {
  const provider = process.env.LLM_PROVIDER || 'anthropic';

  switch (provider) {
    case 'hyperspace':
      const required = [
        'SAP_AI_CORE_BASE_URL',
        'SAP_AI_CORE_AUTH_URL',
        'SAP_AI_CORE_CLIENT_ID',
        'SAP_AI_CORE_CLIENT_SECRET',
        'HYPERSPACE_DEPLOYMENT_ID',
      ];

      for (const key of required) {
        if (!process.env[key]) {
          throw new Error(`Missing required environment variable for Hyperspace: ${key}`);
        }
      }
      break;

    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Missing required environment variable: ANTHROPIC_API_KEY');
      }
      break;

    case 'openai':
      if (!process.env.OPENAI_API_KEY && !process.env.GITHUB_TOKEN) {
        throw new Error('Missing required environment variable: OPENAI_API_KEY or GITHUB_TOKEN');
      }
      break;

    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }

  console.log(`[LLM] Configuration validated for provider: ${provider}`);
}
