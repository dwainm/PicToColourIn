/**
 * PicToColourIn App - Async Background Processing Version
 * Allows users to continue browsing while images process in background
 */

class ColoringApp {
    constructor() {
        this.sourceImage = null;
        this.currentJobId = null;
        this.isProcessing = false;
        
        // Best params from testing (5/10 quality)
        this.processingParams = {
            blurRadius: 3.6,
            edgeIntensity: 1.42,
            threshold: 0.175,
            sigmaRatio: 3.6
        };
        
        // Job queue for background processing
        this.processingQueue = [];
        this.completedJobs = [];
        
        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        this.initWebGL();
    }

    cacheElements() {
        // Sections
        this.uploadSection = document.getElementById('uploadSection');
        this.editorSection = document.getElementById('editorSection');
        
        // Upload
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        
        // Canvas
        this.sourceCanvas = document.getElementById('sourceCanvas');
        this.outputCanvas = document.getElementById('outputCanvas');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.processingStatus = document.getElementById('processingStatus');
        
        // Controls
        this.blurSlider = document.getElementById('blurSlider');
        this.edgeSlider = document.getElementById('edgeSlider');
        this.thresholdSlider = document.getElementById('thresholdSlider');
        
        // Value displays
        this.blurValue = document.getElementById('blurValue');
        this.edgeValue = document.getElementById('edgeValue');
        this.thresholdValue = document.getElementById('thresholdValue');
        
        // Buttons
        this.newImageBtn = document.getElementById('newImageBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.pdfBtn = document.getElementById('pdfBtn');
        this.printBtn = document.getElementById('printBtn');
        this.processAnotherBtn = document.getElementById('processAnotherBtn'); // Optional
        
        // Update button references with null checks
        this.downloadBtn = document.getElementById('downloadBtn');
        this.pdfBtn = document.getElementById('pdfBtn');
        this.printBtn = document.getElementById('printBtn');
    }

    bindEvents() {
        // Upload events
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag & drop
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });
        
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });
        
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.loadImage(file);
            }
        });
        
        // Control events
        this.blurSlider.addEventListener('input', (e) => {
            this.processingParams.blurRadius = parseFloat(e.target.value);
            this.blurValue.textContent = this.processingParams.blurRadius.toFixed(1);
            this.debouncedProcess();
        });
        
        this.edgeSlider.addEventListener('input', (e) => {
            this.processingParams.edgeIntensity = parseFloat(e.target.value);
            this.edgeValue.textContent = this.processingParams.edgeIntensity.toFixed(1);
            this.debouncedProcess();
        });
        
        this.thresholdSlider.addEventListener('input', (e) => {
            this.processingParams.threshold = parseFloat(e.target.value);
            this.thresholdValue.textContent = this.processingParams.threshold.toFixed(2);
            this.debouncedProcess();
        });
        
        this.newImageBtn.addEventListener('click', () => this.reset());
        this.processAnotherBtn?.addEventListener('click', () => this.reset());
        
        this.downloadBtn.addEventListener('click', () => this.download());
        this.pdfBtn.addEventListener('click', () => this.downloadPDF());
        this.printBtn.addEventListener('click', () => this.print());
    }

    async initWebGL() {
        try {
            this.processor = new WebGLProcessor();
            await this.processor.init();
        } catch (err) {
            console.error('WebGL init failed:', err);
            alert('Your browser does not support WebGL, which is required for this app.');
        }
    }

    debouncedProcess() {
        if (this.processTimeout) {
            clearTimeout(this.processTimeout);
        }
        this.processTimeout = setTimeout(() => this.process(), 100);
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            this.loadImage(file);
        }
    }

    async loadImage(file) {
        try {
            // Create preview immediately
            this.sourceImage = await this.createImageBitmap(file);
            this.displaySourceImage();
            
            // Show editor immediately with "processing" state
            this.uploadSection.style.display = 'none';
            this.editorSection.style.display = 'flex';
            this.showProcessingState();
            
            // Process in background
            this.currentJobId = Date.now();
            await this.processAsync(file);
            
        } catch (err) {
            console.error('Error loading image:', err);
            alert('Error loading image. Please try another file.');
        }
    }

    createImageBitmap(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    displaySourceImage() {
        // Draw source image on canvas for preview
        this.sourceCanvas.width = this.sourceImage.width;
        this.sourceCanvas.height = this.sourceImage.height;
        const ctx = this.sourceCanvas.getContext('2d');
        ctx.drawImage(this.sourceImage, 0, 0);
        
        // Scale output canvas to match
        this.outputCanvas.width = this.sourceImage.width;
        this.outputCanvas.height = this.sourceImage.height;
    }

    showProcessingState() {
        this.isProcessing = true;
        this.loadingOverlay.style.display = 'flex';
        if (this.processingStatus) {
            this.processingStatus.textContent = 'Creating your coloring page...';
            this.processingStatus.style.display = 'block';
        }
        
        // Disable download buttons while processing
        this.downloadBtn.disabled = true;
        this.pdfBtn.disabled = true;
        this.printBtn.disabled = true;
    }

    hideProcessingState() {
        this.isProcessing = false;
        this.loadingOverlay.style.display = 'none';
        if (this.processingStatus) {
            this.processingStatus.style.display = 'none';
        }
        
        // Enable download buttons
        this.downloadBtn.disabled = false;
        this.pdfBtn.disabled = false;
        this.printBtn.disabled = false;
    }

    /**
     * Async processing - doesn't block UI
     */
    async processAsync(file) {
        try {
            // Use requestIdleCallback or setTimeout to yield to UI
            await this.yieldToUI();
            
            // Load image into processor
            await this.processor.loadImage(file);
            
            await this.yieldToUI();
            
            // Process with current params
            const result = await this.processor.processImage(this.processingParams);
            
            await this.yieldToUI();
            
            // Update canvas with result
            this.updateOutputCanvas(result);
            
            this.hideProcessingState();
            
            // Store completed job
            this.completedJobs.push({
                id: this.currentJobId,
                params: { ...this.processingParams },
                timestamp: Date.now()
            });
            
        } catch (err) {
            console.error('Processing error:', err);
            this.processingStatus.textContent = 'Error processing image. Try adjusting settings.';
        }
    }

    /**
     * Yield control to UI thread to prevent blocking
     */
    yieldToUI() {
        return new Promise(resolve => {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(resolve, { timeout: 50 });
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    /**
     * Synchronous processing (for slider adjustments)
     */
    process() {
        if (!this.processor || !this.sourceImage || this.isProcessing) return;
        
        // Quick re-process without full loading
        this.loadingOverlay.style.display = 'flex';
        
        // Use setTimeout to allow UI update
        setTimeout(async () => {
            try {
                const result = await this.processor.processImage(this.processingParams);
                this.updateOutputCanvas(result);
            } catch (err) {
                console.error('Process error:', err);
            } finally {
                this.loadingOverlay.style.display = 'none';
            }
        }, 50);
    }

    updateOutputCanvas(imageData) {
        if (!imageData) return;
        
        const ctx = this.outputCanvas.getContext('2d');
        
        // Handle different result formats
        if (imageData instanceof ImageData) {
            ctx.putImageData(imageData, 0, 0);
        } else if (imageData instanceof HTMLCanvasElement) {
            ctx.drawImage(imageData, 0, 0);
        } else if (this.processor && this.processor.outputCanvas) {
            ctx.drawImage(this.processor.outputCanvas, 0, 0);
        }
    }

    download() {
        const link = document.createElement('a');
        link.download = 'coloring-page.png';
        link.href = this.outputCanvas.toDataURL('image/png');
        link.click();
    }

    downloadPDF() {
        // Simple PDF generation using canvas
        const { jsPDF } = window.jspdf || {};
        
        if (!jsPDF) {
            // Fallback: just download PNG
            this.download();
            return;
        }
        
        const imgData = this.outputCanvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: this.outputCanvas.width > this.outputCanvas.height ? 'l' : 'p',
            unit: 'px',
            format: [this.outputCanvas.width, this.outputCanvas.height]
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, this.outputCanvas.width, this.outputCanvas.height);
        pdf.save('coloring-page.pdf');
    }

    print() {
        const printWindow = window.open('', '_blank');
        const imgData = this.outputCanvas.toDataURL('image/png');
        
        printWindow.document.write(`
            <html>
                <head><title>Print Coloring Page</title></head>
                <body style="margin:0; display:flex; justify-content:center; align-items:center;">
                    <img src="${imgData}" style="max-width:100%; max-height:100vh;">
                    <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 100); };</script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    reset() {
        // Reset UI
        this.uploadSection.style.display = 'block';
        this.editorSection.style.display = 'none';
        
        // Clear current
        this.sourceImage = null;
        this.currentJobId = null;
        
        // Reset file input
        this.fileInput.value = '';
        
        // Reset params to defaults
        this.processingParams = {
            blurRadius: 3.6,
            edgeIntensity: 1.42,
            threshold: 0.175,
            sigmaRatio: 3.6
        };
        
        // Update UI
        this.blurSlider.value = this.processingParams.blurRadius;
        this.blurValue.textContent = this.processingParams.blurRadius.toFixed(1);
        this.edgeSlider.value = this.processingParams.edgeIntensity;
        this.edgeValue.textContent = this.processingParams.edgeIntensity.toFixed(1);
        this.thresholdSlider.value = this.processingParams.threshold;
        this.thresholdValue.textContent = this.processingParams.threshold.toFixed(2);
        
        // Reset processor
        if (this.processor) {
            this.processor.reset();
        }
    }

    /**
     * Pre-process images while user is browsing (e.g., from gallery)
     */
    async preloadAndProcess(files) {
        for (const file of files) {
            const jobId = Date.now() + Math.random();
            
            // Add to queue
            this.processingQueue.push({
                id: jobId,
                file: file,
                status: 'queued'
            });
        }
        
        // Process queue in background
        this.processQueue();
    }

    async processQueue() {
        while (this.processingQueue.length > 0) {
            const job = this.processingQueue.shift();
            job.status = 'processing';
            
            try {
                // Process in background
                await this.processAsync(job.file);
                job.status = 'completed';
                this.completedJobs.push(job);
            } catch (err) {
                job.status = 'error';
                job.error = err.message;
            }
            
            // Yield between jobs
            await this.yieldToUI();
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ColoringApp();
});
