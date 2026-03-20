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
            console.log('Starting WASM init...');
            
            // Dynamic import of WASM module
            console.log('Importing imgproc-wasm.js...');
            const wasmModule = await import('./imgproc-wasm.js');
            console.log('WASM module imported:', wasmModule);
            
            const ModuleFactory = wasmModule.default;
            console.log('ModuleFactory:', ModuleFactory);
            
            // Create module instance with callbacks
            console.log('Calling ModuleFactory...');
            const moduleInstance = await ModuleFactory({
                onRuntimeInitialized: () => {
                    console.log('WASM runtime initialized callback');
                }
            });
            console.log('Module instance created:', moduleInstance);
            
            this.module = moduleInstance;
            
            // Check if already ready
            console.log('Checking calledRun:', this.module.calledRun);
            console.log('Checking HEAPU8:', !!this.module.HEAPU8);
            
            // Wait for runtime to be fully ready
            if (!this.module.calledRun) {
                console.log('Waiting for calledRun...');
                let attempts = 0;
                await new Promise((resolve, reject) => {
                    const check = () => {
                        attempts++;
                        if (this.module.calledRun && this.module.HEAPU8) {
                            console.log('WASM ready after', attempts, 'attempts');
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
            console.log('Module keys:', Object.keys(this.module));
            console.log('Has HEAP8:', !!this.module.HEAP8);
            console.log('Has HEAPU8:', !!this.module.HEAPU8);
            console.log('Has buffer:', !!this.module.buffer);
            
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
            
            console.log('HEAP available, length:', heap.length);
            
            // Wrap C functions - using obfuscated names to hide implementation
            console.log('Wrapping C functions...');
            // Use ccall for proper type marshalling (especially floats)
            this.processFn = (ptr, w, h, windowSize, c, method, outMin, outMax) => {
                return this.module.ccall('x9', 'number', 
                    ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
                    [ptr, w, h, windowSize, c, method, outMin, outMax]
                );
            };
            this.freeFn = (ptr) => this.module._free(ptr);  // Use built-in _free
            this.estimateFn = (w, h) => this.module._z3(w, h);
            
            console.log('Functions bound:', {
                process: !!this.processFn,
                free: !!this.freeFn,
                estimate: !!this.estimateFn
            });
            
            this.isReady = true;
            console.log('✓ WASM processor initialized');
            console.log(`WASM memory: ${this.module.HEAPU8.length / 1024 / 1024}MB`);
            
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
        console.log('WASM processing input:', width, 'x', height, 'data length:', imageData.data.length);

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
            
            console.log('Calling x9 with params:', {width, height, windowSize, c, method, outputMin, outputMax});
            
            const outputPtr = this.processFn(
                inputPtr,
                width,
                height,
                windowSize,
                c,
                method,
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
            
            // DEBUG: Check for pure black/white
            let hasGray = false;
            for (let i = 0; i < result.data.length; i += 4) {
                const r = result.data[i];
                const g = result.data[i+1];
                const b = result.data[i+2];
                // Check if any channel is not 0 or 255
                if ((r !== 0 && r !== 255) || (g !== 0 && g !== 255) || (b !== 0 && b !== 255)) {
                    hasGray = true;
                    console.log('Found non-binary pixel at', i, ':', r, g, b);
                    if (i > 100) break; // Just show first few
                }
            }
            console.log('Has gray values:', hasGray);
            
            console.log('WASM output ImageData:', result.width, 'x', result.height, 'data length:', result.data.length);

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
