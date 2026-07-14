/**
 * Pull Requests Route
 * 
 * Provides API endpoints for fetching pull request data.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/pulls
 * Returns all active (non-merged, non-closed) pull requests.
 */
router.get('/', (req, res) => {
  try {
    const pulls = db.getActivePRs();
    res.json(pulls);
  } catch (error) {
    console.error('[API] Error fetching active PRs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/pulls/all
 * Returns ALL pull requests regardless of status.
 */
router.get('/all', (req, res) => {
  try {
    const pulls = db.getAllPRs();
    res.json(pulls);
  } catch (error) {
    console.error('[API] Error fetching all PRs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/pulls/stale
 * Returns active pull requests that haven't been updated in 24+ hours.
 */
router.get('/stale', (req, res) => {
  try {
    const stalePRs = db.getStalePRs();
    res.json(stalePRs);
  } catch (error) {
    console.error('[API] Error fetching stale PRs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
