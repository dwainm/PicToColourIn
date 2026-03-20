/**
 * PicToColourIn App - WASM-powered Version
 * Uses C++ compiled to WASM for high-quality image processing
 * Falls back to WebGL if WASM unavailable
 */

class ColoringApp {
    constructor() {
        this.sourceImage = null;
        this.currentJobId = null;
        this.isProcessing = false;
        this.processor = null;
        
        // Optimized params for C++ implementation (target: 7/10)
        this.processingParams = {
            blurRadius: 3.6,        // Large blur for wide edges
            edgeIntensity: 1.42,    // From our best 5/10 result
            sigmaRatio: 3.6,        // Large ratio for better DoG
            closeRadius: 1,         // Connect broken lines
            outputMin: 0.15,        // Slightly darker minimum
            outputMax: 0.85         // Slightly darker maximum
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
        this.processingStatus = document.getElementById('processingStatus');
        
        // Controls - updated for C++ params
        this.blurSlider = document.getElementById('blurSlider');
        this.edgeSlider = document.getElementById('edgeSlider');
        this.closeSlider = document.getElementById('closeSlider'); // New control
        
        // Value displays
        this.blurValue = document.getElementById('blurValue');
        this.edgeValue = document.getElementById('edgeValue');
        this.closeValue = document.getElementById('closeValue');
        
        // Buttons
        this.newImageBtn = document.getElementById('newImageBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.pdfBtn = document.getElementById('pdfBtn');
        this.printBtn = document.getElementById('printBtn');
        
        // WASM indicator
        this.wasmIndicator = document.getElementById('wasmIndicator');
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
        this.blurSlider?.addEventListener('input', (e) => {
            this.processingParams.blurRadius = parseFloat(e.target.value);
            if (this.blurValue) {
                this.blurValue.textContent = this.processingParams.blurRadius.toFixed(1);
            }
            this.debouncedProcess();
        });
        
        this.edgeSlider?.addEventListener('input', (e) => {
            this.processingParams.edgeIntensity = parseFloat(e.target.value);
            if (this.edgeValue) {
                this.edgeValue.textContent = this.processingParams.edgeIntensity.toFixed(1);
            }
            this.debouncedProcess();
        });
        
        this.closeSlider?.addEventListener('input', (e) => {
            this.processingParams.closeRadius = parseInt(e.target.value);
            if (this.closeValue) {
                this.closeValue.textContent = this.processingParams.closeRadius;
            }
            this.debouncedProcess();
        });
        
        // Button events
        this.newImageBtn?.addEventListener('click', () => this.reset());
        
        this.downloadBtn?.addEventListener('click', () => this.download());
        this.pdfBtn?.addEventListener('click', () => this.downloadPDF());
        this.printBtn?.addEventListener('click', () => this.print());
    }

    async initProcessor() {
        try {
            // Try to load WASM processor
            const { WasmProcessor } = await import('./wasm-processor.js');
            this.processor = new WasmProcessor();
            await this.processor.init();
            
            if (this.processor.fallbackMode) {
                this.showStatus('Using WebGL (WASM unavailable)', 'info');
            } else {
                this.showStatus('✓ High-performance WASM loaded', 'success');
                console.log('WASM processor ready');
            }
            
        } catch (err) {
            console.warn('WASM init failed, using WebGL:', err);
            this.showStatus('Using WebGL processing', 'info');
            
            // Fallback to WebGL
            const { WebGLProcessor } = await import('./webgl-processor.js');
            this.processor = new WebGLProcessor();
            await this.processor.init();
        }
    }

    debouncedProcess() {
        if (this.processTimeout) {
            clearTimeout(this.processTimeout);
        }
        this.processTimeout = setTimeout(() => this.process(), 150);
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            this.loadImage(file);
        }
    }

    async loadImage(file) {
        try {
            // Load and display immediately
            this.sourceImage = await this.createImageBitmap(file);
            this.displaySourceImage();
            
            // Show editor
            this.uploadSection.style.display = 'none';
            this.editorSection.style.display = 'flex';
            
            // Show processing state
            this.showProcessingState();
            
            // Process in background
            await this.process();
            
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
        // Draw preview
        this.sourceCanvas.width = this.sourceImage.width;
        this.sourceCanvas.height = this.sourceImage.height;
        const ctx = this.sourceCanvas.getContext('2d');
        ctx.drawImage(this.sourceImage, 0, 0);
        
        // Set output canvas size
        this.outputCanvas.width = this.sourceImage.width;
        this.outputCanvas.height = this.sourceImage.height;
    }

    showProcessingState() {
        this.isProcessing = true;
        this.loadingOverlay.style.display = 'flex';
        if (this.processingStatus) {
            this.processingStatus.textContent = 'Creating coloring page...';
        }
        
        if (this.downloadBtn) this.downloadBtn.disabled = true;
        if (this.pdfBtn) this.pdfBtn.disabled = true;
        if (this.printBtn) this.printBtn.disabled = true;
    }

    hideProcessingState() {
        this.isProcessing = false;
        this.loadingOverlay.style.display = 'none';
        
        if (this.downloadBtn) this.downloadBtn.disabled = false;
        if (this.pdfBtn) this.pdfBtn.disabled = false;
        if (this.printBtn) this.printBtn.disabled = false;
    }

    async process() {
        if (!this.processor || !this.sourceImage || this.isProcessing) {
            return;
        }
        
        this.showProcessingState();
        
        try {
            // Get image data from source canvas
            const ctx = this.sourceCanvas.getContext('2d');
            const imageData = ctx.getImageData(
                0, 0, 
                this.sourceCanvas.width, 
                this.sourceCanvas.height
            );
            
            // Estimate time
            const estTime = this.processor.estimateTime?.(
                this.sourceCanvas.width, 
                this.sourceCanvas.height
            ) || 500;
            
            console.log(`Estimated processing time: ${estTime}ms`);
            
            // Process
            const startTime = performance.now();
            const result = await this.processor.process(imageData, this.processingParams);
            const processTime = performance.now() - startTime;
            
            console.log(`Total processing: ${processTime.toFixed(1)}ms`);
            
            // Display result
            this.updateOutputCanvas(result);
            
            // Update status
            if (this.processingStatus) {
                const mode = this.processor.fallbackMode ? 'WebGL' : 'WASM';
                this.processingStatus.textContent = `Done in ${processTime.toFixed(0)}ms (${mode})`;
                setTimeout(() => this.hideProcessingState(), 500);
            } else {
                this.hideProcessingState();
            }
            
        } catch (err) {
            console.error('Processing error:', err);
            this.processingStatus.textContent = 'Error. Try different settings.';
            this.hideProcessingState();
        }
    }

    updateOutputCanvas(imageData) {
        if (!imageData) return;
        
        const ctx = this.outputCanvas.getContext('2d');
        
        if (imageData instanceof ImageData) {
            ctx.putImageData(imageData, 0, 0);
        }
    }

    showStatus(message, type = 'info') {
        if (this.wasmIndicator) {
            this.wasmIndicator.textContent = message;
            this.wasmIndicator.className = `status-${type}`;
            this.wasmIndicator.style.display = 'block';
        }
        console.log(`[${type}] ${message}`);
    }

    download() {
        const link = document.createElement('a');
        link.download = `coloring-page-${Date.now()}.png`;
        link.href = this.outputCanvas.toDataURL('image/png');
        link.click();
    }

    downloadPDF() {
        const { jsPDF } = window.jspdf || {};
        
        if (!jsPDF) {
            this.download();  // Fallback to PNG
            return;
        }
        
        const imgData = this.outputCanvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: this.outputCanvas.width > this.outputCanvas.height ? 'l' : 'p',
            unit: 'px',
            format: [this.outputCanvas.width, this.outputCanvas.height]
        });
        
        pdf.addImage(imgData, 'PNG', 0, 0, this.outputCanvas.width, this.outputCanvas.height);
        pdf.save(`coloring-page-${Date.now()}.pdf`);
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
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    }

    reset() {
        this.uploadSection.style.display = 'block';
        this.editorSection.style.display = 'none';
        
        this.sourceImage = null;
        this.currentJobId = null;
        
        this.fileInput.value = '';
        
        // Reset params to defaults
        this.processingParams = {
            blurRadius: 3.6,
            edgeIntensity: 1.42,
            sigmaRatio: 3.6,
            closeRadius: 1,
            outputMin: 0.15,
            outputMax: 0.85
        };
        
        // Update sliders if they exist
        if (this.blurSlider) this.blurSlider.value = this.processingParams.blurRadius;
        if (this.blurValue) this.blurValue.textContent = this.processingParams.blurRadius.toFixed(1);
        if (this.edgeSlider) this.edgeSlider.value = this.processingParams.edgeIntensity;
        if (this.edgeValue) this.edgeValue.textContent = this.processingParams.edgeIntensity.toFixed(1);
        if (this.closeSlider) this.closeSlider.value = this.processingParams.closeRadius;
        if (this.closeValue) this.closeValue.textContent = this.processingParams.closeRadius;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ColoringApp();
});
