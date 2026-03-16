import { createClient } from 'redis';
import { env } from './env';
import { logger } from '../utils/logger';

export const redisClient = createClient({
  url: env.REDIS_URL,
});

redisClient.on('error', (err) => {
  logger.error('Redis client error', err);
});

redisClient.on('connect', () => {
  logger.info('✅ Redis connection established');
});

export async function connectRedis(): Promise<void> {
  try {
    await redisClient.connect();
  } catch (error) {
    logger.error('❌ Redis connection failed', error);
  }
}

export const redisSubscriber = redisClient.duplicate();
