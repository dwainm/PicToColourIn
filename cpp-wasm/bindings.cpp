/**
 * Emscripten bindings for mini_imgproc
 * Exports: processImage WASM function
 */

#include <emscripten/bind.h>
#include "mini_imgproc.h"

using namespace emscripten;

// Wrapper that takes raw memory pointer from JS
extern "C" {

// Process image and return pointer to output buffer
// Caller must free the result with freeProcessedImage()
uint8_t* processImage(
    const uint8_t* rgbaIn,
    int width,
    int height,
    float blurSigma,
    float edgeIntensity,
    float sigmaRatio,
    int closeRadius,
    float outputMin,
    float outputMax
) {
    imgproc::Image result = imgproc::processToColoringPage(
        rgbaIn, width, height,
        blurSigma, edgeIntensity, sigmaRatio,
        closeRadius, outputMin, outputMax
    );
    
    // Allocate output buffer (RGBA)
    size_t outSize = width * height * 4;
    uint8_t* rgbaOut = (uint8_t*)malloc(outSize);
    
    // Convert grayscale result to RGBA
    imgproc::grayToRgba(result, rgbaOut);
    
    return rgbaOut;
}

// Free memory allocated by processImage
void freeProcessedImage(uint8_t* ptr) {
    free(ptr);
}

// Get estimated processing time in ms (based on megapixels)
int estimateProcessingTime(int width, int height) {
    float megapixels = (width * height) / 1000000.0f;
    // Rough estimate: 50ms per megapixel for DoG + closing
    return static_cast<int>(megapixels * 50.0f + 100.0f);
}

} // extern "C"

// Embind bindings for cleaner JS interface (optional)
EMSCRIPTEN_BINDINGS(imgproc_module) {
    function("estimateProcessingTime", &estimateProcessingTime);
}
