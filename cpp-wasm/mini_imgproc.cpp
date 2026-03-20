/**
 * Mini Image Processing Library - Implementation
 * Optimized for WASM with minimal dependencies
 */

#include "mini_imgproc.h"
#include <algorithm>
#include <cstring>

namespace imgproc {

Image rgbToGray(const uint8_t* rgba, int width, int height) {
    Image gray(width, height);
    
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            int idx = (y * width + x) * 4;
            // Standard RGB to luminance
            float r = rgba[idx];
            float g = rgba[idx + 1];
            float b = rgba[idx + 2];
            float luminance = 0.299f * r + 0.587f * g + 0.114f * b;
            gray.at(x, y) = static_cast<uint8_t>(luminance);
        }
    }
    
    return gray;
}

void grayToRgba(const Image& gray, uint8_t* rgbaOut) {
    for (int y = 0; y < gray.height; ++y) {
        for (int x = 0; x < gray.width; ++x) {
            int idx = (y * gray.width + x) * 4;
            uint8_t val = gray.at(x, y);
            rgbaOut[idx] = val;     // R
            rgbaOut[idx + 1] = val; // G
            rgbaOut[idx + 2] = val; // B
            rgbaOut[idx + 3] = 255; // A
        }
    }
}

std::vector<float> generateGaussianKernel(float sigma) {
    if (sigma <= 0.0f) {
        return std::vector<float>{1.0f};
    }
    
    // Kernel size: 6 sigma (99.7% of distribution)
    int radius = static_cast<int>(std::ceil(sigma * 3.0f));
    int size = radius * 2 + 1;
    
    std::vector<float> kernel(size);
    float sum = 0.0f;
    float twoSigmaSq = 2.0f * sigma * sigma;
    
    for (int i = -radius; i <= radius; ++i) {
        float x = static_cast<float>(i);
        float value = std::exp(-(x * x) / twoSigmaSq);
        kernel[i + radius] = value;
        sum += value;
    }
    
    // Normalize
    for (float& k : kernel) {
        k /= sum;
    }
    
    return kernel;
}

// Horizontal pass of separable Gaussian
static void gaussianBlurH(const Image& src, Image& dst, const std::vector<float>& kernel) {
    int radius = (kernel.size() - 1) / 2;
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            float sum = 0.0f;
            for (int k = -radius; k <= radius; ++k) {
                uint8_t pixel = src.getClamped(x + k, y);
                sum += pixel * kernel[k + radius];
            }
            dst.at(x, y) = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, sum)));
        }
    }
}

// Vertical pass of separable Gaussian
static void gaussianBlurV(const Image& src, Image& dst, const std::vector<float>& kernel) {
    int radius = (kernel.size() - 1) / 2;
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            float sum = 0.0f;
            for (int k = -radius; k <= radius; ++k) {
                uint8_t pixel = src.getClamped(x, y + k);
                sum += pixel * kernel[k + radius];
            }
            dst.at(x, y) = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, sum)));
        }
    }
}

Image gaussianBlur(const Image& src, float sigma) {
    auto kernel = generateGaussianKernel(sigma);
    if (kernel.size() == 1) {
        return src;  // No blur needed
    }
    
    Image temp(src.width, src.height);
    Image result(src.width, src.height);
    
    // Separable blur: horizontal then vertical
    gaussianBlurH(src, temp, kernel);
    gaussianBlurV(temp, result, kernel);
    
    return result;
}

Image differenceOfGaussians(const Image& src, float sigmaSmall, float sigmaLarge, float intensity) {
    // Blur with two different sigmas
    Image narrow = gaussianBlur(src, sigmaSmall);
    Image wide = gaussianBlur(src, sigmaLarge);
    
    Image result(src.width, src.height);
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            float n = narrow.at(x, y);
            float w = wide.at(x, y);
            // DoG: absolute difference, scaled
            float edge = std::abs(n - w) * intensity * 4.0f;
            
            // Clamp to 0-255
            uint8_t val = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, edge)));
            result.at(x, y) = val;
        }
    }
    
    return result;
}

Image dilate(const Image& src, int radius) {
    Image result(src.width, src.height);
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            uint8_t maxVal = 0;
            
            for (int dy = -radius; dy <= radius; ++dy) {
                for (int dx = -radius; dx <= radius; ++dx) {
                    uint8_t val = src.getClamped(x + dx, y + dy);
                    if (val > maxVal) maxVal = val;
                }
            }
            
            result.at(x, y) = maxVal;
        }
    }
    
    return result;
}

