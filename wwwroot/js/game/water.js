// water.js - Water rendering and effects
import * as THREE from 'https://esm.sh/three@0.158.0';
import { getState } from './globals.js';
import { CHUNK_SIZE } from './constants.js';
import { chunkKey } from './terrain.js';

export function createWaterChunk(chunkX, chunkZ) {
    const state = getState();
    const key = chunkKey(chunkX, chunkZ);

    if (state.waterChunks.has(key)) {
        return state.waterChunks.get(key);
    }

    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;

    // Reduced segments - we don't need high geometry anymore!
    const waterSegments = 32;
    const waterGeometry = new THREE.PlaneGeometry(
        CHUNK_SIZE,
        CHUNK_SIZE,
        waterSegments,
        waterSegments
    );

    const waterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            waterColor: { value: new THREE.Color(0x4a9fd8) },
            deepWaterColor: { value: new THREE.Color(0x1e5a7a) },
            time: { value: 0 },
            lightDirection: { value: new THREE.Vector3(1, 1, 0).normalize() },
            chunkOffset: { value: new THREE.Vector2(worldX, worldZ) }
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            
            uniform vec2 chunkOffset;
            uniform float time;
            
            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                
                // Calculate world position for waves
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform vec3 waterColor;
            uniform vec3 deepWaterColor;
            uniform vec3 lightDirection;
            uniform float time;
            uniform vec2 chunkOffset;
            
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vWorldPosition;
            
            // Simple noise function for water variation
            float noise(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }
            
            void main() {
                // Use world position for seamless waves across chunks
                vec2 worldUV = vWorldPosition.xz * 0.1;
                
                // Create multiple wave layers for realistic water
                float wave1 = sin(worldUV.x * 2.0 + time * 0.3) * 0.5 + 0.5;
                float wave2 = sin(worldUV.y * 1.5 - time * 0.2) * 0.5 + 0.5;
                float wave3 = sin((worldUV.x - worldUV.y) * 1.2 + time * 0.25) * 0.5 + 0.5;
                
                // Combine waves
                float waves = (wave1 + wave2 + wave3) / 3.0;
                
                // Add some noise for texture
                float noiseVal = noise(worldUV + time * 0.1) * 0.3;
                
                // Calculate fake normal from waves for lighting
                vec3 fakeNormal = normalize(vec3(
                    cos(worldUV.x * 2.0 + time * 0.3) * 0.3,
                    1.0,
                    cos(worldUV.y * 1.5 - time * 0.2) * 0.3
                ));
                
                // Lighting
                float diffuse = max(dot(fakeNormal, lightDirection), 0.0) * 0.5 + 0.5;
                
                // Specular highlight
                vec3 viewDir = normalize(cameraPosition - vWorldPosition);
                vec3 reflectDir = reflect(-lightDirection, fakeNormal);
                float specular = pow(max(dot(viewDir, reflectDir), 0.0), 32.0) * 0.5;
                
                // Mix colors based on waves and depth
                vec3 color = mix(deepWaterColor, waterColor, waves * 0.7 + 0.3);
                color += noiseVal * 0.1;
                color *= diffuse;
                color += vec3(specular);
                
                // Add some Fresnel effect for realism
                float fresnel = pow(1.0 - max(dot(viewDir, fakeNormal), 0.0), 3.0);
                color = mix(color, vec3(0.8, 0.9, 1.0), fresnel * 0.3);
                
                gl_FragColor = vec4(color, 0.75);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide
    });

    const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(worldX, state.waterLevel, worldZ);
    waterMesh.receiveShadow = true;
    waterMesh.castShadow = false;
    state.scene.add(waterMesh);

    console.log(`Water chunk (${chunkX}, ${chunkZ}) positioned at world (${worldX}, ${state.waterLevel}, ${worldZ})`);

    state.waterChunks.set(key, waterMesh);

    return waterMesh;
}

// Update water shader time uniform - this is all we need now!
export function updateWaterDisturbance(deltaTime) {
    const state = getState();

    const currentTime = performance.now() * 0.001; // Convert to seconds

    for (const [key, waterMesh] of state.waterChunks) {
        if (waterMesh.material.uniforms) {
            waterMesh.material.uniforms.time.value = currentTime;
        }
    }
}

// These are no longer needed but keeping for compatibility
export function addRipple(x, z) {
    // Ripples are now handled entirely by the shader
}