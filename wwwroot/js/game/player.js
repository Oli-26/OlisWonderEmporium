// player.js - Player creation and movement
import * as THREE from 'https://esm.sh/three@0.158.0';
import { getState } from './globals.js';
import { PLAYER_SPEED, PLAYER_HEIGHT, CAMERA_HEIGHT } from './constants.js';
import { updateChunks } from './terrain.js';
import { addRipple } from './water.js';

export function createPlayer() {
    const state = getState();
    
    const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        roughness: 0.5,
        metalness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;

    const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xff6666,
        roughness: 0.5,
        metalness: 0.3
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.7;
    head.castShadow = true;

    const noseGeometry = new THREE.ConeGeometry(0.15, 0.4, 6);
    const noseMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.35;
    nose.position.y = 0.7;
    nose.castShadow = true;

    state.player = new THREE.Group();
    state.player.add(body);
    state.player.add(head);
    state.player.add(nose);
    state.player.position.set(0, 0.5, 0);
    state.scene.add(state.player);
    updateChunks();
    
}

export function updatePlayer() {
    const state = getState();

    state.playerVelocity.x = 0;
    state.playerVelocity.z = 0;

    if (state.keys['w'] || state.keys['arrowup']) {
        state.playerVelocity.z -= PLAYER_SPEED;
    }
    if (state.keys['s'] || state.keys['arrowdown']) {
        state.playerVelocity.z += PLAYER_SPEED;
    }
    if (state.keys['a'] || state.keys['arrowleft']) {
        state.playerVelocity.x -= PLAYER_SPEED;
    }
    if (state.keys['d'] || state.keys['arrowright']) {
        state.playerVelocity.x += PLAYER_SPEED;
    }

    // Normalize diagonal movement
    if (state.playerVelocity.x !== 0 && state.playerVelocity.z !== 0) {
        const length = Math.sqrt(state.playerVelocity.x ** 2 + state.playerVelocity.z ** 2);
        state.playerVelocity.x = (state.playerVelocity.x / length) * PLAYER_SPEED;
        state.playerVelocity.z = (state.playerVelocity.z / length) * PLAYER_SPEED;
    }

    // Calculate new position
    const newX = state.player.position.x + state.playerVelocity.x;
    const newZ = state.player.position.z + state.playerVelocity.z;

    // Get current terrain height
    state._raycasterOrigin.set(state.player.position.x, 100, state.player.position.z);
    state.raycaster.set(state._raycasterOrigin, state._raycasterDirection);

    const terrainMeshes = Array.from(state.chunks.values()).map(chunk => chunk.mesh);
    const currentIntersects = state.raycaster.intersectObjects(terrainMeshes);

    let currentTerrainHeight = 0;
    if (currentIntersects.length > 0) {
        currentTerrainHeight = currentIntersects[0].point.y;
    }

    // Check terrain height at new position
    state._raycasterOrigin.set(newX, 100, newZ);
    state.raycaster.set(state._raycasterOrigin, state._raycasterDirection);

    const newIntersects = state.raycaster.intersectObjects(terrainMeshes);

    if (newIntersects.length > 0) {
        const newTerrainHeight = newIntersects[0].point.y;
        const heightDifference = newTerrainHeight - currentTerrainHeight;

        // Maximum climbable height (adjust this value to make climbing easier/harder)
        const MAX_CLIMB_HEIGHT = 1.5;

        // Only apply movement if the height difference is not too steep upward
        if (heightDifference <= MAX_CLIMB_HEIGHT) {
            state.player.position.x = newX;
            state.player.position.z = newZ;
            state.player.position.y = newTerrainHeight + PLAYER_HEIGHT;
        }
        // If too steep, don't move (player is blocked)

        // Check if player is in water and moving
        const isInWater = newTerrainHeight < state.waterLevel;
        const isMoving = (state.playerVelocity.x !== 0 || state.playerVelocity.z !== 0);
    }

    // Player rotation based on movement
    if (state.playerVelocity.x !== 0 || state.playerVelocity.z !== 0) {
        const angle = Math.atan2(state.playerVelocity.x, state.playerVelocity.z);
        const currentRotation = new THREE.Euler().setFromQuaternion(state.player.quaternion);
        currentRotation.y = angle;
        const targetQuat = new THREE.Quaternion().setFromEuler(currentRotation);
        state.player.quaternion.slerp(targetQuat, 0.2);
    }

    // Update camera to follow player
    const cameraOffset = CAMERA_HEIGHT * 0.5;
    state.camera.position.x = state.player.position.x;
    state.camera.position.y = state.player.position.y + CAMERA_HEIGHT;
    state.camera.position.z = state.player.position.z + cameraOffset;
    state.camera.lookAt(state.player.position.x, state.player.position.y, state.player.position.z);

    // Update chunks based on player position
    updateChunks();
}