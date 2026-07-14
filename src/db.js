const { Pool } = require('pg');
const { databaseUrl } = require('./config');

const pool = new Pool(
  databaseUrl
    ? {
        connectionString: databaseUrl,
      }
    : undefined,
);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
