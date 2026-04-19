import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

// MCP Client - spawns MCP server as subprocess and communicates via stdio
export function createMCPLLMClient() {
  let client = null;
  let serverProcess = null;

  return {
    async connect() {
      serverProcess = spawn('node', ['src/mcp-server/index.js'], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'inherit'],
      });

      client = new Client(
        {
          name: 'pr-agent-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      const transport = new StdioClientTransport({
        reader: serverProcess.stdout,
        writer: serverProcess.stdin,
      });

      await client.connect(transport);
      console.log('[MCP] Connected to LLM server');
    },

    async complete(systemPrompt, userPrompt, maxTokens = 1024) {
      if (!client) {
        throw new Error('MCP client not connected. Call connect() first.');
      }

      const result = await client.callTool({
        name: 'complete',
        arguments: {
          systemPrompt,
          userPrompt,
          maxTokens,
        },
      });

      if (result.isError) {
        throw new Error(result.content[0].text);
      }

      return result.content[0].text;
    },

    /**
     * Complete with metadata (stop_reason, usage, model)
     * Returns: { text, metadata } or throws on error
     */
    async completeWithMetadata(systemPrompt, userPrompt, maxTokens = 1024) {
      if (!client) {
        throw new Error('MCP client not connected. Call connect() first.');
      }

      const result = await client.callTool({
        name: 'complete',
        arguments: {
          systemPrompt,
          userPrompt,
          maxTokens,
          includeMetadata: true,
        },
      });

      if (result.isError) {
        throw new Error(result.content[0].text);
      }

      // Parse JSON response containing { text, metadata }
      return JSON.parse(result.content[0].text);
    },

    async health() {
      if (!client) {
        throw new Error('MCP client not connected. Call connect() first.');
      }

      const result = await client.callTool({
        name: 'health',
        arguments: {},
      });

      return JSON.parse(result.content[0].text);
    },

    async disconnect() {
      if (client) {
        await client.close();
      }
      if (serverProcess) {
        serverProcess.kill();
      }
      console.log('[MCP] Disconnected from LLM server');
    },
  };
}
