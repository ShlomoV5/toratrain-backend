function createRateLimiter({ windowMs, maxRequests }) {
  const hits = new Map();

  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const hit = hits.get(key);

    if (!hit || now > hit.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (hit.count >= maxRequests) {
      const retryAfter = Math.ceil((hit.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: 'Too many requests' });
    }

    hit.count += 1;
    return next();
  };
}

module.exports = {
  createRateLimiter,
};
