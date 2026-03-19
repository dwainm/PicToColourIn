/**
 * WebGL Image Processor for PicToColourIn
 * Multi-pass GPU-accelerated edge detection
 */

class WebGLProcessor {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.gl = this.canvas.getContext('webgl', {
            preserveDrawingBuffer: true,
            premultipliedAlpha: false
        }) || this.canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }

        this.width = 0;
        this.height = 0;
        this.textures = {};
        this.framebuffers = {};
        this.programs = {};
        
        this.init();
    }

    init() {
        const gl = this.gl;
        
        // Enable floating point textures if available
        this.floatExt = gl.getExtension('OES_texture_float');
        this.halfFloatExt = gl.getExtension('OES_texture_half_float');
        
        // Create shader programs
        this.createPrograms();
        
        // Setup geometry
        this.setupGeometry();
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            console.error('Shader compile error:', log);
            gl.deleteShader(shader);
            throw new Error('Shader compile error');
        }
        
        return shader;
    }

    createProgram(vertexSource, fragmentSource) {
        const gl = this.gl;
        
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentSource);
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
        }
        
        return {
            program: program,
            attribs: {
                position: gl.getAttribLocation(program, 'a_position'),
                texCoord: gl.getAttribLocation(program, 'a_texCoord')
            },
            uniforms: {
                sourceTexture: gl.getUniformLocation(program, 'u_sourceTexture'),
                blurTexture: gl.getUniformLocation(program, 'u_blurTexture'),
                resolution: gl.getUniformLocation(program, 'u_resolution'),
                direction: gl.getUniformLocation(program, 'u_direction'),
                radius: gl.getUniformLocation(program, 'u_radius'),
                edgeIntensity: gl.getUniformLocation(program, 'u_edgeIntensity'),
                threshold: gl.getUniformLocation(program, 'u_threshold'),
                sigmaRatio: gl.getUniformLocation(program, 'u_sigmaRatio')
            }
        };
    }

    createPrograms() {
        // Gaussian blur program (separable, two-pass)
        this.programs.blur = this.createProgram(VERTEX_SHADER, BLUR_FRAGMENT_SHADER);
        
        // Difference of Gaussians (DoG) edge detection
        this.programs.dog = this.createProgram(VERTEX_SHADER, DOG_FRAGMENT_SHADER);
    }

    setupGeometry() {
        const gl = this.gl;
        
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        // Flip Y texture coordinates to correct upside-down image
        const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
        
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
    }

    loadImage(source) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                this.setImageSize(img.width, img.height);
                this.createTextures(img);
                resolve(img);
            };
            
            img.onerror = () => reject(new Error('Failed to load image'));
            
            if (source instanceof File) {
                const reader = new FileReader();
                reader.onload = (e) => img.src = e.target.result;
                reader.readAsDataURL(source);
            } else {
                img.src = source;
            }
        });
    }

    setImageSize(width, height) {
        const MAX_SIZE = 2048;
        let w = width;
        let h = height;
        
        if (w > MAX_SIZE || h > MAX_SIZE) {
            const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
        }
        
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        
        this.gl.viewport(0, 0, w, h);
    }

    createTextures(image) {
        const gl = this.gl;
        
        // Cleanup old textures
        if (this.textures.source) gl.deleteTexture(this.textures.source);
        if (this.textures.blurTemp) gl.deleteTexture(this.textures.blurTemp);
        if (this.framebuffers.blurTemp) gl.deleteFramebuffer(this.framebuffers.blurTemp);
        
        // Source texture
        this.textures.source = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.textures.source);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        // Blur temp texture and framebuffer
        this.textures.blurTemp = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.textures.blurTemp);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        this.framebuffers.blurTemp = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.blurTemp);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.blurTemp, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    bindGeometry(programInfo) {
        const gl = this.gl;
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.enableVertexAttribArray(programInfo.attribs.position);
        gl.vertexAttribPointer(programInfo.attribs.position, 2, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.enableVertexAttribArray(programInfo.attribs.texCoord);
        gl.vertexAttribPointer(programInfo.attribs.texCoord, 2, gl.FLOAT, false, 0, 0);
    }

    renderBlurPass(inputTexture, outputFramebuffer, direction, radius) {
        const gl = this.gl;
        const program = this.programs.blur;
        
        gl.useProgram(program.program);
        
        if (outputFramebuffer) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        
        this.bindGeometry(program);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(program.uniforms.sourceTexture, 0);
        
        gl.uniform2f(program.uniforms.resolution, this.width, this.height);
        gl.uniform2f(program.uniforms.direction, direction[0], direction[1]);
        gl.uniform1f(program.uniforms.radius, radius);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    renderDoGPass(narrowBlurTexture, wideBlurTexture, params) {
        const gl = this.gl;
        const program = this.programs.dog;
        
        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        this.bindGeometry(program);
        
        // Bind narrow blur (sharper, smaller sigma)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, narrowBlurTexture);
        gl.uniform1i(program.uniforms.sourceTexture, 0);
        
        // Bind wide blur (softer, larger sigma)
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, wideBlurTexture);
        gl.uniform1i(program.uniforms.blurTexture, 1);
        
        gl.uniform2f(program.uniforms.resolution, this.width, this.height);
        gl.uniform1f(program.uniforms.edgeIntensity, params.edgeIntensity);
        gl.uniform1f(program.uniforms.threshold, params.threshold);
        gl.uniform1f(program.uniforms.sigmaRatio, params.sigmaRatio || 2.0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    process(params = {}) {
        const {
            blurRadius = 2.0,
            edgeIntensity = 0.5,
            threshold = 0.3,
            sigmaRatio = 2.0  // Wide blur is sigmaRatio times larger than narrow
        } = params;
        
        // Ensure we have textures for both blur results
        this.ensureBlurTextures();
        
        // Narrow blur radius (smaller sigma, preserves more detail)
        const narrowRadius = blurRadius;
        // Wide blur radius (larger sigma, suppresses fine details)
        const wideRadius = blurRadius * sigmaRatio;
        
        // Pass 1: Narrow horizontal blur from source -> blurNarrowTemp
        this.renderBlurPass(this.textures.source, this.framebuffers.blurNarrowTemp, [1, 0], narrowRadius);
        
        // Pass 2: Narrow vertical blur from blurNarrowTemp -> blurNarrowResult
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers.blurNarrowResult);
        this.renderBlurPass(this.textures.blurNarrowTemp, this.framebuffers.blurNarrowResult, [0, 1], narrowRadius);
        
        // Pass 3: Wide horizontal blur from source -> blurWideTemp  
        this.renderBlurPass(this.textures.source, this.framebuffers.blurWideTemp, [1, 0], wideRadius);
        
        // Pass 4: Wide vertical blur from blurWideTemp -> blurWideResult
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers.blurWideResult);
        this.renderBlurPass(this.textures.blurWideTemp, this.framebuffers.blurWideResult, [0, 1], wideRadius);
        
        // Pass 5: DoG edge detection (subtract wide from narrow, threshold)
        this.renderDoGPass(this.textures.blurNarrowResult, this.textures.blurWideResult, { 
            edgeIntensity, 
            threshold,
            sigmaRatio 
        });
    }

    ensureBlurTextures() {
        const gl = this.gl;
        
        // Narrow blur temp texture and framebuffer
        if (!this.textures.blurNarrowTemp) {
            this.textures.blurNarrowTemp = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.textures.blurNarrowTemp);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            
            this.framebuffers.blurNarrowTemp = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.blurNarrowTemp);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.blurNarrowTemp, 0);
        }
        
        // Narrow blur result texture and framebuffer
        if (!this.textures.blurNarrowResult) {
            this.textures.blurNarrowResult = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.textures.blurNarrowResult);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            
            this.framebuffers.blurNarrowResult = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.blurNarrowResult);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.blurNarrowResult, 0);
        }
        
        // Wide blur temp texture and framebuffer
        if (!this.textures.blurWideTemp) {
            this.textures.blurWideTemp = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.textures.blurWideTemp);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            
            this.framebuffers.blurWideTemp = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.blurWideTemp);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.blurWideTemp, 0);
        }
        
        // Wide blur result texture and framebuffer
        if (!this.textures.blurWideResult) {
            this.textures.blurWideResult = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.textures.blurWideResult);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            
            this.framebuffers.blurWideResult = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.blurWideResult);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.blurWideResult, 0);
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    ensureBlurResultTexture() {
        // Kept for backward compatibility, but now handled by ensureBlurTextures
        this.ensureBlurTextures();
    }

    getOutputCanvas() {
        return this.canvas;
    }

    download(filename = 'coloring-page.png') {
        const link = document.createElement('a');
        link.download = filename;
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
}

