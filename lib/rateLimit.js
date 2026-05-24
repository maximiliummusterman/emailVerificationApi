import { incrementWithExpiry } from './redis.js';

export async function checkRateLimit(key, maxRequests, windowSeconds) {
  const count = await incrementWithExpiry(key, windowSeconds);

  return {
    allowed: count <= maxRequests,
    count,
    remaining: Math.max(0, maxRequests - count)
  };
}
