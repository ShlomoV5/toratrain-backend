const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || path.resolve(process.cwd(), '.env') });

module.exports = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  databaseUrl: process.env.DATABASE_URL,
};
