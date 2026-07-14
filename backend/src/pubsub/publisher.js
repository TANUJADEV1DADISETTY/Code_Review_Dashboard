/**
 * Redis Pub/Sub Publisher
 * Publishes processed webhook events to a Redis channel for consumption
 * by the WebSocket manager.
 */
const Redis = require('ioredis');

let publisher = null;

/**
 * Initialize the Redis publisher connection.
 * @param {string} redisUrl - Redis connection URL.
 */
function initPublisher(redisUrl) {
  publisher = new Redis(redisUrl, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 200, 5000);
      console.log(`[PUB] Reconnecting to Redis in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: null
  });

  publisher.on('connect', () => {
    console.log('[PUB] Connected to Redis');
  });

  publisher.on('error', (err) => {
    console.error('[PUB] Redis error:', err.message);
  });

  return publisher;
}

/**
 * Publish an event to the pr_events channel.
 * @param {string} type - Event type (e.g., 'pr:opened', 'pr:updated').
 * @param {object} data - Event payload data.
 */
async function publishEvent(type, data) {
  if (!publisher) {
    console.error('[PUB] Publisher not initialized');
    return;
  }

  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  await publisher.publish('pr_events', message);
  console.log(`[PUB] Published event: ${type} for PR #${data.id}`);
}

/**
 * Get the publisher instance.
 */
function getPublisher() {
  return publisher;
}

module.exports = { initPublisher, publishEvent, getPublisher };
