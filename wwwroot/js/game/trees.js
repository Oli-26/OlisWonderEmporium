// trees.js - Tree generation
import * as THREE from 'https://esm.sh/three@0.158.0';
import { getState } from './globals.js';
import { SeededRandom } from './noise.js';
import {CHUNK_SIZE, LIGHT_GRASS_LEVEL, LIGHT_ROCK_LEVEL, WORLD_SEED} from './constants.js';
import { getTerrainHeightAt } from './terrain.js';

export function createTree(x, groundY, z) {
    const state = getState();

    // Create a parent group for the entire tree
    const treeGroup = new THREE.Group();

    // Trunk - slimmer (0.3 top, 0.4 bottom instead of 0.5, 0.7)
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 5, 6);
    const trunk = new THREE.Mesh(trunkGeometry, state.trunkMaterial);
    trunk.position.set(0, 2.5, 0); // Position relative to group origin
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Foliage layers - slimmer (reduced radius, kept height)
    const foliage1 = new THREE.Mesh(
        new THREE.ConeGeometry(2, 4, 6), // Was 3, now 2
        state.foliageMaterial
    );
    foliage1.position.set(0, 5 + 2, 0);
    foliage1.castShadow = true;
    treeGroup.add(foliage1);

    const foliage2 = new THREE.Mesh(
        new THREE.ConeGeometry(1.6, 3.5, 6), // Was 2.5, now 1.6
        state.foliageMaterial
    );
    foliage2.position.set(0, 5 + 4 + 1.75, 0);
    foliage2.castShadow = true;
    treeGroup.add(foliage2);

    const foliage3 = new THREE.Mesh(
        new THREE.ConeGeometry(1.3, 3, 6), // Was 2, now 1.3
        state.foliageMaterial
    );
    foliage3.position.set(0, 5 + 4 + 3.5 + 1.5, 0);
    foliage3.castShadow = true;
    treeGroup.add(foliage3);

    // Position the entire tree group
    treeGroup.position.set(x, groundY, z);

    // Scale down the entire tree (adjust this value to your preference)
    treeGroup.scale.setScalar(0.2); // Makes tree 50% smaller

    state.scene.add(treeGroup);

    return treeGroup; // Return in case you need to reference it later
}
export function placeTreesInChunk(state, numberOfTrees, minHeight, maxHeight, waterLevel,
                                  vertices, worldX, worldZ) {
    const chunkTreeSeed = WORLD_SEED + worldX * 1000 + worldZ;
    const treeRandom = new SeededRandom(chunkTreeSeed);

    // Use waterLevel directly, not relative to chunk's min/max
    const beachHeight = (state.globalMinHeight + (state.globalMaxHeight - state.globalMinHeight) * LIGHT_GRASS_LEVEL); // Trees start 2 units above water
    const mountainHeight = (state.globalMinHeight + (state.globalMaxHeight - state.globalMinHeight) * LIGHT_ROCK_LEVEL) + (maxHeight - waterLevel) * 0.75; // Upper terrain

    // Create forest clusters
    const numClusters = Math.floor(numberOfTrees / 8);

    for (let c = 0; c < numClusters; c++) {
        // Pick a random cluster center
        const clusterCenterX = (treeRandom.random() - 0.5) * CHUNK_SIZE;
        const clusterCenterZ = (treeRandom.random() - 0.5) * CHUNK_SIZE;

        const clusterCenterHeight = getTerrainHeightAt(worldX + clusterCenterX, worldZ + clusterCenterZ);

        // Skip this cluster if center is underwater or too high
        if (clusterCenterHeight <= beachHeight || clusterCenterHeight >= mountainHeight) {
            continue;
        }

        // Place 6-12 trees around this cluster center
        const treesInCluster = Math.floor(treeRandom.random() * 14) + 8;
        const clusterRadius = 1 + treeRandom.random() * 4;

        for (let t = 0; t < treesInCluster; t++) {
            const angle = treeRandom.random() * Math.PI * 2;
            const distance = Math.sqrt(treeRandom.random()) * clusterRadius;

            const localX = clusterCenterX + Math.cos(angle) * distance;
            const localZ = clusterCenterZ + Math.sin(angle) * distance;

            // Make sure tree is within chunk bounds
            if (Math.abs(localX) > CHUNK_SIZE / 2 || Math.abs(localZ) > CHUNK_SIZE / 2) {
                continue;
            }

            const terrainHeight = getTerrainHeightAt(worldX + localX, worldZ + localZ);

            // CRITICAL: Check against absolute waterLevel, not relative heights
            if (terrainHeight > beachHeight && terrainHeight < mountainHeight) {
                createTree(worldX + localX, terrainHeight, worldZ + localZ);
            }
        }
    }
}