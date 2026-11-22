// The screenshot scenes behind ?shot=title|play|hide|win. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (A* to the nearest loot, then to the exit; it waits in place while any guard is onto
// it), so the frame is what a short game really looks like and the same seed always
// gives the same frame.
import { FIELD, STEP, TILE } from './config.js';
import { LEVELS } from './levels.js';
import { autopilotMove } from './autopilot.js';
import { EVENT_CAUGHT, EVENT_LEVEL, EVENT_WIN } from './world.js';
import {
  SCREEN_CAUGHT, SCREEN_CLEAR, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';

const TITLE_SECONDS = 9;
const PLAY_SECONDS = 16;
const HIDE_SECONDS = 12;

function runFor(world, seconds, level) {
  const cache = {};
  let events = 0;
  for (let index = 0; index < seconds / STEP; index += 1) {
    const move = autopilotMove(world, cache);
    events = world.step(STEP, move, move.run);
    if (events & (EVENT_CAUGHT | EVENT_LEVEL | EVENT_WIN)) break;
    if (level !== undefined && world.state.levelIndex !== level) break;
  }
  return events;
}

/**
 * Set `world` to the named scene (title, play, hide or win; any other name is title)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    world.loadLevel(1, false);
    runFor(world, PLAY_SECONDS, 1);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'hide') {
    // The thief crouched in the Lobby's dark corner while a guard, drawn by a
    // tossed coin, searches the spot beside them. The thief waits in the shadow.
    world.loadLevel(0, false);
    world.debugPlace(8, 2);
    world.throwCoin(8 * TILE + TILE / 2, 8 * TILE + TILE / 2);
    for (let index = 0; index < HIDE_SECONDS / STEP; index += 1) {
      world.step(STEP, { dx: 0, dy: 0 }, false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    // Play the Vault through to the getaway: collect everything, reach the exit.
    world.loadLevel(2, false);
    world.debugCollectAll();
    const state = world.state;
    state.player.x = state.exit.x - 60;
    state.player.y = state.exit.y;
    for (let index = 0; index < 3 / STEP; index += 1) {
      const events = world.step(STEP, { dx: 1, dy: 0 }, false);
      if (events & EVENT_WIN) break;
      if (world.state.status !== 'playing' && world.state.status !== 'clear') break;
    }
    // Let the clear interstitial finish so the frame shows the win panel.
    for (let index = 0; index < 3 / STEP; index += 1) {
      world.step(STEP, { dx: 0, dy: 0 }, false);
      if (world.state.status === 'won') break;
    }
    return { screen: world.state.status === 'won' ? SCREEN_WIN : SCREEN_CLEAR, best: 0 };
  }
  // title: the cover — the Lobby mid-heist, thief, guards, cones, a camera, loot
  // and the alarm meter all in one frame. It draws the play screen, not the
  // title panel: the panel would cover the middle of the room.
  runFor(world, TITLE_SECONDS, 0);
  return { screen: SCREEN_PLAY, best: 0 };
}

// Keep the level list referenced so a bundler cannot mistake it for dead code.
export const LEVEL_COUNT = LEVELS.length;
export const FIELD_SIZE = FIELD.width;
