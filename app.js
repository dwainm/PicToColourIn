/**
 * PicToColourIn - One-Click Photo to Coloring Page
 * No sliders. No settings. Just perfect results.
 */

class ColoringApp {
    constructor() {
        this.sourceImage = null;
        this.processor = null;
        this.isProcessing = false;
        
        // Tuned parameters (from 19 iterations of testing)
        // Target: 7/10 quality for coloring pages
        this.processingParams = {
            blurRadius: 3.6,
            edgeIntensity: 1.42,
            sigmaRatio: 3.6,
            closeRadius: 1,
            outputMin: 0.15,
            outputMax: 0.85
        };
        
        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        await this.initProcessor();
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
        this.processingStatus = document.querySelector('#loadingOverlay p');
        
        // Buttons
        this.newImageBtn = document.getElementById('newImageBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.printBtn = document.getElementById('printBtn');
        
        // Status
        this.statusDiv = document.getElementById('status');
    }

    bindEvents() {
        // Upload
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
            if (file?.type.startsWith('image/')) {
                this.loadImage(file);
            }
        });
        
        // Actions
        this.newImageBtn?.addEventListener('click', () => this.reset());
        this.downloadBtn?.addEventListener('click', () => this.download());
        this.printBtn?.addEventListener('click', () => this.print());
    }

    async initProcessor() {
        try {
            // Try WASM first (higher quality)
            const { WasmProcessor } = await import('./wasm-processor.js');
            this.processor = new WasmProcessor();
            await this.processor.init();
            
            if (!this.processor.fallbackMode) {
                console.log('✓ High-performance mode active');
            }
        } catch (err) {
            // Fallback to WebGL
            console.log('Using standard processing');
            const { WebGLProcessor } = await import('./webgl-processor.js');
            this.processor = new WebGLProcessor();
            await this.processor.init();
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file?.type.startsWith('image/')) {
            this.loadImage(file);
        }
    }

    async loadImage(file) {
        try {
            // Load image
            this.sourceImage = await this.createImageBitmap(file);
            this.displaySourceImage();
            
            // Switch to editor
            this.uploadSection.style.display = 'none';
            this.editorSection.style.display = 'flex';
            
            // Auto-process
            await this.process();
            
        } catch (err) {
            console.error('Error:', err);
            this.showStatus('Error loading image. Try another photo.', 'error');
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
        this.sourceCanvas.width = this.sourceImage.width;
        this.sourceCanvas.height = this.sourceImage.height;
        const ctx = this.sourceCanvas.getContext('2d');
        ctx.drawImage(this.sourceImage, 0, 0);
        
        this.outputCanvas.width = this.sourceImage.width;
        this.outputCanvas.height = this.sourceImage.height;
    }

    async process() {
        if (!this.processor || !this.sourceImage) return;
        
        this.isProcessing = true;
        this.loadingOverlay.style.display = 'flex';
        this.processingStatus.textContent = 'Creating coloring page...';
        this.downloadBtn.disabled = true;
        
        try {
            const ctx = this.sourceCanvas.getContext('2d');
            const imageData = ctx.getImageData(
                0, 0, 
                this.sourceCanvas.width, 
                this.sourceCanvas.height
            );
            
            const startTime = performance.now();
            const result = await this.processor.process(imageData, this.processingParams);
            const processTime = performance.now() - startTime;
            
            // Display result
            const outCtx = this.outputCanvas.getContext('2d');
            outCtx.putImageData(result, 0, 0);
            
            this.showStatus(`Ready in ${(processTime/1000).toFixed(1)}s`, 'success');
            this.downloadBtn.disabled = false;
            
        } catch (err) {
            console.error('Processing error:', err);
            this.showStatus('Processing failed. Try a different photo.', 'error');
        } finally {
            this.isProcessing = false;
            this.loadingOverlay.style.display = 'none';
        }
    }

    showStatus(message, type = 'info') {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status-message status-${type}`;
            this.statusDiv.style.display = 'block';
        }
    }

    download() {
        const link = document.createElement('a');
        link.download = `coloring-page-${Date.now()}.png`;
        link.href = this.outputCanvas.toDataURL('image/png');
        link.click();
    }

    print() {
        const printWindow = window.open('', '_blank');
        const imgData = this.outputCanvas.toDataURL('image/png');
        
        printWindow.document.write(`
            <html>
                <head><title>Print Coloring Page</title></head>
                <body style="margin:0; display:flex; justify-content:center; align-items:center;">
                    <img src="${imgData}" style="max-width:100%; max-height:100vh;">
                    <script>
                        window.onload = () => {
                            setTimeout(() => { 
                                window.print(); 
                                setTimeout(() => window.close(), 100);
                            }, 100);
                        };
                    <\/script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    reset() {
        this.uploadSection.style.display = 'block';
        this.editorSection.style.display = 'none';
        this.sourceImage = null;
        this.fileInput.value = '';
        this.statusDiv.style.display = 'none';
        this.downloadBtn.disabled = false;
    }
}

// Start app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ColoringApp();
});
