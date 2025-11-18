// terrain.js - Terrain generation and chunk management
import * as THREE from 'https://esm.sh/three@0.158.0';
import { getState } from './globals.js';
import {getHeight} from './noise.js';
import { 
    CHUNK_SIZE, 
    CHUNK_SEGMENTS, 
    RENDER_DISTANCE,
    NOISE_SCALE,
    RIDGE_SCALE,
    DETAIL_SCALE,
    HEIGHT_MULTIPLIER,
    SAND_LEVEL,
    LIGHT_GRASS_LEVEL,
    DARK_GRASS_LEVEL,
    LIGHT_ROCK_LEVEL,
    CONTOUR_INTERVAL,
    CONTOUR_THICKNESS,
    TREES_PER_CHUNK
} from './constants.js';
import { createTree, placeTreesInChunk } from './trees.js';
import { createWaterChunk } from './water.js';

export function getChunkCoords(worldX, worldZ) {
    return {
        x: Math.floor(worldX / CHUNK_SIZE),
        z: Math.floor(worldZ / CHUNK_SIZE)
    };
}

export function chunkKey(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`;
}

// In terrain.js, modify createChunk function
export function createChunk(chunkX, chunkZ) {
    const state = getState();
    const key = chunkKey(chunkX, chunkZ);

    if (state.chunks.has(key)) {
        return state.chunks.get(key);
    }

    const worldX = chunkX * CHUNK_SIZE;
    const worldZ = chunkZ * CHUNK_SIZE;

    const geometry = new THREE.PlaneGeometry(
        CHUNK_SIZE,
        CHUNK_SIZE,
        CHUNK_SEGMENTS,
        CHUNK_SEGMENTS
    );

    const vertices = geometry.attributes.position.array;
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    let hasWater = false; // Track if this chunk needs water

    for (let i = 0; i < vertices.length; i += 3) {
        const localX = vertices[i];
        const localY = vertices[i + 1];

        const worldPosX = worldX + localX;
        const worldPosZ = worldZ - localY;


        let height = getHeight(worldPosX, worldPosZ, state);
        
        vertices[i + 2] = height;
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);

        // Check if any vertex is below water level
        if (height < state.waterLevel) {
            hasWater = true;
        }
    }

    console.log(`Chunk (${chunkX}, ${chunkZ}) at world (${worldX}, ${worldZ}), local height: [${minHeight.toFixed(2)}, ${maxHeight.toFixed(2)}]`);

    geometry.computeVertexNormals();

    const colors = generateTerrainColors(vertices, state.globalMinHeight, state.globalMaxHeight);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        metalness: 0.2,
        flatShading: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(worldX, 0, worldZ);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    state.scene.add(mesh);

    // Only create water chunk if terrain is below water level
    let waterMesh = null;
    if (hasWater) {
        waterMesh = createWaterChunk(chunkX, chunkZ);
    }

    const waterLevelForTrees = state.globalMinHeight + (state.globalMaxHeight - state.globalMinHeight) * 0.15;
    placeTreesInChunk(state, TREES_PER_CHUNK, minHeight, maxHeight, waterLevelForTrees,
        vertices, worldX, worldZ);

    const chunk = {
        mesh: mesh,
        waterMesh: waterMesh,
        geometry: geometry,
        vertices: vertices,
        minHeight: minHeight,
        maxHeight: maxHeight,
        worldX: worldX,
        worldZ: worldZ,
        trees: []
    };

    state.chunks.set(key, chunk);
    console.log(`Created chunk at (${chunkX}, ${chunkZ})${hasWater ? ' with water' : ''}`);

    return chunk;
}

function generateTerrainColors(vertices, globalMinHeight, globalMaxHeight) {
    const colors = [];

    for (let i = 0; i < vertices.length; i += 3) {
        const height = vertices[i + 2];
        const normalizedHeight = (height - globalMinHeight) / (globalMaxHeight - globalMinHeight);

        let r, g, b;

        if (normalizedHeight < SAND_LEVEL) {
            const t = normalizedHeight / SAND_LEVEL;
            r = THREE.MathUtils.lerp(0.85, 0.95, t);
            g = THREE.MathUtils.lerp(0.75, 0.87, t);
            b = THREE.MathUtils.lerp(0.50, 0.65, t);
        } else if (normalizedHeight < LIGHT_GRASS_LEVEL) {
            const t = (normalizedHeight - SAND_LEVEL) / (LIGHT_GRASS_LEVEL - SAND_LEVEL);
            r = THREE.MathUtils.lerp(0.95, 0.55, t);
            g = THREE.MathUtils.lerp(0.87, 0.75, t);
            b = THREE.MathUtils.lerp(0.65, 0.35, t);
        } else if (normalizedHeight < DARK_GRASS_LEVEL) {
            const t = (normalizedHeight - LIGHT_GRASS_LEVEL) / (DARK_GRASS_LEVEL - LIGHT_GRASS_LEVEL);
            r = THREE.MathUtils.lerp(0.55, 0.25, t);
            g = THREE.MathUtils.lerp(0.75, 0.65, t);
            b = THREE.MathUtils.lerp(0.35, 0.25, t);
        } else if (normalizedHeight < LIGHT_ROCK_LEVEL) {
            const t = (normalizedHeight - DARK_GRASS_LEVEL) / (LIGHT_ROCK_LEVEL - DARK_GRASS_LEVEL);
            r = THREE.MathUtils.lerp(0.25, 0.55, t);
            g = THREE.MathUtils.lerp(0.65, 0.52, t);
            b = THREE.MathUtils.lerp(0.25, 0.50, t);
        } else {
            const t = (normalizedHeight - LIGHT_ROCK_LEVEL) / (1.0 - LIGHT_ROCK_LEVEL);
            r = THREE.MathUtils.lerp(0.55, 0.30, t);
            g = THREE.MathUtils.lerp(0.52, 0.28, t);
            b = THREE.MathUtils.lerp(0.50, 0.27, t);
        }

        const shiftedHeight = height - globalMinHeight;
        const heightMod = shiftedHeight % CONTOUR_INTERVAL;
        const isContourLine = heightMod < CONTOUR_THICKNESS || 
                             heightMod > (CONTOUR_INTERVAL - CONTOUR_THICKNESS);

        if (isContourLine) {
            r *= 0.9;
            g *= 0.9;
            b *= 0.9;
        }

        colors.push(r, g, b);
    }

    return colors;
}

export function removeChunk(chunkX, chunkZ) {
    const state = getState();
    const key = chunkKey(chunkX, chunkZ);
    const chunk = state.chunks.get(key);
    
    if (chunk) {
        // Remove terrain mesh
        state.scene.remove(chunk.mesh);
        chunk.geometry.dispose();
        chunk.mesh.material.dispose();
        
        // Remove trees
        if (chunk.trees) {
            chunk.trees.forEach(tree => {
                state.scene.remove(tree);
                tree.geometry?.dispose();
            });
        }
        
        state.chunks.delete(key);
    }

    // Remove water chunk
    const waterMesh = state.waterChunks.get(key);
    if (waterMesh) {
        state.scene.remove(waterMesh);
        waterMesh.geometry.dispose();
        waterMesh.material.dispose();
        state.waterChunks.delete(key);
    }

    console.log(`Removed chunk at (${chunkX}, ${chunkZ})`);
}

export function updateChunks() {
    const state = getState();
    const playerChunk = getChunkCoords(state.player.position.x, state.player.position.z);
    
    // Only update if player moved to a new chunk
    if (playerChunk.x === state.lastPlayerChunk.x && playerChunk.z === state.lastPlayerChunk.z) {
        return;
    }

    state.lastPlayerChunk = playerChunk;

    const newActiveChunks = new Set();

    // Determine which chunks should be loaded
    for (let x = playerChunk.x - RENDER_DISTANCE; x <= playerChunk.x + RENDER_DISTANCE; x++) {
        for (let z = playerChunk.z - RENDER_DISTANCE; z <= playerChunk.z + RENDER_DISTANCE; z++) {
            const key = chunkKey(x, z);
            newActiveChunks.add(key);
            
            // Create chunk if it doesn't exist
            if (!state.chunks.has(key)) {
                createChunk(x, z);
            }
        }
    }

    // Remove chunks that are no longer needed
    for (const key of state.activeChunkCoords) {
        if (!newActiveChunks.has(key)) {
            const [x, z] = key.split(',').map(Number);
            removeChunk(x, z);
        }
    }

    state.activeChunkCoords = newActiveChunks;
    console.log(`Active chunks: ${state.activeChunkCoords.size}`);
}

// In terrain.js, update getTerrainHeightAt to match the compressed terrain
export function getTerrainHeightAt(worldX, worldZ) {

    const state = getState();
    return getHeight(worldX, worldZ, state);
        
}

