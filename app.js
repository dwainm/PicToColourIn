/**
 * PicToColourIn - One-Click Photo to Coloring Page
 * WASM loads immediately in background. Ready when user drops photo.
 */

class ColoringApp {
    constructor() {
        this.sourceImage = null;
        this.processor = null;
        this.wasmState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
        
        // Tuned parameters for adaptive threshold (final winner: window=23, c=5)
        this.processingParams = {
            windowSize: 23,
            c: 5.0,
            method: 1,
            outputMin: 0.0,  // Pure white
            outputMax: 1.0   // Pure black
        };
        
        this.init();
    }

    async init() {
        this.cacheElements();
        this.bindEvents();
        
        // Start loading WASM immediately in background (don't await)
        this.loadWasmInBackground().catch(err => {
            console.error('Background WASM load failed:', err);
        });
    }

    async loadWasmInBackground() {
        if (this.wasmState !== 'idle') return;
        
        this.wasmState = 'loading';
        console.log('Loading WASM...');
        
        try {
            const mod = await import('./wasm-processor.js');
            console.log('wasm-processor module loaded:', mod);
            
            const WasmProcessor = mod.WasmProcessor || mod.default;
            if (!WasmProcessor) {
                throw new Error('WasmProcessor not exported from module');
            }
            
            this.processor = new WasmProcessor();
            await this.processor.init();
            
            this.wasmState = 'ready';
            console.log('✓ WASM processor ready');
            
        } catch (err) {
            console.error('WASM loading failed:', err);
            console.error('Error stack:', err.stack);
            this.wasmState = 'error';
            this.showStatus('WASM failed to load: ' + err.message, 'error');
        }
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
        this.testBtn = document.getElementById('testBtn');
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
        
        // DEBUG: Test canvas drawing - pure black/white
        this.testBtn?.addEventListener('click', () => {
            this.testCanvasPureBW();
        });
    }
    
    // DEBUG: Test drawing pure black and white directly on canvas
    testCanvasPureBW() {
        console.log('=== CANVAS PURE B/W TEST ===');
        const ctx = this.outputCanvas.getContext('2d', { alpha: false });
        this.outputCanvas.width = 400;
        this.outputCanvas.height = 400;
        
        // Fill white
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 400, 400);
        
        // Draw black circle
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(200, 200, 100, 0, Math.PI * 2);
        ctx.fill();
        
