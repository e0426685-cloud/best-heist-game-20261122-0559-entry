// Logic tests for VAULT BREAK (Node 22, no browser): run with
//   /path/to/node22 tests/test.mjs
// Exit code 0 when every check passes, 1 otherwise.
import { STEP, TILE } from '../game/src/config.js';
import { LEVELS, buildLevel } from '../game/src/levels.js';
import { findPath, hasLineOfSight } from '../game/src/pathfind.js';
import { createWorld, EVENT_CAUGHT, EVENT_LEVEL, EVENT_WIN } from '../game/src/world.js';
import { autopilotMove } from '../game/src/autopilot.js';
import { createRandom } from '../game/src/random.js';

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function flood(grid, sx, sy) {
  const seen = new Set([`${sx},${sy}`]);
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= 32 || ny >= 18) continue;
      if (grid[ny][nx] === 1) continue;
      const k = `${nx},${ny}`;
      if (!seen.has(k)) {
        seen.add(k);
        stack.push([nx, ny]);
      }
    }
  }
  return seen;
}

function tileCenter(tx) {
  return tx * TILE + TILE / 2;
}

/** Steer the thief with the autopilot until `done(state)` is true. */
function autopilotStep(world, done, maxSeconds = 240) {
  const cache = {};
  for (let i = 0; i < maxSeconds / STEP; i += 1) {
    if (done(world.state)) return { reached: true, seconds: i * STEP };
    const move = autopilotMove(world, cache);
    const events = world.step(STEP, move, move.run);
    if (events & EVENT_CAUGHT) return { reached: false, seconds: i * STEP, reason: 'caught' };
    if (done(world.state)) return { reached: true, seconds: i * STEP };
  }
  return { reached: false, seconds: maxSeconds, reason: 'timeout' };
}

// --- 1. every level: connected, and A* reaches every waypoint, loot and exit ---
for (let li = 0; li < LEVELS.length; li += 1) {
  const def = LEVELS[li];
  const grid = buildLevel(def);
  check(`L${li + 1} grid is 18 rows of 32`, grid.length === 18 && grid.every((r) => r.length === 32));
  const seen = flood(grid, def.player[0], def.player[1]);
  const points = [
    ...def.loot.map((p) => ['loot', p]),
    ['exit', def.exit],
    ...def.guards.flatMap((g, gi) => g.waypoints.map((p) => [`guard${gi} wp`, p])),
  ];
  for (const [label, p] of points) {
    check(`L${li + 1} ${label} ${p} reachable from start`, seen.has(`${p[0]},${p[1]}`));
    check(`L${li + 1} ${label} ${p} A* path exists`,
      findPath(grid, def.player[0], def.player[1], p[0], p[1]) !== null);
  }
  // Waypoints connect to each other (a patrol loop must be walkable).
  for (const g of def.guards) {
    for (let i = 0; i < g.waypoints.length; i += 1) {
      const a = g.waypoints[i];
      const b = g.waypoints[(i + 1) % g.waypoints.length];
      check(`L${li + 1} patrol ${a} -> ${b}`, findPath(grid, a[0], a[1], b[0], b[1]) !== null);
    }
  }
}

// --- 2. detection: fast in the open, slow in shadow ---
// Freeze the guard in place (a huge pause timer keeps it on its waypoint) so the
// setup, not the patrol, is what the test measures. Column 12 is open floor.
function freezeGuard(guard, tx, ty, angle) {
  guard.x = tileCenter(tx);
  guard.y = tileCenter(ty);
  guard.angle = angle;
  guard.state = 'patrol';
  guard.path = null;
  guard.pauseTimer = 999;
}
{
  const world = createWorld(createRandom(1));
  const state = world.state;
  const guard = state.guards[0];
  world.debugPlace(12, 9);
  let secondsToFull = -1;
  for (let i = 0; i < 10 / STEP; i += 1) {
    freezeGuard(guard, 12, 4, Math.PI / 2); // facing down, at the player
    world.step(STEP, { dx: 0, dy: 0 }, false);
    if (guard.alert >= 1) {
      secondsToFull = i * STEP;
      break;
    }
  }
  check('detection fills to full in the open', secondsToFull > 0 && secondsToFull < 3, `took ${secondsToFull}s`);
  check('guard chases once fully alerted', guard.state === 'chase');

  // Same setup, but the thief stands in a shadow tile.
  const world2 = createWorld(createRandom(1));
  const g2 = world2.state.guards[0];
  world2.debugPlace(8, 2); // shadow patch {x:6,y:1,w:4,h:3}
  check('shadow tile recognised', world2.playerInShadow());
  let alertAfter3 = 0;
  for (let i = 0; i < 3 / STEP; i += 1) {
    freezeGuard(g2, 8, 6, -Math.PI / 2); // facing up, at the player in shadow
    world2.step(STEP, { dx: 0, dy: 0 }, false);
    alertAfter3 = g2.alert;
  }
  check('detection in shadow stays well below full after 3s', alertAfter3 < 0.65, `alert ${alertAfter3.toFixed(2)}`);
}

// --- 3. walls block line of sight ---
{
  const grid = buildLevel(LEVELS[0]);
  // Reception desk (3,7,4x2) sits between (5,5) and (5,9).
  check('LOS blocked by the reception desk',
    !hasLineOfSight(grid, tileCenter(5), tileCenter(5), tileCenter(5), tileCenter(9)));
  check('LOS open across the open floor',
    hasLineOfSight(grid, tileCenter(2), tileCenter(2), tileCenter(14), tileCenter(2)));
}

