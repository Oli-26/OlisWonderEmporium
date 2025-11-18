// constants.js - Game constants and configuration
export const TARGET_FPS = 60;
export const FRAME_TIME = 1000 / TARGET_FPS;
export const MAX_DELTA = 0.1;
export const WATER_UPDATE_RATE = 1 / 100;
export const PLAYER_SPEED = 0.2;
export const CAMERA_HEIGHT = 20;
export const PLAYER_HEIGHT = 0.5;
export const DAY_DURATION = 6000;

// Chunk system constants
export const CHUNK_SIZE = 25;
export const CHUNK_SEGMENTS = 150;
export const RENDER_DISTANCE = 3;
export const WORLD_SEED = Math.floor(Math.random() * 1000000);

// Terrain constants
export const NOISE_SCALE = 0.05;
export const RIDGE_SCALE = 0.1;
export const DETAIL_SCALE = 0.1;
export const HEIGHT_MULTIPLIER = 12;
export const TREES_PER_CHUNK = 20;

// Color level thresholds
export const SAND_LEVEL = 0.27;
export const LIGHT_GRASS_LEVEL = 0.28;
export const DARK_GRASS_LEVEL = 0.33;
export const LIGHT_ROCK_LEVEL = 0.54;
export const WATER_LEVEL = 0.26;

export const CONTOUR_INTERVAL = 0.2;
export const CONTOUR_THICKNESS = 0.01;
