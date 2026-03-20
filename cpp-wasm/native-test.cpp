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
int main(int argc, char* argv[]) {
    if (argc < 7) {
        std::cerr << "Usage: " << argv[0] << " <input.ppm> <output.ppm> <blurSigma> <edgeIntensity> <sigmaRatio> <closeRadius>\n";
        return 1;
    }
    
    const char* inputPath = argv[1];
    const char* outputPath = argv[2];
    float blurSigma = std::stof(argv[3]);
    float edgeIntensity = std::stof(argv[4]);
    float sigmaRatio = std::stof(argv[5]);
    int closeRadius = std::stoi(argv[6]);
    
    // Read input
    std::vector<uint8_t> rgba;
    int width, height;
    
    if (!readPPM(inputPath, rgba, width, height)) {
        std::cerr << "Failed to read: " << inputPath << "\n";
        return 1;
    }
    
    std::cerr << "Processing " << width << "x" << height << " with " 
              << "blur=" << blurSigma << ", intensity=" << edgeIntensity << "\n";
    
    // Process
    imgproc::Image result = imgproc::processToColoringPage(
        rgba.data(), width, height,
        blurSigma, edgeIntensity, sigmaRatio,
        closeRadius, 0.0f, 1.0f  // full black/white range
    );
    
    // Write output
    if (!writePPM(outputPath, result.data.data(), width, height)) {
        std::cerr << "Failed to write: " << outputPath << "\n";
        return 1;
    }
    
    std::cerr << "Wrote: " << outputPath << "\n";
    return 0;
}
