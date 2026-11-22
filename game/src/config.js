// Every tuning number and colour in one place. The playfield is a fixed 1280x720
// logical area (32x18 tiles of 40 px); the renderer scales it to the window, so no
// rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 275,
  /** Seconds a run makes noise before the next noise pulse. */
  noiseInterval: 0.35,
  noiseRadius: 170,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 88,
  investigateSpeed: 130,
  chaseSpeed: 190,
  /** How long a guard waits at each patrol waypoint, in seconds. */
  waypointPause: 0.9,
  /** Vision range in pixels and half-angle of the cone. */
  viewRange: 245,
  viewHalfAngle: 0.66,
  /** Alert 0..1; how fast it fills when the thief is seen, at point-blank range. */
  alertFill: 1.35,
  /** Alert fill at the edge of the cone, and the multiplier while the thief is in shadow. */
  alertFillFar: 0.45,
  shadowMultiplier: 0.2,
  runMultiplier: 1.6,
  alertDecay: 0.22,
  /** Alert above this makes a guard suspicious; 1.0 makes it chase. */
  suspiciousAt: 0.45,
  /** Seconds of not seeing the thief before a chasing guard gives up. */
  chaseMemory: 3.0,
  /** Seconds a suspicious guard stares at the spot it checked before patrolling again. */
  lookAround: 1.6,
  /** Touching a chasing guard (or one past suspicion) catches the thief. */
  catchDistance: 26,
};

export const CAMERA = {
  viewRange: 235,
  viewHalfAngle: 0.52,
  alertFill: 1.5,
  alertDecay: 0.35,
};

export const ALARM = {
  /** Per-second rise while any guard chases, while any guard is suspicious, or a camera is hot. */
  chaseRate: 26,
  suspiciousRate: 11,
  cameraRate: 16,
  decayRate: 7,
  /** At 100 the lockdown starts: every guard hunts, the exit locks until it cools below this. */
  lockdownAt: 100,
  lockdownReleaseBelow: 40,
};

export const COIN = {
  perLevel: 3,
  noiseRadius: 230,
  cooldown: 1.0,
};

export const LOOT_POINTS = 500;
export const LEVEL_BONUS = 1000;
export const WIN_BONUS = 2000;
export const ATTEMPTS = 3;

export const PALETTE = {
  backdrop: '#0b0d12',
  floorA: '#232833',
  floorB: '#20242e',
  floorLine: '#2c3242',
  shadow: '#141824',
  shadowEdge: '#1d2333',
  wall: '#3a4152',
  wallTop: '#565f75',
  wallDark: '#262b38',
  carpet: '#3d2b3d',
  player: '#2ec4b6',
  playerDark: '#0f766e',
  guard: '#e5534b',
  guardDark: '#7f1d1d',
  camera: '#f2c94c',
  loot: '#f2c94c',
  lootDark: '#b8860b',
  exit: '#34d399',
  exitLocked: '#e5534b',
  cone: 'rgba(242, 201, 76, 0.20)',
  coneHot: 'rgba(229, 83, 75, 0.30)',
  coneCamera: 'rgba(242, 201, 76, 0.16)',
  panel: '#171b26',
  panelEdge: '#2c3242',
  text: '#eef1f5',
  muted: '#9aa3b5',
  alarmLow: '#34d399',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'vault-break.best';
