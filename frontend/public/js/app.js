/**
 * Code Review Dashboard — Frontend Application
 * 
 * Handles WebSocket connection, API data fetching,
 * Kanban board rendering, Chart.js visualization, and activity feed.
 */

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════
const API_BASE = window.location.origin;
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

// ═══════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════
let pullRequests = {};    // { [id]: prObject }
let reviewerChart = null;
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 20;
const RECONNECT_DELAY_BASE = 1000;
let stalePRIds = new Set();

// ═══════════════════════════════════════════════════════════════
// DOM References
// ═══════════════════════════════════════════════════════════════
const connectionStatus = document.getElementById('connection-status');
const statusText = connectionStatus.querySelector('.status-text');
const totalPRsCount = document.getElementById('total-prs-count');
const activePRsCount = document.getElementById('active-prs-count');
const mergedPRsCount = document.getElementById('merged-prs-count');
const activityFeed = document.getElementById('activity-feed');
const feedEmpty = document.getElementById('feed-empty');
const chartEmpty = document.getElementById('chart-empty');

// Column containers
const columns = {
  opened: document.getElementById('cards-opened'),
  in_review: document.getElementById('cards-in_review'),
  merged: document.getElementById('cards-merged'),
  closed: document.getElementById('cards-closed')
};

const columnCounts = {
  opened: document.getElementById('count-opened'),
  in_review: document.getElementById('count-in_review'),
  merged: document.getElementById('count-merged'),
  closed: document.getElementById('count-closed')
};

// ═══════════════════════════════════════════════════════════════
// WebSocket Management
// ═══════════════════════════════════════════════════════════════

function connectWebSocket() {
  console.log('[WS] Connecting to', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[WS] Connected');
    reconnectAttempts = 0;
    setConnectionStatus('connected', 'Connected');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[WS] Message received:', message);
      handleWebSocketMessage(message);
    } catch (e) {
      console.error('[WS] Failed to parse message:', e);
    }
  };

  ws.onclose = (event) => {
    console.log('[WS] Disconnected:', event.code, event.reason);
    setConnectionStatus('disconnected', 'Disconnected');
    scheduleReconnect();
  };

  ws.onerror = (error) => {
    console.error('[WS] Error:', error);
  };
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[WS] Max reconnect attempts reached');
    setConnectionStatus('disconnected', 'Connection Failed');
    return;
  }

  reconnectAttempts++;
  const delay = Math.min(RECONNECT_DELAY_BASE * Math.pow(1.5, reconnectAttempts), 15000);
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setConnectionStatus('disconnected', `Reconnecting (${reconnectAttempts})...`);
  setTimeout(connectWebSocket, delay);
}

function setConnectionStatus(status, text) {
  connectionStatus.className = `connection-status ${status}`;
  statusText.textContent = text;
}

// ═══════════════════════════════════════════════════════════════
// Message Handling
// ═══════════════════════════════════════════════════════════════

function handleWebSocketMessage(message) {
  const { type, data } = message;

  switch (type) {
    case 'pr:opened':
      handlePROpened(data);
      break;
    case 'pr:updated':
      handlePRUpdated(data);
      break;
    case 'connection':
      console.log('[WS] Server says:', data.message);
      break;
    default:
      console.log('[WS] Unknown message type:', type);
  }
}

function handlePROpened(data) {
  pullRequests[data.id] = data;
  addPRCard(data);
  addActivityItem('opened', `PR #${data.id} opened: <strong>${data.title}</strong> by ${data.author}`);
  updateStats();
  fetchReviewerLoad();
}

function handlePRUpdated(data) {
  const existing = pullRequests[data.id];
  if (existing) {
    const oldStatus = existing.status;
    existing.status = data.status;

    // Move card to new column
    movePRCard(data.id, oldStatus, data.status);

    const statusLabel = data.status.replace('_', ' ');
    let feedText = `PR #${data.id} status changed to <strong>${statusLabel}</strong>`;
    if (data.reviewer) {
      feedText += ` (reviewed by ${data.reviewer})`;
    }
    addActivityItem(data.status, feedText);
  } else {
    // PR not in local state — fetch all to resync
    addActivityItem(data.status, `PR #${data.id} updated to <strong>${data.status}</strong>`);
    fetchAllPRs();
  }

  updateStats();
  fetchReviewerLoad();
}

// ═══════════════════════════════════════════════════════════════
// Kanban Board Rendering
// ═══════════════════════════════════════════════════════════════

