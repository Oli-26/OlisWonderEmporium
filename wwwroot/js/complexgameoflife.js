// complexgameoflife.js - WebGL2 Compute Shader Game of Life

window.ComplexGameOfLife = (() => {
    let canvas, gl;
    let computeProgram, renderProgram;
    let stateTextures = [];
    let currentStateIndex = 0;
    let framebuffers = [];
    let computeVAO, renderVAO;
    let quadBuffer;

    let isRunning = false;
    let generation = 0;
    let lastTime = 0;
    let frameCount = 0;
    let fps = 0;
    let updateSpeed = 100;
    let lastUpdateTime = 0;

    let parameters = {
        effectRange: 1,
        minBirth: 3,
        maxBirth: 3,
        minSurvive: 2,
        maxSurvive: 3,
        useStatistical: false,
        birthProbability: 0.7,
        deathProbability: 0.3,
        updateSpeed: 100
    };

    const GRID_SIZE = 250;

    // Vertex shader for fullscreen quad
    const vertexShaderSource = `#version 300 es
        in vec2 a_position;
        out vec2 v_texCoord;
        
        void main() {
            v_texCoord = a_position * 0.5 + 0.5;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    // Compute shader (fragment shader used as compute)
    const computeShaderSource = `#version 300 es
        precision highp float;
        precision highp int;
        
        uniform sampler2D u_state;
        uniform int u_effectRange;
        uniform int u_minBirth;
        uniform int u_maxBirth;
        uniform int u_minSurvive;
        uniform int u_maxSurvive;
        uniform bool u_useStatistical;
        uniform float u_birthProbability;
        uniform float u_deathProbability;
        uniform float u_randomSeed;
        
        in vec2 v_texCoord;
        out vec4 fragColor;
        
        // Simple pseudo-random function
        float random(vec2 st, float seed) {
            return fract(sin(dot(st.xy + seed, vec2(12.9898, 78.233))) * 43758.5453123);
        }
        
        void main() {
            ivec2 texSize = textureSize(u_state, 0);
            ivec2 pixelCoord = ivec2(v_texCoord * vec2(texSize));
            
            // Get current cell state (read from R channel)
            float currentState = texelFetch(u_state, pixelCoord, 0).r;
            
            // Count living neighbors within effect range
            int aliveCount = 0;
            
            for (int dy = -u_effectRange; dy <= u_effectRange; dy++) {
                for (int dx = -u_effectRange; dx <= u_effectRange; dx++) {
                    if (dx == 0 && dy == 0) continue;
                    
                    // Wrap around edges (toroidal topology)
                    ivec2 neighborCoord = ivec2(
                        (pixelCoord.x + dx + texSize.x) % texSize.x,
                        (pixelCoord.y + dy + texSize.y) % texSize.y
                    );
                    
                    float neighborState = texelFetch(u_state, neighborCoord, 0).r;
                    if (neighborState > 0.5) {
                        aliveCount++;
                    }
                }
            }
            
            float newState = currentState;
            
            if (u_useStatistical) {
                // Statistical mechanics mode
                float randValue = random(v_texCoord, u_randomSeed);
                
                if (currentState > 0.5) {
                    // Cell is alive
                    if (aliveCount >= u_minSurvive && aliveCount <= u_maxSurvive) {
                        // Should survive, but apply probability
                        newState = (randValue < (1.0 - u_deathProbability)) ? 1.0 : 0.0;
                    } else {
                        // Should die
                        newState = (randValue < u_deathProbability) ? 0.0 : 1.0;
                    }
                } else {
                    // Cell is dead
                    if (aliveCount >= u_minBirth && aliveCount <= u_maxBirth) {
                        // Should be born, but apply probability
                        newState = (randValue < u_birthProbability) ? 1.0 : 0.0;
                    } else {
                        newState = 0.0;
                    }
                }
            } else {
                // Standard deterministic mode
                if (currentState > 0.5) {
                    // Cell is alive
                    if (aliveCount >= u_minSurvive && aliveCount <= u_maxSurvive) {
                        newState = 1.0;
                    } else {
                        newState = 0.0;
                    }
                } else {
                    // Cell is dead
                    if (aliveCount >= u_minBirth && aliveCount <= u_maxBirth) {
                        newState = 1.0;
                    } else {
                        newState = 0.0;
                    }
                }
            }
            
            // Output to all channels for RGBA8 format
            fragColor = vec4(newState, newState, newState, 1.0);
        }
    `;

    // Render shader
    const renderShaderSource = `#version 300 es
        precision highp float;
        
        uniform sampler2D u_state;
        in vec2 v_texCoord;
        out vec4 fragColor;
        
        void main() {
            float state = texture(u_state, v_texCoord).r;
            
            // Color living cells with a nice gradient
            if (state > 0.5) {
                vec3 aliveColor = vec3(0.2, 0.8, 0.3);
                fragColor = vec4(aliveColor, 1.0);
            } else {
                vec3 deadColor = vec3(0.05, 0.05, 0.1);
                fragColor = vec4(deadColor, 1.0);
            }
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

    function createProgram(gl, vertexSource, fragmentSource) {
        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    function createQuad(gl) {
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1,  1,
            1,  1,
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        return buffer;
    }

    function createTexture(gl, data = null) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Use RGBA8 format which is always renderable in WebGL2
        // We'll use the R channel for state (0 or 255)
        let pixelData = null;
        if (data) {
            // Convert float data to RGBA bytes
            pixelData = new Uint8Array(GRID_SIZE * GRID_SIZE * 4);
            for (let i = 0; i < data.length; i++) {
                const value = data[i] > 0.5 ? 255 : 0;
                pixelData[i * 4] = value;     // R
                pixelData[i * 4 + 1] = value; // G
                pixelData[i * 4 + 2] = value; // B
                pixelData[i * 4 + 3] = 255;   // A
            }
        }

        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            GRID_SIZE,
            GRID_SIZE,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixelData
        );

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        return texture;
    }

    function createFramebuffer(gl, texture) {
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0
        );

        return framebuffer;
    }

    function initialize() {
        canvas = document.getElementById('gameCanvas');
        gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            preserveDrawingBuffer: false
        });

        if (!gl) {
            alert('WebGL2 not supported!');
            return;
        }

        // Create programs
        computeProgram = createProgram(gl, vertexShaderSource, computeShaderSource);
        renderProgram = createProgram(gl, vertexShaderSource, renderShaderSource);

        // Create quad buffer
        quadBuffer = createQuad(gl);

        // Setup VAO for compute program
        computeVAO = gl.createVertexArray();
        gl.bindVertexArray(computeVAO);
        const computePositionLoc = gl.getAttribLocation(computeProgram, 'a_position');
        gl.enableVertexAttribArray(computePositionLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.vertexAttribPointer(computePositionLoc, 2, gl.FLOAT, false, 0, 0);

        // Setup VAO for render program
        renderVAO = gl.createVertexArray();
        gl.bindVertexArray(renderVAO);
        const renderPositionLoc = gl.getAttribLocation(renderProgram, 'a_position');
        gl.enableVertexAttribArray(renderPositionLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.vertexAttribPointer(renderPositionLoc, 2, gl.FLOAT, false, 0, 0);

        // Unbind VAO
        gl.bindVertexArray(null);

        // Create double-buffered state textures
        stateTextures[0] = createTexture(gl);
        stateTextures[1] = createTexture(gl);

        // Create framebuffers
        framebuffers[0] = createFramebuffer(gl, stateTextures[0]);
        framebuffers[1] = createFramebuffer(gl, stateTextures[1]);

        // Initialize with random state
        randomize();

        // Setup mouse interaction
        canvas.addEventListener('click', handleCanvasClick);

        // Start render loop
        requestAnimationFrame(render);
    }

    function handleCanvasClick(event) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / rect.width * GRID_SIZE);
        const y = Math.floor((event.clientY - rect.top) / rect.height * GRID_SIZE);

        // Toggle cell at click position
        toggleCell(x, y);
    }

    function toggleCell(x, y) {
        // Read current pixel data (RGBA format)
        const pixel = new Uint8Array(4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[currentStateIndex]);
        gl.readPixels(x, GRID_SIZE - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

        // Toggle state
        const newState = pixel[0] > 127 ? 0 : 255;

        // Write back
        gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
        gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            x, GRID_SIZE - 1 - y,
            1, 1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([newState, newState, newState, 255])
        );
    }

    function compute() {
        const nextStateIndex = 1 - currentStateIndex;

        // Bind framebuffer for next state
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[nextStateIndex]);
        gl.viewport(0, 0, GRID_SIZE, GRID_SIZE);

        // Use compute program and its VAO
        gl.useProgram(computeProgram);
        gl.bindVertexArray(computeVAO);

        // Bind current state texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
        gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_state'), 0);

        // Set parameters
        gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_effectRange'), parameters.effectRange);
        gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_minBirth'), parameters.minBirth);
        gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_maxBirth'), parameters.maxBirth);
        gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_minSurvive'), parameters.minSurvive);
        gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_maxSurvive'), parameters.maxSurvive);
        gl.uniform1i(gl.getUniformLocation(computeProgram, 'u_useStatistical'), parameters.useStatistical ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(computeProgram, 'u_birthProbability'), parameters.birthProbability);
        gl.uniform1f(gl.getUniformLocation(computeProgram, 'u_deathProbability'), parameters.deathProbability);
        gl.uniform1f(gl.getUniformLocation(computeProgram, 'u_randomSeed'), Math.random() * 1000);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Swap state
        currentStateIndex = nextStateIndex;
        generation++;
    }

    function render(currentTime) {
        requestAnimationFrame(render);

        // Calculate FPS
        frameCount++;
        if (currentTime - lastTime >= 1000) {
            fps = frameCount;
            frameCount = 0;
            lastTime = currentTime;
        }

        // Update simulation if running
        if (isRunning && currentTime - lastUpdateTime >= parameters.updateSpeed) {
            compute();
            lastUpdateTime = currentTime;
        }

        // Render to canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);

        gl.useProgram(renderProgram);
        gl.bindVertexArray(renderVAO);

        // Bind current state texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
        gl.uniform1i(gl.getUniformLocation(renderProgram, 'u_state'), 0);

        // Draw
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function toggleSimulation(running) {
        isRunning = running;
        if (isRunning) {
            lastUpdateTime = performance.now();
        }
    }

    function reset() {
        // Create classic glider pattern
        const data = new Uint8Array(GRID_SIZE * GRID_SIZE * 4);

        // Glider at center
        const cx = Math.floor(GRID_SIZE / 2);
        const cy = Math.floor(GRID_SIZE / 2);

        function setCell(x, y) {
            const idx = (y * GRID_SIZE + x) * 4;
            data[idx] = 255;     // R
            data[idx + 1] = 255; // G
            data[idx + 2] = 255; // B
            data[idx + 3] = 255; // A
        }

        setCell(cx + 1, cy);
        setCell(cx + 2, cy + 1);
        setCell(cx, cy + 2);
        setCell(cx + 1, cy + 2);
        setCell(cx + 2, cy + 2);

        gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            GRID_SIZE,
            GRID_SIZE,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data
        );

        generation = 0;
    }

    function randomize() {
        const data = new Uint8Array(GRID_SIZE * GRID_SIZE * 4);
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const value = Math.random() > 0.7 ? 255 : 0;
            data[i * 4] = value;     // R
            data[i * 4 + 1] = value; // G
            data[i * 4 + 2] = value; // B
            data[i * 4 + 3] = 255;   // A
        }

        gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            GRID_SIZE,
            GRID_SIZE,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data
        );

        generation = 0;
    }

    function clear() {
        const data = new Uint8Array(GRID_SIZE * GRID_SIZE * 4);
        // Data is already all zeros, just set alpha to 255
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            data[i * 4 + 3] = 255;
        }

        gl.bindTexture(gl.TEXTURE_2D, stateTextures[currentStateIndex]);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA8,
            GRID_SIZE,
            GRID_SIZE,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            data
        );

        generation = 0;
    }

    function updateParameters(params) {
        parameters = { ...parameters, ...params };
        updateSpeed = parameters.updateSpeed;
    }

    return {
        initialize,
        toggleSimulation,
        reset,
        randomize,
        clear,
        updateParameters
    };
})();