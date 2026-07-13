const SEFARIA_API_BASE = 'https://www.sefaria.org/api';

// Torah books catalogue with their Sefaria reference names and short codes
const TORAH_BOOKS = [
  { code: '01', name: 'Bereshit', sefariaRef: 'Genesis', category: 'torah' },
  { code: '02', name: 'Shemot', sefariaRef: 'Exodus', category: 'torah' },
  { code: '03', name: 'Vayikra', sefariaRef: 'Leviticus', category: 'torah' },
  { code: '04', name: 'Bemidbar', sefariaRef: 'Numbers', category: 'torah' },
  { code: '05', name: 'Devarim', sefariaRef: 'Deuteronomy', category: 'torah' },
];

const HAFTARAH_BOOKS = [
  { code: '06', name: 'Yehoshua', sefariaRef: 'Joshua', category: 'haftarah' },
  { code: '07', name: 'Shoftim', sefariaRef: 'Judges', category: 'haftarah' },
  { code: '08', name: 'Shmuel I', sefariaRef: 'I Samuel', category: 'haftarah' },
  { code: '09', name: 'Shmuel II', sefariaRef: 'II Samuel', category: 'haftarah' },
  { code: '10', name: 'Melachim I', sefariaRef: 'I Kings', category: 'haftarah' },
  { code: '11', name: 'Melachim II', sefariaRef: 'II Kings', category: 'haftarah' },
  { code: '12', name: 'Yeshayah', sefariaRef: 'Isaiah', category: 'haftarah' },
  { code: '13', name: 'Yirmiyah', sefariaRef: 'Jeremiah', category: 'haftarah' },
  { code: '14', name: 'Yechezkel', sefariaRef: 'Ezekiel', category: 'haftarah' },
  { code: '15', name: 'Hoshea', sefariaRef: 'Hosea', category: 'haftarah' },
  { code: '16', name: 'Amos', sefariaRef: 'Amos', category: 'haftarah' },
  { code: '17', name: 'Michah', sefariaRef: 'Micah', category: 'haftarah' },
  { code: '18', name: 'Zechariah', sefariaRef: 'Zechariah', category: 'haftarah' },
  { code: '19', name: 'Malachi', sefariaRef: 'Malachi', category: 'haftarah' },
];

const MEGILLOT_BOOKS = [
  { code: '20', name: 'Megillat Esther', sefariaRef: 'Esther', category: 'megillot' },
  { code: '21', name: 'Shir HaShirim', sefariaRef: 'Song of Songs', category: 'megillot' },
  { code: '22', name: 'Ruth', sefariaRef: 'Ruth', category: 'megillot' },
  { code: '23', name: 'Eichah', sefariaRef: 'Lamentations', category: 'megillot' },
  { code: '24', name: 'Kohelet', sefariaRef: 'Ecclesiastes', category: 'megillot' },
];

const ALL_BOOKS = [...TORAH_BOOKS, ...HAFTARAH_BOOKS, ...MEGILLOT_BOOKS];

// Hebrew Unicode cantillation (trope/teamim) marks: U+0591–U+05AF, U+05BE (paseq), U+05C0 (sof pasuq)
const TROPE_REGEX = /[\u0591-\u05AF\u05BE\u05C0]/g;
// Hebrew nikud (vowel points): U+05B0–U+05BD, U+05BF, U+05C1, U+05C2, U+05C4, U+05C5, U+05C7
const NIKUD_REGEX = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;

// Named trope codes — maps Unicode code point (hex) to conventional trope name
const TROPE_NAMES = {
  '05C1': 'shin_dot',
  '05C2': 'sin_dot',
  '0591': 'etnahta',
  '0592': 'segol_accent',
  '0593': 'shalshelet',
  '0594': 'zaqef_qatan',
  '0595': 'zaqef_gadol',
  '0596': 'tipeha',
  '0597': 'revia',
  '0598': 'zarqa',
  '0599': 'pashta',
  '059A': 'yetiv',
  '059B': 'tevir',
  '059C': 'geresh',
  '059D': 'geresh_muqdam',
  '059E': 'gershayim',
  '059F': 'qarney_para',
  '05A0': 'telisha_gedola',
  '05A1': 'pazer',
  '05A3': 'munah',
  '05A4': 'mahapakh',
  '05A5': 'merkha',
  '05A6': 'merkha_kefula',
  '05A7': 'darga',
  '05A8': 'qadma',
  '05A9': 'telisha_qetana',
  '05AA': 'yerah_ben_yomo',
  '05AB': 'ole',
  '05AC': 'iluy',
  '05AD': 'dehi',
  '05AE': 'zinor',
  '05AF': 'masora_circle',
  '05BE': 'paseq',
  '05C0': 'sof_pasuq',
};

