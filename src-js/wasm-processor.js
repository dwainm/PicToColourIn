/**
 * WASM Image Processor
 * Loads and wraps the C++ WASM module for coloring page generation
 * Falls back to WebGL if WASM fails to load
 */

class WasmProcessor {
    constructor() {
        this.module = null;
        this.processImageFn = null;
        this.freeImageFn = null;
        this.estimateTimeFn = null;
        this.isReady = false;
        this.fallbackMode = false;
    }

    async init() {
        try {
            // Dynamic import of WASM module
            const wasmModule = await import('./imgproc-wasm.js');
            this.module = await wasmModule.default();
            
            // Wrap C functions for easy calling
            this.processImageFn = this.module.cwrap('processImage', 'number', [
                'number',  // rgbaIn pointer
                'number',  // width
                'number',  // height
                'number',  // blurSigma
                'number',  // edgeIntensity
                'number',  // sigmaRatio
                'number',  // closeRadius
                'number',  // outputMin
                'number'   // outputMax
            ]);
            
            this.freeImageFn = this.module.cwrap('freeProcessedImage', null, ['number']);
            this.estimateTimeFn = this.module.cwrap('estimateProcessingTime', 'number', ['number', 'number']);
            
            this.isReady = true;
            console.log('✓ WASM processor initialized');
            
            // Log estimated memory
            console.log(`WASM memory: ${this.module.HEAP8.length / 1024 / 1024}MB initial`);
            
        } catch (err) {
            console.warn('WASM load failed, falling back to WebGL:', err);
            this.fallbackMode = true;
            this.isReady = true;  // Ready in fallback mode
        }
    }

    /**
     * Process image using WASM or fallback to WebGL
     */
    async process(imageData, params = {}) {
        if (!this.isReady) {
            throw new Error('Processor not initialized');
        }

        if (this.fallbackMode) {
            return this.processWebGL(imageData, params);
        }

        const {
            blurRadius = 3.6,
            edgeIntensity = 1.42,
            sigmaRatio = 3.6,
            closeRadius = 1,
            outputMin = 0.2,   // Don't go to pure black
            outputMax = 0.8    // Dark gray lines
        } = params;

        // Extract dimensions
        const width = imageData.width || imageData.videoWidth || 800;
        const height = imageData.height || imageData.videoHeight || 600;

        // Get RGBA data
        let rgbaData;
        if (imageData instanceof ImageData) {
            rgbaData = imageData.data;
        } else if (imageData instanceof HTMLCanvasElement) {
            const ctx = imageData.getContext('2d');
            rgbaData = ctx.getImageData(0, 0, width, height).data;
        } else if (imageData instanceof HTMLImageElement || imageData instanceof ImageBitmap) {
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageData, 0, 0);
            rgbaData = ctx.getImageData(0, 0, width, height).data;
        } else {
            throw new Error('Unsupported image data type');
        }

        // Allocate memory in WASM
        const inputPtr = this.module._malloc(rgbaData.length);
        const outputSize = width * height * 4;
        
        try {
            // Copy input to WASM memory
            this.module.HEAPU8.set(rgbaData, inputPtr);

            // Call WASM function
            const startTime = performance.now();
            
            const outputPtr = this.processImageFn(
                inputPtr,
                width,
                height,
                blurRadius,
                edgeIntensity,
                sigmaRatio,
                closeRadius,
                outputMin,
                outputMax
            );

            const processTime = performance.now() - startTime;
            console.log(`WASM processing: ${processTime.toFixed(1)}ms`);

            // Copy result from WASM
            const resultData = new Uint8ClampedArray(
                this.module.HEAPU8.buffer,
                outputPtr,
                outputSize
            );
            
            // Create ImageData (make a copy since we'll free WASM memory)
            const result = new ImageData(
                new Uint8ClampedArray(resultData),
                width,
                height
            );

            // Free WASM memory
            this.freeImageFn(outputPtr);

            return result;

        } finally {
            // Always free input memory
            this.module._free(inputPtr);
        }
    }

    /**
     * Estimate processing time in milliseconds
     */
    estimateTime(width, height) {
        if (this.fallbackMode || !this.estimateTimeFn) {
            // Rough estimate for WebGL
            return (width * height / 1000000) * 30 + 50;
        }
        return this.estimateTimeFn(width, height);
    }

    /**
     * Fallback to WebGL processor
     */
    async processWebGL(imageData, params) {
        // Import the original WebGL processor
        const { WebGLProcessor } = await import('./webgl-processor.js');
        const processor = new WebGLProcessor();
        await processor.init();
        
        // Convert params
        const webglParams = {
            blurRadius: params.blurRadius || 3.6,
            edgeIntensity: params.edgeIntensity || 1.42,
            threshold: params.threshold || 0.175,
            sigmaRatio: params.sigmaRatio || 3.6
        };
        
        return processor.processImage(imageData, webglParams);
    }

    /**
     * Check if WASM is supported and loaded
     */
    static isSupported() {
        return typeof WebAssembly === 'object' && 
               typeof WebAssembly.instantiate === 'function';
    }
}

// Export for use
if (typeof module !== 'undefined') {
    module.exports = { WasmProcessor };
}

export { WasmProcessor };
export default WasmProcessor;
