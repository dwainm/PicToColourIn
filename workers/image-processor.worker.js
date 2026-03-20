/**
 * Web Worker for image processing
 * Offloads WebGL processing from main thread
 */

importScripts('webgl-processor.js');

self.onmessage = async function(e) {
  const { imageData, params, width, height } = e.data;
  
  try {
    // Initialize processor
    const processor = new WebGLProcessor();
    await processor.initialize(width, height);
    
    // Process image
    const result = await processor.processImage(imageData, params);
    
    // Return result
    self.postMessage({ 
      success: true, 
      result: result,
      params: params 
    }, [result.buffer]); // Transfer ownership for performance
    
  } catch (error) {
    self.postMessage({ 
      success: false, 
      error: error.message 
    });
  }
};
