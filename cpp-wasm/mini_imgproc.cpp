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

// Non-maximum suppression for edge thinning (Canny-style)
Image nonMaxSuppress(const Image& src) {
    Image result(src.width, src.height);
    
    for (int y = 1; y < src.height - 1; ++y) {
        for (int x = 1; x < src.width - 1; ++x) {
            uint8_t center = src.at(x, y);
            
            // Simple 4-direction NMS: check if center is max in any direction
            uint8_t n = src.at(x, y-1);
            uint8_t s = src.at(x, y+1);
            uint8_t e = src.at(x+1, y);
            uint8_t w = src.at(x-1, y);
            
            // Keep only if it's a local maximum
            if (center >= n && center >= s && center >= e && center >= w) {
                result.at(x, y) = center;
            } else {
                // Suppress - reduce intensity
                result.at(x, y) = center / 4;
            }
        }
    }
    
    // Copy borders
    for (int x = 0; x < src.width; ++x) {
        result.at(x, 0) = src.at(x, 0);
        result.at(x, src.height - 1) = src.at(x, src.height - 1);
    }
    for (int y = 0; y < src.height; ++y) {
        result.at(0, y) = src.at(0, y);
        result.at(src.width - 1, y) = src.at(src.width - 1, y);
    }
    
    return result;
}

// Adaptive thresholding - threshold based on local neighborhood
Image adaptiveThreshold(const Image& src, int windowSize, float c) {
    int halfWindow = windowSize / 2;
    Image result(src.width, src.height);
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            // Calculate local mean
            float sum = 0;
            int count = 0;
            
            for (int dy = -halfWindow; dy <= halfWindow; ++dy) {
                for (int dx = -halfWindow; dx <= halfWindow; ++dx) {
                    int nx = std::max(0, std::min(x + dx, src.width - 1));
                    int ny = std::max(0, std::min(y + dy, src.height - 1));
                    sum += src.at(nx, ny);
                    count++;
                }
            }
            
            float localMean = sum / count;
            float threshold = localMean - c;
            
            uint8_t val = src.at(x, y);
            result.at(x, y) = (val > threshold) ? 255 : 0;
        }
    }
    
    return result;
}

// Hysteresis thresholding (Canny-style edge tracking)
Image hysteresisThreshold(const Image& src, uint8_t lowThresh, uint8_t highThresh) {
    Image result(src.width, src.height);
    
    // Mark strong edges
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            uint8_t val = src.at(x, y);
            if (val >= highThresh) {
                result.at(x, y) = 255;  // Strong edge
            } else if (val >= lowThresh) {
                result.at(x, y) = 128;  // Weak edge (candidate)
            } else {
                result.at(x, y) = 0;    // Non-edge
            }
        }
    }
    
    // Trace edges - connect weak to strong
    bool changed = true;
    while (changed) {
        changed = false;
        for (int y = 1; y < src.height - 1; ++y) {
            for (int x = 1; x < src.width - 1; ++x) {
                if (result.at(x, y) == 128) {  // Weak edge
                    // Check if connected to strong edge
                    bool connected = false;
                    for (int dy = -1; dy <= 1 && !connected; ++dy) {
                        for (int dx = -1; dx <= 1; ++dx) {
                            if (result.at(x + dx, y + dy) == 255) {
                                connected = true;
                                break;
                            }
                        }
                    }
                    if (connected) {
                        result.at(x, y) = 255;
                        changed = true;
                    }
                }
            }
        }
    }
    
    // Remove remaining weak edges
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            if (result.at(x, y) == 128) {
                result.at(x, y) = 0;
            }
        }
    }
    
    return result;
}

// Median filter for removing salt-and-pepper noise
Image medianFilter(const Image& src, int radius) {
    Image result(src.width, src.height);
    int size = (2 * radius + 1) * (2 * radius + 1);
    std::vector<uint8_t> window(size);
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            int idx = 0;
            
            // Collect neighborhood
            for (int dy = -radius; dy <= radius; ++dy) {
                for (int dx = -radius; dx <= radius; ++dx) {
                    window[idx++] = src.getClamped(x + dx, y + dy);
                }
            }
            
            // Find median
            std::nth_element(window.begin(), window.begin() + size/2, window.begin() + idx);
            result.at(x, y) = window[size/2];
        }
    }
    
    return result;
}

// Simple box blur for noise reduction (faster than Gaussian)
Image boxBlur(const Image& src, int radius) {
    Image result(src.width, src.height);
    int size = (2 * radius + 1) * (2 * radius + 1);
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            int sum = 0;
            
            for (int dy = -radius; dy <= radius; ++dy) {
                for (int dx = -radius; dx <= radius; ++dx) {
                    sum += src.getClamped(x + dx, y + dy);
                }
            }
            
            result.at(x, y) = static_cast<uint8_t>(sum / size);
        }
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
    
    // Step 2: Difference of Gaussians
    float sigmaSmall = blurSigma / sigmaRatio;
    float sigmaLarge = blurSigma;
    Image dog = differenceOfGaussians(gray, sigmaSmall, sigmaLarge, edgeIntensity);
    
    // Step 2.5: Hysteresis thresholding (Canny-style edge cleanup)
    // Keeps strong edges and connects through weak regions
    uint8_t lowThresh = static_cast<uint8_t>(edgeIntensity * 12);  // Lower threshold
    uint8_t highThresh = static_cast<uint8_t>(edgeIntensity * 22); // Higher threshold
    dog = hysteresisThreshold(dog, lowThresh, highThresh);
    
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
