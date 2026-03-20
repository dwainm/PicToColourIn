/**
 * PicToColourIn - One-Click Photo to Coloring Page
 * Lazily loads C++ WASM on first use, shows loading state
 */

class ColoringApp {
    constructor() {
        this.sourceImage = null;
        this.processor = null;
        this.wasmLoading = false;
        this.wasmReady = false;
        this.pendingImage = null;
        
        // Tuned parameters (from 19 iterations of testing)
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

    init() {
        this.cacheElements();
        this.bindEvents();
        // Don't load WASM yet - wait for first image
        console.log('App ready. Drop a photo to start.');
    }

    cacheElements() {
        this.uploadSection = document.getElementById('uploadSection');
        this.editorSection = document.getElementById('editorSection');
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.sourceCanvas = document.getElementById('sourceCanvas');
        this.outputCanvas = document.getElementById('outputCanvas');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = this.loadingOverlay?.querySelector('p');
        this.newImageBtn = document.getElementById('newImageBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.printBtn = document.getElementById('printBtn');
        this.statusDiv = document.getElementById('status');
    }

    bindEvents() {
        this.dropZone?.addEventListener('click', () => this.fileInput?.click());
        this.fileInput?.addEventListener('change', (e) => this.handleFileSelect(e));
        
        this.dropZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });
        
        this.dropZone?.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });
        
        this.dropZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            const file = e.dataTransfer?.files?.[0];
            if (file?.type?.startsWith('image/')) {
                this.loadImage(file);
            }
        });
        
        this.newImageBtn?.addEventListener('click', () => this.reset());
        this.downloadBtn?.addEventListener('click', () => this.download());
        this.printBtn?.addEventListener('click', () => this.print());
    }

    handleFileSelect(e) {
        const file = e.target?.files?.[0];
        if (file?.type?.startsWith('image/')) {
            this.loadImage(file);
        }
    }

    async loadImage(file) {
        try {
            // Show loading immediately
            this.showEditorLoading();
            
            // Load image preview
            this.sourceImage = await this.createImageBitmap(file);
            this.displaySourceImage();
            
            // Show editor with loading state
            this.uploadSection.style.display = 'none';
            this.editorSection.style.display = 'flex';
            
            // Lazy load WASM if not already loading/ready
            if (!this.processor && !this.wasmLoading) {
                await this.initProcessor();
            }
            
            // If still loading WASM, wait
            if (this.wasmLoading) {
                this.updateLoadingText('Loading high-performance engine...');
                await this.waitForWasm();
            }
            
            // Now process
            await this.process();
            
        } catch (err) {
            console.error('Error:', err);
            this.showStatus('Something went wrong. Try another photo.', 'error');
            this.hideLoading();
        }
    }

    createImageBitmap(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = URL.createObjectURL(file);
        });
    }

    displaySourceImage() {
        if (!this.sourceImage) return;
        
        this.sourceCanvas.width = this.sourceImage.width;
        this.sourceCanvas.height = this.sourceImage.height;
        const ctx = this.sourceCanvas.getContext('2d');
        ctx.drawImage(this.sourceImage, 0, 0);
        
        this.outputCanvas.width = this.sourceImage.width;
        this.outputCanvas.height = this.sourceImage.height;
    }

    async initProcessor() {
        this.wasmLoading = true;
        this.updateLoadingText('Preparing processor...');
        
        try {
            // Try WASM first
            const { WasmProcessor } = await import('./wasm-processor.js');
            this.processor = new WasmProcessor();
            await this.processor.init();
            
            if (!this.processor.fallbackMode) {
                this.wasmReady = true;
                console.log('✓ WASM ready');
            } else {
                console.log('Using WebGL fallback');
            }
        } catch (err) {
            console.warn('WASM failed, using WebGL:', err.message);
            
            // Fallback to WebGL
            try {
                const { WebGLProcessor } = await import('./webgl-processor.js');
                this.processor = new WebGLProcessor();
                await this.processor.init();
            } catch (webglErr) {
                console.error('WebGL also failed:', webglErr);
                throw new Error('Your browser does not support image processing');
            }
        } finally {
            this.wasmLoading = false;
        }
    }

    waitForWasm() {
        return new Promise((resolve) => {
            const check = () => {
                if (!this.wasmLoading) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    async process() {
        if (!this.processor || !this.sourceImage) {
            this.showStatus('Processor not ready', 'error');
            return;
        }
        
        this.updateLoadingText('Creating coloring page...');
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
            
            this.hideLoading();
            
            const mode = this.wasmReady ? 'High-performance' : 'Standard';
            this.showStatus(`${mode} mode • Ready in ${(processTime/1000).toFixed(1)}s`, 'success');
            this.downloadBtn.disabled = false;
            
        } catch (err) {
            console.error('Processing error:', err);
            this.hideLoading();
            this.showStatus('Processing failed. Try a different photo.', 'error');
        }
    }

    showEditorLoading() {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'flex';
        }
        this.updateLoadingText('Loading...');
    }

    updateLoadingText(text) {
        if (this.loadingText) {
            this.loadingText.textContent = text;
        }
    }

    hideLoading() {
        if (this.loadingOverlay) {
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
        this.hideLoading();
        this.downloadBtn.disabled = false;
    }
}

// Start app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ColoringApp();
});
