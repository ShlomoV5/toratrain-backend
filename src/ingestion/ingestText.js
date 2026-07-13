#!/usr/bin/env node
/**
 * Sefaria Text Ingestion Script
 *
 * Fetches Hebrew Torah/Haftarah/Megillot texts from the Sefaria API and upserts them
 * into the PostgreSQL database (books → chapters → verses → verse_words → word_accents).
 *
 * Usage:
 *   node src/ingestion/ingestText.js [--books 01,02] [--chapters 1-3] [--dry-run]
 *
 * Environment variables:
 *   DATABASE_URL    PostgreSQL connection string (required unless --dry-run)
 *   DATABASE_SSL    Set to "true" to enable SSL (optional)
 *   SEFARIA_API_BASE  Override Sefaria API base URL (optional)
 */

const { SefariaService, ALL_BOOKS } = require('../services/sefariaService');
const { getPool, closePool } = require('../db/client');

// Delay helper to avoid overwhelming the Sefaria API
const SEFARIA_API_DELAY_MS = 250;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parse CLI arguments into a simple options object.
 * Supported flags:
 *   --books 01,02,05   comma-separated book codes to ingest (default: all)
 *   --chapters 1-3     chapter range to ingest per book (default: all)
 *   --dry-run          fetch and parse without writing to the database
 */
function parseArgs(argv) {
  const opts = { bookCodes: null, chapterRange: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') {
      opts.dryRun = true;
    } else if (argv[i] === '--books' && argv[i + 1]) {
      opts.bookCodes = argv[++i].split(',').map((c) => c.trim().padStart(2, '0'));
    } else if (argv[i] === '--chapters' && argv[i + 1]) {
      const parts = argv[++i].split('-').map(Number);
      opts.chapterRange = { from: parts[0] || 1, to: parts[1] || parts[0] };
    }
  }
  return opts;
}

/** Upsert a book row; returns the database id. */
async function upsertBook(pool, book) {
  const result = await pool.query(
    `INSERT INTO books (code, name, category)
     VALUES ($1, $2, $3)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category
     RETURNING id`,
    [book.code, book.name, book.category],
  );
  return result.rows[0].id;
}

/** Upsert a chapter row; returns the database id. */
async function upsertChapter(pool, bookId, chapterNumber) {
  const result = await pool.query(
    `INSERT INTO chapters (book_id, chapter_number)
     VALUES ($1, $2)
     ON CONFLICT (book_id, chapter_number) DO UPDATE SET chapter_number = EXCLUDED.chapter_number
     RETURNING id`,
    [bookId, chapterNumber],
  );
  return result.rows[0].id;
}

/** Upsert a verse row; returns the database id. */
async function upsertVerse(pool, chapterId, verseNumber, rawText) {
  const result = await pool.query(
    `INSERT INTO verses (chapter_id, verse_number, raw_text)
     VALUES ($1, $2, $3)
     ON CONFLICT (chapter_id, verse_number) DO UPDATE SET raw_text = EXCLUDED.raw_text
     RETURNING id`,
    [chapterId, verseNumber, rawText],
  );
  return result.rows[0].id;
}

/** Upsert a verse_word row; returns the database id. */
async function upsertVerseWord(pool, verseId, wordIndex, wordText, normalizedText) {
  const result = await pool.query(
    `INSERT INTO verse_words (verse_id, word_index, word_text, normalized_text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (verse_id, word_index) DO UPDATE SET word_text = EXCLUDED.word_text, normalized_text = EXCLUDED.normalized_text
     RETURNING id`,
    [verseId, wordIndex, wordText, normalizedText],
  );
  return result.rows[0].id;
}

/** Upsert word_accent rows for a word (delete-then-insert for clean replacement). */
async function replaceWordAccents(pool, wordId, accents) {
  await pool.query('DELETE FROM word_accents WHERE word_id = $1', [wordId]);
  for (const accent of accents) {
    await pool.query(
      `INSERT INTO word_accents (word_id, accent_index, trope_code, trope_symbol)
       VALUES ($1, $2, $3, $4)`,
      [wordId, accent.accentIndex, accent.tropeCode, accent.tropeSymbol],
    );
  }
}

