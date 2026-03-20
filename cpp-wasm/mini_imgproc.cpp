/**
 * Mini Image Processing Library - Implementation
 * Optimized for WASM with minimal dependencies
 */

#include "mini_imgproc.h"
#include <algorithm>
#include <cstring>

namespace imgproc {

// Forward declarations (in namespace)
Image colorEdgeLab(const uint8_t* rgba, int width, int height, float chromaWeight);
Image adaptiveThreshold(const Image& src, int blockSize, double delta, int method);
Image processToColoringPageAdaptive(
    const uint8_t* rgbaIn, int width, int height,
    int windowSize, float c, int method, float outputMin, float outputMax
);

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

// OpenCV-compatible adaptive threshold - copied exactly from OpenCV source
// method: 0 = MEAN (box filter), 1 = GAUSSIAN (Gaussian blur)
Image adaptiveThreshold(const Image& src, int blockSize, double delta, int method) {
    int halfBlock = blockSize / 2;
    Image result(src.width, src.height);
    
    // Pre-compute local mean using Gaussian or box filter
    Image mean(src.width, src.height);
    
    if (method == 1) {  // GAUSSIAN_C - matches OpenCV's GaussianBlur
        // Pre-compute 1D Gaussian weights (separable)
        float sigma = 0.3f * ((blockSize - 1) * 0.5f - 1) + 0.8f;  // OpenCV sigma formula
        std::vector<float> weights(blockSize);
        float weightSum = 0;
        for (int i = 0; i < blockSize; ++i) {
            float x = i - halfBlock;
            weights[i] = std::exp(-(x * x) / (2 * sigma * sigma));
            weightSum += weights[i];
        }
        
        // Separable 2D Gaussian (horizontal then vertical)
        Image temp(src.width, src.height);
        
        // Horizontal pass
        for (int y = 0; y < src.height; ++y) {
            for (int x = 0; x < src.width; ++x) {
                float sum = 0;
                float wsum = 0;
                for (int dx = -halfBlock; dx <= halfBlock; ++dx) {
                    int nx = x + dx;
                    // BORDER_REPLICATE handling
                    if (nx < 0) nx = 0;
                    if (nx >= src.width) nx = src.width - 1;
                    float w = weights[dx + halfBlock];
                    sum += src.at(nx, y) * w;
                    wsum += w;
                }
                temp.at(x, y) = static_cast<uint8_t>(sum / wsum);
            }
        }
        
        // Vertical pass
        for (int y = 0; y < src.height; ++y) {
            for (int x = 0; x < src.width; ++x) {
                float sum = 0;
                float wsum = 0;
                for (int dy = -halfBlock; dy <= halfBlock; ++dy) {
                    int ny = y + dy;
                    // BORDER_REPLICATE handling
                    if (ny < 0) ny = 0;
                    if (ny >= src.height) ny = src.height - 1;
                    float w = weights[dy + halfBlock];
                    sum += temp.at(x, ny) * w;
                    wsum += w;
                }
                mean.at(x, y) = static_cast<uint8_t>(sum / wsum);
            }
        }
    } else {  // MEAN_C - box filter
        for (int y = 0; y < src.height; ++y) {
            for (int x = 0; x < src.width; ++x) {
                int sum = 0;
                int count = 0;
                for (int dy = -halfBlock; dy <= halfBlock; ++dy) {
                    for (int dx = -halfBlock; dx <= halfBlock; ++dx) {
                        int nx = x + dx;
                        int ny = y + dy;
                        // BORDER_REPLICATE handling
                        if (nx < 0) nx = 0;
                        if (nx >= src.width) nx = src.width - 1;
                        if (ny < 0) ny = 0;
                        if (ny >= src.height) ny = src.height - 1;
                        sum += src.at(nx, ny);
                        count++;
                    }
                }
                mean.at(x, y) = static_cast<uint8_t>(sum / count);
            }
        }
    }
    
    // OpenCV's lookup table approach: tab[pixel - mean + 255]
    // THRESH_BINARY: if (src - mean > -delta) then maxval else 0
    // which is: if (src > mean - delta) then maxval else 0
    uint8_t tab[768];
    int idelta = static_cast<int>(delta);
    for (int i = 0; i < 768; ++i) {
        // i = src - mean + 255, so src - mean = i - 255
        // condition: src - mean > -delta  =>  i - 255 > -delta  =>  i > 255 - delta
        tab[i] = (i - 255 > -idelta) ? 255 : 0;
    }
    
    // Apply threshold using lookup table
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            int diff = src.at(x, y) - mean.at(x, y) + 255;
            result.at(x, y) = tab[diff];
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
    
    // Step 2: Difference of Gaussians (luminance edges)
    float sigmaSmall = blurSigma / sigmaRatio;
    float sigmaLarge = blurSigma;
    Image dog = differenceOfGaussians(gray, sigmaSmall, sigmaLarge, edgeIntensity);
    
    // Step 2.5: Very light smoothing to reduce waviness without losing detail
    dog = gaussianBlur(dog, 0.5f);
    
    // Debug: return raw DoG if requested (disabled to avoid dark debug images)
    (void)debugDogOut;
    
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

// NEW: Simplified adaptive threshold - just like OpenCV
// Outputs regions (like THRESH_BINARY) - white objects on black background
Image processToColoringPageAdaptive(
    const uint8_t* rgbaIn,
    int width,
    int height,
    int windowSize,      // Neighborhood size (e.g., 15 for 15x15 window)
    float c,             // Constant subtracted from mean (higher = more edges)
    int method,          // 0 = MEAN_C (box), 1 = GAUSSIAN_C (Gaussian blur)
    float outputMin,     // 0.0 for white
    float outputMax      // 1.0 for black
) {
    // Step 1: Convert to grayscale
    Image gray = rgbToGray(rgbaIn, width, height);
    
    // Step 2: Adaptive threshold - exact OpenCV algorithm
    Image thresh = adaptiveThreshold(gray, windowSize, c, method);
    
    // Step 3: Output like OpenCV - regions ready to color
    // (Thresh is 255=white/foreground, 0=black/background)
    Image result(width, height);
    float minOut = outputMin * 255.0f;
    float maxOut = outputMax * 255.0f;
    float outRange = maxOut - minOut;
    
    for (int i = 0; i < width * height; ++i) {
        // Scale to output range
        float scaled = minOut + (thresh.data[i] / 255.0f) * outRange;
        result.data[i] = static_cast<uint8_t>(std::min(255.0f, std::max(0.0f, scaled)));
    }
    
    return result;
}

// Color-aware edge detection - detects changes in hue/saturation, not just brightness
Image colorEdgeMagnitude(const uint8_t* rgba, int width, int height, float colorWeight) {
    Image result(width, height);
    
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            int idx = (y * width + x) * 4;
            float r = rgba[idx];
            float g = rgba[idx + 1];
            float b = rgba[idx + 2];
            
            // Compare with right neighbor
            int idxR = (y * width + std::min(x + 1, width - 1)) * 4;
            float rR = rgba[idxR];
            float gR = rgba[idxR + 1];
            float bR = rgba[idxR + 2];
            
            // Compare with bottom neighbor
            int idxB = (std::min(y + 1, height - 1) * width + x) * 4;
            float rB = rgba[idxB];
            float gB = rgba[idxB + 1];
            float bB = rgba[idxB + 2];
            
            // Color difference (Euclidean distance in RGB)
            float diffR = std::sqrt((r-rR)*(r-rR) + (g-gR)*(g-gR) + (b-bR)*(b-bR));
            float diffB = std::sqrt((r-rB)*(r-rB) + (g-gB)*(g-gB) + (b-bB)*(b-bB));
            float colorDiff = std::max(diffR, diffB);
            
            // Luminance difference
            float lum = 0.299f * r + 0.587f * g + 0.114f * b;
            float lumR = 0.299f * rR + 0.587f * gR + 0.114f * bR;
            float lumB = 0.299f * rB + 0.587f * gB + 0.114f * bB;
            float lumDiff = std::max(std::abs(lum - lumR), std::abs(lum - lumB));
            
            // Combined: color-aware edges
            float combined = lumDiff + colorWeight * colorDiff / 3.0f;  // /3 because RGB diff is 0-441
            result.at(x, y) = static_cast<uint8_t>(std::min(255.0f, combined * 2.0f));
        }
    }
    
