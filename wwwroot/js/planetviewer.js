// planetviewer.js - 3D Planet Viewer with WebGL

let gl, program, vertexBuffer, indexBuffer, normalBuffer, texCoordBuffer;
let rotationX = 0, rotationY = 0;
let animationId = null;
let planetScale = 1.0;
let speed = 1.0;
let isRunning = true;
let indexCount = 0;

// Terrain parameters
let waterLevel = 0.5;
let beachWidth = 0.05;
let grassWidth = 0.15;
let forestWidth = 0.15;
let mountainWidth = 0.10;
let planetHeight = 0.2;
let terrainVariation = 3.0;

// Terrain colors
let deepWaterColor = [0.0, 0.1, 0.3];
let shallowWaterColor = [0.1, 0.3, 0.5];
let beachColor = [0.9, 0.85, 0.6];
let grassColor = [0.2, 0.5, 0.1];
let forestColor = [0.1, 0.3, 0.05];
let mountainColor = [0.4, 0.35, 0.3];
let snowColor = [0.9, 0.9, 0.95];

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
    ] : [1, 1, 1];
}

export function initialize() {
    const canvas = document.getElementById('planetCanvas');
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
        alert('WebGL not supported');
        return false;
    }

    const ext = gl.getExtension('OES_element_index_uint');
    if (!ext) {
        console.warn('32-bit indices not supported, limiting sphere resolution');
    }

    const vsSource = `
precision mediump float;

attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat4 uNormalMatrix;

// Terrain controls
uniform float uWaterLevel;
uniform float uTerrainVariation;
uniform float uPlanetHeight;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPos;
varying vec2 vTexCoord;
varying float vTerrainHeight;

// Noise functions
vec3 random3(vec3 p) {
    return fract(sin(vec3(
        dot(p, vec3(127.1, 311.7, 74.7)),
        dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453123);
}

vec3 smootherstep(vec3 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = smootherstep(f);

    float n000 = dot(random3(i + vec3(0.0, 0.0, 0.0)) - 0.5, f - vec3(0.0, 0.0, 0.0));
    float n001 = dot(random3(i + vec3(0.0, 0.0, 1.0)) - 0.5, f - vec3(0.0, 0.0, 1.0));
    float n010 = dot(random3(i + vec3(0.0, 1.0, 0.0)) - 0.5, f - vec3(0.0, 1.0, 0.0));
    float n011 = dot(random3(i + vec3(0.0, 1.0, 1.0)) - 0.5, f - vec3(0.0, 1.0, 1.0));
    float n100 = dot(random3(i + vec3(1.0, 0.0, 0.0)) - 0.5, f - vec3(1.0, 0.0, 0.0));
    float n101 = dot(random3(i + vec3(1.0, 0.0, 1.0)) - 0.5, f - vec3(1.0, 0.0, 1.0));
    float n110 = dot(random3(i + vec3(1.0, 1.0, 0.0)) - 0.5, f - vec3(1.0, 1.0, 0.0));
    float n111 = dot(random3(i + vec3(1.0, 1.0, 1.0)) - 0.5, f - vec3(1.0, 1.0, 1.0));

    return mix(
        mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
        mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
        u.z
    ) * 0.5 + 0.5;
}

float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float lacunarity = 2.3;
    float gain = 0.45;

    for(int i = 0; i < 6; i++) {
        value += amplitude * noise(p * frequency);
        frequency *= lacunarity;
        amplitude *= gain;
    }
    return value;
}

void main() {
    // Sample noise at vertex position to create height
    vec3 noisePos = aPosition * uTerrainVariation;
    float terrainHeight = fbm(noisePos);
    
    // Map terrain height from [0,1] to a displacement value
    float displacement = (terrainHeight - 0.5) * 2.0; // Range: -1 to 1

    // Flatten water areas
    if(terrainHeight < uWaterLevel){
        displacement = (uWaterLevel - 0.5) * 2.0;
    }

    float heightOffset = displacement * uPlanetHeight;
    
    // Displace vertex along its normal by the terrain height
    vec3 displacedPos = aPosition * (1.0 + heightOffset);

    // Output world-space position
    vec4 worldPos = vec4(displacedPos, 1.0);
    gl_Position = uProjection * uModelView * worldPos;

    // Pass variables to fragment shader
    vNormal = mat3(uNormalMatrix) * normalize(displacedPos);
    vPosition = (uModelView * worldPos).xyz;
    vWorldPos = displacedPos;
    vTexCoord = aTexCoord;
    vTerrainHeight = terrainHeight;
}
    `;

    // Fragment shader with procedural terrain coloring
    const fsSource = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vTexCoord;
