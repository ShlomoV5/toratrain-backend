const express = require('express');
const multer = require('multer');
const path = require('node:path');

const SUPPORTED_MIME_TYPES = {
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function detectExtension(fileName, mimeType) {
  const ext = path.extname(fileName || '').toLowerCase();
  const extFromName = ext ? ext.slice(1) : '';
  if (extFromName) {
    return extFromName;
  }

  const extFromMime = SUPPORTED_MIME_TYPES[mimeType];
  if (extFromMime) {
    return extFromMime;
  }

  throw new Error('Unsupported audio format');
}

function buildMeta(body) {
  return {
    nusach: body.nusach,
    bookId: body.bookId,
    chapter: body.chapter,
    verse: body.verse,
    partIndex: body.partIndex,
  };
}

function createAudioRouter({ audioService, uploadQueue }) {
  const router = express.Router();

  router.get('/audio/scan', async (req, res, next) => {
    try {
      const segments = await audioService.scan(req.query);
      res.json({ count: segments.length, segments });
    } catch (error) {
      next(error);
    }
  });

  router.get('/audio/segments/:nusach/:bookId/:chapter/:verse', async (req, res, next) => {
    try {
      const segments = await audioService.scan(req.params);
      res.json({ count: segments.length, segments });
    } catch (error) {
      next(error);
    }
  });

  router.post('/uploads/audio', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Missing audio file' });
      }

      const extension = detectExtension(req.file.originalname, req.file.mimetype);
      const job = uploadQueue.enqueue('uploadSegment', {
        meta: buildMeta(req.body),
        extension,
        buffer: req.file.buffer,
      });

      return res.status(202).json({
        jobId: job.id,
        status: job.status,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/uploads/audio/blob', async (req, res, next) => {
    try {
      const { audioBase64, fileName, mimeType } = req.body;
      if (!audioBase64) {
        return res.status(400).json({ error: 'audioBase64 is required' });
      }

      const buffer = Buffer.from(audioBase64, 'base64');
      const extension = detectExtension(fileName, mimeType);
      const job = uploadQueue.enqueue('uploadSegment', {
        meta: buildMeta(req.body),
        extension,
        buffer,
      });

      return res.status(202).json({
        jobId: job.id,
        status: job.status,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/audio/segments/replace', async (req, res, next) => {
    try {
      const { nusach, bookId, chapter, verse, segments } = req.body;
      if (!Array.isArray(segments) || !segments.length) {
        return res.status(400).json({ error: 'Request body must contain a non-empty segments array' });
      }

      const normalizedSegments = segments.map((segment) => {
        if (!segment.audioBase64) {
          throw new Error('Each segment must include audioBase64');
        }
        const extension = detectExtension(segment.fileName, segment.mimeType);
        return {
          partIndex: segment.partIndex,
          extension,
          buffer: Buffer.from(segment.audioBase64, 'base64'),
        };
      });

      const job = uploadQueue.enqueue('replaceVerseSegments', {
        meta: { nusach, bookId, chapter, verse },
        segments: normalizedSegments,
      });

      return res.status(202).json({ jobId: job.id, status: job.status });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/uploads/jobs/:jobId', (req, res) => {
    const job = uploadQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json({
      id: job.id,
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      result: job.result,
      error: job.error,
    });
  });

  return router;
}

module.exports = { createAudioRouter };
