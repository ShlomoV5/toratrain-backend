const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src/createApp');
const { jwtSecret } = require('../src/config');

function createDbMock(overrides = {}) {
  return {
    query: async () => ({ rows: [] }),
    ...overrides,
  };
}

test('POST /api/auth/login returns token for valid credentials', async () => {
  const db = createDbMock({
    query: async () => ({
      rows: [
        {
          id: 1,
          email: 'admin@example.com',
          role: 'ADMIN',
          password_hash: '$2b$10$UON1Qluz8VDKoUwJvId.D.b4TtEL.BJ8piUoaLAahnNk4bVSgaTPS', // secret123
        },
      ],
    }),
  });
  const app = createApp(db);

  const response = await request(app).post('/api/auth/login').send({
    email: 'admin@example.com',
    password: 'secret123',
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
});

test('GET /api/assignments/my-routes is restricted to students', async () => {
  const db = createDbMock();
  const app = createApp(db);
  const adminToken = jwt.sign({ id: 1, role: 'ADMIN' }, jwtSecret);

  const response = await request(app)
    .get('/api/assignments/my-routes')
    .set('Authorization', 'Bearer ' + adminToken);

  assert.equal(response.status, 403);
});

test('GET /api/texts/:bookId/:chapter returns structured hierarchy', async () => {
  const db = createDbMock({
    query: async () => ({
      rows: [
        {
          verse_id: 10,
          verse_number: 1,
          verse_text: 'Verse A',
          word_id: 100,
          word_position: 1,
          word_text: 'Word',
          trope_id: 1000,
          trope_symbol: 'mercha',
        },
      ],
    }),
  });

  const app = createApp(db);
  const studentToken = jwt.sign({ id: 2, role: 'STUDENT' }, jwtSecret);

  const response = await request(app)
    .get('/api/texts/1/1')
    .set('Authorization', 'Bearer ' + studentToken);

  assert.equal(response.status, 200);
  assert.equal(response.body.verses.length, 1);
  assert.equal(response.body.verses[0].words[0].tropes[0].symbol, 'mercha');
});