    return result;
}

// Post-processing: remove small isolated edge components (speckle removal)
Image removeSmallComponents(const Image& src, int minSize) {
    Image result(src.width, src.height);
    std::vector<bool> visited(src.width * src.height, false);
    
    auto getIndex = [&](int x, int y) { return y * src.width + x; };
    
    for (int y = 0; y < src.height; ++y) {
        for (int x = 0; x < src.width; ++x) {
            if (visited[getIndex(x, y)] || src.at(x, y) < 128) {
                continue;  // Already visited or not an edge
            }
            
            // Flood fill to find component size
            std::vector<std::pair<int, int>> component;
            std::vector<std::pair<int, int>> stack;
            stack.push_back({x, y});
            visited[getIndex(x, y)] = true;
            
            while (!stack.empty()) {
                auto [cx, cy] = stack.back();
                stack.pop_back();
                component.push_back({cx, cy});
                
                // Check 8 neighbors
                for (int dy = -1; dy <= 1; ++dy) {
                    for (int dx = -1; dx <= 1; ++dx) {
                        if (dx == 0 && dy == 0) continue;
                        int nx = cx + dx, ny = cy + dy;
                        if (nx >= 0 && nx < src.width && ny >= 0 && ny < src.height) {
                            int nidx = getIndex(nx, ny);
                            if (!visited[nidx] && src.at(nx, ny) >= 128) {
                                visited[nidx] = true;
                                stack.push_back({nx, ny});
                            }
                        }
                    }
                }
            }
            
            // Keep component if it's large enough
            if (component.size() >= static_cast<size_t>(minSize)) {
                for (auto [cx, cy] : component) {
                    result.at(cx, cy) = src.at(cx, cy);
                }
            }
        }
    }
    
    return result;
}

