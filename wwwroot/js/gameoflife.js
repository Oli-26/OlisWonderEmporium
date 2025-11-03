// gameoflife.js - Place in wwwroot/js/

let gl;
let canvas;
let gridSize = 256;
let generation = 0;
let isRunning = false;
let animationId = null;
let lastFrameTime = 0;
let frameInterval = 1000 / 30; // 30 FPS default

// Rule parameters
let birthMin = 3;
let birthMax = 3;
let surviveMin = 2;
let surviveMax = 3;

// Visual parameters
let colorScheme = 'green';
let cellBrightness = 1.0;
let gridOpacity = 0.0;

// Textures for ping-pong rendering
let stateTextures = [];
let currentStateIndex = 0;

// Programs
let computeProgram;
let renderProgram;

// Framebuffers
let framebuffers = [];

// Render quad
let quadBuffer;

// Compute shader source with parameterized rules
const computeShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_currentState;
uniform vec2 u_resolution;
uniform int u_birthMin;
uniform int u_birthMax;
uniform int u_surviveMin;
uniform int u_surviveMax;

out vec4 fragColor;

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    ivec2 coord = ivec2(gl_FragCoord.xy);
    
    // Sample current cell state
    float current = texture(u_currentState, uv).r;
    
    // Count living neighbors
    int neighbors = 0;
    for(int dy = -1; dy <= 1; dy++) {
        for(int dx = -1; dx <= 1; dx++) {
            if(dx == 0 && dy == 0) continue;
            
            vec2 neighborCoord = (vec2(coord) + vec2(dx, dy)) / u_resolution;
            // Wrap around edges
            neighborCoord = fract(neighborCoord);
            
            float neighborState = texture(u_currentState, neighborCoord).r;
            if(neighborState > 0.5) neighbors++;
        }
    }
    
    // Parameterized Game of Life rules
    float newState = 0.0;
    if(current > 0.5) {
        // Cell is alive - check survival rules
        if(neighbors >= u_surviveMin && neighbors <= u_surviveMax) {
            newState = 1.0;
        }
    } else {
        // Cell is dead - check birth rules
        if(neighbors >= u_birthMin && neighbors <= u_birthMax) {
            newState = 1.0;
        }
    }
    
    fragColor = vec4(newState, newState, newState, 1.0);
}
`;

// Vertex shader for both compute and render
const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Fragment shader for rendering with parameterized visuals
const renderFragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_state;
uniform vec3 u_aliveColor;
uniform vec3 u_deadColor;
uniform float u_brightness;
uniform float u_gridOpacity;
uniform vec2 u_resolution;

out vec4 fragColor;

void main() {
    float state = texture(u_state, v_uv).r;
    
    // Base color based on cell state
    vec3 color = state > 0.5 ? u_aliveColor * u_brightness : u_deadColor;
    
    // Add grid lines if enabled
    if(u_gridOpacity > 0.0) {
        vec2 pixelCoord = v_uv * u_resolution;
        vec2 grid = abs(fract(pixelCoord) - 0.5);
        float gridLine = min(grid.x, grid.y);
        
        if(gridLine < 0.02) {
            color = mix(color, vec3(0.3), u_gridOpacity);
        }
    }
    
    fragColor = vec4(color, 1.0);
}
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }

    return program;
}

function createTexture(gl, width, height, data = null) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, width, height, 0, gl.RED, gl.FLOAT, data);

    return texture;
}

function createFramebuffer(gl, texture) {
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer is not complete');
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return framebuffer;
}

function initializeGrid(density = 0.3) {
    const data = new Float32Array(gridSize * gridSize);

    for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() > (1 - density) ? 1.0 : 0.0;
    }

    return data;
}

function getColorForScheme(scheme) {
    const colors = {
        green: { alive: [0.0, 1.0, 0.2], dead: [0.0, 0.0, 0.0] },
        blue: { alive: [0.2, 0.6, 1.0], dead: [0.0, 0.0, 0.1] },
        red: { alive: [1.0, 0.2, 0.2], dead: [0.1, 0.0, 0.0] },
        purple: { alive: [0.8, 0.2, 1.0], dead: [0.05, 0.0, 0.1] },
        rainbow: { alive: [1.0, 0.5, 0.0], dead: [0.0, 0.0, 0.0] },
        heat: { alive: [1.0, 0.4, 0.0], dead: [0.0, 0.0, 0.2] }
    };

    return colors[scheme] || colors.green;
}

export function initGameOfLife() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Canvas not found');
        return;
    }

    gl = canvas.getContext('webgl2');
    if (!gl) {
        console.error('WebGL 2 not supported');
        return;
    }

    // Check for required extensions
    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
        console.error('EXT_color_buffer_float not supported');
        return;
    }

    // Create shaders and programs
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const computeFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, computeShaderSource);
    const renderFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, renderFragmentShaderSource);

    computeProgram = createProgram(gl, vertexShader, computeFragmentShader);
    renderProgram = createProgram(gl, vertexShader, renderFragmentShader);

    // Create full-screen quad
    const quadVertices = new Float32Array([
        -1, -1,
        1, -1,
        -1,  1,
        1,  1
    ]);

    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    // Initialize textures and framebuffers
    const initialData = initializeGrid(0.3);

    for (let i = 0; i < 2; i++) {
        stateTextures[i] = createTexture(gl, gridSize, gridSize, i === 0 ? initialData : null);
        framebuffers[i] = createFramebuffer(gl, stateTextures[i]);
    }

    generation = 0;
    render();
}

function computeStep() {
    const readIndex = currentStateIndex;
    const writeIndex = 1 - currentStateIndex;

    // Bind framebuffer for writing
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[writeIndex]);
    gl.viewport(0, 0, gridSize, gridSize);

    // Use compute program
    gl.useProgram(computeProgram);

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateTextures[readIndex]);
    gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_currentState'), 0);
    gl.uniform2f(gl.getUniformLocation(computeProgram, 'u_resolution'), gridSize, gridSize);

    // Set rule parameters
    gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_birthMin'), birthMin);
    gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_birthMax'), birthMax);
    gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_surviveMin'), surviveMin);
    gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_surviveMax'), surviveMax);

    // Set up vertex attributes
    const positionLoc = gl.getAttribLocation(computeProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Swap buffers
    currentStateIndex = writeIndex;
    generation++;
}

function render() {
    // Render to canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(renderProgram);

    // Bind current state texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
    gl.uniform1i(gl.getUniformLocation(renderProgram, 'u_state'), 0);

    // Set visual parameters
    const colors = getColorForScheme(colorScheme);
    gl.uniform3fv(gl.getUniformLocation(renderProgram, 'u_aliveColor'), colors.alive);
    gl.uniform3fv(gl.getUniformLocation(renderProgram, 'u_deadColor'), colors.dead);
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'u_brightness'), cellBrightness);
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'u_gridOpacity'), gridOpacity);
    gl.uniform2f(gl.getUniformLocation(renderProgram, 'u_resolution'), gridSize, gridSize);

    // Set up vertex attributes
    const positionLoc = gl.getAttribLocation(renderProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function animate(currentTime) {
    if (!isRunning) return;

    const elapsed = currentTime - lastFrameTime;

    if (elapsed >= frameInterval) {
        computeStep();
        render();
        lastFrameTime = currentTime - (elapsed % frameInterval);
    }

    animationId = requestAnimationFrame(animate);
}

export function startGame() {
    if (isRunning) return;
    isRunning = true;
    lastFrameTime = performance.now();
    animate(lastFrameTime);
}

export function stopGame() {
    isRunning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

export function stepGame() {
    computeStep();
    render();
    return generation;
}

export function resetGame(density = 0.3) {
    const data = initializeGrid(density);
    gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, gridSize, gridSize, 0, gl.RED, gl.FLOAT, data);
    generation = 0;
    render();
}

export function clearGame() {
    const data = new Float32Array(gridSize * gridSize);
    gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, gridSize, gridSize, 0, gl.RED, gl.FLOAT, data);
    generation = 0;
    render();
}

export function setGridSize(newSize, density = 0.3) {
    gridSize = newSize;

    // Cleanup old textures and framebuffers
    stateTextures.forEach(tex => gl.deleteTexture(tex));
    framebuffers.forEach(fb => gl.deleteFramebuffer(fb));

    // Create new textures and framebuffers
    const initialData = initializeGrid(density);
    stateTextures = [];
    framebuffers = [];

    for (let i = 0; i < 2; i++) {
        stateTextures[i] = createTexture(gl, gridSize, gridSize, i === 0 ? initialData : null);
        framebuffers[i] = createFramebuffer(gl, stateTextures[i]);
    }

    currentStateIndex = 0;
    generation = 0;
    render();
}

export function setRules(bMin, bMax, sMin, sMax) {
    birthMin = bMin;
    birthMax = bMax;
    surviveMin = sMin;
    surviveMax = sMax;
}

export function setColorScheme(scheme) {
    colorScheme = scheme;
    render();
}

export function setVisualParams(brightness, gridOp) {
    cellBrightness = brightness;
    gridOpacity = gridOp;
    render();
}

export function setSimulationSpeed(fps) {
    frameInterval = 1000 / fps;
}

export function cleanup() {
    stopGame();

    if (gl) {
        stateTextures.forEach(tex => gl.deleteTexture(tex));
        framebuffers.forEach(fb => gl.deleteFramebuffer(fb));
        gl.deleteProgram(computeProgram);
        gl.deleteProgram(renderProgram);
        gl.deleteBuffer(quadBuffer);
    }
}