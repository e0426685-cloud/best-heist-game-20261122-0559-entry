// The autopilot: steers the thief along an A* path to the nearest loot, then to the
// exit — and, while any guard or camera is onto it, flees to the nearest shadow tile
// out of the guards' way instead of standing in the open waiting to be spotted. It
// never steps onto a tile a guard or camera can currently see, so it waits out the
// patrol gaps the way a careful player would. Shared by the screenshot scenes and
// the logic tests, so both play by the same rules.
import { COLS, GUARD, ROWS, TILE } from './config.js';
import { isWall, tileAt, TILE_SHADOW } from './levels.js';
import { findPathCost, hasLineOfSight } from './pathfind.js';

function tileCenter(tx) {
  return tx * TILE + TILE / 2;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Can `eye` (x, y, facing, range, half-angle) see the point (x, y)? */
function canSeePoint(grid, eye, x, y) {
  const dx = x - eye.x;
  const dy = y - eye.y;
  const dist = Math.hypot(dx, dy);
  if (dist > eye.range) return false;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), eye.angle)) > eye.halfAngle) return false;
  return hasLineOfSight(grid, eye.x, eye.y, x, y);
}

function observers(state) {
  // Guards only: a camera only feeds the alarm, so a thief can dash through its
  // cone — but a guard's cone is a chase waiting to happen, and the autopilot
  // plans around those.
  const list = [];
  for (const guard of state.guards) {
    list.push({ x: guard.x, y: guard.y, angle: guard.angle, range: GUARD.viewRange, halfAngle: GUARD.viewHalfAngle });
  }
  return list;
}

/** Whether any guard or camera can currently see the point (x, y). */
function pointVisible(state, x, y) {
  for (const eye of observers(state)) {
    if (canSeePoint(state.grid, eye, x, y)) return true;
  }
  return false;
}

/** The autopilot's current objective: the nearest uncollected loot, else the exit. */
function objective(state) {
  let best = null;
  let bestDist = Infinity;
  for (const item of state.loot) {
    if (item.got) continue;
    const d = Math.hypot(item.x - state.player.x, item.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best ?? state.exit;
}

function stepToward(world, tx, ty, cache) {
  const state = world.state;
  const sx = Math.floor(state.player.x / TILE);
  const sy = Math.floor(state.player.y / TILE);
  if (sx === tx && sy === ty) return { dx: 0, dy: 0, run: false };
  const grid = getCostGrid(world, cache);
  const path = findPathCost(state.grid, sx, sy, tx, ty, (x, y) => grid[y][x]);
  if (!path || path.length < 2) return { dx: 0, dy: 0, run: false };
  const [nx, ny] = path[1];
  const dx = tileCenter(nx) - state.player.x;
  const dy = tileCenter(ny) - state.player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return { dx: 0, dy: 0, run: false };
  return { dx: dx / dist, dy: dy / dist, run: false, next: [nx, ny] };
}

/**
 * The tiles the guards patrol on (the axis-aligned segments between consecutive
 * waypoints). The autopilot's routes pay extra near them, so it crosses a patrol
 * lane at a right angle instead of strolling along it.
 */
function laneTiles(state) {
  const tiles = new Set();
  for (const guard of state.guards) {
    const wps = guard.waypoints;
    for (let i = 0; i < wps.length; i += 1) {
      const [ax, ay] = wps[i];
      const [bx, by] = wps[(i + 1) % wps.length];
      const dx = Math.sign(bx - ax);
      const dy = Math.sign(by - ay);
      let x = ax;
      let y = ay;
      tiles.add(`${x},${y}`);
      while (x !== bx || y !== by) {
        if (x !== bx) x += dx;
        else y += dy;
        tiles.add(`${x},${y}`);
      }
    }
  }
  return tiles;
}

/**
 * Extra path cost near patrol lanes: on a lane 12, one tile off 6, two off 2.
 * Computed once per level and cached on the caller's cache object, so the A*
 * that runs every step pays one array lookup per neighbour, not a set scan.
 */
function getCostGrid(world, cache) {
  if (cache.costGrid && cache.costLevel === world.state.levelIndex) return cache.costGrid;
  const lanes = laneTiles(world.state);
  const grid = [];
  for (let ty = 0; ty < ROWS; ty += 1) {
    const row = new Array(COLS).fill(0);
    for (let tx = 0; tx < COLS; tx += 1) {
      let best = Infinity;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (lanes.has(`${tx + dx},${ty + dy}`)) best = Math.min(best, Math.max(Math.abs(dx), Math.abs(dy)));
        }
      }
      row[tx] = best === 0 ? 12 : best === 1 ? 6 : best === 2 ? 2 : 0;
    }
    grid.push(row);
  }
  cache.costGrid = grid;
  cache.costLevel = world.state.levelIndex;
  return grid;
}

/**
 * The nearest shadow tile to hide in. Tiles a guard is standing next to, or walking
 * toward on its patrol, are skipped; when every shadow fails the strict test, the
 * nearest shadow of all is returned rather than none.
 */