/**
 * Ingest a single chapter for a given book.
 * @returns {{ versesIngested: number, wordsIngested: number, accentsIngested: number }}
 */
async function ingestChapter(pool, sefariaService, bookDbId, book, chapterNumber, dryRun) {
  const verses = await sefariaService.fetchChapterVerses(book.sefariaRef, chapterNumber);

  let versesIngested = 0;
  let wordsIngested = 0;
  let accentsIngested = 0;

  if (dryRun) {
    for (const verse of verses) {
      versesIngested++;
      wordsIngested += verse.words.length;
      for (const word of verse.words) {
        accentsIngested += word.accents.length;
      }
    }
    return { versesIngested, wordsIngested, accentsIngested };
  }

  const chapterDbId = await upsertChapter(pool, bookDbId, chapterNumber);

  for (const verse of verses) {
    const verseDbId = await upsertVerse(pool, chapterDbId, verse.verseNumber, verse.rawText);
    versesIngested++;

    for (const word of verse.words) {
      const wordDbId = await upsertVerseWord(
        pool,
        verseDbId,
        word.wordIndex,
        word.wordText,
        word.normalizedText,
      );
      wordsIngested++;

      if (word.accents.length > 0) {
        await replaceWordAccents(pool, wordDbId, word.accents);
        accentsIngested += word.accents.length;
      }
    }
  }

  return { versesIngested, wordsIngested, accentsIngested };
}

async function main() {
  const opts = parseArgs(process.argv);
  const sefariaService = new SefariaService(process.env.SEFARIA_API_BASE);
  const pool = opts.dryRun ? null : getPool();

  const booksToIngest = opts.bookCodes
    ? ALL_BOOKS.filter((b) => opts.bookCodes.includes(b.code))
    : ALL_BOOKS;

  if (booksToIngest.length === 0) {
    console.error('No matching books found for the provided --books filter.');
    process.exitCode = 1;
    return;
  }

  let totalVerses = 0;
  let totalWords = 0;
  let totalAccents = 0;

  for (const book of booksToIngest) {
    console.log(`\n[${book.code}] ${book.name} (${book.sefariaRef})`);

    let bookDbId = null;
    if (!opts.dryRun) {
      bookDbId = await upsertBook(pool, book);
    }

    // Determine how many chapters to fetch
    let chapterFrom = 1;
    let chapterTo;

    if (opts.chapterRange) {
      chapterFrom = opts.chapterRange.from;
      chapterTo = opts.chapterRange.to;
    } else {
      // Fetch the index to get chapter count
      try {
        const index = await sefariaService.fetchIndex(book.sefariaRef);
        chapterTo =
          Array.isArray(index.schema?.lengths)
            ? index.schema.lengths[0]
            : Array.isArray(index.lengths)
              ? index.lengths[0]
              : null;
        if (!chapterTo) {
          console.warn(`  Could not determine chapter count for ${book.sefariaRef}; defaulting to 1`);
          chapterTo = 1;
        }
      } catch (err) {
        console.warn(`  Index fetch failed for ${book.sefariaRef}: ${err.message}`);
        chapterTo = 1;
      }
    }

    for (let ch = chapterFrom; ch <= chapterTo; ch++) {
      try {
        const stats = await ingestChapter(pool, sefariaService, bookDbId, book, ch, opts.dryRun);
        totalVerses += stats.versesIngested;
        totalWords += stats.wordsIngested;
        totalAccents += stats.accentsIngested;
        process.stdout.write(
          `  Chapter ${ch}/${chapterTo}: ${stats.versesIngested} verses, ${stats.wordsIngested} words, ${stats.accentsIngested} accents\n`,
        );
      } catch (err) {
        console.error(`  Error ingesting ${book.sefariaRef} ${ch}: ${err.message}`);
      }
      // Polite delay between API calls
      if (ch < chapterTo) {
        await delay(SEFARIA_API_DELAY_MS);
      }
    }
  }

  console.log(
    `\nIngestion complete${opts.dryRun ? ' (dry-run)' : ''}:` +
      ` ${totalVerses} verses, ${totalWords} words, ${totalAccents} accents`,
  );

  if (pool) {
    await closePool();
  }
}

main().catch((err) => {
  console.error('Fatal ingestion error:', err);
  process.exitCode = 1;
});