// Vertex Shader
const VERTEX_SHADER = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`;

// Gaussian Blur Fragment Shader (separable) - fully unrolled for WebGL 1.0 compatibility
const BLUR_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    
    uniform sampler2D u_sourceTexture;
    uniform vec2 u_resolution;
    uniform vec2 u_direction;
    uniform float u_radius;
    
    void main() {
        vec2 texelSize = 1.0 / u_resolution;
        
        // Gaussian weights - kernel size 9 (5 unique weights, mirrored)
        float w0 = 0.227027;
        float w1 = 0.1945946;
        float w2 = 0.1216216;
        float w3 = 0.054054;
        float w4 = 0.016216;
        
        vec4 color = texture2D(u_sourceTexture, v_texCoord) * w0;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * -1.0 * u_radius * texelSize) * w1;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * 1.0 * u_radius * texelSize) * w1;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * -2.0 * u_radius * texelSize) * w2;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * 2.0 * u_radius * texelSize) * w2;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * -3.0 * u_radius * texelSize) * w3;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * 3.0 * u_radius * texelSize) * w3;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * -4.0 * u_radius * texelSize) * w4;
        color += texture2D(u_sourceTexture, v_texCoord + u_direction * 4.0 * u_radius * texelSize) * w4;
        
        gl_FragColor = color;
    }
`;

