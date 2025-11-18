// noise.js - Noise generation utilities

import { DETAIL_SCALE, HEIGHT_MULTIPLIER, NOISE_SCALE, RIDGE_SCALE } from "./constants.js";

export class SeededRandom {
    constructor(seed) {
        this.seed = seed;
        this.originalSeed = seed;
    }

    random() {
        const x = Math.sin(this.seed++) * 10000;
        return x - Math.floor(x);
    }

    noise2D(x, y, offset = 0) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + this.originalSeed + offset) * 43758.5453;
        return (n - Math.floor(n)) * 2 - 1;
    }
}

export function improvedNoise(x, z, seededRandom, scale, modulateDetail = false, modulePow = 2.0) {
    let total = 0;
    let frequency = 1.0;
    let amplitude = 1.0;
    let maxValue = 0;
    const octaves = 6;
    const persistence = 0.5;
    const lacunarity = 2.0;

    for (let i = 0; i < octaves; i++) {
        const offsetX = seededRandom.originalSeed * 0.1 + i * 100;
        const offsetZ = seededRandom.originalSeed * 0.2 + i * 200;

        const sampleX = (x + offsetX) * frequency * scale;
        const sampleZ = (z + offsetZ) * frequency * scale;

        const noiseValue = Math.sin(sampleX) * Math.cos(sampleZ) +
            Math.sin(sampleX * 2 + sampleZ) * 0.5 +
            Math.cos(sampleX + sampleZ * 2) * 0.25;

        // Apply modulation to higher octaves (detail) based on accumulated height
        let effectiveAmplitude = amplitude;
        if (modulateDetail && i >= 2) { // Only modulate octaves 2+ (detail layers)
            // Normalize accumulated total to roughly 0-1 range
            const currentHeight = total / (maxValue || 1); // Prevent division by zero
            // Reduce detail at low elevations, full detail at high
            const detailModulator = Math.pow((currentHeight + 1.0) / 2.0, modulePow);
            effectiveAmplitude *= detailModulator;
        }

        total += noiseValue * effectiveAmplitude;
        maxValue += amplitude; // Keep maxValue consistent for normalization

        amplitude *= persistence;
        frequency *= lacunarity;
    }

    return total / maxValue;
}

export function compressMiddleElevations(height, globalMin, globalMax) {
    const range = globalMax - globalMin;

    // Normalize height to 0-1 range
    const normalized = (height - globalMin) / range;

    // Define biome transition points
    const waterEnd = 0.25;      // End of water
    const beachEnd = 0.3;      // End of beach
    const grassEnd = 0.80;      // End of grass (start of mountains)

    let compressed;

    if (normalized < waterEnd) {
        // Water - keep as is
        compressed = normalized;
    } else if (normalized < beachEnd) {
        // Beach - heavily flatten (compress to 10% of original height)
        const beachRange = beachEnd - waterEnd;
        const normalizedInBeach = (normalized - waterEnd) / beachRange;
        const compressedBeachRange = beachRange * 0.1;
        compressed = waterEnd + normalizedInBeach * compressedBeachRange;
    } else if (normalized < grassEnd) {
        // Grass - moderately flatten (compress to 40% of original height)
        const grassRange = grassEnd - beachEnd;
        const normalizedInGrass = (normalized - beachEnd) / grassRange;
        const compressedGrassRange = grassRange * 0.4;
        const beachTop = waterEnd + (beachEnd - waterEnd) * 0.1;
        compressed = beachTop + normalizedInGrass * compressedGrassRange;
    } else {
        // Mountains - progressively expand using a power curve for dramatic peaks
        const mountainRange = 1.0 - grassEnd;
        const normalizedInMountain = (normalized - grassEnd) / mountainRange;

        // Use power of 1.9 to make mountains progressively steeper
        const expandedMountain = Math.pow(normalizedInMountain, 1.9);

        const grassTop = waterEnd + (beachEnd - waterEnd) * 0.1 + (grassEnd - beachEnd) * 0.4;
        const remainingSpace = 1.0 - grassTop;
        compressed = grassTop + expandedMountain * remainingSpace;
    }

    // Convert back to world height
    return globalMin + compressed * range;
}

// noise.js - Update getHeight to handle initialization
export function getHeight(x, z, state, skipCompression = false) {
    let height = improvedNoise(x, z, state.globalSeededRandom, NOISE_SCALE, true, 3.5);

    const ridgeNoise = Math.abs(improvedNoise(x * 0.7, z * 0.7, state.globalSeededRandom, RIDGE_SCALE, true, 3));
    height += ridgeNoise * 0.4;

    const detailNoise = improvedNoise(x * 1.5, z * 1.5, state.globalSeededRandom, DETAIL_SCALE, true, 3.5);
    height += detailNoise * 0.3;

    height *= HEIGHT_MULTIPLIER;

    // Only compress if global min/max are set and compression is not skipped
    if (!skipCompression && state.globalMinHeight !== Infinity && state.globalMaxHeight !== -Infinity) {
        height = compressMiddleElevations(height, state.globalMinHeight, state.globalMaxHeight);
    }

    return height;
}