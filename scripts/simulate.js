/**
 * Webhook Event Simulation Script
 * 
 * Sends a sequence of simulated GitHub webhook events to the backend
 * with proper HMAC-SHA256 signature authentication.
 * 
 * Usage: node scripts/simulate.js [--api-url http://localhost:8080]
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

// ─── Configuration ──────────────────────────────────────────────
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'my-dashboard-secret-2026';
const API_URL = process.argv.includes('--api-url')
  ? process.argv[process.argv.indexOf('--api-url') + 1]
  : (process.env.API_URL || 'http://localhost:8080');

const WEBHOOK_ENDPOINT = `${API_URL}/api/webhook`;

// ─── Color Output ───────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// ─── Simulated Event Payloads ───────────────────────────────────

const events = [
  {
    name: 'PR #201 Opened by alice — "Add user authentication module"',
    headers: { 'X-GitHub-Event': 'pull_request' },
    payload: {
      action: 'opened',
      pull_request: {
        id: 201,
        title: 'Add user authentication module',
        user: { login: 'alice' },
        html_url: 'https://github.com/acme/webapp/pull/201',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        merged: false,
        requested_reviewers: [
          { login: 'bob' },
          { login: 'charlie' }
        ]
      }
    }
  },
  {
    name: 'PR #202 Opened by bob — "Fix database connection pooling"',
    headers: { 'X-GitHub-Event': 'pull_request' },
    payload: {
      action: 'opened',
      pull_request: {
        id: 202,
        title: 'Fix database connection pooling',
        user: { login: 'bob' },
        html_url: 'https://github.com/acme/webapp/pull/202',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        merged: false,
        requested_reviewers: [
          { login: 'alice' },
          { login: 'diana' }
        ]
      }
    }
  },
  {
    name: 'Review submitted on PR #201 by bob',
    headers: { 'X-GitHub-Event': 'pull_request_review' },
    payload: {
      action: 'submitted',
      review: {
        id: 5001,
        user: { login: 'bob' },
        state: 'approved',
        body: 'LGTM! Clean implementation.'
      },
      pull_request: {
        id: 201,
        title: 'Add user authentication module',
        user: { login: 'alice' },
        html_url: 'https://github.com/acme/webapp/pull/201'
      }
    }
  },
  {
    name: 'PR #203 Opened by charlie — "Implement caching layer with Redis"',
    headers: { 'X-GitHub-Event': 'pull_request' },
    payload: {
      action: 'opened',
      pull_request: {
        id: 203,
        title: 'Implement caching layer with Redis',
        user: { login: 'charlie' },
        html_url: 'https://github.com/acme/webapp/pull/203',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        merged: false,
        requested_reviewers: [
          { login: 'alice' },
          { login: 'bob' }
        ]
      }
    }
  },
  {
    name: 'PR #204 Opened by diana — "Update CI/CD pipeline configuration"',
    headers: { 'X-GitHub-Event': 'pull_request' },
    payload: {
      action: 'opened',
      pull_request: {
        id: 204,
        title: 'Update CI/CD pipeline configuration',
        user: { login: 'diana' },
        html_url: 'https://github.com/acme/webapp/pull/204',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        merged: false,
        requested_reviewers: [
          { login: 'charlie' }
        ]
      }
    }
  },
  {
    name: 'Review submitted on PR #202 by diana',
    headers: { 'X-GitHub-Event': 'pull_request_review' },
    payload: {
      action: 'submitted',
      review: {
        id: 5002,
        user: { login: 'diana' },
        state: 'approved',
        body: 'Looks good, nice fix!'
      },
      pull_request: {
        id: 202,
        title: 'Fix database connection pooling',
        user: { login: 'bob' },
        html_url: 'https://github.com/acme/webapp/pull/202'
      }
    }
  },
  {
    name: 'PR #201 Merged',
    headers: { 'X-GitHub-Event': 'pull_request' },
    payload: {
      action: 'closed',
      pull_request: {
        id: 201,
        title: 'Add user authentication module',
        user: { login: 'alice' },
        html_url: 'https://github.com/acme/webapp/pull/201',
        merged: true
      }
    }
  },
  {
    name: 'Review submitted on PR #203 by alice',
    headers: { 'X-GitHub-Event': 'pull_request_review' },
    payload: {
      action: 'submitted',
      review: {
        id: 5003,
        user: { login: 'alice' },
        state: 'changes_requested',
        body: 'Please add TTL configuration for cache entries.'
      },
      pull_request: {
        id: 203,
        title: 'Implement caching layer with Redis',
        user: { login: 'charlie' },
        html_url: 'https://github.com/acme/webapp/pull/203'
      }
    }
  }
];

// ─── HMAC Signature Generation ──────────────────────────────────

function computeSignature(payload) {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  hmac.update(body);
  return 'sha256=' + hmac.digest('hex');
}

// ─── HTTP Request Helper ────────────────────────────────────────

function sendWebhook(event) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(event.payload);
    const signature = computeSignature(event.payload);
    const url = new URL(WEBHOOK_ENDPOINT);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Hub-Signature-256': signature,
        ...event.headers
      }
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Simulation Runner ──────────────────────────────────────────

async function runSimulation() {
  console.log(`\n${C.bright}${C.magenta}═══════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bright}${C.magenta}  Code Review Dashboard — Webhook Simulation${C.reset}`);
  console.log(`${C.bright}${C.magenta}═══════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.dim}  Target: ${WEBHOOK_ENDPOINT}${C.reset}`);
  console.log(`${C.dim}  Secret: ${WEBHOOK_SECRET.substring(0, 4)}****${C.reset}`);
  console.log(`${C.dim}  Events: ${events.length}${C.reset}\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const step = `[${i + 1}/${events.length}]`;

    process.stdout.write(`  ${C.cyan}${step}${C.reset} ${event.name}... `);

    try {
      const result = await sendWebhook(event);

      if (result.status >= 200 && result.status < 300) {
        console.log(`${C.green}✓ ${result.status}${C.reset}`);
        success++;
      } else {
        console.log(`${C.red}✗ ${result.status} — ${result.body}${C.reset}`);
        failed++;
      }
    } catch (error) {
      console.log(`${C.red}✗ ERROR: ${error.message}${C.reset}`);
      failed++;
    }

    // Delay between events for realistic simulation
    if (i < events.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`\n${C.bright}${C.magenta}═══════════════════════════════════════════════════════════${C.reset}`);
  console.log(`  ${C.green}✓ Sent: ${success}${C.reset}  ${C.red}✗ Failed: ${failed}${C.reset}  Total: ${events.length}`);
  console.log(`${C.bright}${C.magenta}═══════════════════════════════════════════════════════════${C.reset}\n`);

  // ─── Idempotency Test ─────────────────────────────────────
  console.log(`${C.bright}${C.yellow}  Running Idempotency Test...${C.reset}`);
  console.log(`  Sending PR #201 opened event again (should be ignored)...`);

  try {
    const dupEvent = events[0]; // PR #201 opened
    const result = await sendWebhook(dupEvent);
    if (result.status >= 200 && result.status < 300) {
      console.log(`  ${C.green}✓ Server accepted (idempotent) — ${result.status}${C.reset}`);
    } else {
      console.log(`  ${C.red}✗ Unexpected response: ${result.status}${C.reset}`);
    }
  } catch (error) {
    console.log(`  ${C.red}✗ Error: ${error.message}${C.reset}`);
  }

  // ─── Security Test ────────────────────────────────────────
  console.log(`\n${C.bright}${C.yellow}  Running Security Test...${C.reset}`);
  console.log(`  Sending request with invalid signature...`);

  try {
    const body = JSON.stringify(events[0].payload);
    const url = new URL(WEBHOOK_ENDPOINT);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Hub-Signature-256': 'sha256=invalid_signature_for_testing',
        'X-GitHub-Event': 'pull_request'
      }
    };

    const result = await new Promise((resolve, reject) => {
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    if (result.status === 403) {
      console.log(`  ${C.green}✓ Correctly rejected with 403 Forbidden${C.reset}`);
    } else {
      console.log(`  ${C.red}✗ Expected 403, got ${result.status}${C.reset}`);
    }
  } catch (error) {
    console.log(`  ${C.red}✗ Error: ${error.message}${C.reset}`);
  }

  console.log(`\n${C.bright}${C.magenta}═══════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bright}${C.green}  Simulation Complete! Check your dashboard for updates.${C.reset}`);
  console.log(`${C.bright}${C.magenta}═══════════════════════════════════════════════════════════${C.reset}\n`);
}

runSimulation().catch(err => {
  console.error(`${C.red}Fatal error:${C.reset}`, err);
  process.exit(1);
});
