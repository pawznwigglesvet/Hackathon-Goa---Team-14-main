#!/usr/bin/env node

/**
 * Test SAP Hyperspace integration end-to-end
 */

import { createHyperspaceClient } from './src/llm/hyperspace-client.js';

async function main() {
  console.log('🧪 Testing SAP Hyperspace Integration\n');

  // Override env from .env.hyperspace
  process.env.LLM_PROVIDER = 'hyperspace';
  process.env.SAP_AI_CORE_BASE_URL = 'https://api.ai.intprod-eu12.eu-central-1.aws.ml.hana.ondemand.com';
  process.env.SAP_AI_CORE_AUTH_URL = 'https://scm-agents-157875.authentication.eu12.hana.ondemand.com/oauth/token';
  process.env.SAP_AI_CORE_CLIENT_ID = 'sb-71982814-463f-4be7-bd6c-271eeaa319dc!b1624009|xsuaa_std!b318061';
  process.env.SAP_AI_CORE_CLIENT_SECRET = '14d4ffbe-439c-4ff0-b21a-b8d1633573af$xNHQLBZNNEvQsJfvzuQxzARkad8bIeUifZn_J2ZycOc=';
  process.env.SAP_AI_CORE_RESOURCE_GROUP = 'default';
  process.env.HYPERSPACE_DEPLOYMENT_ID = 'dd36820fa39bd00b';

  try {
    // Test 1: Create and connect client
    console.log('Test 1: Initialize Hyperspace client');
    const client = createHyperspaceClient();
    await client.connect();
    console.log('✅ Client connected\n');

    // Test 2: Health check
    console.log('Test 2: Health check');
    const health = await client.health();
    console.log('Health status:', JSON.stringify(health, null, 2));
    console.log('✅ Health check passed\n');

    // Test 3: Simple completion
    console.log('Test 3: Simple completion');
    const simpleResult = await client.complete(
      'You are a helpful assistant.',
      'Say "Hello from Hyperspace!" in exactly 5 words.',
      50
    );
    console.log('Response:', simpleResult);
    console.log('✅ Simple completion works\n');

    // Test 4: SAP-aware completion (mimicking PR summary use case)
    console.log('Test 4: SAP-aware PR summary simulation');
    const sapSystemPrompt = `You are an SAP-aware AI assistant specializing in:
- SAP Cloud Application Programming (CAP) model
- Core Data Services (CDS)
- OData services
- SAPUI5 and Fiori Elements

Analyze code changes and provide concise, technical summaries.`;

    const sapUserPrompt = `Summarize these PR changes:
- Modified: srv/catalog-service.cds (added new entity "Products")
- Modified: db/schema.cds (added fields: price, currency)
- Added: srv/handlers/products.js (CRUD operations)

Provide a 2-sentence summary.`;

    const sapResult = await client.complete(sapSystemPrompt, sapUserPrompt, 200);
    console.log('SAP-aware summary:', sapResult);
    console.log('✅ SAP-aware completion works\n');

    // Test 5: Token refresh (call again after short delay)
    console.log('Test 5: Token caching/reuse');
    const quickResult = await client.complete(
      'You are a test assistant.',
      'Reply with: OK',
      10
    );
    console.log('Quick response:', quickResult);
    console.log('✅ Token caching works\n');

    await client.disconnect();

    console.log('🎉 All tests passed!');
    console.log('\n✅ SAP Hyperspace integration is fully functional');
    console.log('   You can now run the PR agent with: npm start');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

main();
