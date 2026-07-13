const express = require('express');
const rateLimit = require('express-rate-limit');
const { getPool } = require('../db/client');

const textRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

function createTextRouter() {
  const router = express.Router();
  router.use(textRateLimiter);

  /** GET /api/texts/books — list all books */
  router.get('/books', async (_req, res, next) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        'SELECT id, code, name, category FROM books ORDER BY code',
      );
      res.json({ count: result.rowCount, books: result.rows });
    } catch (err) {
      next(err);
    }
  });

  /** GET /api/texts/books/:bookCode — get a single book */
  router.get('/books/:bookCode', async (req, res, next) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        'SELECT id, code, name, category FROM books WHERE code = $1',
        [req.params.bookCode],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      return res.json(result.rows[0]);
    } catch (err) {
      return next(err);
    }
  });

  /** GET /api/texts/books/:bookCode/chapters — list chapters for a book */
  router.get('/books/:bookCode/chapters', async (req, res, next) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT c.id, c.chapter_number
         FROM chapters c
         JOIN books b ON b.id = c.book_id
         WHERE b.code = $1
         ORDER BY c.chapter_number`,
        [req.params.bookCode],
      );
      res.json({ count: result.rowCount, chapters: result.rows });
    } catch (err) {
      next(err);
    }
  });

  /** GET /api/texts/books/:bookCode/chapters/:chapter/verses — list verses in a chapter */
  router.get('/books/:bookCode/chapters/:chapter/verses', async (req, res, next) => {
    try {
      const pool = getPool();
      const chapterNumber = Number(req.params.chapter);
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
        return res.status(400).json({ error: 'Invalid chapter number' });
      }
      const result = await pool.query(
        `SELECT v.id, v.verse_number, v.raw_text
         FROM verses v
         JOIN chapters c ON c.id = v.chapter_id
         JOIN books b ON b.id = c.book_id
         WHERE b.code = $1 AND c.chapter_number = $2
         ORDER BY v.verse_number`,
        [req.params.bookCode, chapterNumber],
      );
      return res.json({ count: result.rowCount, verses: result.rows });
    } catch (err) {
      return next(err);
    }
  });

  /** GET /api/texts/books/:bookCode/chapters/:chapter/verses/:verse — single verse with words */
  router.get('/books/:bookCode/chapters/:chapter/verses/:verse', async (req, res, next) => {
    try {
      const pool = getPool();
      const chapterNumber = Number(req.params.chapter);
      const verseNumber = Number(req.params.verse);
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
        return res.status(400).json({ error: 'Invalid chapter number' });
      }
      if (!Number.isInteger(verseNumber) || verseNumber < 1) {
        return res.status(400).json({ error: 'Invalid verse number' });
      }

      const verseResult = await pool.query(
        `SELECT v.id, v.verse_number, v.raw_text
         FROM verses v
         JOIN chapters c ON c.id = v.chapter_id
         JOIN books b ON b.id = c.book_id
         WHERE b.code = $1 AND c.chapter_number = $2 AND v.verse_number = $3`,
        [req.params.bookCode, chapterNumber, verseNumber],
      );
      if (verseResult.rowCount === 0) {
        return res.status(404).json({ error: 'Verse not found' });
      }

      const verse = verseResult.rows[0];

      const wordsResult = await pool.query(
        `SELECT vw.id, vw.word_index, vw.word_text, vw.normalized_text,
                json_agg(
                  json_build_object(
                    'accentIndex', wa.accent_index,
                    'tropeCode', wa.trope_code,
                    'tropeSymbol', wa.trope_symbol
                  ) ORDER BY wa.accent_index
                ) FILTER (WHERE wa.id IS NOT NULL) AS accents
         FROM verse_words vw
         LEFT JOIN word_accents wa ON wa.word_id = vw.id
         WHERE vw.verse_id = $1
         GROUP BY vw.id
         ORDER BY vw.word_index`,
        [verse.id],
      );

      verse.words = wordsResult.rows.map((row) => ({
        ...row,
        accents: row.accents || [],
      }));

      return res.json(verse);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = { createTextRouter };