// Difference of Gaussians (DoG) Fragment Shader with non-maximum suppression
// Thins edges to single pixel width for cleaner lines
const DOG_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    
    uniform sampler2D u_sourceTexture;   // Narrow blur (sharper)
    uniform sampler2D u_blurTexture;     // Wide blur (softer)
    uniform vec2 u_resolution;
    uniform float u_edgeIntensity;
    uniform float u_threshold;
    
    float grayscale(vec4 color) {
        return dot(color.rgb, vec3(0.299, 0.587, 0.114));
    }
    
    void main() {
        vec2 texelSize = 1.0 / u_resolution;
        
        // Sample center pixel DoG value
        float centerNarrow = grayscale(texture2D(u_sourceTexture, v_texCoord));
        float centerWide = grayscale(texture2D(u_blurTexture, v_texCoord));
        float centerEdge = abs(centerNarrow - centerWide) * u_edgeIntensity * 5.0;
        
        // Sample neighbors for gradient direction (Sobel on DoG)
        float rightNarrow = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2(1.0, 0.0) * texelSize));
        float rightWide = grayscale(texture2D(u_blurTexture, v_texCoord + vec2(1.0, 0.0) * texelSize));
        float gx = abs(rightNarrow - rightWide) - centerEdge;
        
        float downNarrow = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2(0.0, 1.0) * texelSize));
        float downWide = grayscale(texture2D(u_blurTexture, v_texCoord + vec2(0.0, 1.0) * texelSize));
        float gy = abs(downNarrow - downWide) - centerEdge;
        
        // Gradient magnitude
        float g = sqrt(gx * gx + gy * gy);
        
        // Normalize gradient direction
        float dx = gx / (g + 0.0001);
        float dy = gy / (g + 0.0001);
        
        // Sample in gradient direction (non-maximum suppression)
        vec2 pos1 = v_texCoord + vec2(dx, dy) * texelSize;
        vec2 pos2 = v_texCoord - vec2(dx, dy) * texelSize;
        
        float val1 = abs(grayscale(texture2D(u_sourceTexture, pos1)) - grayscale(texture2D(u_blurTexture, pos1))) * u_edgeIntensity * 5.0;
        float val2 = abs(grayscale(texture2D(u_sourceTexture, pos2)) - grayscale(texture2D(u_blurTexture, pos2))) * u_edgeIntensity * 5.0;
        
        // Keep only if local maximum
        float finalEdge = centerEdge;
        if (centerEdge < val1 || centerEdge < val2) {
            finalEdge = 0.0; // Suppress non-maximum
        }
        
        // Soft threshold
        float thresholdLow = u_threshold * 0.6;
        float thresholdHigh = u_threshold * 1.2;
        
        float result;
        if (finalEdge > thresholdHigh) {
            result = 0.0;
        } else if (finalEdge < thresholdLow) {
            result = 1.0;
        } else {
            float t = (finalEdge - thresholdLow) / (thresholdHigh - thresholdLow);
            result = 1.0 - t;
        }
        
        gl_FragColor = vec4(vec3(result), 1.0);
    }
