// lighting.js - Lighting and day/night cycle
import * as THREE from 'https://esm.sh/three@0.158.0';
import { getState } from './globals.js';
import { DAY_DURATION } from './constants.js';

export function setupLighting() {
    const state = getState();
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    state.scene.add(ambientLight);

    state.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    state.directionalLight.position.set(100, 100, 10);
    state.directionalLight.castShadow = true;
    state.directionalLight.target.position.set(0, 0, 0);
    state.scene.add(state.directionalLight.target);

    state.directionalLight.shadow.mapSize.width = 2048;
    state.directionalLight.shadow.mapSize.height = 2048;
    state.directionalLight.shadow.camera.left = -150;
    state.directionalLight.shadow.camera.right = 150;
    state.directionalLight.shadow.camera.top = 150;
    state.directionalLight.shadow.camera.bottom = -150;
    state.directionalLight.shadow.camera.near = 0.1;
    state.directionalLight.shadow.camera.far = 10000;

    state.scene.add(state.directionalLight);
}

export function updateDayNightCycle(deltaTime) {
    const state = getState();
    
    // Update day time (0 to 1, then loops)
    state.dayTime += deltaTime / DAY_DURATION;
    if (state.dayTime >= 1) {
        state.dayTime = 0;
    }

    // Make day longer and night shorter by warping the time
    let adjustedTime;
    if (state.dayTime < 0.5) {
        adjustedTime = state.dayTime * 0.6;
    } else {
        adjustedTime = 0.3 + (state.dayTime - 0.5) * 1.4;
    }

    const sunAngle = adjustedTime * Math.PI * 2;
    const radius = 3000;
    const sunX = Math.cos(sunAngle - Math.PI / 2) * radius;
    let sunY = Math.sin(sunAngle - Math.PI / 2) * radius;

    const minSunHeight = radius * 0.15;
    if (sunY > 0) {
        sunY = Math.max(minSunHeight, sunY);
    }

    const sunZ = 0;
    state.directionalLight.position.set(sunX, sunY, sunZ);

    const sunHeight = Math.max(0, sunY / radius);
    const lightIntensity = Math.max(0.1, sunHeight * 0.8);
    state.directionalLight.intensity = lightIntensity;

    let lightColor;
    if (sunHeight < 0.1) {
        lightColor = new THREE.Color(0x6b8cae);
    } else if (sunHeight < 0.3) {
        const t = (sunHeight - 0.1) / 0.2;
        lightColor = new THREE.Color().lerpColors(
            new THREE.Color(0xff6b35),
            new THREE.Color(0xffffff),
            t
        );
    } else {
        lightColor = new THREE.Color(0xfffaec);
    }
    state.directionalLight.color = lightColor;

    const ambientIntensity = Math.max(0.2, sunHeight * 0.6);
    state.scene.children.find(child => child instanceof THREE.AmbientLight).intensity = ambientIntensity;

    if (sunHeight < 0.05) {
        state.scene.background = new THREE.Color(0x0a1929);
    } else if (sunHeight < 0.2) {
        const t = (sunHeight - 0.05) / 0.15;
        state.scene.background = new THREE.Color().lerpColors(
            new THREE.Color(0x0a1929),
            new THREE.Color(0xff7e5f),
            t
        );
    } else if (sunHeight < 0.4) {
        const t = (sunHeight - 0.2) / 0.2;
        state.scene.background = new THREE.Color().lerpColors(
            new THREE.Color(0xff7e5f),
            new THREE.Color(0x87ceeb),
            t
        );
    } else {
        state.scene.background = new THREE.Color(0x87ceeb);
    }
}
