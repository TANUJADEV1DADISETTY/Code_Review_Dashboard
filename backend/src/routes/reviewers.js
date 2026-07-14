/**
 * Reviewers Route
 * 
 * Provides API endpoint for fetching reviewer load data.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');

/**
 * GET /api/reviewers/load
 * Returns the number of active (non-merged/closed) PRs assigned to each reviewer.
 */
router.get('/load', (req, res) => {
  try {
    const load = db.getReviewerLoad();
    res.json(load);
  } catch (error) {
    console.error('[API] Error fetching reviewer load:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
