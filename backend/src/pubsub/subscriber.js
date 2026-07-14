/**
 * Redis Pub/Sub Subscriber
 * Subscribes to the pr_events channel and forwards messages
 * to the WebSocket manager for broadcasting to clients.
 */
const Redis = require('ioredis');

let subscriber = null;

/**
 * Initialize the Redis subscriber and wire it to the WebSocket broadcast function.
 * @param {string} redisUrl - Redis connection URL.
 * @param {Function} onMessage - Callback invoked with (channel, message) on each message.
 */
function initSubscriber(redisUrl, onMessage) {
  subscriber = new Redis(redisUrl, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 200, 5000);
      console.log(`[SUB] Reconnecting to Redis in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: null
  });

  subscriber.on('connect', () => {
    console.log('[SUB] Connected to Redis');
  });

  subscriber.on('error', (err) => {
    console.error('[SUB] Redis error:', err.message);
  });

  // Subscribe to the pr_events channel
  subscriber.subscribe('pr_events', (err, count) => {
    if (err) {
      console.error('[SUB] Failed to subscribe:', err.message);
      return;
    }
    console.log(`[SUB] Subscribed to ${count} channel(s) — listening for pr_events`);
  });

  // Forward messages to the callback
  subscriber.on('message', (channel, message) => {
    console.log(`[SUB] Received message on channel "${channel}"`);
    if (onMessage) {
      onMessage(channel, message);
    }
  });

  return subscriber;
}

/**
 * Get the subscriber instance.
 */
function getSubscriber() {
  return subscriber;
}

module.exports = { initSubscriber, getSubscriber };
