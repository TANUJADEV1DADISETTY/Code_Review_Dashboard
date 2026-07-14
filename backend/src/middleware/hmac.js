/**
 * HMAC-SHA256 Signature Verification Middleware
 * 
 * Validates incoming webhook requests by comparing the X-Hub-Signature-256 header
 * against a computed HMAC digest of the raw request body. Uses timing-safe comparison
 * to prevent timing attacks.
 */
const crypto = require('crypto');

/**
 * Creates Express middleware that verifies HMAC-SHA256 signatures.
 * @param {string} secret - The shared webhook secret key.
 * @returns {Function} Express middleware function.
 */
function createHmacMiddleware(secret) {
  return (req, res, next) => {
    const signatureHeader = req.headers['x-hub-signature-256'];

    // Reject if no signature header is present
    if (!signatureHeader) {
      console.warn('[HMAC] Request rejected: Missing X-Hub-Signature-256 header');
      return res.status(403).json({ error: 'Forbidden: Missing signature header' });
    }

    // The raw body must be available (set up in server.js via express.json verify option)
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.error('[HMAC] Request rejected: Raw body not available');
      return res.status(400).json({ error: 'Bad Request: Unable to read body' });
    }

    // Compute HMAC-SHA256 digest
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const computedSignature = 'sha256=' + hmac.digest('hex');

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signatureHeader);
    const computedBuffer = Buffer.from(computedSignature);

    if (sigBuffer.length !== computedBuffer.length) {
      console.warn('[HMAC] Request rejected: Signature length mismatch');
      return res.status(403).json({ error: 'Forbidden: Invalid signature' });
    }

    if (!crypto.timingSafeEqual(sigBuffer, computedBuffer)) {
      console.warn('[HMAC] Request rejected: Signature mismatch');
      return res.status(403).json({ error: 'Forbidden: Invalid signature' });
    }

    console.log('[HMAC] Signature verified successfully');
    next();
  };
}

module.exports = { createHmacMiddleware };
