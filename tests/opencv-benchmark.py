#!/usr/bin/env python3
"""
OpenCV Edge Detection Benchmark
Tests OpenCV's best algorithms in isolation for comparison
"""

import cv2
import numpy as np
import sys
import os

def test_canny(img_path, low=50, high=150):
    """Canny edge detector - the gold standard"""
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Canny with Gaussian blur pre-processing
    blurred = cv2.GaussianBlur(gray, (5, 5), 1.0)
    edges = cv2.Canny(blurred, low, high)
    
    return edges

def test_scharr(img_path, threshold=50):
    """Scharr operator - better rotation invariance than Sobel"""
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Scharr derivatives
    scharr_x = cv2.Scharr(gray, cv2.CV_64F, 1, 0)
    scharr_y = cv2.Scharr(gray, cv2.CV_64F, 0, 1)
    
    # Magnitude
    magnitude = np.sqrt(scharr_x**2 + scharr_y**2)
    
    # Normalize and threshold
    magnitude = np.uint8(np.clip(magnitude, 0, 255))
    _, edges = cv2.threshold(magnitude, threshold, 255, cv2.THRESH_BINARY)
    
    return edges

def test_laplacian(img_path, ksize=5):
    """Laplacian - 2nd derivative, finds zero crossings"""
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Laplacian with Gaussian pre-blur (LoG)
    blurred = cv2.GaussianBlur(gray, (ksize, ksize), 0)
    laplacian = cv2.Laplacian(blurred, cv2.CV_64F, ksize=ksize)
    
    # Take absolute value and normalize
    laplacian = np.uint8(np.absolute(laplacian))
    
    return laplacian

def test_dog_opencv(img_path, sigma1=1.0, sigma2=2.0):
    """Difference of Gaussians using OpenCV"""
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Two Gaussian blurs
    blur1 = cv2.GaussianBlur(gray, (0, 0), sigma1)
    blur2 = cv2.GaussianBlur(gray, (0, 0), sigma2)
    
    # Difference
    dog = cv2.subtract(blur1, blur2)
    
    # Scale and normalize
    dog = cv2.normalize(dog, None, 0, 255, cv2.NORM_MINMAX)
    
    return dog

def test_adaptive_threshold(img_path, block=11, c=2):
    """Adaptive threshold - good for varying lighting"""
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Adaptive Gaussian thresholding
    thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                    cv2.THRESH_BINARY, block, c)
    
    return thresh

def test_canny_with_l2(img_path, low=50, high=150):
    """Canny with L2 gradient (more accurate)"""
    img = cv2.imread(img_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    blurred = cv2.GaussianBlur(gray, (5, 5), 1.0)
    edges = cv2.Canny(blurred, low, high, L2gradient=True)
    
    return edges

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <input.jpg/png> [output_dir]")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "tests/outputs"
    
    # Ensure output dir exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Resize to match our processing size
    img = cv2.imread(input_path)
    if img is None:
        print(f"Failed to load: {input_path}")
        sys.exit(1)
    
    # Resize maintaining aspect ratio (max 800px width like our pipeline)
    scale = 800 / img.shape[1]
    new_width = 800
    new_height = int(img.shape[0] * scale)
    img = cv2.resize(img, (new_width, new_height))
    
    # Save temp for processing
    temp_path = "/tmp/opencv_test_input.jpg"
    cv2.imwrite(temp_path, img)
    
    print(f"Testing OpenCV algorithms on {new_width}x{new_height} image...")
    
    algorithms = [
        ("canny", lambda: test_canny(temp_path, 30, 100)),
        ("canny-l2", lambda: test_canny_with_l2(temp_path, 30, 100)),
        ("scharr", lambda: test_scharr(temp_path, 30)),
        ("laplacian", lambda: test_laplacian(temp_path, 5)),
        ("dog", lambda: test_dog_opencv(temp_path, 1.5, 3.0)),
        ("adaptive", lambda: test_adaptive_threshold(temp_path, 15, 5)),
    ]
    
    for name, func in algorithms:
        print(f"\n  Testing {name}...", end="")
        try:
            edges = func()
            output_path = os.path.join(output_dir, f"opencv-{name}.png")
            cv2.imwrite(output_path, edges)
            print(f" → {output_path}")
        except Exception as e:
            print(f" FAILED: {e}")
    
    print(f"\n✓ Results in {output_dir}/opencv-*.png")
    print("\nCompare these to your custom DoG output!")

if __name__ == "__main__":
    main()
