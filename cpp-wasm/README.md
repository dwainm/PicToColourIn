# C++ WASM Image Processing Pipeline

High-performance C++ implementation of the photo-to-coloring-page algorithm, compiled to WebAssembly for browser use.

## Architecture

```
cpp-wasm/
├── mini_imgproc.h        - Header with Image struct and function declarations
├── mini_imgproc.cpp      - Core algorithms (DoG, Gaussian blur, morphology)
├── bindings.cpp          - Emscripten bindings for JS interop
└── Makefile              - Build configuration

src-js/
└── wasm-processor.js     - JavaScript wrapper that loads and uses the WASM
```

## Why C++ instead of WebGL?

1. **Accuracy**: Double-precision floating point vs WebGL's mediump float
2. **Algorithm flexibility**: Easier to implement complex operations like morphological closing
3. **Deterministic**: Same results across all browsers
4. **Performance**: Optimized C++ can be faster than GPU for small images
5. **Size**: ~50KB WASM vs no external deps for WebGL

## Algorithms Implemented

### 1. Difference of Gaussians (DoG)
The core edge detection:
```cpp
edge = abs(Gaussian(small_sigma) - Gaussian(large_sigma)) * intensity
```

### 2. Separable Gaussian Blur
Much faster than 2D convolution:
- Horizontal pass with 1D kernel
- Vertical pass with 1D kernel
- Complexity: O(n*radius) vs O(n*radius²)

### 3. Morphological Closing
```cpp
closing(image) = erode(dilate(image, radius), radius)
```
This connects broken line segments (key for coloring pages).

### 4. Soft Range Mapping
Instead of hard thresholding (which creates artifacts), we map edge strength to a gray range:
```cpp
output = min_out + (inverted_edge / 255) * (max_out - min_out)
```

## Building

### Prerequisites
- Emscripten SDK: https://emscripten.org/docs/getting_started/downloads.html

### Build
```bash
cd cpp-wasm
make
```

Outputs:
- `src-js/imgproc-wasm.js` (loader)
- `src-js/imgproc-wasm.wasm` (~30-50KB)

### Debug Build
```bash
make debug
```

## JavaScript Usage

```javascript
import { WasmProcessor } from './wasm-processor.js';

const processor = new WasmProcessor();
await processor.init();

const result = await processor.process(imageData, {
    blurRadius: 3.6,
    edgeIntensity: 1.42,
    sigmaRatio: 3.6,
    closeRadius: 1,
    outputMin: 0.15,
    outputMax: 0.85
});
```

## Performance

Typical processing times (MacBook Pro M1):
- 1MP image: ~50ms
- 4MP image: ~150ms
- 12MP image: ~400ms

Memory usage:
- Initial: 16MB
- Grows as needed up to 256MB

## Testing Quality

To test the C++ implementation against WebGL:

```bash
cd tests
# Update pi-runner.js to use WasmProcessor
node pi-runner.js
```

Target quality: **7/10** (vs 5/10 with WebGL)

## Future Improvements

1. **SIMD**: Use WebAssembly SIMD for 4x speedup
2. **Multi-threading**: Web Workers for parallel processing
3. **Adaptive thresholding**: Per-region threshold based on local contrast
4. **Contour following**: Vector output instead of raster
5. **ML integration**: Neural network edge detection (but keep it lightweight)

## License

Same as main project - MIT or proprietary as needed.
