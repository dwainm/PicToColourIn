/**
 * Emscripten bindings for mini_imgproc
 * Public API with obfuscated names
 */

#include <emscripten/emscripten.h>
#include "mini_imgproc.h"

// Wrapper that takes raw memory pointer from JS
extern "C" {

// Public API: Process image - obfuscated name
EMSCRIPTEN_KEEPALIVE
uint8_t* x9(const uint8_t* rgbaIn, int width, int height, int windowSize, float c, int method, float outputMin, float outputMax) {
    imgproc::Image result = imgproc::processToColoringPageAdaptive(
        rgbaIn, width, height, windowSize, c, method, outputMin, outputMax
    );
    size_t outSize = width * height * 4;
    uint8_t* rgbaOut = (uint8_t*)malloc(outSize);
    imgproc::grayToRgba(result, rgbaOut);
    return rgbaOut;
}

// Free memory
EMSCRIPTEN_KEEPALIVE
void y2(uint8_t* ptr) {
    free(ptr);
}

// Estimate processing time
EMSCRIPTEN_KEEPALIVE
int z3(int width, int height) {
    float megapixels = (width * height) / 1000000.0f;
    return static_cast<int>(megapixels * 30.0f + 50.0f);
}

} // extern "C"
