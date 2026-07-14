/**
 * SQLite Database Layer
 * Manages pull request state persistence with idempotency checks.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'dashboard.db');

let db;

/**
 * Initialize the database and create tables if they don't exist.
 */
function initDatabase() {
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS pull_requests (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'opened',
      reviewers TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  console.log('[DB] SQLite database initialized at', DB_PATH);
  return db;
}

/**
 * Check if a pull request exists by ID.
 */
function prExists(id) {
  const row = db.prepare('SELECT id FROM pull_requests WHERE id = ?').get(id);
  return !!row;
}

/**
 * Create a new pull request record (idempotent — skips if exists).
 * @returns {object|null} The created PR or null if already exists.
 */
function createPR(pr) {
  if (prExists(pr.id)) {
    console.log(`[DB] PR #${pr.id} already exists — skipping (idempotent)`);
    return null;
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO pull_requests (id, title, author, url, status, reviewers, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    pr.id,
    pr.title,
    pr.author,
    pr.url,
    pr.status || 'opened',
    JSON.stringify(pr.reviewers || []),
    pr.created_at || now,
    pr.updated_at || now
  );

  console.log(`[DB] Created PR #${pr.id}: "${pr.title}" by ${pr.author}`);
  return getPR(pr.id);
}

/**
 * Get a single pull request by ID.
 */
function getPR(id) {
  const row = db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    reviewers: JSON.parse(row.reviewers || '[]')
  };
}

/**
 * Update the status of a pull request.
 */
function updatePRStatus(id, status) {
  const now = new Date().toISOString();
  const result = db.prepare(
    'UPDATE pull_requests SET status = ?, updated_at = ? WHERE id = ?'
  ).run(status, now, id);

  if (result.changes === 0) {
    console.warn(`[DB] PR #${id} not found — cannot update status to "${status}"`);
    return null;
  }

  console.log(`[DB] Updated PR #${id} status → "${status}"`);
  return getPR(id);
}

/**
 * Add a reviewer to a pull request.
 */
function addReviewer(prId, reviewer) {
  const pr = getPR(prId);
  if (!pr) return null;

  const reviewers = pr.reviewers || [];
  if (!reviewers.includes(reviewer)) {
    reviewers.push(reviewer);
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE pull_requests SET reviewers = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(reviewers), now, prId);
    console.log(`[DB] Added reviewer "${reviewer}" to PR #${prId}`);
  }

  return getPR(prId);
}

/**
 * Get all active (non-merged, non-closed) pull requests.
 */
function getActivePRs() {
  const rows = db.prepare(
    "SELECT * FROM pull_requests WHERE status NOT IN ('merged', 'closed') ORDER BY created_at DESC"
  ).all();

  return rows.map(row => ({
    ...row,
    reviewers: JSON.parse(row.reviewers || '[]')
  }));
}

/**
 * Get ALL pull requests (for the dashboard).
 */
function getAllPRs() {
  const rows = db.prepare(
    'SELECT * FROM pull_requests ORDER BY updated_at DESC'
  ).all();

  return rows.map(row => ({
    ...row,
    reviewers: JSON.parse(row.reviewers || '[]')
  }));
}

/**
 * Get stale PRs — active PRs not updated in the last 24 hours.
 */
function getStalePRs() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(
    "SELECT * FROM pull_requests WHERE status NOT IN ('merged', 'closed') AND updated_at < ? ORDER BY updated_at ASC"
  ).all(cutoff);

  return rows.map(row => ({
    ...row,
    reviewers: JSON.parse(row.reviewers || '[]')
  }));
}

/**
 * Get reviewer load — count of active PRs per reviewer.
 */
function getReviewerLoad() {
  const activePRs = getActivePRs();
  const loadMap = {};

  for (const pr of activePRs) {
    const reviewers = pr.reviewers || [];
    for (const reviewer of reviewers) {
      loadMap[reviewer] = (loadMap[reviewer] || 0) + 1;
    }
  }

  return Object.entries(loadMap).map(([reviewer, load]) => ({
    reviewer,
    load
  }));
}

module.exports = {
  initDatabase,
  prExists,
  createPR,
  getPR,
  updatePRStatus,
  addReviewer,
  getActivePRs,
  getAllPRs,
  getStalePRs,
  getReviewerLoad
};
