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
            
            // Dynamic import of WASM module with cache-busting
            const version = 'v=' + Date.now();
            const wasmModule = await import('./imgproc-wasm.js?' + version);
            
            const ModuleFactory = wasmModule.default;
            
            // Create module instance with callbacks
            const moduleInstance = await ModuleFactory({
                onRuntimeInitialized: () => {
                }
            });
            
            this.module = moduleInstance;
            
            // Check if already ready
            
            // Wait for runtime to be fully ready
            if (!this.module.calledRun) {
                let attempts = 0;
                await new Promise((resolve, reject) => {
                    const check = () => {
                        attempts++;
                        if (this.module.calledRun && this.module.HEAPU8) {
                            resolve();
                        } else if (attempts > 100) {
                            reject(new Error('WASM init timeout'));
                        } else {
                            setTimeout(check, 10);
                        }
                    };
                    check();
                });
            }
            
            // Check what's actually available
            
            // Try to find memory
            let heap = this.module.HEAPU8 || this.module.HEAP8;
            if (!heap && this.module.buffer) {
                heap = new Uint8Array(this.module.buffer);
            }
            
            // Verify HEAP is available
            if (!heap) {
                console.error('No heap available, module contents:', this.module);
                throw new Error('WASM HEAP not initialized');
            }
            
            // Store reference
            this.module.HEAPU8 = heap;
            
            // Wrap C functions
            this.processFn = (ptr, w, h, windowSize, c, method, outMin, outMax) => {
                // Ensure proper types for WASM
                return this.module.ccall('x9', 'number',
                    ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
                    [
                        ptr | 0,      // force int
                        w | 0,
                        h | 0,
                        windowSize | 0,
                        +c,           // force float
                        method | 0,
                        +outMin,      // force float
                        +outMax       // force float
                    ]
                );
            };
            this.freeFn = (ptr) => this.module._free(ptr);
            this.estimateFn = (w, h) => this.module._z3(w, h);
            
                process: !!this.processFn,
                free: !!this.freeFn,
                estimate: !!this.estimateFn
            });
            
            this.isReady = true;
            
        } catch (err) {
            console.error('WASM load FAILED:', err);
            console.error('Error stack:', err.stack);
            this.fallbackMode = true;
            this.isReady = false;
            throw err; // Re-throw so caller knows
        }
    }

    /**
     * Process image using WASM or fallback to WebGL
     * Uses OpenCV-style adaptive threshold (winner: window=21, c=5, GAUSSIAN)
     */
    async process(imageData, params = {}) {
        if (!this.isReady) {
            throw new Error('Processor not initialized');
        }

        if (this.fallbackMode) {
            return this.processWebGL(imageData, params);
        }

        // PRODUCTION DEFAULTS: Adaptive threshold (OpenCV-style)
        // FINAL WINNER: window=23, c=5, method=GAUSSIAN_C (user selected)
        const {
            windowSize = 23,     // Neighborhood size (23x23) - slightly larger for smoother regions
            c = 5.0,             // Constant subtracted from mean
            method = 1,          // 1 = GAUSSIAN_C (smooth), 0 = MEAN_C (faster)
            outputMin = 0.0,     // White
            outputMax = 1.0,     // Black
            // Legacy params (ignored in adaptive mode)
            blurRadius,
            edgeIntensity,
            sigmaRatio,
            closeRadius
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

            // Call WASM function - adaptive threshold (OpenCV-style)
            const startTime = performance.now();
            
            // FORCE params to be exact numbers
            const ws = Number(windowSize);
            const cVal = Number(c);
            const meth = Number(method);
            const minVal = Number(outputMin);
            const maxVal = Number(outputMax);
            
                width, height, 
                windowSize: ws, c: cVal, method: meth,
                outputMin: minVal, outputMax: maxVal,
                outputMinType: typeof minVal, outputMaxType: typeof maxVal
            });
            
            const outputPtr = this.processFn(
                inputPtr,
                width,
                height,
                ws,
                cVal,
                meth,
                minVal,
                maxVal
            );

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
            this.freeFn(outputPtr);

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
        if (!this.estimateFn) {
            // Rough estimate
            return (width * height / 1000000) * 30 + 50;
        }
        return this.estimateFn(width, height);
    }
}

// Export for use
if (typeof module !== 'undefined') {
    module.exports = { WasmProcessor };
}

export { WasmProcessor };
export default WasmProcessor;
