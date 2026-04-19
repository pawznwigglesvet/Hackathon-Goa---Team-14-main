/**
 * SAP CAP GenAI SDK Integration
 *
 * Use this if your project is a CAP application.
 * The CAP GenAI SDK provides built-in integration with SAP AI Core/Hyperspace.
 *
 * Documentation: https://github.com/SAP/ai-sdk-js
 */

// Step 1: Install dependencies
// npm install @sap-ai-sdk/foundation @sap-ai-sdk/core

import { AzureOpenAiChatClient } from '@sap-ai-sdk/foundation-models';
import { DeploymentApi } from '@sap-ai-sdk/ai-api';

/**
 * SAP AI Core client using official SAP SDK
 */
export class SAPGenAIClient {
  constructor() {
    this.deploymentId = process.env.HYPERSPACE_DEPLOYMENT_ID;
    this.resourceGroup = process.env.SAP_AI_CORE_RESOURCE_GROUP || 'default';
  }

  async connect() {
    // Initialize client (uses destination service or direct credentials)
    this.chatClient = new AzureOpenAiChatClient({
      deploymentId: this.deploymentId,
      resourceGroup: this.resourceGroup,
    });

    console.log('[SAP GenAI] Client initialized');
  }

  async complete(systemPrompt, userPrompt, maxTokens = 1024) {
    const response = await this.chatClient.run({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    return response.content;
  }

  async health() {
    try {
      // Check deployment status
      const deployment = await DeploymentApi.get(this.deploymentId, {
        resourceGroup: this.resourceGroup,
      });

      return {
        status: 'healthy',
        provider: 'sap-gen-ai',
        deploymentId: this.deploymentId,
        deploymentStatus: deployment.status,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  async disconnect() {
    console.log('[SAP GenAI] Client disconnected');
  }
}

/**
 * Factory function
 */
export function createSAPGenAIClient() {
  return new SAPGenAIClient();
}
