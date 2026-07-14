const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVerseWords, SefariaService } = require('../src/services/sefariaService');

test('parseVerseWords splits a Hebrew verse into words', () => {
  // Sample: Genesis 1:1 in Hebrew (simplified without full nikud)
  const verse = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים';
  const words = parseVerseWords(verse);

  assert.equal(words.length, 3);
  assert.equal(words[0].wordIndex, 0);
  assert.equal(words[1].wordIndex, 1);
  assert.equal(words[2].wordIndex, 2);
});

test('parseVerseWords extracts trope accents from words', () => {
  // Word containing a tipeha accent (U+0596)
  const wordWithTrope = 'בָּרָ֣א';
  const words = parseVerseWords(wordWithTrope);

  assert.equal(words.length, 1);
  assert.ok(words[0].accents.length > 0, 'expected at least one accent');
  const accent = words[0].accents[0];
  assert.ok(typeof accent.tropeCode === 'string', 'tropeCode should be a string');
  assert.ok(typeof accent.tropeSymbol === 'string', 'tropeSymbol should be a string');
});

test('parseVerseWords strips tropes to produce normalizedText', () => {
  // Hebrew word with trope: tipeha U+0596 and merkha U+05A5
  const wordWithTropes = 'אֱלֹהִ֑ים';
  const words = parseVerseWords(wordWithTropes);

  assert.equal(words.length, 1);
  // normalizedText should not contain any trope characters
  const TROPE_REGEX = /[\u0591-\u05AF\u05BE\u05C0]/;
  const NIKUD_REGEX = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/;
  assert.ok(!TROPE_REGEX.test(words[0].normalizedText), 'normalizedText should not contain tropes');
  assert.ok(!NIKUD_REGEX.test(words[0].normalizedText), 'normalizedText should not contain nikud');
});

test('parseVerseWords returns empty array for empty or non-string input', () => {
  assert.deepEqual(parseVerseWords(''), []);
  assert.deepEqual(parseVerseWords(null), []);
  assert.deepEqual(parseVerseWords(undefined), []);
});

test('SefariaService.fetchChapterVerses returns array of verse objects on success', async () => {
  // Mock fetch to avoid real network call
  const mockData = {
    text: ['בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים', 'וְהָאָ֗רֶץ הָיְתָ֥ה תֹ֙הוּ֙'],
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => mockData,
  });

  try {
    const service = new SefariaService('https://example.com/api');
    const verses = await service.fetchChapterVerses('Genesis', 1);

    assert.equal(verses.length, 2);
    assert.equal(verses[0].verseNumber, 1);
    assert.equal(verses[1].verseNumber, 2);
    assert.ok(verses[0].words.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('SefariaService.fetchChapterVerses throws on non-OK HTTP response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    text: async () => 'Not found',
  });

  try {
    const service = new SefariaService('https://example.com/api');
    await assert.rejects(() => service.fetchChapterVerses('Genesis', 999), {
      message: /Sefaria API error 404/,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
