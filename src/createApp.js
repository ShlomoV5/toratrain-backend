const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const {
  jwtExpiresIn,
  jwtSecret,
  rateLimitMaxRequests,
  rateLimitWindowMs,
} = require('./config');
const { authenticateJwt, authorizeRoles } = require('./middleware/auth');
const { createRateLimiter } = require('./middleware/rateLimit');

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function buildTextHierarchy(rows) {
  const verses = new Map();

  for (const row of rows) {
    if (!verses.has(row.verse_id)) {
      verses.set(row.verse_id, {
        verseId: row.verse_id,
        verseNumber: row.verse_number,
        text: row.verse_text,
        words: [],
      });
    }

    const verse = verses.get(row.verse_id);
    if (row.word_id) {
      let word = verse.words.find((entry) => entry.wordId === row.word_id);
      if (!word) {
        word = {
          wordId: row.word_id,
          position: row.word_position,
          text: row.word_text,
          tropes: [],
        };
        verse.words.push(word);
      }

      if (row.trope_id) {
        word.tropes.push({
          tropeId: row.trope_id,
          symbol: row.trope_symbol,
        });
      }
    }
  }

  return Array.from(verses.values()).sort((a, b) => a.verseNumber - b.verseNumber);
}

function createApp(db) {
  const app = express();
  const openapi = YAML.load(path.join(__dirname, '..', 'docs', 'openapi.yaml'));
  const apiRateLimiter = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: rateLimitMaxRequests,
  });

  app.use(express.json());
  app.use('/api', apiRateLimiter);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));

  app.post(
    '/api/auth/login',
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const result = await db.query(
        'SELECT id, email, password_hash, role FROM users WHERE email = $1',
        [email],
      );
      const user = result.rows[0];
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, jwtSecret, {
        expiresIn: jwtExpiresIn,
      });

      return res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
    }),
  );

  app.get(
    '/api/texts/:bookId/:chapter',
    authenticateJwt,
    asyncHandler(async (req, res) => {
      const { bookId, chapter } = req.params;
      const rows = await db.query(
        `SELECT
          v.id AS verse_id,
          v.number AS verse_number,
          v.text AS verse_text,
          w.id AS word_id,
          w.position AS word_position,
          w.text AS word_text,
          t.id AS trope_id,
          t.symbol AS trope_symbol
        FROM verses v
        JOIN chapters c ON c.id = v.chapter_id
        LEFT JOIN words w ON w.verse_id = v.id
        LEFT JOIN tropes t ON t.word_id = w.id
        WHERE c.book_id = $1 AND c.number = $2
        ORDER BY v.number, w.position, t.id`,
        [bookId, chapter],
      );

      return res.json({
        bookId: Number(bookId),
        chapter: Number(chapter),
        verses: buildTextHierarchy(rows.rows),
      });
    }),
  );

  app.post(
    '/api/students',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (req, res) => {
      const { email, password, displayName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userInsert = await db.query(
        `INSERT INTO users(email, password_hash, role)
         VALUES ($1, $2, 'STUDENT')
         RETURNING id, email, role`,
        [email, passwordHash],
      );

      const user = userInsert.rows[0];
      await db.query(
        `INSERT INTO students(user_id, display_name)
         VALUES ($1, $2)`,
        [user.id, displayName || null],
      );

      return res.status(201).json(user);
    }),
  );

  app.get(
    '/api/students',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (_req, res) => {
      const result = await db.query(
        `SELECT u.id, u.email, u.role, s.display_name, s.coins
         FROM users u
         JOIN students s ON s.user_id = u.id
         WHERE u.role = 'STUDENT'
         ORDER BY u.id`,
      );
      return res.json(result.rows);
    }),
  );

  app.get(
    '/api/students/:id',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT u.id, u.email, u.role, s.display_name, s.coins, s.feedback
         FROM users u
         JOIN students s ON s.user_id = u.id
         WHERE u.id = $1 AND u.role = 'STUDENT'`,
        [req.params.id],
      );
      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Student not found' });
      }
      return res.json(result.rows[0]);
    }),
  );

  app.put(
    '/api/students/:id',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (req, res) => {
      const { email, password, displayName } = req.body;
      const updates = [];
      const params = [];

      if (email) {
        params.push(email);
        updates.push(`email = $${params.length}`);
      }
      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        params.push(passwordHash);
        updates.push(`password_hash = $${params.length}`);
      }

      if (updates.length) {
        params.push(req.params.id);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length} AND role = 'STUDENT'`, params);
      }

      if (displayName !== undefined) {
        await db.query('UPDATE students SET display_name = $1 WHERE user_id = $2', [displayName, req.params.id]);
      }

      const result = await db.query(
        `SELECT u.id, u.email, u.role, s.display_name, s.coins
         FROM users u JOIN students s ON s.user_id = u.id
         WHERE u.id = $1 AND u.role = 'STUDENT'`,
        [req.params.id],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Student not found' });
      }

      return res.json(result.rows[0]);
    }),
  );

  app.delete(
    '/api/students/:id',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (req, res) => {
      await db.query('DELETE FROM students WHERE user_id = $1', [req.params.id]);
      const deleted = await db.query("DELETE FROM users WHERE id = $1 AND role = 'STUDENT' RETURNING id", [req.params.id]);

      if (!deleted.rows[0]) {
        return res.status(404).json({ error: 'Student not found' });
      }

      return res.status(204).send();
    }),
  );

  app.post(
    '/api/students/:id/coins',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (req, res) => {
      const { delta } = req.body;
      if (!Number.isInteger(delta)) {
        return res.status(400).json({ error: 'delta must be an integer' });
      }

      const result = await db.query(
        `UPDATE students
         SET coins = coins + $1
         WHERE user_id = $2
         RETURNING user_id AS id, coins`,
        [delta, req.params.id],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Student not found' });
      }

      return res.json(result.rows[0]);
    }),
  );

  app.post(
    '/api/students/:id/feedback',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (req, res) => {
      const { message, score } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }

      const result = await db.query(
        `UPDATE students
         SET feedback = COALESCE(feedback, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'timestamp', NOW(),
           'author_id', $1,
           'message', $2,
           'score', $3
         ))
         WHERE user_id = $4
         RETURNING user_id AS id, feedback`,
        [req.user.id, message, score || null, req.params.id],
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Student not found' });
      }

      return res.json(result.rows[0]);
    }),
  );

  app.post(
    '/api/assignments',
    authenticateJwt,
    authorizeRoles('ADMIN'),
    asyncHandler(async (req, res) => {
      const {
        studentId,
        startVerseId,
        endVerseId,
        partStartIndex,
        partEndIndex,
      } = req.body;
      if (!studentId) {
        return res.status(400).json({ error: 'studentId is required' });
      }

      const studentCheck = await db.query(
        "SELECT id FROM users WHERE id = $1 AND role = 'STUDENT'",
        [studentId],
      );
      if (!studentCheck.rows[0]) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const result = await db.query(
        `INSERT INTO assignments(
          admin_user_id,
          student_user_id,
          start_verse_id,
          end_verse_id,
          part_start_index,
          part_end_index,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
        RETURNING id, admin_user_id, student_user_id, start_verse_id, end_verse_id, part_start_index, part_end_index, status`,
        [req.user.id, studentId, startVerseId || null, endVerseId || null, partStartIndex || null, partEndIndex || null],
      );

      return res.status(201).json(result.rows[0]);
    }),
  );

  app.get(
    '/api/assignments/my-routes',
    authenticateJwt,
    authorizeRoles('STUDENT'),
    asyncHandler(async (req, res) => {
      const result = await db.query(
        `SELECT id, admin_user_id, student_user_id, start_verse_id, end_verse_id, part_start_index, part_end_index, status, created_at
         FROM assignments
         WHERE student_user_id = $1 AND status = 'ACTIVE'
         ORDER BY created_at DESC`,
        [req.user.id],
      );

      return res.json(result.rows);
    }),
  );

  app.use((err, _req, res, _next) => {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Resource already exists' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = {
  createApp,
};
