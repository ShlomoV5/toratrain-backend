const fs = require('node:fs/promises');
const path = require('node:path');

const SEGMENT_PARTS = ['nusach', 'bookId', 'chapter', 'verse', 'partIndex'];
const FILE_NAME_PATTERN = /^([A-Za-z0-9]{2})-([A-Za-z0-9]{2})-([A-Za-z0-9]{2})-([A-Za-z0-9]{2})-([A-Za-z0-9]{2})\.([A-Za-z0-9]+)$/;

class AudioStorageService {
  constructor(storagePath) {
    this.storagePath = storagePath;
  }

  static padPart(value) {
    return String(value).padStart(2, '0');
  }

  static sanitizePart(value) {
    const v = String(value).trim();
    if (!/^[A-Za-z0-9]+$/.test(v)) {
      throw new Error(`Invalid segment value: ${value}`);
    }
    return v;
  }

  static normalizeSegment(segment) {
    const normalized = {};
    for (const key of SEGMENT_PARTS) {
      if (segment[key] === undefined || segment[key] === null || segment[key] === '') {
        throw new Error(`Missing required segment field: ${key}`);
      }
      normalized[key] = AudioStorageService.sanitizePart(segment[key]);
    }

    normalized.nusach = AudioStorageService.padPart(normalized.nusach);
    normalized.bookId = AudioStorageService.padPart(normalized.bookId);
    normalized.chapter = AudioStorageService.padPart(normalized.chapter);
    normalized.verse = AudioStorageService.padPart(normalized.verse);
    normalized.partIndex = AudioStorageService.padPart(normalized.partIndex);
    return normalized;
  }

  static buildStem(segment) {
    const normalized = AudioStorageService.normalizeSegment(segment);
    return `${normalized.nusach}-${normalized.bookId}-${normalized.chapter}-${normalized.verse}-${normalized.partIndex}`;
  }

  static parseFileName(fileName) {
    const match = fileName.match(FILE_NAME_PATTERN);
    if (!match) {
      return null;
    }

    return {
      nusach: match[1],
      bookId: match[2],
      chapter: match[3],
      verse: match[4],
      partIndex: match[5],
      extension: match[6],
      fileName,
    };
  }

  async ensureStorageDir() {
    await fs.mkdir(this.storagePath, { recursive: true });
  }

  async scan(filters = {}) {
    await this.ensureStorageDir();
    const entries = await fs.readdir(this.storagePath, { withFileTypes: true });
    const parsed = entries
      .filter((entry) => entry.isFile())
      .map((entry) => AudioStorageService.parseFileName(entry.name))
      .filter(Boolean)
      .map((segment) => ({
        ...segment,
        absolutePath: path.join(this.storagePath, segment.fileName),
      }));

    const normFilters = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        normFilters[key] = AudioStorageService.padPart(AudioStorageService.sanitizePart(value));
      }
    }

    return parsed.filter((segment) =>
      Object.entries(normFilters).every(([key, value]) => segment[key] === value),
    );
  }

  async writeSegment(segment, extension, buffer) {
    await this.ensureStorageDir();
    const safeExtension = AudioStorageService.sanitizePart(extension.toLowerCase());
    const stem = AudioStorageService.buildStem(segment);
    const targetPath = path.join(this.storagePath, `${stem}.${safeExtension}`);
    const tempPath = `${targetPath}.tmp-${Date.now()}`;

    await fs.writeFile(tempPath, buffer);
    await fs.rename(tempPath, targetPath);

    return targetPath;
  }

  async replaceVerseSegments(segment, newSegments) {
    const normalized = AudioStorageService.normalizeSegment({ ...segment, partIndex: '01' });
    const prefix = `${normalized.nusach}-${normalized.bookId}-${normalized.chapter}-${normalized.verse}-`;

    const existing = await this.scan({
      nusach: normalized.nusach,
      bookId: normalized.bookId,
      chapter: normalized.chapter,
      verse: normalized.verse,
    });

    await Promise.all(existing.map((file) => fs.unlink(file.absolutePath)));

    const saved = [];
    for (const part of newSegments) {
      const writeTarget = {
        nusach: normalized.nusach,
        bookId: normalized.bookId,
        chapter: normalized.chapter,
        verse: normalized.verse,
        partIndex: part.partIndex,
      };
      const absolutePath = await this.writeSegment(writeTarget, part.extension, part.buffer);
      saved.push({
        fileName: path.basename(absolutePath),
        absolutePath,
        stemPrefix: prefix,
      });
    }

    return saved;
  }
}

module.exports = { AudioStorageService };