function refuge(world, cache) {
  const state = world.state;
  const sx = Math.floor(state.player.x / TILE);
  const sy = Math.floor(state.player.y / TILE);
  const grid = getCostGrid(world, cache);
  const cost = (x, y) => grid[y][x];
  let best = null;
  let bestLen = Infinity;
  let fallback = null;
  let fallbackLen = Infinity;
  for (let ty = 0; ty < ROWS; ty += 1) {
    for (let tx = 0; tx < COLS; tx += 1) {
      if (tileAt(state.grid, tx, ty) !== TILE_SHADOW) continue;
      const cx = tileCenter(tx);
      const cy = tileCenter(ty);
      const path = findPathCost(state.grid, sx, sy, tx, ty, cost);
      if (!path) continue;
      // Score the way there, not just the refuge: a short path that runs past a
      // guard is worse than a long safe one. Each path tile near a guard costs 2.
      let score = path.length;
      let pathSafe = true;
      for (const [px, py] of path) {
        for (const guard of state.guards) {
          const d = Math.hypot(guard.x - tileCenter(px), guard.y - tileCenter(py));
          if (d < 120) {
            pathSafe = false;
            break;
          }
          if (d < 180) score += 2;
        }
        if (!pathSafe) break;
      }
      if (!pathSafe) continue;
      if (score < fallbackLen) {
        fallbackLen = score;
        fallback = [tx, ty];
      }
      let bad = false;
      for (const guard of state.guards) {
        if (Math.hypot(guard.x - cx, guard.y - cy) < 200) {
          bad = true;
          break;
        }
        // A patrolling guard's next waypoint: do not hide where it is headed.
        if (guard.state === 'patrol') {
          const [wx, wy] = guard.waypoints[guard.wpIndex];
          if (Math.hypot(tileCenter(wx) - cx, tileCenter(wy) - cy) < 80) {
            bad = true;
            break;
          }
        }
        if (guard.state !== 'patrol' && guard.lastSeen
          && Math.hypot(guard.lastSeen.x - cx, guard.lastSeen.y - cy) < 80) {
          bad = true;
          break;
        }
      }
      if (bad) continue;
      if (score < bestLen) {
        bestLen = score;
        best = [tx, ty];
      }
    }
  }
  return best ?? fallback;
}

/** One fleeing step away from `threat`: the walkable neighbour best aligned with the away direction. */
function fleeStep(world, threat) {
  const state = world.state;
  const px = Math.floor(state.player.x / TILE);
  const py = Math.floor(state.player.y / TILE);
  const awayLen = Math.hypot(state.player.x - threat.x, state.player.y - threat.y) || 1;
  const ax = (state.player.x - threat.x) / awayLen;
  const ay = (state.player.y - threat.y) / awayLen;
  let best = null;
  let bestScore = -Infinity;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tx = px + dx;
      const ty = py + dy;
      if (isWall(state.grid, tx, ty)) continue;
      const cx = tileCenter(tx);
      const cy = tileCenter(ty);
      const dirLen = Math.hypot(cx - state.player.x, cy - state.player.y) || 1;
      const dot = ((cx - state.player.x) / dirLen) * ax + ((cy - state.player.y) / dirLen) * ay;
      const dist = Math.hypot(cx - threat.x, cy - threat.y);
      const score = dot * 100 + dist;
      if (score > bestScore) {
        bestScore = score;
        best = [cx, cy];
      }
    }
  }
  if (!best) return { dx: 0, dy: 0, run: false };
  const mx = best[0] - state.player.x;
  const my = best[1] - state.player.y;
  const m = Math.hypot(mx, my) || 1;
  return { dx: mx / m, dy: my / m, run: true };
}

/**
 * One step's steering for `world`. Returns { dx, dy, run }.
 * `cache` is a small object the caller keeps between steps for the refuge target.
 */
export function autopilotMove(world, cache) {
  const state = world.state;
  let hot = false;
  for (const guard of state.guards) {
    if (guard.alert > 0.25 || guard.state === 'chase') {
      hot = true;
      break;
    }
  }
  if (!hot && pointVisible(state, state.player.x, state.player.y)) hot = true;
  if (hot) {
    // A guard right on top of the thief: run straight away from it first, before
    // picking a refuge — a refuge behind the guard is no refuge at all. Step to
    // the walkable neighbour best aligned with "away from the guard", so the
    // thief slides along walls instead of pressing into a corner.
    let threat = null;
    let threatDist = Infinity;
    for (const guard of state.guards) {
      if (guard.state !== 'chase' && guard.alert <= 0.25) continue;
      const d = Math.hypot(guard.x - state.player.x, guard.y - state.player.y);
      if (d < threatDist) {
        threat = guard;
        threatDist = d;
      }
    }
    if (threat && threatDist < 260) return fleeStep(world, threat);
    if (!cache.refuge || cache.refugeAge === undefined || cache.refugeAge > 30) {
      cache.refuge = refuge(world, cache);
      cache.refugeAge = 0;
    } else {
      cache.refugeAge += 1;
    }
    if (cache.refuge) {
      const [tx, ty] = cache.refuge;
      const px = Math.floor(state.player.x / TILE);
      const py = Math.floor(state.player.y / TILE);
      if (px === tx && py === ty) {
        let guardNear = false;
        for (const guard of state.guards) {
          // In the dark the thief holds still unless a guard is nearly on top
          // of them; out in the open any guard nearby means keep moving.
          const near = tileAt(state.grid, px, py) === TILE_SHADOW ? 90 : 170;
          if (Math.hypot(guard.x - state.player.x, guard.y - state.player.y) < near) {
            guardNear = true;
            break;
          }
        }
        if (!guardNear && !pointVisible(state, state.player.x, state.player.y)) {
          return { dx: 0, dy: 0, run: false };
        }
        cache.refuge = null;
      }
      // Already spotted: run for the shadow — speed beats stealth now.
      const move = stepToward(world, tx, ty, cache);
      return { dx: move.dx, dy: move.dy, run: true };
    }
    return { dx: 0, dy: 0, run: false };
  }
  cache.refuge = null;
  cache.refugeAge = 0;
  const target = objective(state);
  const move = stepToward(world, Math.floor(target.x / TILE), Math.floor(target.y / TILE), cache);
  // Do not step onto a tile a guard or camera can currently see: wait for the gap.
  if (move.next && pointVisible(state, tileCenter(move.next[0]), tileCenter(move.next[1]))) {
    return { dx: 0, dy: 0, run: false };
  }
  return move;
}
