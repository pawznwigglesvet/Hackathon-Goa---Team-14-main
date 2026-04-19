#!/usr/bin/env node

/**
 * Inspect a specific deployment to see available endpoints
 */

const CLIENT_ID = 'sb-71982814-463f-4be7-bd6c-271eeaa319dc!b1624009|xsuaa_std!b318061';
const CLIENT_SECRET = '14d4ffbe-439c-4ff0-b21a-b8d1633573af$xNHQLBZNNEvQsJfvzuQxzARkad8bIeUifZn_J2ZycOc=';
const AUTH_URL = 'https://scm-agents-157875.authentication.eu12.hana.ondemand.com/oauth/token';
const BASE_URL = 'https://api.ai.intprod-eu12.eu-central-1.aws.ml.hana.ondemand.com';
const DEPLOYMENT_ID = 'dd36820fa39bd00b';

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

  const data = await response.json();
  return data.access_token;
}

async function getDeploymentDetails(token, deploymentId) {
  const response = await fetch(`${BASE_URL}/v2/lm/deployments/${deploymentId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'AI-Resource-Group': 'default',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get deployment (${response.status}): ${error}`);
  }

  return await response.json();
}

async function main() {
  console.log('🔍 Inspecting deployment:', DEPLOYMENT_ID, '\n');

  const token = await getAccessToken();
  const deployment = await getDeploymentDetails(token, DEPLOYMENT_ID);

  console.log('Deployment Details:');
  console.log(JSON.stringify(deployment, null, 2));
}

main();
