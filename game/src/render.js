// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the
// backdrop colour. Flat shapes and canvas text; the HUD sits on a bar along the bottom
// so the room, the cones, the loot and the alarm meter share one frame.
import { ATTEMPTS, CAMERA, COLS, FIELD, FONT, GUARD, PALETTE, ROWS, TILE } from './config.js';
import { isWall, tileAt, TILE_SHADOW } from './levels.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CLEAR = 'clear';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const HUD_H = 48;

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const timeLabel = cachedLabel('');
  const lootLabel = cachedLabel('');
  const coinsLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  /** Screen (CSS pixel) coordinates back to logical playfield coordinates. */
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const px = (clientX - rect.left) * ratio;
    const py = (clientY - rect.top) * ratio;
    return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  }

  function drawCone(x, y, angle, halfAngle, range, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, y);
    context.arc(x, y, range, angle - halfAngle, angle + halfAngle);
    context.closePath();
    context.fill();
  }

  function drawFloor(state) {
    const grid = state.grid;
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        const tile = tileAt(grid, tx, ty);
        if (tile === TILE_SHADOW) {
          context.fillStyle = PALETTE.shadow;
          context.fillRect(tx * TILE, ty * TILE, TILE, TILE);
          context.fillStyle = PALETTE.shadowEdge;
          context.fillRect(tx * TILE, ty * TILE, TILE, 2);
        } else if (!isWall(grid, tx, ty)) {
          context.fillStyle = (tx + ty) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
          context.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        }
      }
    }
  }

  function drawWalls(state) {
    const grid = state.grid;
    for (let ty = 0; ty < ROWS; ty += 1) {
      for (let tx = 0; tx < COLS; tx += 1) {
        if (!isWall(grid, tx, ty)) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        context.fillStyle = PALETTE.wall;
        context.fillRect(x, y, TILE, TILE);
        context.fillStyle = PALETTE.wallTop;
        context.fillRect(x, y, TILE, 4);
        context.fillStyle = PALETTE.wallDark;
        context.fillRect(x, y + TILE - 3, TILE, 3);
      }
    }
  }

  function drawCones(state) {
    for (const camera of state.cameras) {
      const hot = camera.alert > 0.5;
      drawCone(camera.x, camera.y, camera.angle, CAMERA.viewHalfAngle, CAMERA.viewRange,
        hot ? PALETTE.coneHot : PALETTE.coneCamera);
    }
    for (const guard of state.guards) {
      const hot = guard.state === 'chase';
      drawCone(guard.x, guard.y, guard.angle, GUARD.viewHalfAngle, GUARD.viewRange,
        hot ? PALETTE.coneHot : PALETTE.cone);
    }
  }

  function drawLootAndExit(state) {
    for (const item of state.loot) {
      if (item.got) continue;
      // A gold loot bag: a diamond with a $ on it, gently bobbing.
      const bob = Math.sin(state.time * 3 + item.id * 1.7) * 2;
      context.fillStyle = PALETTE.loot;
      context.beginPath();
      context.moveTo(item.x, item.y - 13 + bob);
      context.lineTo(item.x + 11, item.y + bob);
      context.lineTo(item.x, item.y + 13 + bob);
      context.lineTo(item.x - 11, item.y + bob);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.lootDark;
      context.beginPath();
      context.moveTo(item.x, item.y - 13 + bob);
      context.lineTo(item.x + 11, item.y + bob);
      context.lineTo(item.x, item.y + 13 + bob);
      context.closePath();
      context.fill();
      text('$', item.x, item.y + 5 + bob, 15, '#3a2c00', 'center');
    }
    const exit = state.exit;
    context.fillStyle = exit.open ? PALETTE.exit : PALETTE.exitLocked;
    context.fillRect(exit.x - 16, exit.y - 16, 32, 32);
    context.fillStyle = '#0b0d12';
    context.fillRect(exit.x - 11, exit.y - 11, 22, 22);
    text(exit.open ? '>' : 'x', exit.x, exit.y + 7, 20, exit.open ? PALETTE.exit : PALETTE.exitLocked, 'center');
    if (exit.open) text('EXIT', exit.x, exit.y - 22, 13, PALETTE.exit, 'center');
  }

  function drawCameras(state) {
    for (const camera of state.cameras) {
      context.fillStyle = '#11141b';
      context.beginPath();
      context.arc(camera.x, camera.y, 10, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = camera.alert > 0.5 ? PALETTE.alarmHigh : PALETTE.camera;
      context.beginPath();
      context.arc(camera.x, camera.y, 7, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#11141b';
      context.beginPath();
      context.arc(camera.x + Math.cos(camera.angle) * 3, camera.y + Math.sin(camera.angle) * 3, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      // Body: a guard in a dark-red uniform, facing its angle.
      context.fillStyle = PALETTE.guardDark;
      context.beginPath();
      context.arc(guard.x, guard.y, GUARD.radius + 2, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.guard;
      context.beginPath();
      context.arc(guard.x, guard.y, GUARD.radius, 0, Math.PI * 2);
      context.fill();
      // Cap brim pointing where it looks.
      context.fillStyle = '#11141b';
      context.beginPath();
      context.arc(guard.x + Math.cos(guard.angle) * 8, guard.y + Math.sin(guard.angle) * 8, 5, 0, Math.PI * 2);
      context.fill();
      // Alert ring above the head while it is onto something.
      if (guard.alert > 0.05) {
        context.strokeStyle = guard.alert >= 1 ? PALETTE.alarmHigh : PALETTE.camera;
        context.lineWidth = 3;
        context.beginPath();
        context.arc(guard.x, guard.y, GUARD.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * guard.alert);
        context.stroke();
      }
      if (guard.state === 'chase') text('!', guard.x, guard.y - 24, 22, PALETTE.alarmHigh, 'center');
      else if (guard.state === 'suspicious') text('?', guard.x, guard.y - 24, 22, PALETTE.camera, 'center');
    }
  }

  function drawPlayer(state, inShadow) {
    const p = state.player;
    // A thief in a teal hood, mask band across the eyes, facing its angle.
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.arc(p.x, p.y, 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x, p.y, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#0b0d12';
    context.fillRect(p.x - 9, p.y - 4, 18, 6);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 9, p.y + Math.sin(p.angle) * 9, 4, 0, Math.PI * 2);
    context.fill();
    if (inShadow) {
      context.strokeStyle = 'rgba(46, 196, 182, 0.5)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(p.x, p.y, 19, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawNoise(state) {
    for (const ring of state.noiseRings) {
      const t = ring.ttl / ring.max;
      context.strokeStyle = `rgba(238, 241, 245, ${0.55 * t})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(ring.x, ring.y, ring.radius * (1 - t * 0.5), 0, Math.PI * 2);
      context.stroke();
    }
  }

  function alarmColor(alarm) {
    if (alarm >= 75) return PALETTE.alarmHigh;
    if (alarm >= 40) return PALETTE.alarmMid;
    return PALETTE.alarmLow;
  }

  function drawHud(state) {
    const y0 = FIELD.height - HUD_H;
    context.fillStyle = 'rgba(11, 13, 18, 0.92)';
    context.fillRect(0, y0, FIELD.width, HUD_H);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, y0, FIELD.width, 2);
    context.textBaseline = 'alphabetic';
    // Level name.
    text(state.levelName, 20, y0 + 30, 20, PALETTE.text, 'left');
    // Loot count.
    text(lootLabel(`◆ ${state.lootGot}/${state.lootTotal} loot`), 210, y0 + 30, 18, PALETTE.loot, 'left');
    // Alarm meter.
    const meterX = 400;
    const meterW = 320;
    text(state.lockdown ? 'ALARM!' : 'ALARM', meterX - 10, y0 + 30, 18,
      state.lockdown && Math.floor(state.time * 4) % 2 === 0 ? PALETTE.alarmHigh : PALETTE.muted, 'right');
    context.fillStyle = '#262b38';
    context.fillRect(meterX, y0 + 12, meterW, 20);
    context.fillStyle = alarmColor(state.alarm);
    context.fillRect(meterX, y0 + 12, Math.max(0, (meterW * state.alarm) / 100), 20);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.strokeRect(meterX, y0 + 12, meterW, 20);
    text(`${Math.round(state.alarm)}%`, meterX + meterW + 10, y0 + 30, 18, alarmColor(state.alarm), 'left');
    // Coins, attempts, score, time.
    const minutes = Math.floor(state.time / 60);
    const seconds = Math.floor(state.time % 60);
    text(coinsLabel(`◉ ${state.coins}`), 880, y0 + 30, 18, PALETTE.text, 'left');
    text(`♥ ${state.attempts}`, 950, y0 + 30, 18, PALETTE.guard, 'left');
    text(scoreLabel(state.score), 1030, y0 + 30, 18, PALETTE.text, 'left');
    text(timeLabel(`${minutes}:${String(seconds).padStart(2, '0')}`), 1260, y0 + 30, 18, PALETTE.muted, 'right');
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 128 + index * 34, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.loot, 'center');
  }

  function drawField(state, inShadow) {
    drawFloor(state);
    drawCones(state);
    drawWalls(state);
    drawLootAndExit(state);
    drawCameras(state);
    drawGuards(state);
    drawPlayer(state, inShadow);
    drawNoise(state);
  }

  /** Paint one frame: the field, the HUD, then a panel for the screen the game is on. */
  function draw(state, screen, best, inShadow) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawField(state, inShadow);
    drawHud(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('VAULT BREAK', [
        'Three buildings. Every bag of loot. One way out.',
        'Sneak past the guards and their vision cones.',
        'Cameras sweep the halls — shadows hide you, running gives you away.',
        'Click to toss a coin and lure a guard off. Grab all the loot, reach the exit.',
        `Best score ${best}`,
      ], 'Press Space or click to start the heist', PALETTE.player);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The guards will wait for you.'], 'Press P to resume', PALETTE.panelEdge);
    } else if (screen === SCREEN_CLEAR) {
      drawPanel(`${state.levelName} cleared`, [`Loot secured. Score ${state.score}.`], 'Next building…', PALETTE.exit);
    } else if (screen === SCREEN_CAUGHT) {
      drawPanel('Caught!', [
        `The guards hauled you out. ${state.attempts} ${state.attempts === 1 ? 'attempt' : 'attempts'} left.`,
      ], 'Back to the start of this building…', PALETTE.guard);
    } else if (screen === SCREEN_OVER) {
      drawPanel('Busted', [`Score ${state.score}. Best ${best}.`], 'Press Space or click to try again', PALETTE.guard);
    } else if (screen === SCREEN_WIN) {
      drawPanel('CLEAN GETAWAY', [
        `Every vault emptied. Score ${state.score}. Best ${best}.`,
        'The crew is already spending it.',
      ], 'Press Space or click to run it again', PALETTE.exit);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toLogical };
}
