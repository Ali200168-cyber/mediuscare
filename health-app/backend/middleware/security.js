const requestBuckets = new Map();

const apiRateLimit = ({ windowMs = 60 * 1000, max = 120 } = {}) => {
  return (req, res, next) => {
    const key = `${req.ip || "unknown"}:${req.path}`;
    const now = Date.now();
    const bucket = requestBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      requestBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= max) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please retry shortly.",
      });
    }

    bucket.count += 1;
    requestBuckets.set(key, bucket);
    return next();
  };
};

module.exports = {
  apiRateLimit,
};
