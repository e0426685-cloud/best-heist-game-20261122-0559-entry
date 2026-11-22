# VAULT BREAK — a top-down heist game

[![make.fun](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/node-22-green.svg)](https://nodejs.org)

A complete, original top-down heist game that plays offline in a desktop
browser from its own static files. Sneak through three buildings — the Lobby,
the Gallery, the Vault — dodge patrolling guards and their vision cones,
slip past sweeping security cameras, grab every loot bag, and reach the exit
before the alarm meter fills.

Built for the make.fun bounty **best-heist-game-20261122-0559**
("Make the best heist game").

## Play

Serve `game/` with any static server, e.g. `node serve.ts`, then open
http://localhost:8080 in desktop Chrome.

- **Move:** WASD or arrow keys. **Run:** hold Shift (fast, but loud).
- **Distraction:** click anywhere to toss a coin (3 per level) — guards
  investigate the noise.
- **Hide:** stand still in the dark shadow patches; guards spot you far
  slower there.
- **Goal:** collect all the loot to open the exit, then reach it. Get
  spotted and the alarm rises; at 100% every guard hunts you down.
- **Pause:** P or Esc. **Start / restart:** Space or click.

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to `/output` and writes `/output/dossier.json` with the
vendored `vendor/makefun-game.ts`.
