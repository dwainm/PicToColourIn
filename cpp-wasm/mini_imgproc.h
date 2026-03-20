/**
 * Mini Image Processing Library for Photo-to-Coloring-Page
 * Lightweight C++ implementation of DoG + morphological operations
 * Compiles to ~50KB WASM with Emscripten
 */

#ifndef MINI_IMGPROC_H
#define MINI_IMGPROC_H

#include <cstdint>
#include <vector>
#include <cmath>

namespace imgproc {

struct Image {
    int width;
    int height;
    std::vector<uint8_t> data;  // Grayscale: single channel
    
    Image(int w, int h) : width(w), height(h), data(w * h, 0) {}
    
    uint8_t& at(int x, int y) { return data[y * width + x]; }
    const uint8_t& at(int x, int y) const { return data[y * width + x]; }
    
    // Safe access with border clamping
    uint8_t getClamped(int x, int y) const {
        x = x < 0 ? 0 : (x >= width ? width - 1 : x);
        y = y < 0 ? 0 : (y >= height ? height - 1 : y);
        return at(x, y);
    }
};

// RGBA to Grayscale conversion
Image rgbToGray(const uint8_t* rgba, int width, int height);

// Grayscale to RGBA output (for canvas)
void grayToRgba(const Image& gray, uint8_t* rgbaOut);

// 1D Gaussian kernel generation
std::vector<float> generateGaussianKernel(float sigma);

// Separable Gaussian blur (much faster than 2D)
Image gaussianBlur(const Image& src, float sigma);

// Difference of Gaussians
Image differenceOfGaussians(const Image& src, float sigmaSmall, float sigmaLarge, float intensity);

// Morphological dilation (for closing operation)
Image dilate(const Image& src, int radius);

// Morphological erosion
Image erode(const Image& src, int radius);

// Morphological closing = dilate then erode (connects broken lines)
Image morphologicalClose(const Image& src, int radius);

// Bilateral filter (edge-preserving smoothing)
Image bilateralFilter(const Image& src, float spatialSigma, float intensitySigma);

// Non-maximum suppression for edge thinning
Image nonMaxSuppress(const Image& src);

// Median filter for noise removal
Image medianFilter(const Image& src, int radius);

// Box blur for fast noise reduction  
Image boxBlur(const Image& src, int radius);

// Adaptive thresholding
Image adaptiveThreshold(const Image& src, int windowSize, float c);

// Hysteresis thresholding (Canny-style)
Image hysteresisThreshold(const Image& src, uint8_t lowThresh, uint8_t highThresh);

// Contrast stretching
Image stretchContrast(const Image& src, float lowPercentile, float highPercentile);

// Main pipeline: RGBA -> processed grayscale
Image processToColoringPage(
    const uint8_t* rgbaIn,
    int width,
    int height,
    float blurSigma,        // e.g., 3.6
    float edgeIntensity,    // e.g., 1.42
    float sigmaRatio,       // e.g., 3.6
    int closeRadius,        // morphological closing radius, e.g., 1 or 2
    float outputMin,        // minimum output value (0.0 for pure white)
    float outputMax,        // maximum output value (1.0 for pure black)
    Image* debugDogOut = nullptr,  // optional: output raw DoG for debugging
    float bilateralSpatial = 2.0f,   // bilateral spatial sigma (0 to disable)
    float bilateralIntensity = 30.0f // bilateral intensity sigma
);

} // namespace imgproc

#endif // MINI_IMGPROC_H
