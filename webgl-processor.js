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
                resolution: gl.getUniformLocation(program, 'u_resolution'),
                direction: gl.getUniformLocation(program, 'u_direction'),
                radius: gl.getUniformLocation(program, 'u_radius'),
                edgeIntensity: gl.getUniformLocation(program, 'u_edgeIntensity'),
                threshold: gl.getUniformLocation(program, 'u_threshold'),
                invert: gl.getUniformLocation(program, 'u_invert')
            }
        };
    }

    createPrograms() {
        // Gaussian blur program (separable, two-pass)
        this.programs.blur = this.createProgram(VERTEX_SHADER, BLUR_FRAGMENT_SHADER);
        
        // Edge detection program
        this.programs.edge = this.createProgram(VERTEX_SHADER, EDGE_FRAGMENT_SHADER);
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

    renderEdgePass(inputTexture, params) {
        const gl = this.gl;
        const program = this.programs.edge;
        
        gl.useProgram(program.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        this.bindGeometry(program);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, inputTexture);
        gl.uniform1i(program.uniforms.sourceTexture, 0);
        
        gl.uniform2f(program.uniforms.resolution, this.width, this.height);
        gl.uniform1f(program.uniforms.edgeIntensity, params.edgeIntensity);
        gl.uniform1f(program.uniforms.threshold, params.threshold);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    process(params = {}) {
        const {
            blurRadius = 2.0,
            edgeIntensity = 0.5,
            threshold = 0.3
        } = params;
        
        // Skip blur if radius is small
        if (blurRadius < 0.5) {
            this.renderEdgePass(this.textures.source, { edgeIntensity, threshold });
            return;
        }
        
        // Two-pass Gaussian blur
        // Pass 1: Horizontal blur from source -> blurTemp
        this.renderBlurPass(this.textures.source, this.framebuffers.blurTemp, [1, 0], blurRadius);
        
        // Pass 2: Vertical blur from blurTemp -> screen
        // But we need to render to screen for edge detection to work on blurred image
        // Create a temporary texture for the fully blurred result
        this.ensureBlurResultTexture();
        
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers.blurResult);
        this.renderBlurPass(this.textures.blurTemp, this.framebuffers.blurResult, [0, 1], blurRadius);
        
        // Edge detection on blurred image
        this.renderEdgePass(this.textures.blurResult, { edgeIntensity, threshold });
    }

    ensureBlurResultTexture() {
        if (this.textures.blurResult) return;
        
        const gl = this.gl;
        this.textures.blurResult = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.textures.blurResult);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        
        this.framebuffers.blurResult = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.blurResult);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.blurResult, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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

// Edge Detection Fragment Shader - Always outputs black lines on white background
const EDGE_FRAGMENT_SHADER = `
    precision mediump float;
    varying vec2 v_texCoord;
    
    uniform sampler2D u_sourceTexture;
    uniform vec2 u_resolution;
    uniform float u_edgeIntensity;
    uniform float u_threshold;
    
    float grayscale(vec4 color) {
        return dot(color.rgb, vec3(0.299, 0.587, 0.114));
    }
    
    void main() {
        vec2 texelSize = 1.0 / u_resolution;
        
        // Sample neighboring pixels
        float tl = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2(-1.0, -1.0) * texelSize));
        float tc = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2( 0.0, -1.0) * texelSize));
        float tr = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2( 1.0, -1.0) * texelSize));
        float cl = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2(-1.0,  0.0) * texelSize));
        float cr = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2( 1.0,  0.0) * texelSize));
        float bl = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2(-1.0,  1.0) * texelSize));
        float bc = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2( 0.0,  1.0) * texelSize));
        float br = grayscale(texture2D(u_sourceTexture, v_texCoord + vec2( 1.0,  1.0) * texelSize));
        
        // Sobel operator
        float gx = tl + 2.0 * cl + bl - tr - 2.0 * cr - br;
        float gy = tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
        float edge = sqrt(gx * gx + gy * gy);
        
        // Apply intensity
        edge *= u_edgeIntensity * 4.0;
        
        // Threshold - edge > threshold means we have a line (black), else white background
        float result = edge > u_threshold ? 0.0 : 1.0;
        
        gl_FragColor = vec4(vec3(result), 1.0);
    }
`;

// Expose to window
if (typeof window !== 'undefined') {
    window.WebGLProcessor = WebGLProcessor;
}
