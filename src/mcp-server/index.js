#!/usr/bin/env node
// MCP Server - middleware for LLM access
// Supports: Anthropic Claude, OpenAI
// Environment: ANTHROPIC_API_KEY, OPENAI_API_KEY, LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

class PRAgentMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'pr-agent-llm',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.initializeLLMClients();
  }

  initializeLLMClients() {
    const provider = process.env.LLM_PROVIDER || 'anthropic';

    if (provider === 'anthropic' || process.env.ANTHROPIC_API_KEY) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error('Warning: ANTHROPIC_API_KEY not set');
      } else {
        const options = { apiKey };
        if (process.env.LLM_BASE_URL) {
          options.baseURL = process.env.LLM_BASE_URL;
        }
        this.anthropic = new Anthropic(options);
        console.error('✓ Anthropic client initialized');
      }
    }

    if (provider === 'openai' || process.env.OPENAI_API_KEY) {
      const apiKey = process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN;
      if (apiKey) {
        this.openai = new OpenAI({
          apiKey,
          baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
        });
        console.error('✓ OpenAI client initialized');
      }
    }

    this.defaultProvider = provider;
    this.defaultModel = process.env.LLM_MODEL || 'claude-sonnet-4-6';
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'complete',
          description: 'Generate text completion using LLM',
          inputSchema: {
            type: 'object',
            properties: {
              systemPrompt: {
                type: 'string',
                description: 'System prompt for the LLM',
              },
              userPrompt: {
                type: 'string',
                description: 'User prompt/query',
              },
              maxTokens: {
                type: 'number',
                description: 'Maximum tokens to generate (default: 1024)',
              },
              provider: {
                type: 'string',
                description: 'LLM provider: anthropic | openai (optional)',
              },
              model: {
                type: 'string',
                description: 'Model name (optional, uses default)',
              },
              includeMetadata: {
                type: 'boolean',
                description: 'Return metadata (stop_reason, usage, model) along with text (default: false)',
              },
            },
            required: ['systemPrompt', 'userPrompt'],
          },
        },
        {
          name: 'health',
          description: 'Check MCP server health and available providers',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'complete':
          return await this.handleComplete(args);
        case 'health':
          return await this.handleHealth();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async handleComplete(args) {
    const {
      systemPrompt,
      userPrompt,
      maxTokens = 1024,
      provider = this.defaultProvider,
      model = this.defaultModel,
      includeMetadata = false,
    } = args;

    try {
      let result;

      if (provider === 'anthropic' && this.anthropic) {
        result = await this.completeWithAnthropic(
          systemPrompt,
          userPrompt,
          maxTokens,
          model,
          includeMetadata
        );
      } else if (provider === 'openai' && this.openai) {
        result = await this.completeWithOpenAI(
          systemPrompt,
          userPrompt,
          maxTokens,
          model,
          includeMetadata
        );
      } else {
        throw new Error(`Provider ${provider} not available or not configured`);
      }

      // For backward compatibility: if includeMetadata is false, return text only
      if (!includeMetadata) {
        const text = typeof result === 'object' ? result.text : result;
        return {
          content: [
            {
              type: 'text',
              text,
            },
          ],
        };
      }

      // Return structured response with metadata as JSON
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      console.error('LLM completion error:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async completeWithAnthropic(systemPrompt, userPrompt, maxTokens, model, includeMetadata = false) {
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].text;

    // Return text only for backward compatibility
    if (!includeMetadata) {
      return text;
    }

    // Return structured response with metadata
    return {
      text,
      metadata: {
        stop_reason: response.stop_reason,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
        model: response.model,
        id: response.id,
      },
    };
  }

  async completeWithOpenAI(systemPrompt, userPrompt, maxTokens, model, includeMetadata = false) {
    const response = await this.openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const text = response.choices[0].message.content;

    // Return text only for backward compatibility
    if (!includeMetadata) {
      return text;
    }

    // Return structured response with metadata
    return {
      text,
      metadata: {
        stop_reason: response.choices[0].finish_reason,
        usage: {
          input_tokens: response.usage.prompt_tokens,
          output_tokens: response.usage.completion_tokens,
        },
        model: response.model,
        id: response.id,
      },
    };
  }

  async handleHealth() {
    const providers = [];

    if (this.anthropic) {
      providers.push({
        name: 'anthropic',
        status: 'available',
        model: this.defaultModel,
      });
    }

    if (this.openai) {
      providers.push({
        name: 'openai',
        status: 'available',
        model: this.defaultModel,
      });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'healthy',
            defaultProvider: this.defaultProvider,
            defaultModel: this.defaultModel,
            providers,
            baseURL: process.env.LLM_BASE_URL || 'default',
          }, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('PR Agent MCP Server running on stdio');
  }
}

// Run server
const server = new PRAgentMCPServer();
server.run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
