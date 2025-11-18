// globals.js - Global state management
import * as THREE from 'https://esm.sh/three@0.158.0';

// Initialize global state on window object for easy access
export function initGlobals() {
    // Three.js core objects
    window.gameState = {
        scene: null,
        camera: null,
        renderer: null,
        composer: null,
        
        // Game objects
        player: null,
        directionalLight: null,
        
        // Input state
        keys: {},
        playerVelocity: { x: 0, z: 0 },
        
        // Animation state
        animationId: null,
        lastFrameTime: 0,
        lastTime: performance.now(),
        dayTime: 0.5,
        waterUpdateAccumulator: 0,
        lastRippleTime: 0,
        
        // Chunk management
        chunks: new Map(),
        waterChunks: new Map(),
        activeChunkCoords: new Set(),
        lastPlayerChunk: { x: 10, z: 2 },
        
        // World generation
        globalSeededRandom: null,
        globalMinHeight: Infinity,
        globalMaxHeight: -Infinity,
        
        // Water and effects
        waterLevel: 0,
        ripples: [],
        
        // Shared materials
        trunkMaterial: null,
        foliageMaterial: null,
        
        // Reusable objects
        raycaster: new THREE.Raycaster(),
        _vec3: new THREE.Vector3(),
        _raycasterOrigin: new THREE.Vector3(),
        _raycasterDirection: new THREE.Vector3(0, -1, 0)
    };
}

// Convenience accessors
export function getState() {
    return window.gameState;
}