        // Check pixel values
        const imageData = ctx.getImageData(0, 0, 400, 400);
        let whiteCount = 0, blackCount = 0, grayCount = 0;
        for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i+1];
            const b = imageData.data[i+2];
            if (r === 255 && g === 255 && b === 255) whiteCount++;
            else if (r === 0 && g === 0 && b === 0) blackCount++;
            else {
                grayCount++;
                if (grayCount < 5) console.log('Gray pixel:', r, g, b, 'at', i);
            }
        }
        console.log('White pixels:', whiteCount, 'Black pixels:', blackCount, 'Gray:', grayCount);
        console.log('==============================');
    }

    handleFileSelect(e) {
        const file = e.target?.files?.[0];
        if (file?.type?.startsWith('image/')) {
            this.loadImage(file);
        }
    }

    async loadImage(file) {
        console.log('Loading image:', file.name, file.type, file.size);
        
        try {
            // Load and display image immediately
            this.sourceImage = await this.createImageBitmap(file);
            console.log('Image loaded:', this.sourceImage.width, 'x', this.sourceImage.height);
            
            this.displaySourceImage();
            
            // Switch to editor
            this.uploadSection.style.display = 'none';
            this.editorSection.style.display = 'flex';
            
            // Check WASM state
            console.log('WASM state:', this.wasmState);
            
            if (this.wasmState === 'loading') {
                // Show loading over photo while waiting
                this.showLoadingOverPhoto('Loading high-performance engine...');
                await this.waitForWasmReady();
                this.hideLoadingOverPhoto();
            } else if (this.wasmState === 'error') {
                this.showStatus('Processing not available in this browser', 'error');
                return;
            }
            
            // Now WASM is ready, process
            await this.process();
            
        } catch (err) {
            console.error('Error loading image:', err);
            this.showStatus('Error loading image: ' + err.message, 'error');
            this.hideLoadingOverPhoto();
        }
    }

    createImageBitmap(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(img.src); // Clean up
                resolve(img);
            };
            img.onerror = () => reject(new Error('Failed to decode image'));
            img.src = URL.createObjectURL(file);
        });
    }

    displaySourceImage() {
        if (!this.sourceImage) return;
        
        this.sourceCanvas.width = this.sourceImage.width;
        this.sourceCanvas.height = this.sourceImage.height;
        const ctx = this.sourceCanvas.getContext('2d', { alpha: false });
        ctx.drawImage(this.sourceImage, 0, 0);
        
        this.outputCanvas.width = this.sourceImage.width;
        this.outputCanvas.height = this.sourceImage.height;
    }

    waitForWasmReady() {
        return new Promise((resolve) => {
            const check = () => {
                if (this.wasmState === 'ready' || this.wasmState === 'error') {
                    resolve();
                } else {
                    setTimeout(check, 50);
                }
            };
            check();
        });
    }

    async process() {
        if (!this.processor) {
            console.warn('Processor not initialized yet, waiting...');
            // Wait a bit and try again
            await new Promise(r => setTimeout(r, 500));
            if (!this.processor) {
                this.showStatus('Processor not ready yet. Please wait...', 'error');
                return;
            }
        }
        
        if (this.wasmState !== 'ready') {
            this.showStatus('Engine still loading. Please wait...', 'error');
            return;
        }
        
        // Show loading while processing
        this.showLoadingOverPhoto('Creating coloring page...');
        this.downloadBtn.disabled = true;
        
        try {
            const ctx = this.sourceCanvas.getContext('2d', { alpha: false });
            console.log('Source canvas size:', this.sourceCanvas.width, 'x', this.sourceCanvas.height);
            
            const imageData = ctx.getImageData(
                0, 0, 
                this.sourceCanvas.width, 
                this.sourceCanvas.height
            );
            console.log('ImageData size:', imageData.width, 'x', imageData.height, 'data length:', imageData.data.length);
            
            const startTime = performance.now();
            const result = await this.processor.process(imageData, this.processingParams);
            console.log('Result ImageData size:', result.width, 'x', result.height, 'data length:', result.data.length);
            
            // DEBUG: Check ImageData BEFORE putImageData
            let wasmGray = false;
            for (let i = 0; i < Math.min(100, result.data.length); i += 4) {
                const r = result.data[i], g = result.data[i+1], b = result.data[i+2];
                if ((r !== 0 && r !== 255) || (g !== 0 && g !== 255) || (b !== 0 && b !== 255)) {
                    wasmGray = true;
                    console.log('WASM GRAY at', i, ':', r, g, b);
                    if (i > 20) break;
                }
            }
            console.log('WASM ImageData has gray:', wasmGray);
            
            const processTime = performance.now() - startTime;
            
            // DEBUG: Check canvas color space
            const testCtx = this.outputCanvas.getContext('2d', { alpha: false });
            console.log('Canvas color space:', testCtx.getContextAttributes()?.colorSpace || 'unknown');
            
            // Display result
            const outCtx = this.outputCanvas.getContext('2d', { alpha: false });
            console.log('Output canvas size before put:', this.outputCanvas.width, 'x', this.outputCanvas.height);
            outCtx.putImageData(result, 0, 0);
            
            // DEBUG: Verify canvas pixels are pure black/white
            const sampleData = outCtx.getImageData(0, 0, 100, 100).data;
            let hasGray = false;
            for (let i = 0; i < sampleData.length; i += 4) {
                const r = sampleData[i], g = sampleData[i+1], b = sampleData[i+2];
                if ((r !== 0 && r !== 255) || (g !== 0 && g !== 255) || (b !== 0 && b !== 255)) {
                    hasGray = true;
                    console.log('GRAY PIXEL at', i, ':', r, g, b);
                    if (i > 20) break;
                }
            }
            console.log('Canvas has gray pixels:', hasGray);
            
            console.log('Result displayed');
            
            this.hideLoadingOverPhoto();
            
            const mode = this.processor.fallbackMode ? 'Standard' : 'High-performance';
            this.showStatus(`${mode} • ${(processTime/1000).toFixed(1)}s`, 'success');
            this.downloadBtn.disabled = false;
            
        } catch (err) {
            console.error('Processing error:', err);
            this.hideLoadingOverPhoto();
            this.showStatus('Processing failed. Try a different photo.', 'error');
        }
    }

    showLoadingOverPhoto(text) {
        if (this.loadingOverlay) {
            this.loadingOverlay.style.display = 'flex';
        }
        if (this.loadingText) {
            this.loadingText.textContent = text;
        }
    }

    hideLoadingOverPhoto() {
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
        this.hideLoadingOverPhoto();
        this.downloadBtn.disabled = false;
    }
}

// Start app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ColoringApp();
});
