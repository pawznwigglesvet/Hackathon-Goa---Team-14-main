#!/usr/bin/env node

/**
 * SAP AI Core Deployment Finder
 * Queries your AI Core instance for available deployments
 */

const CLIENT_ID = 'sb-71982814-463f-4be7-bd6c-271eeaa319dc!b1624009|xsuaa_std!b318061';
const CLIENT_SECRET = '14d4ffbe-439c-4ff0-b21a-b8d1633573af$xNHQLBZNNEvQsJfvzuQxzARkad8bIeUifZn_J2ZycOc=';
const AUTH_URL = 'https://scm-agents-157875.authentication.eu12.hana.ondemand.com/oauth/token';
const BASE_URL = 'https://api.ai.intprod-eu12.eu-central-1.aws.ml.hana.ondemand.com';

async function getAccessToken() {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth2 failed (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function listDeployments(token, resourceGroup = 'default') {
  const response = await fetch(`${BASE_URL}/v2/lm/deployments`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'AI-Resource-Group': resourceGroup,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list deployments (${response.status}): ${error}`);
  }

  return await response.json();
}

async function main() {
  console.log('🔍 Querying SAP AI Core for deployments...\n');

  try {
    console.log('🔐 Authenticating...');
    const token = await getAccessToken();
    console.log('✅ Authentication successful\n');

    console.log('📋 Fetching deployments...');
    const deployments = await listDeployments(token);

    if (!deployments || !deployments.resources || deployments.resources.length === 0) {
      console.log('⚠️  No deployments found');
      console.log('\n💡 You need to create a deployment in SAP AI Core first:');
      console.log('   1. Go to SAP BTP Cockpit → AI Core');
      console.log('   2. Navigate to ML Operations → Deployments');
      console.log('   3. Create a new deployment with a Hyperspace model');
      return;
    }

    console.log(`✅ Found ${deployments.resources.length} deployment(s)\n`);

    deployments.resources.forEach((deployment, index) => {
      console.log(`Deployment ${index + 1}:`);
      console.log(`  ID: ${deployment.id}`);
      console.log(`  Status: ${deployment.status}`);
      console.log(`  Scenario ID: ${deployment.scenarioId || 'N/A'}`);
      console.log(`  Configuration ID: ${deployment.configurationId || 'N/A'}`);

      if (deployment.deploymentUrl) {
        console.log(`  URL: ${deployment.deploymentUrl}`);
      }

      if (deployment.status === 'RUNNING') {
        console.log(`  ✅ Ready to use!`);
        console.log(`\n  Add to .env.hyperspace:`);
        console.log(`  HYPERSPACE_DEPLOYMENT_ID=${deployment.id}`);
      } else {
        console.log(`  ⚠️  Status: ${deployment.status} (not RUNNING)`);
      }

      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.message.includes('invalid_client') || error.message.includes('Bad credentials')) {
      console.log('\n💡 Credential Issues:');
      console.log('   - Your SAP AI Core service key might be expired');
      console.log('   - Verify credentials in BTP Cockpit');
      console.log('   - Create a new service key if needed');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.log('\n💡 Permission Issues:');
      console.log('   - Check resource group access');
      console.log('   - Verify AI Core entitlements');
    } else if (error.message.includes('404')) {
      console.log('\n💡 Not Found:');
      console.log('   - AI Core instance might not be provisioned');
      console.log('   - Check the base URL');
    }

    process.exit(1);
  }
}

main();
