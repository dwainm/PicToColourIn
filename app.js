/**
 * PicToColourIn App - Main Application Logic
 */

class ColoringApp {
    constructor() {
        this.processor = null;
        this.sourceImage = null;
        this.processingParams = {
            blurRadius: 2.0,
            edgeIntensity: 0.5,
            threshold: 0.3,
            invert: false
        };
        
        this.init();
    }

    init() {
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
        
        // Controls
        this.blurSlider = document.getElementById('blurSlider');
        this.edgeSlider = document.getElementById('edgeSlider');
        this.thresholdSlider = document.getElementById('thresholdSlider');
        this.invertToggle = document.getElementById('invertToggle');
        
        // Value displays
        this.blurValue = document.getElementById('blurValue');
        this.edgeValue = document.getElementById('edgeValue');
        this.thresholdValue = document.getElementById('thresholdValue');
        
        // Buttons
        this.newImageBtn = document.getElementById('newImageBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.pdfBtn = document.getElementById('pdfBtn');
        this.printBtn = document.getElementById('printBtn');
    }

    bindEvents() {
        // Upload events
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('drag-over');
        });
        
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('drag-over');
        });
        
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.loadImage(files[0]);
            }
        });
        
        // Control events
        this.blurSlider.addEventListener('input', (e) => {
            this.processingParams.blurRadius = parseFloat(e.target.value);
            this.blurValue.textContent = e.target.value;
            this.debouncedProcess();
        });
        
        this.edgeSlider.addEventListener('input', (e) => {
            this.processingParams.edgeIntensity = parseFloat(e.target.value);
            this.edgeValue.textContent = e.target.value;
            this.debouncedProcess();
        });
        
        this.thresholdSlider.addEventListener('input', (e) => {
            this.processingParams.threshold = parseFloat(e.target.value);
            this.thresholdValue.textContent = e.target.value;
            this.debouncedProcess();
        });
        
        this.invertToggle.addEventListener('change', (e) => {
            this.processingParams.invert = e.target.checked;
            this.process();
        });
        
        // Action buttons
        this.newImageBtn.addEventListener('click', () => this.reset());
        this.downloadBtn.addEventListener('click', () => this.download());
        this.pdfBtn.addEventListener('click', () => this.downloadPDF());
        this.printBtn.addEventListener('click', () => this.print());
    }

    initWebGL() {
        try {
            this.processor = new WebGLProcessor();
        } catch (err) {
            console.error('WebGL initialization failed:', err);
            alert('Sorry, your browser does not support WebGL which is required for this app.');
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            this.loadImage(file);
        }
    }

    async loadImage(file) {
        try {
            // Show loading state
            this.dropZone.style.opacity = '0.5';
            
            await this.processor.loadImage(file);
            
            // Process image
            this.process();
            
            // Switch to editor view
            this.uploadSection.style.display = 'none';
            this.editorSection.style.display = 'flex';
            
            // Copy result to visible canvas
            this.updateOutputCanvas();
            
        } catch (err) {
            console.error('Error loading image:', err);
            alert('Error loading image. Please try another file.');
        } finally {
            this.dropZone.style.opacity = '1';
        }
    }

    process() {
        if (!this.processor) return;
        
        // Show loading
        this.loadingOverlay.style.display = 'flex';
        
        // Use requestAnimationFrame to allow UI to update before processing
        requestAnimationFrame(() => {
            // Process with WebGL
            this.processor.process(this.processingParams);
            
            // Update visible canvas
            this.updateOutputCanvas();
            
            // Hide loading
            this.loadingOverlay.style.display = 'none';
        });
    }

    debouncedProcess() {
        // Debounce for slider dragging
        if (this.processTimeout) {
            clearTimeout(this.processTimeout);
        }
        this.processTimeout = setTimeout(() => this.process(), 50);
    }

    updateOutputCanvas() {
        const glCanvas = this.processor.getOutputCanvas();
        
        // Match dimensions
        this.outputCanvas.width = glCanvas.width;
        this.outputCanvas.height = glCanvas.height;
        
        // Draw WebGL result to visible canvas
        const ctx = this.outputCanvas.getContext('2d');
        ctx.drawImage(glCanvas, 0, 0);
    }

    download() {
        if (!this.processor) return;
        
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        this.processor.download(`coloring-page-${timestamp}.png`);
    }

    downloadPDF() {
        if (!this.processor) return;
        
        const canvas = this.processor.getOutputCanvas();
        const imgData = canvas.toDataURL('image/png');
        
        // Create a print-optimized window
        const printWindow = window.open('', '_blank');
        const timestamp = new Date().toISOString().slice(0, 10);
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>PicToColourIn - Coloring Page</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { 
                        display: flex; 
                        justify-content: center; 
                        align-items: center; 
                        min-height: 100vh;
                        background: white;
                    }
                    img { 
                        max-width: 100%; 
                        max-height: 100vh;
                        object-fit: contain;
                    }
                    @media print {
                        body { margin: 0; }
                        img { max-height: 100vh; width: auto; }
                    }
                </style>
            </head>
            <body>
                <img src="${imgData}" alt="Coloring Page">
                <script>
                    // Auto-trigger print dialog
                    setTimeout(() => {
                        window.print();
                    }, 250);
                <\/script>
            </body>
            </html>
        `);
        
        printWindow.document.close();
    }

    print() {
        window.print();
    }

    reset() {
        // Reset UI
        this.uploadSection.style.display = 'block';
        this.editorSection.style.display = 'none';
        
        // Reset file input
        this.fileInput.value = '';
        
        // Reset sliders to defaults
        this.blurSlider.value = 2;
        this.edgeSlider.value = 0.5;
        this.thresholdSlider.value = 0.3;
        this.invertToggle.checked = false;
        
        // Reset values display
        this.blurValue.textContent = '2';
        this.edgeValue.textContent = '0.5';
        this.thresholdValue.textContent = '0.3';
        
        // Reset params
        this.processingParams = {
            blurRadius: 2.0,
            edgeIntensity: 0.5,
            threshold: 0.3,
            invert: false
        };
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ColoringApp();
});
