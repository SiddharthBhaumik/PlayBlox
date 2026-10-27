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
├── README.md
└── CONTRIBUTING.md
```

- `index.html` — shared lobby markup.
- `styles.css` — global visual system and responsive styles.
- `src/app.js` — lobby interactions and game registry integration.
- `src/games/registry.js` — source of truth for game cards.

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

## Pull requests and changes

1. Create a feature branch for substantial work rather than committing unrelated changes together.
2. Keep each game self-contained and avoid unnecessary changes to the shared lobby.
3. Test locally using a static server, for example `python -m http.server 8000`, then open `http://localhost:8000`.
4. Check the browser console, game links, and mobile/desktop layouts.
5. Open a pull request describing the change, how to test it, and any known limitations. Include screenshots for visible UI changes where helpful.

## Important architecture notes

- GitHub Pages can host the static lobby and game pages, but it cannot provide a private-room database or real-time server by itself.
- The current party create/join flows are front-end previews. Do not describe them as working multiplayer until a backend/realtime service is implemented.
- When multiplayer is added, define a shared room/session contract so individual games can use the same room, player list, and host controls without each game implementing a separate room system.
- Keep game logic, rules, and game-specific assets inside the relevant game folder. Use the registry to make games discoverable from the lobby.