`;

// Expose to window
if (typeof window !== 'undefined') {
    window.WebGLProcessor = WebGLProcessor;
}

// Post-processing fragment shader for morphological smoothing
const SMOOTH_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    
    uniform sampler2D u_sourceTexture;
    uniform vec2 u_resolution;
    
    void main() {
        vec2 texelSize = 1.0 / u_resolution;
        
        float tl = texture2D(u_sourceTexture, v_texCoord + vec2(-1.0, -1.0) * texelSize).r;
        float tc = texture2D(u_sourceTexture, v_texCoord + vec2( 0.0, -1.0) * texelSize).r;
        float tr = texture2D(u_sourceTexture, v_texCoord + vec2( 1.0, -1.0) * texelSize).r;
        float cl = texture2D(u_sourceTexture, v_texCoord + vec2(-1.0,  0.0) * texelSize).r;
        float cc = texture2D(u_sourceTexture, v_texCoord).r;
        float cr = texture2D(u_sourceTexture, v_texCoord + vec2( 1.0,  0.0) * texelSize).r;
        float bl = texture2D(u_sourceTexture, v_texCoord + vec2(-1.0,  1.0) * texelSize).r;
        float bc = texture2D(u_sourceTexture, v_texCoord + vec2( 0.0,  1.0) * texelSize).r;
        float br = texture2D(u_sourceTexture, v_texCoord + vec2( 1.0,  1.0) * texelSize).r;
        
        float sum = tl + tc + tr + cl + cc + cr + bl + bc + br;
        float avg = sum / 9.0;
        
        float result;
        if (cc < 0.1) {
            result = cc;
        } else if (cc > 0.9) {
            result = avg * 0.1 + cc * 0.9;
        } else {
            result = avg * 0.3 + cc * 0.7;
        }
        
        gl_FragColor = vec4(vec3(result), 1.0);
    }
`;

// Expose to window
if (typeof window !== 'undefined') {
    window.WebGLProcessor = WebGLProcessor;
}

// Morphological closing shader (dilate then erode)
// Connects broken line segments for better colorability
const CLOSE_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    
    uniform sampler2D u_sourceTexture;
    uniform vec2 u_resolution;
    
    void main() {
        vec2 texelSize = 1.0 / u_resolution;
        
        // Sample cross pattern (dilation)
        float c = texture2D(u_sourceTexture, v_texCoord).r;
        float n = texture2D(u_sourceTexture, v_texCoord + vec2(0.0, -1.0) * texelSize).r;
        float s = texture2D(u_sourceTexture, v_texCoord + vec2(0.0, 1.0) * texelSize).r;
        float e = texture2D(u_sourceTexture, v_texCoord + vec2(1.0, 0.0) * texelSize).r;
        float w = texture2D(u_sourceTexture, v_texCoord + vec2(-1.0, 0.0) * texelSize).r;
        
        // Dilation: if any neighbor is dark, become dark
        float dilated = min(c, min(n, min(s, min(e, w))));
        
        // Slight erosion to thin lines back
        float result = mix(dilated, c, 0.3);
        
        gl_FragColor = vec4(vec3(result), 1.0);
    }
`;

// Bilateral filter shader - edge-preserving smoothing
// Reduces texture noise while keeping edges sharp
const BILATERAL_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    
    uniform sampler2D u_sourceTexture;
    uniform vec2 u_resolution;
    uniform float u_radius;
    
    float grayscale(vec4 color) {
        return dot(color.rgb, vec3(0.299, 0.587, 0.114));
    }
    
    void main() {
        vec2 texelSize = 1.0 / u_resolution;
        float centerGray = grayscale(texture2D(u_sourceTexture, v_texCoord));
        
        // Simple bilateral: weight by spatial distance AND intensity difference
        float sum = 0.0;
        float weightSum = 0.0;
        
        // Sample small neighborhood (3x3 for WebGL 1.0 compatibility)
        for (float x = -1.0; x <= 1.0; x += 1.0) {
            for (float y = -1.0; y <= 1.0; y += 1.0) {
                vec2 offset = vec2(x, y) * u_radius * texelSize;
                float sampleGray = grayscale(texture2D(u_sourceTexture, v_texCoord + offset));
                
                // Spatial weight (Gaussian)
                float spatialDist = sqrt(x*x + y*y);
                float spatialWeight = exp(-spatialDist * spatialDist / 2.0);
                
                // Intensity weight (bilateral - preserve edges)
                float intensityDiff = abs(sampleGray - centerGray);
                float intensityWeight = exp(-intensityDiff * intensityDiff * 10.0);
                
                float weight = spatialWeight * intensityWeight;
                sum += sampleGray * weight;
                weightSum += weight;
            }
        }
        
        float result = sum / weightSum;
        gl_FragColor = vec4(vec3(result), 1.0);
    }
`;