Image erode(const Image& src, int radius) {
    Image result(src.width, src.height);
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            uint8_t minVal = 255;
            
            for (int dy = -radius; dy <= radius; ++dy) {
                for (int dx = -radius; dx <= radius; ++dx) {
                    uint8_t val = src.getClamped(x + dx, y + dy);
                    if (val < minVal) minVal = val;
                }
            }
            
            result.at(x, y) = minVal;
        }
    }
    
    return result;
}

Image morphologicalClose(const Image& src, int radius) {
    // Closing = dilate then erode
    Image dilated = dilate(src, radius);
    return erode(dilated, radius);
}

// Simple bilateral filter (edge-preserving smoothing)
Image bilateralFilter(const Image& src, float spatialSigma, float intensitySigma) {
    int radius = static_cast<int>(std::ceil(spatialSigma * 2));
    Image result(src.width, src.height);
    
    float twoSpatialSigmaSq = 2.0f * spatialSigma * spatialSigma;
    float twoIntensitySigmaSq = 2.0f * intensitySigma * intensitySigma;
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            float centerVal = src.at(x, y);
            float sum = 0.0f;
            float weightSum = 0.0f;
            
            for (int dy = -radius; dy <= radius; ++dy) {
                for (int dx = -radius; dx <= radius; ++dx) {
                    float neighborVal = src.getClamped(x + dx, y + dy);
                    
                    // Spatial weight (distance)
                    float spatialDist = dx * dx + dy * dy;
                    float spatialWeight = std::exp(-spatialDist / twoSpatialSigmaSq);
                    
                    // Intensity weight (difference from center)
                    float intensityDist = (neighborVal - centerVal) * (neighborVal - centerVal);
                    float intensityWeight = std::exp(-intensityDist / twoIntensitySigmaSq);
                    
                    float weight = spatialWeight * intensityWeight;
                    sum += neighborVal * weight;
                    weightSum += weight;
                }
            }
            
            result.at(x, y) = static_cast<uint8_t>(sum / weightSum);
        }
    }
    
    return result;
}

Image stretchContrast(const Image& src, float lowPercentile, float highPercentile) {
    // Find min and max
    int minVal = 255, maxVal = 0;
    for (uint8_t v : src.data) {
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
    }
    
    if (maxVal <= minVal) return src;  // No contrast to stretch
    
    Image result(src.width, src.height);
    float range = maxVal - minVal;
    float scale = 255.0f / range;
    
    for (int i = 0; i < src.width * src.height; ++i) {
        float normalized = (src.data[i] - minVal) * scale;
        result.data[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, normalized)));
    }
    
    return result;
}

Image processToColoringPage(
    const uint8_t* rgbaIn,
    int width,
    int height,
    float blurSigma,
    float edgeIntensity,
    float sigmaRatio,
    int closeRadius,
    float outputMin,
    float outputMax,
    Image* debugDogOut,  // Optional: output raw DoG for debugging
    float bilateralSpatial,   // Spatial sigma for bilateral filter (0 to disable)
    float bilateralIntensity  // Intensity sigma for bilateral filter
) {
    // Step 1: Convert to grayscale
    Image gray = rgbToGray(rgbaIn, width, height);
    
    // Step 1.5: Bilateral filter for edge-preserving noise reduction
    if (bilateralSpatial > 0) {
        gray = bilateralFilter(gray, bilateralSpatial, bilateralIntensity);
    }
    
    // Step 2: Difference of Gaussians
    float sigmaSmall = blurSigma / sigmaRatio;
    float sigmaLarge = blurSigma;
    Image dog = differenceOfGaussians(gray, sigmaSmall, sigmaLarge, edgeIntensity);
    
    // Debug: return raw DoG if requested
    if (debugDogOut) {
        *debugDogOut = dog;
    }
    
    // Step 3: Morphological closing (connect broken lines)
    if (closeRadius > 0) {
        dog = morphologicalClose(dog, closeRadius);
    }
    
    // Step 4: Invert and scale to output range
    // DoG gives us edges as bright values - invert so edges are dark
    Image result(width, height);
    
    float minOut = outputMin * 255.0f;  // e.g., 51 for 0.2
    float maxOut = outputMax * 255.0f;  // e.g., 204 for 0.8
    float outRange = maxOut - minOut;
    
    for (int i = 0; i < width * height; ++i) {
        // Invert: high edge = dark
        float inverted = 255.0f - dog.data[i];
        // Scale to output range
        float scaled = minOut + (inverted / 255.0f) * outRange;
        result.data[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, scaled)));
    }
    
    return result;
}

} // namespace imgproc
