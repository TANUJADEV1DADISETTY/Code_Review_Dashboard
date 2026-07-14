/**
 * Webhook Route Handler
 * 
 * Processes validated GitHub-style webhook events for pull requests.
 * Implements idempotent event handling and publishes updates via Redis pub/sub.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { publishEvent } = require('../pubsub/publisher');

/**
 * POST /api/webhook
 * Receives and processes webhook payloads.
 * HMAC verification is handled by middleware before this handler runs.
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    const eventType = req.headers['x-github-event'] || inferEventType(payload);

    console.log(`[WEBHOOK] Received event: ${eventType}, action: ${payload.action}`);

    switch (eventType) {
      case 'pull_request':
        await handlePullRequestEvent(payload);
        break;
      case 'pull_request_review':
        await handlePullRequestReviewEvent(payload);
        break;
      default:
        console.log(`[WEBHOOK] Unhandled event type: ${eventType}`);
    }

    // Return 202 Accepted — event has been queued for processing
    res.status(202).json({ status: 'accepted' });
  } catch (error) {
    console.error('[WEBHOOK] Error processing event:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Infer event type from payload structure when X-GitHub-Event header is missing.
 */
function inferEventType(payload) {
  if (payload.review) return 'pull_request_review';
  if (payload.pull_request) return 'pull_request';
  return 'unknown';
}

/**
 * Handle pull_request events (opened, closed, merged).
 */
async function handlePullRequestEvent(payload) {
  const pr = payload.pull_request;
  const action = payload.action;

  if (!pr || !pr.id) {
    console.warn('[WEBHOOK] Invalid pull_request payload — missing PR data');
    return;
  }

  switch (action) {
    case 'opened': {
      // Idempotent: createPR returns null if PR already exists
      const created = db.createPR({
        id: pr.id,
        title: pr.title,
        author: pr.user?.login || pr.user || 'unknown',
        url: pr.html_url || pr.url || '',
        status: 'opened',
        reviewers: (pr.requested_reviewers || []).map(r => r.login || r),
        created_at: pr.created_at,
        updated_at: pr.updated_at
      });

      if (created) {
        await publishEvent('pr:opened', {
          id: created.id,
          title: created.title,
          author: created.author,
          status: created.status,
          url: created.url,
          reviewers: created.reviewers,
          created_at: created.created_at
        });
      }
      break;
    }

    case 'closed': {
      const isMerged = pr.merged === true;
      const newStatus = isMerged ? 'merged' : 'closed';

      const existing = db.getPR(pr.id);
      if (!existing) {
        console.warn(`[WEBHOOK] PR #${pr.id} not found — ignoring close event`);
        return;
      }

      const updated = db.updatePRStatus(pr.id, newStatus);
      if (updated) {
        await publishEvent('pr:updated', {
          id: updated.id,
          status: updated.status
        });
      }
      break;
    }

    default:
      console.log(`[WEBHOOK] Unhandled pull_request action: ${action}`);
  }
}

/**
 * Handle pull_request_review events (submitted).
 */
async function handlePullRequestReviewEvent(payload) {
  const action = payload.action;
  const review = payload.review;
  const pr = payload.pull_request;

  if (action !== 'submitted') {
    console.log(`[WEBHOOK] Ignoring review action: ${action}`);
    return;
  }

  if (!pr || !pr.id) {
    console.warn('[WEBHOOK] Invalid review payload — missing PR data');
    return;
  }

  // Check if PR exists — if not, ignore (handle out-of-order events gracefully)
  const existing = db.getPR(pr.id);
  if (!existing) {
    console.warn(`[WEBHOOK] PR #${pr.id} not found — ignoring review event (out-of-order?)`);
    return;
  }

  // Add reviewer if provided
  const reviewer = review?.user?.login || review?.user || null;
  if (reviewer) {
    db.addReviewer(pr.id, reviewer);
  }

  // Update status to in_review
  const updated = db.updatePRStatus(pr.id, 'in_review');
  if (updated) {
    await publishEvent('pr:updated', {
      id: updated.id,
      status: updated.status,
      reviewer: reviewer
    });
  }
}

module.exports = router;