varying vec3 vWorldPos;
varying float vTerrainHeight;

uniform float uWaterLevel;
uniform float uBeachWidth;
uniform float uGrassWidth;
uniform float uForestWidth;
uniform float uMountainWidth;

// Terrain colors
uniform vec3 uDeepWaterColor;
uniform vec3 uShallowWaterColor;
uniform vec3 uBeachColor;
uniform vec3 uGrassColor;
uniform vec3 uForestColor;
uniform vec3 uMountainColor;
uniform vec3 uSnowColor;
        
void main() {
    vec3 lightDir = normalize(vec3(1.0, 1.0, 2.0));
    vec3 normal = normalize(vNormal);
    
    // Calculate lighting
    float diff = max(dot(normal, lightDir), 0.0);
    float ambient = 0.3;
    float lighting = ambient + diff * 0.7;
    
    float terrainHeight = vTerrainHeight;
    vec3 color;
    
    // Calculate terrain boundaries
    float deepWaterEnd = uWaterLevel * 0.7;
    float shallowWaterEnd = uWaterLevel;
    float beachEnd = shallowWaterEnd + uBeachWidth;
    float grassEnd = beachEnd + uGrassWidth;
    float forestEnd = grassEnd + uForestWidth;
    float mountainEnd = forestEnd + uMountainWidth;
    
    // Apply colors based on terrain height
    if (terrainHeight < deepWaterEnd) {
        color = uDeepWaterColor;
    }
    else if (terrainHeight < shallowWaterEnd) {
        float t = (terrainHeight - deepWaterEnd) / (shallowWaterEnd - deepWaterEnd);
        color = mix(uDeepWaterColor, uShallowWaterColor, t);
    }
    else if (terrainHeight < beachEnd) {
        float t = (terrainHeight - shallowWaterEnd) / uBeachWidth;
        color = mix(uShallowWaterColor, uBeachColor, t);
    }
    else if (terrainHeight < grassEnd) {
        float t = (terrainHeight - beachEnd) / uGrassWidth;
        color = mix(uBeachColor, uGrassColor, t);
    }
    else if (terrainHeight < forestEnd) {
        float t = (terrainHeight - grassEnd) / uForestWidth;
        color = mix(uGrassColor, uForestColor, t);
    }
    else if (terrainHeight < mountainEnd) {
        float t = (terrainHeight - forestEnd) / uMountainWidth;
        color = mix(uForestColor, uMountainColor, t);
    }
    else {
        float t = (terrainHeight - mountainEnd) / 0.1;
        t = clamp(t, 0.0, 1.0);
        color = mix(uMountainColor, uSnowColor, t);
    }
    
    // Apply lighting
    color *= lighting;
    
    // Add slight specular for water
    if (terrainHeight < uWaterLevel) {
        vec3 viewDir = normalize(-vPosition);
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
        color += vec3(0.3, 0.3, 0.4) * spec * 0.5;
    }
    
    gl_FragColor = vec4(color, 1.0);
}
    `;

    // Compile shaders
    const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);

    // Create program
    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        return false;
    }

    // Create sphere geometry
    createSphere(600, 600);

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);

    // Start animation
    animate();
    return true;
}

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

function createSphere(latBands, longBands) {
    const vertices = [];
    const normals = [];
    const texCoords = [];
    const indices = [];

    for (let lat = 0; lat <= latBands; lat++) {
        const theta = lat * Math.PI / latBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let long = 0; long <= longBands; long++) {
            const phi = long * 2 * Math.PI / longBands;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const x = cosPhi * sinTheta;
            const y = cosTheta;
            const z = sinPhi * sinTheta;

            vertices.push(x, y, z);
            normals.push(x, y, z);
            texCoords.push(long / longBands, lat / latBands);
        }
    }

    for (let lat = 0; lat < latBands; lat++) {
        for (let long = 0; long < longBands; long++) {
            const first = lat * (longBands + 1) + long;
            const second = first + longBands + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    // Create buffers
    vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

    texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

    indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

    indexCount = indices.length;
}

function animate() {
    if (isRunning) {
        rotationX += 0.005 * speed;
        rotationY += 0.01 * speed;
    }

    render();
    animationId = requestAnimationFrame(animate);
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    // Set up matrices
    const projection = perspective(45, 800 / 600, 0.1, 100);
    const modelView = mat4Identity();

    mat4Translate(modelView, [0, 0, -5]);
    mat4RotateX(modelView, rotationX);
    mat4RotateY(modelView, rotationY);
    mat4Scale(modelView, [planetScale, planetScale, planetScale]);

    const normalMatrix = mat4Inverse(modelView);
    mat4Transpose(normalMatrix);

    // Set uniforms
    const uProjection = gl.getUniformLocation(program, 'uProjection');
    const uModelView = gl.getUniformLocation(program, 'uModelView');
    const uNormalMatrix = gl.getUniformLocation(program, 'uNormalMatrix');
    const uWaterLevel = gl.getUniformLocation(program, 'uWaterLevel');
    const uBeachWidth = gl.getUniformLocation(program, 'uBeachWidth');
    const uGrassWidth = gl.getUniformLocation(program, 'uGrassWidth');
    const uForestWidth = gl.getUniformLocation(program, 'uForestWidth');
    const uMountainWidth = gl.getUniformLocation(program, 'uMountainWidth');
    const uTerrainVariation = gl.getUniformLocation(program, 'uTerrainVariation');
    const uPlanetHeight = gl.getUniformLocation(program, 'uPlanetHeight');

    // Color uniforms
    const uDeepWaterColor = gl.getUniformLocation(program, 'uDeepWaterColor');
    const uShallowWaterColor = gl.getUniformLocation(program, 'uShallowWaterColor');
    const uBeachColor = gl.getUniformLocation(program, 'uBeachColor');
    const uGrassColor = gl.getUniformLocation(program, 'uGrassColor');
    const uForestColor = gl.getUniformLocation(program, 'uForestColor');
    const uMountainColor = gl.getUniformLocation(program, 'uMountainColor');
    const uSnowColor = gl.getUniformLocation(program, 'uSnowColor');

    gl.uniformMatrix4fv(uProjection, false, projection);
    gl.uniformMatrix4fv(uModelView, false, modelView);
    gl.uniformMatrix4fv(uNormalMatrix, false, normalMatrix);
    gl.uniform1f(uWaterLevel, waterLevel);
    gl.uniform1f(uBeachWidth, beachWidth);
    gl.uniform1f(uGrassWidth, grassWidth);
    gl.uniform1f(uForestWidth, forestWidth);
    gl.uniform1f(uMountainWidth, mountainWidth);
    gl.uniform1f(uTerrainVariation, terrainVariation);
    gl.uniform1f(uPlanetHeight, planetHeight);

    // Set color uniforms
    gl.uniform3fv(uDeepWaterColor, deepWaterColor);
    gl.uniform3fv(uShallowWaterColor, shallowWaterColor);
    gl.uniform3fv(uBeachColor, beachColor);
    gl.uniform3fv(uGrassColor, grassColor);
    gl.uniform3fv(uForestColor, forestColor);
    gl.uniform3fv(uMountainColor, mountainColor);
    gl.uniform3fv(uSnowColor, snowColor);

    // Set attributes
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosition);

    const aNormal = gl.getAttribLocation(program, 'aNormal');
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aNormal);

    const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aTexCoord);

    // Draw
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
}

export function setPlanetSize(size) {
    planetScale = size;
}

export function setRotationSpeed(newSpeed) {
    speed = newSpeed;
}

export function toggleAnimation() {
    isRunning = !isRunning;
}

export function resetView() {
    rotationX = 0;
    rotationY = 0;
    planetScale = 1.0;
    speed = 1.0;
}

export function setWaterLevel(level) {
    waterLevel = level / 100.0;
}

export function setBeachWidth(width) {
    beachWidth = width / 100.0;
}

export function setGrassWidth(width) {
    grassWidth = width / 100.0;
}

export function setForestWidth(width) {
    forestWidth = width / 100.0;
}

export function setMountainWidth(width) {
    mountainWidth = width / 100.0;
}

export function setPlanetHeight(height) {
    planetHeight = height;
}

export function setTerrainVariation(variation) {
    terrainVariation = variation;
}

export function setDeepWaterColor(hex) {
    deepWaterColor = hexToRgb(hex);
}

export function setShallowWaterColor(hex) {
    shallowWaterColor = hexToRgb(hex);
}

export function setBeachColor(hex) {
    beachColor = hexToRgb(hex);
}

export function setGrassColor(hex) {
    grassColor = hexToRgb(hex);
}

export function setForestColor(hex) {
    forestColor = hexToRgb(hex);
}

export function setMountainColor(hex) {
    mountainColor = hexToRgb(hex);
}

export function setSnowColor(hex) {
    snowColor = hexToRgb(hex);
}

export function cleanup() {
    if (animationId) {
        cancelAnimationFrame(animationId);
    }
}

// Matrix math helpers
function mat4Identity() {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ]);
}

function mat4Translate(m, v) {
    m[12] += v[0];
    m[13] += v[1];
    m[14] += v[2];
}

function mat4RotateX(m, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const r = mat4Identity();
    r[5] = c; r[6] = s;
    r[9] = -s; r[10] = c;
    mat4Multiply(m, r, m);
}

function mat4RotateY(m, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const r = mat4Identity();
    r[0] = c; r[2] = -s;
    r[8] = s; r[10] = c;
    mat4Multiply(m, r, m);
}

function mat4Scale(m, v) {
    m[0] *= v[0]; m[1] *= v[0]; m[2] *= v[0]; m[3] *= v[0];
    m[4] *= v[1]; m[5] *= v[1]; m[6] *= v[1]; m[7] *= v[1];
    m[8] *= v[2]; m[9] *= v[2]; m[10] *= v[2]; m[11] *= v[2];
}

function mat4Multiply(out, a, b) {
    const result = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            result[i * 4 + j] =
                a[i * 4] * b[j] +
                a[i * 4 + 1] * b[4 + j] +
                a[i * 4 + 2] * b[8 + j] +
                a[i * 4 + 3] * b[12 + j];
        }
    }
    out.set(result);
}

function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy * Math.PI / 360);
    const nf = 1 / (near - far);

    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
    ]);
}

function mat4Inverse(m) {
    const inv = new Float32Array(16);
    const det = m[0] * (m[5] * m[10] - m[9] * m[6]) -
        m[1] * (m[4] * m[10] - m[8] * m[6]) +
        m[2] * (m[4] * m[9] - m[8] * m[5]);

    if (Math.abs(det) < 0.0001) return mat4Identity();

    const invDet = 1 / det;
    inv[0] = (m[5] * m[10] - m[9] * m[6]) * invDet;
    inv[1] = -(m[1] * m[10] - m[9] * m[2]) * invDet;
    inv[2] = (m[1] * m[6] - m[5] * m[2]) * invDet;
    inv[4] = -(m[4] * m[10] - m[8] * m[6]) * invDet;
    inv[5] = (m[0] * m[10] - m[8] * m[2]) * invDet;
    inv[6] = -(m[0] * m[6] - m[4] * m[2]) * invDet;
    inv[8] = (m[4] * m[9] - m[8] * m[5]) * invDet;
    inv[9] = -(m[0] * m[9] - m[8] * m[1]) * invDet;
    inv[10] = (m[0] * m[5] - m[4] * m[1]) * invDet;

    return inv;
}

function mat4Transpose(m) {
    const temp = new Float32Array(m);
    m[1] = temp[4]; m[2] = temp[8]; m[3] = temp[12];
    m[4] = temp[1]; m[6] = temp[9]; m[7] = temp[13];
    m[8] = temp[2]; m[9] = temp[6]; m[11] = temp[14];
    m[12] = temp[3]; m[13] = temp[7]; m[14] = temp[11];
}