// The three heists. Each level is data: wall and shadow rectangles in tile units on
// a 32x18 grid (the border is always wall), loot and exit tiles, the thief's start,
// guard patrol loops and wall-mounted cameras. buildLevel turns the data into the
// tile grid the world and the pathfinder share.
import { COLS, ROWS } from './config.js';

export const TILE_WALL = 1;
export const TILE_FLOOR = 0;
export const TILE_SHADOW = 2;

export const LEVELS = [
  {
    name: 'The Lobby',
    sub: 'Midnight at the Meridian Hotel',
    walls: [
      { x: 3, y: 7, w: 4, h: 2 }, // reception desk (clear of the patrol lanes)
      { x: 18, y: 9, w: 1, h: 3 }, // pillar
      { x: 24, y: 11, w: 3, h: 2 }, // planters
      { x: 4, y: 14, w: 5, h: 1 }, // low wall
    ],
    shadows: [
      { x: 6, y: 1, w: 4, h: 3 },
      { x: 24, y: 14, w: 5, h: 3 },
      { x: 12, y: 12, w: 3, h: 2 },
    ],
    loot: [
      [27, 2],
      [3, 15],
      [12, 9],
    ],
    exit: [30, 9],
    player: [2, 2],
    guards: [
      { waypoints: [[8, 3], [8, 12], [20, 12], [20, 3]] },
      { waypoints: [[24, 5], [28, 5], [28, 14], [14, 14], [14, 5]] },
    ],
    cameras: [
      { x: 16, y: 0, angle: Math.PI / 2, sweep: 0.4, period: 8 },
    ],
  },
  {
    name: 'The Gallery',
    sub: 'The Halcyon Collection, after hours',
    walls: [
      { x: 8, y: 2, w: 1, h: 6 }, // partition, upper
      { x: 8, y: 10, w: 1, h: 5 }, // partition, lower
      { x: 20, y: 2, w: 2, h: 2 }, // plinth
      { x: 20, y: 14, w: 2, h: 2 }, // plinth
      { x: 15, y: 9, w: 2, h: 2 }, // display case (clear of the patrol lanes)
      { x: 26, y: 8, w: 1, h: 4 }, // partition
    ],
    shadows: [
      { x: 2, y: 14, w: 4, h: 3 },
      { x: 26, y: 2, w: 4, h: 3 },
      { x: 13, y: 13, w: 3, h: 2 },
    ],
    loot: [
      [29, 15],
      [2, 2],
      [24, 8],
      [11, 15],
    ],
    exit: [30, 2],
    player: [2, 15],
    guards: [
      { waypoints: [[6, 4], [6, 13], [14, 13], [14, 4]] },
      { waypoints: [[22, 4], [28, 4], [28, 13], [22, 13]] },
      { waypoints: [[10, 8], [18, 8], [18, 12], [10, 12]] },
    ],
    cameras: [
      { x: 0, y: 8, angle: 0, sweep: 0.5, period: 5 },
      { x: 31, y: 5, angle: Math.PI, sweep: 0.5, period: 7 },
    ],
  },
  {
    name: 'The Vault',
    sub: 'The Aurelia Bank, sub-basement',
    walls: [
      { x: 10, y: 2, w: 1, h: 5 }, // vault wall, upper
      { x: 10, y: 9, w: 1, h: 5 }, // vault wall, lower (gap at rows 7-8)
      { x: 21, y: 4, w: 1, h: 5 }, // vault wall, upper (gap at rows 2-3)
      { x: 21, y: 11, w: 1, h: 5 }, // vault wall, lower (gap at rows 9-10)
      { x: 26, y: 2, w: 3, h: 2 }, // safe block
      { x: 26, y: 14, w: 3, h: 2 }, // safe block
      { x: 3, y: 8, w: 2, h: 2 }, // desk (clear of the patrol lanes)
    ],
    shadows: [
      { x: 2, y: 2, w: 3, h: 3 },
      { x: 15, y: 14, w: 4, h: 3 },
      { x: 27, y: 8, w: 3, h: 3 },
      { x: 8, y: 15, w: 4, h: 2 }, // cover for the bottom crossing, west of the patrol
    ],
    loot: [
      [29, 2],
      [29, 15],
      [3, 15],
      [15, 3],
      [18, 15],
    ],
    exit: [30, 8],
    player: [2, 8],
    guards: [
      { waypoints: [[5, 4], [5, 13], [8, 13], [8, 4]] },
      { waypoints: [[13, 3], [13, 14], [19, 14], [19, 3]] },
      { waypoints: [[24, 5], [24, 12], [28, 12], [28, 5]] },
    ],
    cameras: [
      { x: 15, y: 0, angle: Math.PI / 2, sweep: 0.6, period: 6 },
      { x: 0, y: 3, angle: 0, sweep: 0.5, period: 5 },
      { x: 31, y: 9, angle: Math.PI, sweep: 0.5, period: 7 },
    ],
  },
];

/** Turn level data into the tile grid (rows of TILE_*), with the border walled in. */
export function buildLevel(def) {
  const grid = [];
  for (let y = 0; y < ROWS; y += 1) {
    const row = new Array(COLS).fill(TILE_FLOOR);
    for (let x = 0; x < COLS; x += 1) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row[x] = TILE_WALL;
    }
    grid.push(row);
  }
  for (const r of def.walls) {
    for (let y = r.y; y < r.y + r.h; y += 1) {
      for (let x = r.x; x < r.x + r.w; x += 1) grid[y][x] = TILE_WALL;
    }
  }
  for (const r of def.shadows) {
    for (let y = r.y; y < r.y + r.h; y += 1) {
      for (let x = r.x; x < r.x + r.w; x += 1) {
        if (grid[y][x] === TILE_FLOOR) grid[y][x] = TILE_SHADOW;
      }
    }
  }
  return grid;
}

/** The tile at (tx, ty); off-grid counts as wall. */
export function tileAt(grid, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return TILE_WALL;
  return grid[ty][tx];
}

export function isWall(grid, tx, ty) {
  return tileAt(grid, tx, ty) === TILE_WALL;
}
