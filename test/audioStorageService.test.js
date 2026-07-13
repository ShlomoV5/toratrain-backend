const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { AudioStorageService } = require('../src/services/audioStorageService');

test('AudioStorageService uses required naming convention', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'toratrain-audio-'));
  const service = new AudioStorageService(tempDir);

  const output = await service.writeSegment(
    { nusach: 1, bookId: 2, chapter: 3, verse: 4, partIndex: 5 },
    'wav',
    Buffer.from('abc'),
  );

  assert.equal(path.basename(output), '01-02-03-04-05.wav');
});
