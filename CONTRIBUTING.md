# Contributing to PlayBlox

This document is for developers and AI coding assistants working on PlayBlox. The root README is intentionally written for players and visitors.

## Project structure

```text
PlayBlox/
├── index.html
├── styles.css
├── src/
│   ├── app.js
│   └── games/
│       └── registry.js
├── worker/
│   ├── src/index.js
│   ├── wrangler.jsonc
│   └── README.md
├── README.md
└── CONTRIBUTING.md
```

- `index.html` — shared lobby markup.
- `styles.css` — global visual system and responsive styles.
- `src/app.js` — lobby interactions and game registry integration.
- `src/games/registry.js` — source of truth for game cards.
- `worker/src/index.js` — Cloudflare Worker API and Durable Object party-room implementation.
- `worker/wrangler.jsonc` — Cloudflare Worker and Durable Object binding configuration.
- `worker/README.md` — backend API and deployment instructions.

## Add a game

**Always inspect `src/games/registry.js` first.** Do not hardcode new game cards into `index.html` or put gameplay logic in `src/app.js`.

1. Create a dedicated folder for the game, for example `src/games/memory-match/`.
2. Implement the game's own page, JavaScript, styles, and assets inside that folder.
3. Add an entry to the exported `gameRegistry` array in `src/games/registry.js`:

   ```js
   {
     id: 'memory-match',
     name: 'Memory Match',
     description: 'Flip cards and find all the matching pairs.',
     emoji: '🃏',
     color: '#ffe4a8',
     status: 'coming-soon',
     path: './src/games/memory-match/index.html',
   }
   ```

4. Keep `status: 'coming-soon'` until the game is ready. Set it to `'ready'` when the page exists and is playable; supply its correct relative `path`.
5. Check the card, game page, links, and layout at phone and desktop widths.

The registry automatically renders each game card. Use a unique URL-friendly `id`, a short description, an emoji, and a light background colour for readable text.

## Add or adjust a theme

- Start by reviewing the shared colour and layout rules in `styles.css`.
- Keep global design tokens in `:root` where practical, rather than scattering repeated colour values throughout the stylesheet.
- Keep contrast, focus outlines, touch targets, and responsive behaviour accessible.
- If a theme selector is introduced, centralize its theme definitions and make sure every game remains readable under supported themes.
- Avoid introducing a separate incompatible design system inside an individual game.

## Multiplayer architecture

The frontend is hosted as a static site on GitHub Pages. Cloudflare Workers provides the API, and a Durable Object instance coordinates each party room. The same room contract should serve all games; individual games should not create their own room backend.

Initial party cap: **8 players including the host**, with a future hard ceiling of 16 unless a specific game needs a different limit. Keep the cap configurable in the backend and, eventually, in game metadata.

The current backend foundation lives in `worker/`. It supports creating rooms, joining/leaving, public room snapshots, WebSocket snapshots/player-list updates, and idle expiry. It is not yet wired into the GitHub Pages UI and does not yet implement authoritative game actions. Read `worker/README.md` before deploying it.

Security rules:
- Treat room codes as locators, not passwords.
- Require server-issued player tokens for authenticated actions.
- Validate every game action on the server; never trust client-submitted scores or winners.
- Do not commit Cloudflare credentials or private player/host tokens.
- Add origin restrictions and rate limiting before wider public use.

## Pull requests and changes

1. Create a feature branch for substantial work rather than committing unrelated changes together.
2. Keep each game self-contained and avoid unnecessary changes to the shared lobby.
3. Test the static site locally using `python -m http.server 8000`, then open `http://localhost:8000`.
4. Test the backend from `worker/` with Wrangler after setting up a Cloudflare account.
5. Check the browser console, game links, and mobile/desktop layouts.
6. Open a pull request describing the change, how to test it, and any known limitations. Include screenshots for visible UI changes where helpful.
