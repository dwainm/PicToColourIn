/**
 * Native test harness for mini_imgproc
 * Reads image, processes with given params, writes output
 * Compile: g++ -O3 mini_imgproc.cpp native-test.cpp -o native-test
 */

#include "mini_imgproc.h"
#include <iostream>
#include <fstream>
#include <vector>
#include <cstring>

// Simple PPM format for testing (no external libs needed)
// In production, use stb_image.h / stb_image_write.h

// Read PPM (simplified - assumes P6 binary format)
bool readPPM(const char* filename, std::vector<uint8_t>& rgba, int& width, int& height) {
    std::ifstream file(filename, std::ios::binary);
    if (!file) return false;
    
    std::string magic;
    file >> magic;
    if (magic != "P6") return false;
    
    int maxval;
    file >> width >> height >> maxval;
    file.get(); // consume newline
    
    std::vector<uint8_t> rgb(width * height * 3);
    file.read((char*)rgb.data(), rgb.size());
    
    // Convert RGB to RGBA
    rgba.resize(width * height * 4);
    for (int i = 0; i < width * height; i++) {
        rgba[i * 4] = rgb[i * 3];
        rgba[i * 4 + 1] = rgb[i * 3 + 1];
        rgba[i * 4 + 2] = rgb[i * 3 + 2];
        rgba[i * 4 + 3] = 255;
    }
    
    return true;
}

// Write PPM (grayscale output as RGB)
bool writePPM(const char* filename, const uint8_t* gray, int width, int height) {
    std::ofstream file(filename, std::ios::binary);
    if (!file) return false;
    
    file << "P6\n" << width << " " << height << "\n255\n";
    
    for (int i = 0; i < width * height; i++) {
        uint8_t val = gray[i];
        file.write((char*)&val, 1);
        file.write((char*)&val, 1);
        file.write((char*)&val, 1);
    }
    
    return true;
}

// Simple stub for command-line usage
// Usage: native-test <mode> <input.ppm> <output.ppm> [params...]
// Modes:
//   dog <blurSigma> <edgeIntensity> <sigmaRatio> <closeRadius>
//   adaptive <windowSize> <c> <blurSigma> <closeRadius>
int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <mode> <input.ppm> <output.ppm> [params...]\n"
                  << "Modes:\n"
                  << "  dog <blurSigma> <edgeIntensity> <sigmaRatio> <closeRadius>\n"
                  << "  adaptive <windowSize> <c> <blurSigma> <closeRadius>\n";
        return 1;
    }
    
    const char* mode = argv[1];
    
    if (strcmp(mode, "dog") == 0) {
        if (argc < 7) {
            std::cerr << "dog mode needs: input.ppm output.ppm blurSigma edgeIntensity sigmaRatio closeRadius\n";
            return 1;
        }
        const char* inputPath = argv[2];
        const char* outputPath = argv[3];
        float blurSigma = std::stof(argv[4]);
        float edgeIntensity = std::stof(argv[5]);
        float sigmaRatio = std::stof(argv[6]);
        int closeRadius = std::stoi(argv[7]);
        
        // Read input
        std::vector<uint8_t> rgba;
        int width, height;
        if (!readPPM(inputPath, rgba, width, height)) {
            std::cerr << "Failed to read: " << inputPath << "\n";
            return 1;
        }
        
        std::cerr << "[DoG] Processing " << width << "x" << height 
                  << " blur=" << blurSigma << " intensity=" << edgeIntensity << "\n";
        
        // Process with DoG
        imgproc::Image result = imgproc::processToColoringPage(
            rgba.data(), width, height,
            blurSigma, edgeIntensity, sigmaRatio,
            closeRadius, 0.0f, 1.0f,
            nullptr, 0.0f, 30.0f
        );
        
        // Write output
        if (!writePPM(outputPath, result.data.data(), width, height)) {
            std::cerr << "Failed to write: " << outputPath << "\n";
            return 1;
        }
        std::cerr << "Wrote: " << outputPath << "\n";
        
    } else if (strcmp(mode, "adaptive") == 0) {
        if (argc < 7) {
            std::cerr << "adaptive mode needs: input.ppm output.ppm windowSize c method\n";
            return 1;
        }
        const char* inputPath = argv[2];
        const char* outputPath = argv[3];
        int windowSize = std::stoi(argv[4]);
        float c = std::stof(argv[5]);
        int method = std::stoi(argv[6]);  // 0 = MEAN_C, 1 = GAUSSIAN_C
        
        // Read input
        std::vector<uint8_t> rgba;
        int width, height;
        if (!readPPM(inputPath, rgba, width, height)) {
            std::cerr << "Failed to read: " << inputPath << "\n";
            return 1;
        }
        
        const char* methodName = (method == 0) ? "MEAN" : "GAUSSIAN";
        std::cerr << "[Adaptive " << methodName << "] Processing " << width << "x" << height 
                  << " window=" << windowSize << " c=" << c << "\n";
        
        // Process with adaptive threshold
        imgproc::Image result = imgproc::processToColoringPageAdaptive(
            rgba.data(), width, height,
            windowSize, c, method, 0.0f, 1.0f
        );
        
        // Write output
        if (!writePPM(outputPath, result.data.data(), width, height)) {
            std::cerr << "Failed to write: " << outputPath << "\n";
            return 1;
        }
        std::cerr << "Wrote: " << outputPath << "\n";
        
    } else {
        std::cerr << "Unknown mode: " << mode << "\n";
        return 1;
    }
    
    return 0;
}