function createPRCardElement(pr) {
  const card = document.createElement('div');
  card.className = `pr-card${stalePRIds.has(pr.id) ? ' stale' : ''}`;
  card.id = `pr-card-${pr.id}`;
  card.setAttribute('data-pr-id', pr.id);

  const initials = (pr.author || '?').charAt(0).toUpperCase();
  const reviewerTags = (pr.reviewers || [])
    .map(r => `<span class="reviewer-tag">@${r}</span>`)
    .join('');

  card.innerHTML = `
    <div class="pr-card-title">
      <a href="${pr.url || '#'}" target="_blank" rel="noopener">${escapeHtml(pr.title || 'Untitled PR')}</a>
    </div>
    <div class="pr-card-meta">
      <div class="pr-card-author">
        <span class="author-avatar">${initials}</span>
        ${escapeHtml(pr.author || 'unknown')}
      </div>
      <span class="pr-card-id">#${pr.id}</span>
    </div>
    ${reviewerTags ? `<div class="pr-card-reviewers">${reviewerTags}</div>` : ''}
  `;

  return card;
}

function addPRCard(pr) {
  const status = pr.status || 'opened';
  const column = columns[status];
  if (!column) {
    console.warn(`[UI] No column for status: ${status}`);
    return;
  }

  // Remove existing card if present
  const existingCard = document.getElementById(`pr-card-${pr.id}`);
  if (existingCard) existingCard.remove();

  const card = createPRCardElement(pr);
  column.prepend(card);
  updateColumnCounts();
}

function movePRCard(prId, oldStatus, newStatus) {
  const card = document.getElementById(`pr-card-${prId}`);
  const newColumn = columns[newStatus];

  if (!newColumn) {
    console.warn(`[UI] No column for status: ${newStatus}`);
    return;
  }

  if (card) {
    // Animate out
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9)';

    setTimeout(() => {
      card.remove();
      // Reset animation
      card.style.opacity = '';
      card.style.transform = '';
      card.style.animation = 'cardSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      newColumn.prepend(card);
      updateColumnCounts();
    }, 200);
  } else {
    // Card not found — create it
    const pr = pullRequests[prId];
    if (pr) {
      const newCard = createPRCardElement(pr);
      newColumn.prepend(newCard);
      updateColumnCounts();
    }
  }
}

function updateColumnCounts() {
  for (const [status, container] of Object.entries(columns)) {
    const count = container.children.length;
    if (columnCounts[status]) {
      columnCounts[status].textContent = count;
    }
  }
}

function renderAllPRs() {
  // Clear all columns
  for (const col of Object.values(columns)) {
    col.innerHTML = '';
  }

  // Add all PRs to their respective columns
  for (const pr of Object.values(pullRequests)) {
    addPRCard(pr);
  }

  updateColumnCounts();
}

// ═══════════════════════════════════════════════════════════════
// Activity Feed
// ═══════════════════════════════════════════════════════════════

const statusIcons = {
  opened: '🟢',
  in_review: '🔍',
  merged: '🟣',
  closed: '⚫'
};

function addActivityItem(status, text) {
  // Hide empty state
  if (feedEmpty) feedEmpty.classList.add('hidden');

  const item = document.createElement('div');
  item.className = 'feed-item';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });

  item.innerHTML = `
    <div class="feed-icon ${status}">
      ${statusIcons[status] || '📋'}
    </div>
    <div class="feed-content">
      <div class="feed-text">${text}</div>
      <div class="feed-time">${timeStr}</div>
    </div>
  `;

  // Add to top of feed
  if (activityFeed.firstChild && activityFeed.firstChild !== feedEmpty) {
    activityFeed.insertBefore(item, activityFeed.firstChild);
  } else {
    activityFeed.appendChild(item);
  }

  // Limit feed to 50 items
  while (activityFeed.children.length > 51) {
    activityFeed.removeChild(activityFeed.lastChild);
  }
}

// ═══════════════════════════════════════════════════════════════
// Chart.js — Reviewer Load
// ═══════════════════════════════════════════════════════════════

