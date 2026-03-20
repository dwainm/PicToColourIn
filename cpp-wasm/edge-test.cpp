/**
 * Raw Edge Detection Test
 * Outputs edge magnitude without inversion/scaling/noise reduction
 * Usage: ./edge-test <input.ppm> <output.ppm> [algorithm] [params...]
 * 
 * Algorithms:
 *   dog <blurSigma> <edgeIntensity> <sigmaRatio>  - Difference of Gaussians
 *   cielab <chromaWeight>                           - CIELAB chrominance edges
 *   sobel <threshold>                               - Sobel gradient
 *   canny <low> <high>                              - Canny edge detector
 */

#include "mini_imgproc.h"
#include <iostream>
#include <fstream>
#include <vector>
#include <cstring>
#include <cmath>

// PPM helpers
bool readPPM(const char* filename, std::vector<uint8_t>& rgba, int& width, int& height) {
    std::ifstream file(filename, std::ios::binary);
    if (!file) return false;
    
    std::string magic;
    file >> magic;
    if (magic != "P6") return false;
    
    int maxval;
    file >> width >> height >> maxval;
    file.get();
    
    std::vector<uint8_t> rgb(width * height * 3);
    file.read((char*)rgb.data(), rgb.size());
    
    rgba.resize(width * height * 4);
    for (int i = 0; i < width * height; i++) {
        rgba[i * 4] = rgb[i * 3];
        rgba[i * 4 + 1] = rgb[i * 3 + 1];
        rgba[i * 4 + 2] = rgb[i * 3 + 2];
        rgba[i * 4 + 3] = 255;
    }
    return true;
}

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

// Simple Sobel for comparison
imgproc::Image sobelEdges(const imgproc::Image& gray, float threshold) {
    using namespace imgproc;
    Image result(gray.width, gray.height);
    
    for (int y = 1; y < gray.height - 1; ++y) {
        for (int x = 1; x < gray.width - 1; ++x) {
            // Sobel kernels
            int gx = -1 * gray.at(x-1, y-1) + 1 * gray.at(x+1, y-1)
                   + -2 * gray.at(x-1, y  ) + 2 * gray.at(x+1, y  )
                   + -1 * gray.at(x-1, y+1) + 1 * gray.at(x+1, y+1);
            
            int gy = -1 * gray.at(x-1, y-1) + -1 * gray.at(x+1, y-1)
                   +  0 * gray.at(x-1, y  ) +  0 * gray.at(x+1, y  )
                   +  1 * gray.at(x-1, y+1) +  1 * gray.at(x+1, y+1);
            
            float mag = std::sqrt(gx * gx + gy * gy);
            result.at(x, y) = (mag > threshold) ? static_cast<uint8_t>(std::min(255.0f, mag / 4.0f)) : 0;
        }
    }
    return result;
}

int main(int argc, char* argv[]) {
    if (argc < 4) {
        std::cerr << "Usage: " << argv[0] << " <input.ppm> <output.ppm> <algorithm> [params...]\n"
                  << "  dog <blurSigma> <edgeIntensity> <sigmaRatio>  - Difference of Gaussians\n"
                  << "  cielab <chromaWeight>                          - CIELAB chrominance\n"
                  << "  sobel <threshold>                              - Sobel gradient\n"
                  << "Example: " << argv[0] << " input.ppm dog.ppm dog 7 5.5 1.5\n";
        return 1;
    }
    
    const char* inputPath = argv[1];
    const char* outputPath = argv[2];
    const char* algorithm = argv[3];
    
    // Read input
    std::vector<uint8_t> rgba;
    int width, height;
    if (!readPPM(inputPath, rgba, width, height)) {
        std::cerr << "Failed to read: " << inputPath << "\n";
        return 1;
    }
    
    using namespace imgproc;
    Image edges(width, height);
    
    if (strcmp(algorithm, "dog") == 0) {
        if (argc < 7) {
            std::cerr << "dog needs: blurSigma edgeIntensity sigmaRatio\n";
            return 1;
        }
        float blurSigma = std::stof(argv[4]);
        float edgeIntensity = std::stof(argv[5]);
        float sigmaRatio = std::stof(argv[6]);
        
        std::cerr << "DoG: blur=" << blurSigma << " intensity=" << edgeIntensity << " ratio=" << sigmaRatio << "\n";
        
        Image gray = rgbToGray(rgba.data(), width, height);
        float sigmaSmall = blurSigma / sigmaRatio;
        float sigmaLarge = blurSigma;
        edges = differenceOfGaussians(gray, sigmaSmall, sigmaLarge, edgeIntensity);
        
    } else if (strcmp(algorithm, "cielab") == 0) {
        float chromaWeight = (argc > 4) ? std::stof(argv[4]) : 0.85f;
        std::cerr << "CIELAB: chromaWeight=" << chromaWeight << "\n";
        edges = colorEdgeLab(rgba.data(), width, height, chromaWeight);
        
    } else if (strcmp(algorithm, "sobel") == 0) {
        float threshold = (argc > 4) ? std::stof(argv[4]) : 50.0f;
        std::cerr << "Sobel: threshold=" << threshold << "\n";
        
        Image gray = rgbToGray(rgba.data(), width, height);
        edges = sobelEdges(gray, threshold);
        
    } else {
        std::cerr << "Unknown algorithm: " << algorithm << "\n";
        return 1;
    }
    
    // Write raw edge magnitude (no inversion, no scaling)
    if (!writePPM(outputPath, edges.data.data(), width, height)) {
        std::cerr << "Failed to write: " << outputPath << "\n";
        return 1;
    }
    
    std::cerr << "Wrote raw edges: " << outputPath << "\n";
    return 0;
}