// RGB to CIELAB conversion (simplified D65 illuminant)
void rgbToLab(float r, float g, float b, float& L, float& a, float& b_lab) {
    // RGB to XYZ (sRGB, D65)
    auto toXYZ = [](float c) {
        c /= 255.0f;
        c = (c > 0.04045f) ? std::pow((c + 0.055f) / 1.055f, 2.4f) : c / 12.92f;
        return c * 100.0f;
    };
    
    float X = 0.4124564f * toXYZ(r) + 0.3575761f * toXYZ(g) + 0.1804375f * toXYZ(b);
    float Y = 0.2126729f * toXYZ(r) + 0.7151522f * toXYZ(g) + 0.0721750f * toXYZ(b);
    float Z = 0.0193339f * toXYZ(r) + 0.1191920f * toXYZ(g) + 0.9503041f * toXYZ(b);
    
    // XYZ to LAB
    auto f = [](float t) {
        const float delta = 6.0f / 29.0f;
        return (t > delta * delta * delta) ? std::pow(t, 1.0f/3.0f) : t / (3.0f * delta * delta) + 4.0f / 29.0f;
    };
    
    float Xn = 95.047f, Yn = 100.0f, Zn = 108.883f;
    L = 116.0f * f(Y / Yn) - 16.0f;
    a = 500.0f * (f(X / Xn) - f(Y / Yn));
    b_lab = 200.0f * (f(Y / Yn) - f(Z / Zn));
}

// CIELAB-based color edge detection (ignores luminance, only color changes)
Image colorEdgeLab(const uint8_t* rgba, int width, int height, float chromaWeight) {
    Image result(width, height);
    
    for (int y = 0; y < height; ++y) {
        for (int x = 0; x < width; ++x) {
            int idx = (y * width + x) * 4;
            float r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];
            
            // Current pixel LAB
            float L, a, b_lab;
            rgbToLab(r, g, b, L, a, b_lab);
            
            // Right neighbor
            int idxR = (y * width + std::min(x + 1, width - 1)) * 4;
            float rR = rgba[idxR], gR = rgba[idxR + 1], bR = rgba[idxR + 2];
            float LR, aR, bR_lab;
            rgbToLab(rR, gR, bR, LR, aR, bR_lab);
            
            // Bottom neighbor
            int idxB = (std::min(y + 1, height - 1) * width + x) * 4;
            float rB = rgba[idxB], gB = rgba[idxB + 1], bB = rgba[idxB + 2];
            float LB, aB, bB_lab;
            rgbToLab(rB, gB, bB, LB, aB, bB_lab);
            
            // Chrominance differences (ignoring L - luminance)
            float chromaDiffR = std::sqrt((a-aR)*(a-aR) + (b_lab-bR_lab)*(b_lab-bR_lab));
            float chromaDiffB = std::sqrt((a-aB)*(a-aB) + (b_lab-bB_lab)*(b_lab-bB_lab));
            float chromaDiff = std::max(chromaDiffR, chromaDiffB);
            
            // Luminance difference (for backup)
            float lumDiff = std::max(std::abs(L - LR), std::abs(L - LB));
            
            // Combined: primarily chrominance edges, some luminance
            float edge = chromaWeight * chromaDiff + (1.0f - chromaWeight) * lumDiff;
            result.at(x, y) = static_cast<uint8_t>(std::min(255.0f, edge * 2.0f));
        }
    }
    
    return result;
}

} // namespace imgproc