// --- 4. alarm -> chase -> caught ---
{
  const world = createWorld(createRandom(1));
  const state = world.state;
  const guard = state.guards[0];
  world.debugPlace(12, 9);
  let caught = false;
  let sawChase = false;
  let alarmRose = false;
  for (let i = 0; i < 20 / STEP; i += 1) {
    // Keep the guard frozen and facing the thief until it is fully alerted;
    // then let it chase for real.
    if (guard.alert < 1) freezeGuard(guard, 12, 4, Math.PI / 2);
    const events = world.step(STEP, { dx: 0, dy: 0 }, false);
    if (guard.state === 'chase') sawChase = true;
    if (state.alarm > 10) alarmRose = true;
    if (events & EVENT_CAUGHT) {
      caught = true;
      break;
    }
  }
  check('alarm rises while the thief is seen', alarmRose, `alarm ${state.alarm.toFixed(1)}`);
  check('guard chases the seen thief', sawChase);
  check('guard catches the thief it chases', caught);
}

// --- 5. noise: running near a guard draws it to investigate ---
{
  const world = createWorld(createRandom(1));
  const state = world.state;
  const guard = state.guards[0];
  // Put the guard close to the thief's start, patrolling.
  guard.x = tileCenter(4);
  guard.y = tileCenter(4);
  guard.state = 'patrol';
  guard.path = null;
  world.debugPlace(4, 6);
  let investigated = false;
  for (let i = 0; i < 8 / STEP; i += 1) {
    // Run back and forth near the guard.
    const dir = Math.floor(i / 30) % 2 === 0 ? 1 : -1;
    world.step(STEP, { dx: dir, dy: 0 }, true);
    if (guard.state === 'suspicious' && guard.lastSeen) {
      investigated = true;
      break;
    }
  }
  check('running near a guard makes it investigate the noise', investigated);
  // A thrown coin also draws a guard.
  const world2 = createWorld(createRandom(1));
  const g2 = world2.state.guards[0];
  world2.throwCoin(tileCenter(8), tileCenter(6)); // 120px from guard 0's start
  check('coin toss draws the nearest guard to the coin',
    g2.state === 'suspicious' && g2.lastSeen !== null);
  check('coin toss spends a coin', world2.state.coins === 2);
}

// --- 6. camera sees the thief and feeds the alarm ---
{
  const world = createWorld(createRandom(1));
  const state = world.state;
  // Camera 0 sits on the top wall at (16,0), sweeping down. Stand below it at
  // (14,4): inside its cone, with the pillar at x=16 out of the line of sight.
  const camera = state.cameras[0];
  camera.baseAngle = Math.PI / 2;
  camera.sweep = 0;
  camera.angle = Math.PI / 2;
  world.debugPlace(14, 4);
  // Park the guards far away so they cannot interfere with the camera test.
  for (const g of state.guards) freezeGuard(g, 2, 16, 0);
  let hot = false;
  let alarmRose = false;
  for (let i = 0; i < 6 / STEP; i += 1) {
    world.step(STEP, { dx: 0, dy: 0 }, false);
    if (camera.alert > 0.5) hot = true;
    if (state.alarm > 5) alarmRose = true;
  }
  check('camera spots the thief below it', hot, `camera alert ${camera.alert.toFixed(2)}`);
  check('hot camera feeds the alarm', alarmRose, `alarm ${state.alarm.toFixed(1)}`);
}

// --- 7. full win path on all three levels, with the real rules on ---
{
  const world = createWorld(createRandom(7));
  let won = false;
  let levelEvents = 0;
  const startedAt = Date.now();
  for (let level = 0; level < LEVELS.length; level += 1) {
    const def = LEVELS[level];
    for (let li = 0; li < def.loot.length; li += 1) {
      const loot = def.loot[li];
      const r = autopilotStep(world, (s) => s.loot[li].got);
      check(`win path L${level + 1} reaches loot ${loot}`, r.reached, r.reason ?? '');
      if (!r.reached) break;
    }
    // Wait for the exit to open, then walk to it.
    const r = autopilotStep(world, (s) => s.levelIndex !== level || s.status === 'clear' || s.status === 'won');
    check(`win path L${level + 1} reaches the exit`, r.reached, r.reason ?? '');
    if (!r.reached) break;
    // Step through the clear interstitial.
    let done = false;
    for (let i = 0; i < 4 / STEP; i += 1) {
      const events = world.step(STEP, { dx: 0, dy: 0 }, false);
      if (events & EVENT_LEVEL) levelEvents += 1;
      if (events & EVENT_WIN) {
        won = true;
        done = true;
        break;
      }
      if (world.state.status === 'playing' && world.state.levelIndex !== level) {
        done = true;
        break;
      }
    }
    if (!done) {
      check(`win path L${level + 1} clears the level`, false, 'interstitial did not finish');
      break;
    }
  }
  check('win path completes all three levels', won);
  check('score is positive after a win', world.state.score > 0, `score ${world.state.score}`);
  console.log(`  info win-path sim took ${((Date.now() - startedAt) / 1000).toFixed(1)}s wall`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
