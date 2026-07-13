const express = require('express');
const path = require('node:path');
const { AudioStorageService } = require('./services/audioStorageService');
const { UploadQueue } = require('./queue/uploadQueue');
const { createAudioRouter } = require('./routes/audioRoutes');
const { createTextRouter } = require('./routes/textRoutes');

const app = express();
app.use(express.json({ limit: '25mb' }));

const storagePath = process.env.AUDIO_STORAGE_PATH || '/app/storage/audio';
const audioService = new AudioStorageService(path.resolve(storagePath));
const uploadQueue = new UploadQueue();

uploadQueue.registerHandler('uploadSegment', async ({ meta, extension, buffer }) => {
  const absolutePath = await audioService.writeSegment(meta, extension, buffer);
  return {
    absolutePath,
    fileName: path.basename(absolutePath),
  };
});

uploadQueue.registerHandler('replaceVerseSegments', async ({ meta, segments }) => {
  const saved = await audioService.replaceVerseSegments(meta, segments);
  return {
    count: saved.length,
    segments: saved,
  };
});

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', createAudioRouter({ audioService, uploadQueue }));
app.use('/api/texts', createTextRouter());

app.use((error, _req, res, _next) => {
  const statusCode = Number(error.statusCode) || 500;
  res.status(statusCode).json({ error: error.message || 'Unexpected error' });
});

const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Torah Trainer backend listening on port ${port}`);
  });
}

module.exports = { app };