/**
 * Parse a verse string into an array of word objects, each containing the word text,
 * a stripped (normalized) form, and any cantillation accents embedded in the word.
 *
 * @param {string} verseText - Raw Hebrew verse text from Sefaria (may include Unicode tropes).
 * @returns {{ wordIndex: number, wordText: string, normalizedText: string, accents: Array }[]}
 */
function parseVerseWords(verseText) {
  if (!verseText || typeof verseText !== 'string') {
    return [];
  }

  const rawWords = verseText.trim().split(/\s+/);

  return rawWords
    .filter((w) => w.length > 0)
    .map((word, wordIndex) => {
      const normalizedText = word.replace(TROPE_REGEX, '').replace(NIKUD_REGEX, '');

      const accents = [];
      let accentIndex = 0;
      const tropeRegexLocal = /[\u0591-\u05AF\u05BE\u05C0]/g;
      let match;
      while ((match = tropeRegexLocal.exec(word)) !== null) {
        const codePoint = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        accents.push({
          accentIndex,
          tropeCode: codePoint,
          tropeSymbol: match[0],
          tropeName: TROPE_NAMES[codePoint] || null,
        });
        accentIndex++;
      }

      return { wordIndex, wordText: word, normalizedText, accents };
    });
}

class SefariaService {
  constructor(baseUrl = SEFARIA_API_BASE) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch a text reference from the Sefaria API (Hebrew only, no commentary).
   * @param {string} ref - Sefaria text reference, e.g. "Genesis 1" or "Exodus.3.4"
   * @returns {Promise<object>} Parsed Sefaria API response
   */
  async fetchText(ref) {
    const url = `${this.baseUrl}/texts/${encodeURIComponent(ref)}?lang=he&commentary=0&context=0`;
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Sefaria API error ${response.status} for ref "${ref}": ${body.slice(0, 200)}`);
    }
    return response.json();
  }

  /**
   * Fetch the table of contents entry for a given book to learn how many chapters it has.
   * @param {string} sefariaRef - Sefaria book name, e.g. "Genesis"
   * @returns {Promise<object>} Sefaria index entry
   */
  async fetchIndex(sefariaRef) {
    const url = `${this.baseUrl}/index/${encodeURIComponent(sefariaRef)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Sefaria index API error ${response.status} for "${sefariaRef}"`);
    }
    return response.json();
  }

  /**
   * Fetch all verses in a given chapter, returning an array of parsed verse objects.
   * @param {string} sefariaRef - Book name, e.g. "Genesis"
   * @param {number} chapter - 1-based chapter number
   * @returns {Promise<{ verseNumber: number, rawText: string, words: Array }[]>}
   */
  async fetchChapterVerses(sefariaRef, chapter) {
    const ref = `${sefariaRef} ${chapter}`;
    const data = await this.fetchText(ref);

    let verses;
    if (Array.isArray(data.text)) {
      verses = data.text;
    } else if (typeof data.text === 'string') {
      verses = [data.text];
    } else {
      verses = [];
    }

    return verses
      .map((rawText, index) => ({
        verseNumber: index + 1,
        rawText: typeof rawText === 'string' ? rawText : '',
        words: parseVerseWords(typeof rawText === 'string' ? rawText : ''),
      }))
      .filter((v) => v.rawText.length > 0);
  }
}

module.exports = { SefariaService, ALL_BOOKS, TORAH_BOOKS, HAFTARAH_BOOKS, MEGILLOT_BOOKS, parseVerseWords };
