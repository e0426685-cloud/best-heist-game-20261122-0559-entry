// Grid pathfinding (A*, 4-directional) and line of sight (Bresenham over tiles),
// shared by the guards' patrols, the autopilot and the tests.
import { COLS, ROWS } from './config.js';
import { isWall } from './levels.js';

function key(tx, ty) {
  return ty * COLS + tx;
}

function heuristic(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/**
 * A path of [tx, ty] tiles from (sx, sy) to (gx, gy), inclusive of both ends,
 * or null when no route exists. Walls are impassable; shadow and floor are open.
 */
export function findPath(grid, sx, sy, gx, gy) {
  return findPathCost(grid, sx, sy, gx, gy, null);
}

/**
 * Like findPath, but each step also pays `cost(tx, ty)` (extra cost per tile, or
 * null for the plain shortest path), so a caller can steer around danger.
 */
export function findPathCost(grid, sx, sy, gx, gy, cost) {
  if (isWall(grid, gx, gy) || isWall(grid, sx, sy)) return null;
  if (sx === gx && sy === gy) return [[sx, sy]];
  const open = [{ x: sx, y: sy, g: 0, f: heuristic(sx, sy, gx, gy), parent: null }];
  const best = new Map([[key(sx, sy), 0]]);
  const closed = new Set();
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bi].f) bi = i;
    const node = open.splice(bi, 1)[0];
    const nk = key(node.x, node.y);
    if (closed.has(nk)) continue;
    closed.add(nk);
    if (node.x === gx && node.y === gy) {
      const path = [];
      let cur = node;
      while (cur) {
        path.push([cur.x, cur.y]);
        cur = cur.parent;
      }
      path.reverse();
      return path;
    }
    for (const [dx, dy] of DIRS) {
      const nx = node.x + dx;
      const ny = node.y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (isWall(grid, nx, ny)) continue;
      const ng = node.g + 1 + (cost ? cost(nx, ny) : 0);
      const nkey = key(nx, ny);
      if (best.has(nkey) && best.get(nkey) <= ng) continue;
      best.set(nkey, ng);
      open.push({ x: nx, y: ny, g: ng, f: ng + heuristic(nx, ny, gx, gy), parent: node });
    }
  }
  return null;
}

/**
 * Whether a straight line between two pixel points crosses a wall tile.
 * The tile the line starts in never blocks it (so a wall-mounted camera can see out).
 */
export function hasLineOfSight(grid, x0, y0, x1, y1) {
  const { TILE } = { TILE: 40 };
  let tx0 = Math.floor(x0 / TILE);
  let ty0 = Math.floor(y0 / TILE);
  const tx1 = Math.floor(x1 / TILE);
  const ty1 = Math.floor(y1 / TILE);
  const dx = Math.abs(tx1 - tx0);
  const dy = Math.abs(ty1 - ty0);
  const sx = tx0 < tx1 ? 1 : -1;
  const sy = ty0 < ty1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    if (!(tx0 === Math.floor(x0 / TILE) && ty0 === Math.floor(y0 / TILE)) && isWall(grid, tx0, ty0)) return false;
    if (tx0 === tx1 && ty0 === ty1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      tx0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      ty0 += sy;
    }
  }
}
