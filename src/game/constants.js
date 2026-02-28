// ─────────────────────────────────────────────
// Game configuration
// ─────────────────────────────────────────────

export const GAME_CONFIG = {
  FPS:            60,
  WIDTH:          1280,
  HEIGHT:         720,
  ROAD_WIDTH:     2000,
  SEGMENT_LENGTH: 200,
  RUMBLE_LENGTH:  3,
  LANES:          2,
  FIELD_OF_VIEW:  100,    // degrees
  CAMERA_HEIGHT:  1000,
  DRAW_DISTANCE:  400,
  CENTRIFUGAL:    0.3,    // lateral push on curves
  SKY_SPEED:      0.001,  // parallax scroll rates
  HILL_SPEED:     0.002,
  TREE_SPEED:     0.003,
  TOTAL_CARS:     30,
  TOTAL_BIKES:    8,
};

// ─────────────────────────────────────────────
// Road segment colours
// ─────────────────────────────────────────────

export const COLORS = {
  LIGHT:  { road: '#696969', rumble: 'white', lane: 'white' },
  DARK:   { road: '#696969', rumble: 'grey' },
  START:  { road: 'white',  grass: 'white',  rumble: 'white' },
  FINISH: { road: 'black',  grass: 'black',  rumble: 'red'   },
};

// ─────────────────────────────────────────────
// Background image layer positions (in background.png)
// ─────────────────────────────────────────────

export const BACKGROUND_LAYERS = {
  HILLS: { x: 10, y:   5, w: 1280, h: 480 },
  SKY:   { x:  5, y: 495, w: 1280, h: 480 },
  TREES: { x:  5, y: 985, w: 1280, h: 480 },
};

// ─────────────────────────────────────────────
// Sprite source rectangles (inside sprites.png)
// ─────────────────────────────────────────────

export const SPRITES = {
  // Enemy bikes
  BIKE01: { x: 111, y:  0, w:  21, h: 50 },
  BIKE02: { x: 132, y:  0, w:  23, h: 50 },
  BIKE03: { x: 155, y:  0, w:  24, h: 50 },

  // Ground tile (used to fill the area between segments)
  GROUND: { x:   0, y: 103, w: 79, h: 13 },

  // Decorative boats
  BOAT01: { x: 354, y:  0, w: 118, h: 45 },
  BOAT02: { x: 497, y:  0, w:  89, h: 37 },
  BOAT03: { x: 354, y: 82, w: 156, h: 41 },

  // Decorative lighthouse
  LIGHTHOUSE: { x: 541, y: 54, w: 28, h: 69 },

  // Traffic cars
  CAR01: { x: 260, y:  0, w:  86, h: 70 },
  CAR02: { x: 179, y: 65, w:  82, h: 75 },

  // Roadside buildings
  BUILDING_LEFT:  { x: 1148, y:   3, w: 558, h: 965 },
  BUILDING_RIGHT: { x:  549, y: 158, w: 549, h: 740 },

  // Player animations
  PLAYER_KICK_LEFT:  { x: 179, y: 0, w: 34, h: 50 },
  PLAYER_KICK_RIGHT: { x: 213, y: 0, w: 34, h: 50 },
  PLAYER_LEFT:       { x:  27, y: 0, w: 25, h: 50 },
  PLAYER_STRAIGHT:   { x:   0, y: 0, w: 21, h: 50 },
  PLAYER_RIGHT:      { x:  58, y: 0, w: 25, h: 50 },
};

// Global scale factor that maps sprite pixels to road-width units
SPRITES.SCALE = 0.1 * (1 / SPRITES.PLAYER_STRAIGHT.w);

// Convenience groups for random selection
SPRITES.CARS      = [SPRITES.CAR01, SPRITES.CAR02];
SPRITES.BIKES     = [SPRITES.BIKE01, SPRITES.BIKE02, SPRITES.BIKE03];
SPRITES.SHIPS     = [SPRITES.BOAT01, SPRITES.BOAT02, SPRITES.BOAT03];
SPRITES.BUILDINGS = [SPRITES.BUILDING_LEFT, SPRITES.BUILDING_RIGHT];
