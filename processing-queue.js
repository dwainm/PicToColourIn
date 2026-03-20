/**
 * ProcessingQueue - Manages background image processing
 * Allows users to upload/select while processing happens
 */

class ProcessingQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.worker = null;
    this.currentJob = null;
    this.onComplete = null;
    this.onProgress = null;
  }

  async init() {
    // Create web worker for background processing
    this.worker = new Worker('workers/image-processor.worker.js');
    this.worker.onmessage = (e) => this.handleMessage(e);
    this.worker.onerror = (err) => this.handleError(err);
    return this;
  }

  /**
   * Add image to processing queue
   * User can continue browsing while this processes
   */
  enqueue(imageFile, params, metadata = {}) {
    const job = {
      id: Date.now() + Math.random(),
      file: imageFile,
      params: params,
      metadata: metadata,
      status: 'queued',
      result: null,
      error: null,
      startTime: null,
      endTime: null
    };
    
    this.queue.push(job);
    this.processNext();
    return job.id;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    const job = this.queue.find(j => j.id === jobId);
    return job ? { ...job, file: undefined } : null;
  }

  /**
   * Get all completed jobs
   */
  getCompleted() {
    return this.queue
      .filter(j => j.status === 'completed')
      .map(j => ({ ...j, file: undefined }));
  }

  /**
   * Cancel a queued job
   */
  cancel(jobId) {
    const index = this.queue.findIndex(j => j.id === jobId);
    if (index > -1 && this.queue[index].status === 'queued') {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear completed jobs from queue
   */
  clearCompleted() {
    this.queue = this.queue.filter(j => j.status !== 'completed');
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    
    const job = this.queue.find(j => j.status === 'queued');
    if (!job) return;

    this.processing = true;
    job.status = 'processing';
    job.startTime = Date.now();
    this.currentJob = job;

    try {
      // Load image as ImageBitmap for efficient transfer to worker
      const imageBitmap = await createImageBitmap(job.file);
      
      // Get image data
      const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageBitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Send to worker
      this.worker.postMessage({
        imageData: imageData.data,
        params: job.params,
        width: canvas.width,
        height: canvas.height
      }, [imageData.data.buffer]); // Transfer for performance

    } catch (error) {
      this.handleWorkerError(job, error);
    }
  }

  handleMessage(e) {
    const { success, result, error } = e.data;
    
    if (!this.currentJob) return;

    if (success) {
      this.currentJob.status = 'completed';
      this.currentJob.result = result;
      this.currentJob.endTime = Date.now();
      
      if (this.onComplete) {
        this.onComplete(this.currentJob);
      }
    } else {
      this.handleWorkerError(this.currentJob, new Error(error));
    }

    this.processing = false;
    this.currentJob = null;
    
    // Process next in queue
    setTimeout(() => this.processNext(), 0);
  }

  handleWorkerError(job, error) {
    job.status = 'error';
    job.error = error.message;
    job.endTime = Date.now();
    
    if (this.onError) {
      this.onError(job, error);
    }
  }

  handleError(err) {
    console.error('Worker error:', err);
    if (this.currentJob) {
      this.handleWorkerError(this.currentJob, err);
    }
    this.processing = false;
    this.currentJob = null;
  }

  /**
   * Estimate processing time based on image size
   */
  estimateTime(file) {
    // Rough estimate: 100ms per megapixel
    const megapixels = (file.size / 1024 / 1024) * 0.5; // rough estimate
    return Math.max(500, megapixels * 100);
  }

  destroy() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.queue = [];
  }
}

// Export for use in app
if (typeof module !== 'undefined') {
  module.exports = { ProcessingQueue };
}
