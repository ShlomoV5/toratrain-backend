const { randomUUID } = require('node:crypto');

class UploadQueue {
  constructor() {
    this.jobs = new Map();
    this.queue = [];
    this.handlers = new Map();
    this.processing = false;
  }

  registerHandler(type, handler) {
    this.handlers.set(type, handler);
  }

  enqueue(type, payload) {
    if (!this.handlers.has(type)) {
      throw new Error(`No handler registered for type: ${type}`);
    }

    const id = randomUUID();
    const job = {
      id,
      type,
      status: 'queued',
      payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null,
      error: null,
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    setImmediate(() => this.processNext());
    return job;
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }

  async processNext() {
    if (this.processing) {
      return;
    }

    const nextId = this.queue.shift();
    if (!nextId) {
      return;
    }

    this.processing = true;
    const job = this.jobs.get(nextId);
    if (!job) {
      this.processing = false;
      return;
    }

    job.status = 'processing';
    job.updatedAt = new Date().toISOString();

    const handler = this.handlers.get(job.type);

    try {
      job.result = await handler(job.payload);
      job.status = 'completed';
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.status = 'failed';
    }

    job.updatedAt = new Date().toISOString();
    this.processing = false;
    if (this.queue.length > 0) {
      setImmediate(() => this.processNext());
    }
  }
}

module.exports = { UploadQueue };
