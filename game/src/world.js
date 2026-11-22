// The game's rules and state, with no drawing and no browser in it: the thief, the
// guards and their vision cones, the sweeping cameras, loot, the exit, noise and the
// alarm meter. step() advances one fixed step and returns what happened as bit flags,
// so the caller can react without the world knowing about screens or sound.
import {
  ALARM, ATTEMPTS, CAMERA, COIN, COLS, FIELD, GUARD, LEVEL_BONUS, LOOT_POINTS,
  PLAYER, ROWS, STEP, TILE, WIN_BONUS,
} from './config.js';
import { buildLevel, isWall, tileAt, TILE_SHADOW, TILE_WALL } from './levels.js';
import { LEVELS } from './levels.js';
import { findPath, hasLineOfSight } from './pathfind.js';

export const EVENT_LOOT = 1;
export const EVENT_CAUGHT = 2;
export const EVENT_LEVEL = 4;
export const EVENT_WIN = 8;
export const EVENT_OVER = 16;
export const EVENT_ALARM = 32;
export const EVENT_NOISE = 64;

function tileCenter(tx) {
  return tx * TILE + TILE / 2;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Can `eye` (x, y, facing angle, range, half-angle cone) see `target` through the grid? */
function canSee(grid, eye, target) {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dist = Math.hypot(dx, dy);
  if (dist > eye.range) return 0;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), eye.angle)) > eye.halfAngle) return 0;
  if (!hasLineOfSight(grid, eye.x, eye.y, target.x, target.y)) return 0;
  return dist;
}

