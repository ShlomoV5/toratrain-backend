const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

function authenticateJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

module.exports = {
  authenticateJwt,
  authorizeRoles,
};
