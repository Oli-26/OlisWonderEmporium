// game.js - Main game initialization and loop
import * as THREE from 'https://esm.sh/three@0.158.0';
import { EffectComposer } from 'https://esm.sh/three@0.158.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.158.0/examples/jsm/postprocessing/RenderPass.js';

import { initGlobals, getState } from './globals.js';
import {SeededRandom, getHeight} from './noise.js';
import {
    WORLD_SEED,
    CAMERA_HEIGHT,
    FRAME_TIME,
    MAX_DELTA,
    WATER_UPDATE_RATE,
    NOISE_SCALE,
    RIDGE_SCALE,
    DETAIL_SCALE,
    HEIGHT_MULTIPLIER, WATER_LEVEL
} from './constants.js';
import { updateChunks } from './terrain.js';
import { createPlayer, updatePlayer } from './player.js';
import { setupLighting, updateDayNightCycle } from './lighting.js';
import { updateWaterDisturbance } from './water.js';

// ============================================================================
// INITIALIZATION
// ============================================================================
export function initGame(canvasId) {
    console.log('Initializing game...');
    console.log('World seed:', WORLD_SEED);

    try {
        // Initialize global state
        initGlobals();
        const state = getState();

        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error('Canvas not found!');
            return;
        }

        // Initialize global seeded random for consistent world generation
        state.globalSeededRandom = new SeededRandom(WORLD_SEED);

        // Pre-calculate global height range by sampling the noise function
        console.log('Pre-calculating terrain height range...');
        const sampleSize = 1000;
        const sampleSpacing = 10;

        for (let i = 0; i < sampleSize; i++) {
            const x = (Math.random() - 0.5) * sampleSpacing * 100;
            const z = (Math.random() - 0.5) * sampleSpacing * 100;

            let height = getHeight(x, z, state, true);

            state.globalMinHeight = Math.min(state.globalMinHeight, height);
            state.globalMaxHeight = Math.max(state.globalMaxHeight, height);
        }
        
        // Add buffer to ensure all terrain fits
        const heightBuffer = (state.globalMaxHeight - state.globalMinHeight) * 0.1;
        state.globalMinHeight -= heightBuffer;
        state.globalMaxHeight += heightBuffer;
        
        console.log(`Global height range locked: [${state.globalMinHeight.toFixed(2)}, ${state.globalMaxHeight.toFixed(2)}]`);
        
        // Calculate water level once
        state.waterLevel = state.globalMinHeight + (state.globalMaxHeight - state.globalMinHeight) * WATER_LEVEL;
        console.log('Water level set to:', state.waterLevel.toFixed(2));

        // Scene setup
        state.scene = new THREE.Scene();
        state.scene.background = new THREE.Color(0x87ceeb);

        // Camera setup
        state.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        state.camera.position.set(0, CAMERA_HEIGHT, CAMERA_HEIGHT * 0.6);
        state.camera.lookAt(0, 0, 0);

        // Renderer setup
        state.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            powerPreference: "high-performance",
            stencil: false,
        });
        state.renderer.setSize(window.innerWidth, window.innerHeight);
        state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        state.renderer.shadowMap.enabled = true;
        state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        setupPostProcessing();
        setupLighting();
        
        // Initialize shared materials
        state.trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
        state.foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });

        createPlayer();
        
        // Load initial chunks around player
        updateChunks();

        // Event listeners
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('resize', onWindowResize);

        // Start animation loop
        animate();
        console.log('Game initialized successfully!');

    } catch (error) {
        console.error('Error initializing game:', error);
        throw error;
    }
}

function setupPostProcessing() {
    const state = getState();
    
    state.composer = new EffectComposer(state.renderer);
    const renderPass = new RenderPass(state.scene, state.camera);
    state.composer.addPass(renderPass);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================
function onKeyDown(event) {
    const state = getState();
    state.keys[event.key.toLowerCase()] = true;
}

function onKeyUp(event) {
    const state = getState();
    state.keys[event.key.toLowerCase()] = false;
}

function onWindowResize() {
    const state = getState();
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.composer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================
function animate() {
    const state = getState();
    state.animationId = requestAnimationFrame(animate);

    const currentTime = performance.now();

    // Frame rate limiting
    const elapsed = currentTime - state.lastFrameTime;
    if (elapsed < FRAME_TIME) {
        return;
    }
    state.lastFrameTime = currentTime - (elapsed % FRAME_TIME);

    // Clamp delta time
    let deltaTime = (currentTime - state.lastTime) / 1000;
    deltaTime = Math.min(deltaTime, MAX_DELTA);
    state.lastTime = currentTime;

    updatePlayer();
    updateDayNightCycle(deltaTime);

    // Update water less frequently
    state.waterUpdateAccumulator += deltaTime;
    if (state.waterUpdateAccumulator >= WATER_UPDATE_RATE) {
        updateWaterDisturbance(state.waterUpdateAccumulator);
        state.waterUpdateAccumulator = 0;
    }

    state.composer.render();
}

// ============================================================================
// CLEANUP
// ============================================================================
export function cleanup() {
    console.log('Cleaning up game...');
    const state = getState();

    if (state.animationId) {
        cancelAnimationFrame(state.animationId);
    }

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('resize', onWindowResize);

    // Clean up all chunks
    for (const [key, chunk] of state.chunks) {
        state.scene.remove(chunk.mesh);
        chunk.geometry.dispose();
        chunk.mesh.material.dispose();
    }
    state.chunks.clear();

    for (const [key, waterMesh] of state.waterChunks) {
        state.scene.remove(waterMesh);
        waterMesh.geometry.dispose();
        waterMesh.material.dispose();
    }
    state.waterChunks.clear();

    if (state.renderer) {
        state.renderer.dispose();
    }
}
