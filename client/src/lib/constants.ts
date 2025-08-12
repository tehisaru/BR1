export enum PLAYER {
  RED = "red",
  BLUE = "blue",
  ORANGE = "orange",
  BLACK = "black"
}

// Colors as requested:
// BLUE: (55, 114, 255) - royal blue
// RED: (223, 41, 53) - bright red
// BLACK: (8, 7, 8) - near black
// YELLOW: (253, 202, 64) - golden yellow

export const PLAYER_COLORS = {
  [PLAYER.BLUE]: "rgb(55, 114, 255)",   // Royal blue
  [PLAYER.RED]: "rgb(223, 41, 53)",     // Bright red
  [PLAYER.BLACK]: "rgb(8, 7, 8)",      // Black
  [PLAYER.ORANGE]: "rgb(255, 115, 0)"  // Violet purple
};

export const PLAYER_BG_COLORS = {
  [PLAYER.BLUE]: "rgb(13, 27, 64)",    // Darker royal blue
  [PLAYER.RED]: "rgb(56, 10, 13)",     // Darker bright red
  [PLAYER.BLACK]: "rgb(10, 10, 10)",    // Darker black
  [PLAYER.ORANGE]: "rgb(85, 37, 0)"   // Darker orange purple
};

export const CELL_SIZE = 60;
export const DOT_SIZE = 20;
export const DOT_MARGIN = 5;

export const DOT_POSITIONS = {
  1: [{ x: 0, y: 0 }], // Center
  2: [{ x: -10, y: 0 }, { x: 10, y: 0 }], // Horizontal
  3: [{ x: 0, y: -10 }, { x: -10, y: 10 }, { x: 10, y: 10 }], // Triangle
  4: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: -10, y: 10 }, { x: 10, y: 10 }], // Square
};

export const ANIMATION_DURATION = 300; // ms (exactly 0.3 seconds)
