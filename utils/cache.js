// ===============================
// Cache Utility (Redis)
// ===============================

const Redis = require('ioredis');
const logger = require('./logger');

class CacheManager {
  constructor() {
    this.redis = null;
    this.initialized = false;
  }

  /**
   * Initialize Redis connection
   */
  async init() {
    try {
      const redisUrl = process.env.REDIS_URL ||
        process.env.REDIS_CONNECTION ||
        'redis://localhost:6379';

      this.redis = new Redis(redisUrl, {
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        enableOfflineQueue: true,
      });

      this.redis.on('connect', () => {
        logger.info('Redis connected');
        this.initialized = true;
      });

      this.redis.on('error', (err) => {
        logger.error('Redis error:', err);
        this.initialized = false;
      });

      // Test connection
      await this.redis.ping();
      this.initialized = true;
      logger.info('Redis cache initialized');
    } catch (error) {
      logger.warn('Redis not available, caching disabled:', error.message);
      this.initialized = false;
    }
  }

  /**
   * Get value from cache
   * @param {String} key - Cache key
   * @returns {String|null} - Cached value or null
   */
  async get(key) {
    if (!this.initialized || !this.redis) return null;

    try {
      return await this.redis.get(key);
    } catch (error) {
      logger.warn('Cache get error:', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {String} key - Cache key
   * @param {String} value - Cache value
   * @param {Number} ttl - Time to live in seconds
   */
  async set(key, value, ttl = 3600) {
    if (!this.initialized || !this.redis) return;

    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      logger.warn('Cache set error:', { key, error: error.message });
    }
  }

  /**
   * Delete key from cache
   * @param {String} key - Cache key
   */
  async delete(key) {
    if (!this.initialized || !this.redis) return;

    try {
      await this.redis.del(key);
    } catch (error) {
      logger.warn('Cache delete error:', { key, error: error.message });
    }
  }

  /**
   * Delete keys matching pattern
   * @param {String} pattern - Key pattern (e.g., 'user:*')
   */
  async deletePattern(pattern) {
    if (!this.initialized || !this.redis) return;

    try {
      let cursor = '0';
      do {
        const result = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = result[0];
        if (result[1].length) await this.redis.del(...result[1]);
      } while (cursor !== '0');
    } catch (error) {
      logger.warn('Cache delete pattern error:', { pattern, error: error.message });
    }
  }

  /**
   * Clear all cache
   */
  async flush() {
    if (!this.initialized || !this.redis) return;

    try {
      await this.redis.flushdb();
      logger.info('Cache flushed');
    } catch (error) {
      logger.warn('Cache flush error:', error.message);
    }
  }

  /**
   * Check if cache is available
   */
  isAvailable() {
    return this.initialized && this.redis !== null;
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      logger.info('Redis connection closed');
    }
  }
}

// Singleton instance
let instance = null;

function getCacheManager() {
  if (!instance) {
    instance = new CacheManager();
  }
  return instance;
}

module.exports = getCacheManager();
