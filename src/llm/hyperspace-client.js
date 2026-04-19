/**
 * SAP AI Core / Hyperspace Direct Client
 *
 * Environment variables:
 * - SAP_AI_CORE_BASE_URL: e.g., https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com
 * - SAP_AI_CORE_AUTH_URL: OAuth2 token endpoint
 * - SAP_AI_CORE_CLIENT_ID: OAuth2 client ID
 * - SAP_AI_CORE_CLIENT_SECRET: OAuth2 client secret
 * - SAP_AI_CORE_RESOURCE_GROUP: AI Core resource group (default: 'default')
 * - HYPERSPACE_DEPLOYMENT_ID: Deployment ID of your Hyperspace model
 */

export class HyperspaceClient {
  constructor() {
    this.baseUrl = process.env.SAP_AI_CORE_BASE_URL;
    this.authUrl = process.env.SAP_AI_CORE_AUTH_URL;
    this.clientId = process.env.SAP_AI_CORE_CLIENT_ID;
    this.clientSecret = process.env.SAP_AI_CORE_CLIENT_SECRET;
    this.resourceGroup = process.env.SAP_AI_CORE_RESOURCE_GROUP || 'default';
    this.deploymentId = process.env.HYPERSPACE_DEPLOYMENT_ID;
    this.tenantId = process.env.SAP_AI_CORE_TENANT_ID;  // From identityzone in service key

    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get OAuth2 access token (cached)
   */
  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const response = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth2 failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Set expiry to 5 minutes before actual expiry for safety
    this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

    return this.accessToken;
  }

  /**
   * Call SAP AI Core inference endpoint
   *
   * Supports two deployment types:
   * 1. Orchestration service (scenario: orchestration) - Uses /completion endpoint
   * 2. Foundation models (scenario: foundation-models) - Direct URL (experimental)
   *
   * @param {string} systemPrompt - System prompt
   * @param {string} userPrompt - User prompt
   * @param {object} options - Additional options
   * @returns {Promise<string>} - Generated text
   */
  async complete(systemPrompt, userPrompt, options = {}) {
    const {
      maxTokens = 1024,
      temperature = 0.7,
      topP = 0.95,
      deploymentId = this.deploymentId,
      useOrchestration = process.env.SAP_AI_USE_ORCHESTRATION === 'true',
    } = options;

    if (!deploymentId) {
      throw new Error('HYPERSPACE_DEPLOYMENT_ID not configured');
    }

    const token = await this.getAccessToken();

    let inferenceUrl, payload;

    if (useOrchestration) {
      // Orchestration service format (requires templating_module_config)
      inferenceUrl = `${this.baseUrl}/v2/inference/deployments/${deploymentId}/completion`;

      payload = {
        orchestration_config: {
          module_configurations: {
            templating_module_config: {
              template: [
                {
                  role: "system",
                  content: systemPrompt
                },
                {
                  role: "user",
                  content: "{{?input}}"
                }
              ]
            },
            llm_module_config: {
              model_name: "anthropic--claude-4.5-sonnet",  // Using Claude via orchestration
              model_params: {
                max_tokens: parseInt(maxTokens, 10),  // Ensure integer
                temperature: parseFloat(temperature),  // Ensure float
              }
            }
          }
        },
        input_params: {
          input: userPrompt
        }
      };
    } else {
      // Foundation models format - use /invoke endpoint for Anthropic models
      inferenceUrl = `${this.baseUrl}/v2/inference/deployments/${deploymentId}/invoke`;

      payload = {
        anthropic_version: 'bedrock-2023-05-31',
        messages: [
          { role: 'user', content: userPrompt },
        ],
        system: systemPrompt,
        max_tokens: maxTokens,
        temperature,
        // Note: Anthropic models don't allow both temperature and top_p
      };
    }

    console.log(`[Hyperspace] Calling inference: ${inferenceUrl}`);
    console.log(`[Hyperspace] Mode: ${useOrchestration ? 'orchestration' : 'foundation-models'}`);
    console.log(`[Hyperspace] Payload:`, JSON.stringify(payload, null, 2).substring(0, 500));

    const headers = {
      'Authorization': `Bearer ${token}`,
      'AI-Resource-Group': this.resourceGroup,
      'Content-Type': 'application/json',
    };

    // Add tenant ID if configured
    if (this.tenantId) {
      headers['AI-Tenant-Id'] = this.tenantId;
    }

    const response = await fetch(inferenceUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hyperspace API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Extract text and metadata from various response formats
    let text, stopReason, usage, model;

    // Anthropic Messages API format
    if (result.content && result.content[0] && result.content[0].text) {
      text = result.content[0].text;
      stopReason = result.stop_reason || 'end_turn';
      usage = result.usage || {};
      model = result.model || 'hyperspace';
    }
    // Orchestration format
    else if (result.orchestration_result && result.orchestration_result.choices) {
      const choice = result.orchestration_result.choices[0];
      text = choice.message.content;
      stopReason = choice.finish_reason || 'stop';
      usage = result.orchestration_result.usage || {};
      model = result.orchestration_result.model || 'hyperspace';
    }
    // OpenAI format
    else if (result.choices && result.choices[0] && result.choices[0].message) {
      text = result.choices[0].message.content;
      stopReason = result.choices[0].finish_reason || 'stop';
      usage = result.usage || {};
      model = result.model || 'hyperspace';
    } else {
      throw new Error(`Unexpected response format from Hyperspace: ${JSON.stringify(result).substring(0, 200)}`);
    }

    // Return structured response with metadata
    return {
      text,
      metadata: {
        stop_reason: stopReason,
        usage: {
          input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
          output_tokens: usage.completion_tokens || usage.output_tokens || 0,
        },
        model,
        deployment_id: deploymentId,
      },
    };
  }

  /**
   * Health check
   */
  async health() {
    try {
      await this.getAccessToken();
      return {
        status: 'healthy',
        provider: 'hyperspace',
        baseUrl: this.baseUrl,
        resourceGroup: this.resourceGroup,
        deploymentId: this.deploymentId,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }
}

/**
 * Factory function for backward compatibility with existing code
 */
export function createHyperspaceClient() {
  const client = new HyperspaceClient();

  return {
    async connect() {
      // Validate configuration
      const health = await client.health();
      if (health.status === 'unhealthy') {
        throw new Error(`Hyperspace client initialization failed: ${health.error}`);
      }
      console.log('[Hyperspace] Client initialized:', health);
    },

    async complete(systemPrompt, userPrompt, optionsOrMaxTokens = {}) {
      // Support both old signature (3rd param = number) and new (3rd param = object)
      const options = typeof optionsOrMaxTokens === 'number'
        ? { maxTokens: optionsOrMaxTokens }
        : optionsOrMaxTokens;

      return await client.complete(systemPrompt, userPrompt, options);
    },

    async health() {
      return await client.health();
    },

    async disconnect() {
      console.log('[Hyperspace] Client disconnected');
    },
  };
}