function initChart() {
  const ctx = document.getElementById('reviewer-chart').getContext('2d');

  const gradientBg = ctx.createLinearGradient(0, 0, 0, 280);
  gradientBg.addColorStop(0, 'rgba(99, 102, 241, 0.6)');
  gradientBg.addColorStop(1, 'rgba(139, 92, 246, 0.1)');

  reviewerChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Active PR Reviews',
        data: [],
        backgroundColor: gradientBg,
        borderColor: 'rgba(99, 102, 241, 0.8)',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 40,
        maxBarThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(17, 18, 34, 0.95)',
          titleColor: '#e8eaf0',
          bodyColor: '#8b8fa7',
          borderColor: 'rgba(99, 102, 241, 0.3)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          titleFont: { family: "'Inter', sans-serif", weight: '600' },
          bodyFont: { family: "'Inter', sans-serif" },
          callbacks: {
            title: (items) => `@${items[0].label}`,
            label: (item) => `  ${item.raw} active review${item.raw !== 1 ? 's' : ''}`
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#8b8fa7',
            font: { family: "'Inter', sans-serif", size: 11, weight: '500' },
            callback: function(value) {
              return '@' + this.getLabelForValue(value);
            }
          },
          border: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.04)',
            drawTicks: false
          },
          ticks: {
            color: '#5a5e78',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            stepSize: 1,
            padding: 8
          },
          border: {
            display: false
          }
        }
      },
      animation: {
        duration: 600,
        easing: 'easeOutQuart'
      }
    }
  });
}

function updateChart(data) {
  if (!reviewerChart) return;

  if (data.length === 0) {
    if (chartEmpty) chartEmpty.classList.remove('hidden');
    reviewerChart.data.labels = [];
    reviewerChart.data.datasets[0].data = [];
    reviewerChart.update();
    return;
  }

  if (chartEmpty) chartEmpty.classList.add('hidden');

  // Sort by load descending
  data.sort((a, b) => b.load - a.load);

  reviewerChart.data.labels = data.map(d => d.reviewer);
  reviewerChart.data.datasets[0].data = data.map(d => d.load);
  reviewerChart.update();
}

// ═══════════════════════════════════════════════════════════════
// Stats Update
// ═══════════════════════════════════════════════════════════════

function updateStats() {
  const prs = Object.values(pullRequests);
  const total = prs.length;
  const active = prs.filter(p => !['merged', 'closed'].includes(p.status)).length;
  const merged = prs.filter(p => p.status === 'merged').length;

  animateCounter(totalPRsCount, total);
  animateCounter(activePRsCount, active);
  animateCounter(mergedPRsCount, merged);
}

function animateCounter(element, target) {
  const current = parseInt(element.textContent) || 0;
  if (current === target) return;

  element.textContent = target;
  element.style.transform = 'scale(1.3)';
  element.style.color = '#6366f1';
  setTimeout(() => {
    element.style.transform = 'scale(1)';
    element.style.color = '';
    element.style.transition = 'all 0.3s ease';
  }, 150);
}

// ═══════════════════════════════════════════════════════════════
// API Fetching
// ═══════════════════════════════════════════════════════════════

async function fetchAllPRs() {
  try {
    const response = await fetch(`${API_BASE}/api/pulls/all`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const prs = await response.json();

    pullRequests = {};
    for (const pr of prs) {
      pullRequests[pr.id] = pr;
    }

    renderAllPRs();
    updateStats();
    console.log(`[API] Loaded ${prs.length} pull requests`);
  } catch (error) {
    console.error('[API] Failed to fetch PRs:', error);
  }
}

async function fetchReviewerLoad() {
  try {
    const response = await fetch(`${API_BASE}/api/reviewers/load`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    updateChart(data);
  } catch (error) {
    console.error('[API] Failed to fetch reviewer load:', error);
  }
}

async function fetchStalePRs() {
  try {
    const response = await fetch(`${API_BASE}/api/pulls/stale`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const stale = await response.json();
    stalePRIds = new Set(stale.map(pr => pr.id));

    // Apply stale class to existing cards
    for (const id of stalePRIds) {
      const card = document.getElementById(`pr-card-${id}`);
      if (card && !card.classList.contains('stale')) {
        card.classList.add('stale');
      }
    }
  } catch (error) {
    console.error('[API] Failed to fetch stale PRs:', error);
  }
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[APP] Code Review Dashboard initializing...');

  // Initialize Chart.js
  initChart();

  // Fetch initial data
  await fetchAllPRs();
  await fetchReviewerLoad();
  await fetchStalePRs();

  // Connect WebSocket for live updates
  connectWebSocket();

  // Periodically refresh stale PRs and reviewer load
  setInterval(fetchStalePRs, 60000);
  setInterval(fetchReviewerLoad, 30000);

  console.log('[APP] Dashboard ready');
});