function circleHitsWall(grid, x, y, r) {
  const x0 = Math.floor((x - r) / TILE);
  const x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE);
  const y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      if (tileAt(grid, tx, ty) === TILE_WALL) {
        const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
        const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
    }
  }
  return false;
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    levelName: '',
    levelSub: '',
    grid: null,
    player: { x: 0, y: 0, angle: 0, running: false, moving: false },
    guards: [],
    cameras: [],
    loot: [],
    exit: { x: 0, y: 0, open: false },
    alarm: 0,
    lockdown: false,
    coins: COIN.perLevel,
    coinCooldown: 0,
    score: 0,
    time: 0,
    attempts: ATTEMPTS,
    status: 'playing', // playing | caught | clear | won | over
    statusTimer: 0,
    noiseTimer: 0,
    noiseRings: [],
    lootGot: 0,
    lootTotal: 0,
  };

  function loadLevel(index, preserveLoot) {
    const def = LEVELS[index];
    const collected = preserveLoot ? state.loot.filter((l) => l.got).map((l) => l.id) : [];
    state.levelIndex = index;
    state.levelName = def.name;
    state.levelSub = def.sub;
    state.grid = buildLevel(def);
    state.player.x = tileCenter(def.player[0]);
    state.player.y = tileCenter(def.player[1]);
    state.player.angle = 0;
    state.guards = def.guards.map((g) => {
      const guard = {
        x: tileCenter(g.waypoints[0][0]),
        y: tileCenter(g.waypoints[0][1]),
        angle: 0,
        waypoints: g.waypoints,
        wpIndex: 1 % g.waypoints.length,
        path: null,
        pathIndex: 0,
        state: 'patrol',
        alert: 0,
        lastSeen: null,
        lastSeenTime: -99,
        pauseTimer: 0,
        lookTimer: 0,
        repathTimer: 0,
      };
      const [tx, ty] = g.waypoints[guard.wpIndex];
      guardRepath(guard, tx, ty);
      return guard;
    });
    state.cameras = def.cameras.map((c) => ({
      x: tileCenter(c.x),
      y: tileCenter(c.y),
      baseAngle: c.angle,
      sweep: c.sweep,
      period: c.period,
      angle: c.angle,
      alert: 0,
    }));
    state.loot = def.loot.map((p, i) => ({
      id: i, x: tileCenter(p[0]), y: tileCenter(p[1]), got: collected.includes(i),
    }));
    state.lootTotal = state.loot.length;
    state.lootGot = state.loot.filter((l) => l.got).length;
    state.exit = { x: tileCenter(def.exit[0]), y: tileCenter(def.exit[1]), open: state.lootGot === state.lootTotal };
    state.alarm = 0;
    state.lockdown = false;
    state.coins = COIN.perLevel;
    state.coinCooldown = 0;
    state.noiseTimer = 0;
    state.noiseRings = [];
    state.status = 'playing';
    state.statusTimer = 0;
  }

  function reset() {
    state.score = 0;
    state.time = 0;
    state.attempts = ATTEMPTS;
    loadLevel(0, false);
  }

  function playerTile() {
    return [Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE)];
  }

  function playerInShadow() {
    const [tx, ty] = playerTile();
    return tileAt(state.grid, tx, ty) === TILE_SHADOW;
  }

  function guardRepath(guard, tx, ty) {
    const [gx, gy] = [Math.floor(guard.x / TILE), Math.floor(guard.y / TILE)];
    const path = findPath(state.grid, gx, gy, tx, ty);
    guard.path = path;
    guard.pathIndex = path && path.length > 1 ? 1 : 0;
  }

  function followPath(guard, speed, dt) {
    if (!guard.path || guard.pathIndex >= guard.path.length) return true;
    const [tx, ty] = guard.path[guard.pathIndex];
    const px = tileCenter(tx);
    const py = tileCenter(ty);
    const dx = px - guard.x;
    const dy = py - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 3) {
      guard.pathIndex += 1;
      return guard.pathIndex >= guard.path.length;
    }
    guard.angle = Math.atan2(dy, dx);
    const stepLen = Math.min(dist, speed * dt);
    guard.x += (dx / dist) * stepLen;
    guard.y += (dy / dist) * stepLen;
    return false;
  }

  function makeNoise(x, y, radius) {
    state.noiseRings.push({ x, y, radius, ttl: 0.7, max: 0.7 });
    for (const guard of state.guards) {
      if (guard.state === 'chase') continue;
      if (Math.hypot(guard.x - x, guard.y - y) < radius) {
        guard.lastSeen = { x, y };
        guard.lastSeenTime = state.time;
        guard.state = 'suspicious';
        guard.alert = Math.max(guard.alert, GUARD.suspiciousAt);
        guardRepath(guard, Math.floor(x / TILE), Math.floor(y / TILE));
      }
    }
  }

  function throwCoin(x, y) {
    if (state.status !== 'playing' || state.coins <= 0 || state.coinCooldown > 0) return false;
    state.coins -= 1;
    state.coinCooldown = COIN.cooldown;
    makeNoise(x, y, COIN.noiseRadius);
    return true;
  }

  function respawnAfterCaught() {
    state.attempts -= 1;
    if (state.attempts <= 0) {
      state.status = 'over';
      return EVENT_OVER;
    }
    loadLevel(state.levelIndex, true);
    return 0;
  }

  /**
   * One fixed step. `move` is { dx, dy } in -1..1 (already normalised) and `run`.
   * Returns bit flags of what happened.
   */
  function step(dt, move, run) {
    let events = 0;
    if (state.status === 'caught' || state.status === 'clear') {
      state.statusTimer -= dt;
      if (state.statusTimer <= 0) {
        if (state.status === 'caught') {
          events |= respawnAfterCaught();
        } else {
          const next = state.levelIndex + 1;
          if (next >= LEVELS.length) {
            state.status = 'won';
            events |= EVENT_WIN;
          } else {
            loadLevel(next, false);
            events |= EVENT_LEVEL;
          }
        }
      }
      return events;
    }
    if (state.status !== 'playing') return events;

    state.time += dt;
    if (state.coinCooldown > 0) state.coinCooldown -= dt;
    for (const ring of state.noiseRings) ring.ttl -= dt;
    state.noiseRings = state.noiseRings.filter((r) => r.ttl > 0);

    // --- the thief moves (axis-separated, so walls slide instead of snagging) ---
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(move.dx, move.dy);
    const nx = len > 0 ? move.dx / len : 0;
    const ny = len > 0 ? move.dy / len : 0;
    state.player.moving = len > 0;
    state.player.running = run && len > 0;
    if (len > 0) state.player.angle = Math.atan2(ny, nx);
    const px = state.player.x + nx * speed * dt;
    if (!circleHitsWall(state.grid, px, state.player.y, PLAYER.radius)) state.player.x = px;
    const py = state.player.y + ny * speed * dt;
    if (!circleHitsWall(state.grid, state.player.x, py, PLAYER.radius)) state.player.y = py;
    state.player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, state.player.x));
    state.player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, state.player.y));

    // --- running is loud: guards nearby come to look ---
    if (state.player.running) {
      state.noiseTimer -= dt;
      if (state.noiseTimer <= 0) {
        state.noiseTimer = PLAYER.noiseInterval;
        state.noiseRings.push({ x: state.player.x, y: state.player.y, radius: PLAYER.noiseRadius, ttl: 0.5, max: 0.5 });
        for (const guard of state.guards) {
          if (guard.state === 'chase') continue;
          if (Math.hypot(guard.x - state.player.x, guard.y - state.player.y) < PLAYER.noiseRadius) {
            guard.lastSeen = { x: state.player.x, y: state.player.y };
            guard.lastSeenTime = state.time;
            guard.state = 'suspicious';
            guard.alert = Math.max(guard.alert, GUARD.suspiciousAt);
            guardRepath(guard, Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
          }
        }
        events |= EVENT_NOISE;
      }
    }

    const inShadow = playerInShadow();

    // --- guards: see, suspect, chase, patrol ---
    let anyChase = false;
    let anySuspicious = false;
    for (const guard of state.guards) {
      const dist = canSee(state.grid, {
        x: guard.x, y: guard.y, angle: guard.angle, range: GUARD.viewRange, halfAngle: GUARD.viewHalfAngle,
      }, state.player);
      if (dist > 0) {
        const closeness = 1 - dist / GUARD.viewRange;
        let rate = GUARD.alertFillFar + (GUARD.alertFill - GUARD.alertFillFar) * closeness;
        if (inShadow) rate *= GUARD.shadowMultiplier;
        if (state.player.running) rate *= GUARD.runMultiplier;
        guard.alert = Math.min(1, guard.alert + rate * dt);
        guard.lastSeen = { x: state.player.x, y: state.player.y };
        guard.lastSeenTime = state.time;
      } else {
        guard.alert = Math.max(0, guard.alert - GUARD.alertDecay * dt);
      }

      if (state.lockdown) guard.state = 'chase';
      else if (guard.alert >= 1) guard.state = 'chase';
      else if (guard.alert >= GUARD.suspiciousAt && guard.state !== 'chase') guard.state = 'suspicious';
      else if (guard.state === 'chase' && state.time - guard.lastSeenTime > GUARD.chaseMemory) {
        guard.state = 'suspicious';
      } else if (guard.state === 'suspicious' && guard.alert < GUARD.suspiciousAt) {
        guard.state = 'patrol';
      }

      if (guard.state === 'chase') {
        anyChase = true;
        guard.repathTimer -= dt;
        if (guard.repathTimer <= 0) {
          guard.repathTimer = 0.4;
          guardRepath(guard, Math.floor(state.player.x / TILE), Math.floor(state.player.y / TILE));
        }
        followPath(guard, GUARD.chaseSpeed, dt);
        if (Math.hypot(guard.x - state.player.x, guard.y - state.player.y) < GUARD.catchDistance) {
          state.status = 'caught';
          state.statusTimer = 1.6;
          return events | EVENT_CAUGHT;
        }
      } else if (guard.state === 'suspicious') {
        anySuspicious = true;
        const arrived = followPath(guard, GUARD.investigateSpeed, dt);
        if (arrived) {
          guard.lookTimer += dt;
          guard.angle += dt * 1.5;
          if (guard.lookTimer > GUARD.lookAround) {
            guard.lookTimer = 0;
            guard.alert = Math.min(guard.alert, 0.3);
            guard.state = 'patrol';
            guard.path = null;
          }
        } else {
          guard.lookTimer = 0;
        }
      } else {
        // patrol: walk the waypoint loop, pausing at each stop
        if (guard.pauseTimer > 0) {
          guard.pauseTimer -= dt;
        } else {
          const arrived = followPath(guard, GUARD.patrolSpeed, dt);
          if (arrived) {
            guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
            guard.pauseTimer = GUARD.waypointPause;
            const [tx, ty] = guard.waypoints[guard.wpIndex];
            guardRepath(guard, tx, ty);
          }
        }
      }
    }

    // --- cameras: sweep, and a hot camera feeds the alarm ---
    let cameraHot = false;
    for (const camera of state.cameras) {
      camera.angle = camera.baseAngle + Math.sin((state.time * Math.PI * 2) / camera.period) * camera.sweep;
      const dist = canSee(state.grid, {
        x: camera.x, y: camera.y, angle: camera.angle, range: CAMERA.viewRange, halfAngle: CAMERA.viewHalfAngle,
      }, state.player);
      if (dist > 0) {
        let rate = CAMERA.alertFill;
        if (inShadow) rate *= GUARD.shadowMultiplier;
        camera.alert = Math.min(1, camera.alert + rate * dt);
      } else {
        camera.alert = Math.max(0, camera.alert - CAMERA.alertDecay * dt);
      }
      if (camera.alert > 0.5) cameraHot = true;
    }

    // --- the alarm meter ---
    const wasLockdown = state.lockdown;
    if (anyChase) state.alarm += ALARM.chaseRate * dt;
    else if (anySuspicious) state.alarm += ALARM.suspiciousRate * dt;
    if (cameraHot) state.alarm += ALARM.cameraRate * dt;
    if (!anyChase && !anySuspicious && !cameraHot) state.alarm -= ALARM.decayRate * dt;
    state.alarm = Math.max(0, Math.min(100, state.alarm));
    if (state.alarm >= ALARM.lockdownAt && !state.lockdown) {
      state.lockdown = true;
      events |= EVENT_ALARM;
    } else if (state.lockdown && state.alarm < ALARM.lockdownReleaseBelow) {
      state.lockdown = false;
      for (const guard of state.guards) if (guard.state === 'chase') guard.state = 'suspicious';
    }
    if (!wasLockdown && state.lockdown) {
      for (const guard of state.guards) guard.state = 'chase';
    }

    // --- loot and the exit ---
    for (const item of state.loot) {
      if (item.got) continue;
      if (Math.hypot(item.x - state.player.x, item.y - state.player.y) < 28) {
        item.got = true;
        state.lootGot += 1;
        state.score += LOOT_POINTS;
        events |= EVENT_LOOT;
        if (state.lootGot === state.lootTotal) state.exit.open = true;
      }
    }
    if (state.exit.open && !state.lockdown
      && Math.hypot(state.exit.x - state.player.x, state.exit.y - state.player.y) < 30) {
      state.score += LEVEL_BONUS;
      state.status = 'clear';
      state.statusTimer = 1.8;
      return events | EVENT_LEVEL;
    }

    return events;
  }

  // --- debug hooks for the screenshot scenes and the tests (not used by play) ---
  function debugPlace(tx, ty) {
    state.player.x = tileCenter(tx);
    state.player.y = tileCenter(ty);
  }
  function debugCollectAll() {
    for (const item of state.loot) {
      if (!item.got) {
        item.got = true;
        state.lootGot += 1;
        state.score += LOOT_POINTS;
      }
    }
    state.exit.open = true;
  }
  function debugSetAlarm(value) {
    state.alarm = value;
  }

  reset();
  return {
    state, reset, step, loadLevel, throwCoin, playerInShadow,
    debugPlace, debugCollectAll, debugSetAlarm,
  };
}
