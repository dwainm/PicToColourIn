/**
 * Emscripten bindings for mini_imgproc
 * Simple C API - no embind
 */

#include <emscripten/emscripten.h>
#include "mini_imgproc.h"

// Wrapper that takes raw memory pointer from JS
extern "C" {

// Process image using adaptive threshold (like OpenCV)
// Returns pointer to output buffer - caller must free with freeProcessedImage()
EMSCRIPTEN_KEEPALIVE
uint8_t* processImageAdaptive(
    const uint8_t* rgbaIn,
    int width,
    int height,
    int windowSize,    // e.g., 21 for 21x21 neighborhood
    float c,           // constant subtracted from mean (e.g., 5.0)
    int method,        // 0 = MEAN_C, 1 = GAUSSIAN_C
    float outputMin,   // 0.0 for white
    float outputMax    // 1.0 for black
) {
    imgproc::Image result = imgproc::processToColoringPageAdaptive(
        rgbaIn, width, height,
        windowSize, c, method, outputMin, outputMax
    );
    
    // Allocate output buffer (RGBA)
    size_t outSize = width * height * 4;
    uint8_t* rgbaOut = (uint8_t*)malloc(outSize);
    
    // Convert grayscale result to RGBA
    imgproc::grayToRgba(result, rgbaOut);
    
    return rgbaOut;
}

// Original DoG method (kept for compatibility)
EMSCRIPTEN_KEEPALIVE
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
EMSCRIPTEN_KEEPALIVE
void freeProcessedImage(uint8_t* ptr) {
    free(ptr);
}

// Get estimated processing time in ms (based on megapixels)
EMSCRIPTEN_KEEPALIVE
int estimateProcessingTime(int width, int height) {
    float megapixels = (width * height) / 1000000.0f;
    // Rough estimate: 50ms per megapixel for DoG + closing
    return static_cast<int>(megapixels * 50.0f + 100.0f);
}

} // extern "C"
