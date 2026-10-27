# PlayBlox 🧸

A colourful, kindergarten-inspired playground for friends to gather. The first milestone is a responsive party lobby; multiplayer rooms and games will be added in later milestones.

## Run locally

This is a static website. You can open `index.html` directly, or use a local server for a more realistic test:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Project map

```text
PlayBlox/
├── index.html                 # Lobby page and semantic page structure
├── styles.css                 # Shared visual design and responsive layout
├── src/
│   ├── app.js                 # Lobby interactions (create/join preview)
│   └── games/
│       └── registry.js        # GAME REGISTRY: add new game cards here
└── README.md                  # Project guide and contribution instructions
```

## How to add a game

**Start with `src/games/registry.js`.** It is the single catalogue that tells the lobby which games exist. Keep each game's actual gameplay separate from the lobby.

1. Create a new game folder, for example `src/games/memory-match/`.
2. Add the game's own entry page and JavaScript/CSS in that folder. Do not put gameplay code in `src/app.js`.
3. Add an object to `gameRegistry` in `src/games/registry.js`:

   ```js
   {
     id: 'memory-match',
     name: 'Memory Match',
     description: 'Flip cards and find all the matching pairs.',
     emoji: '🃏',
     color: '#ffe4a8',
     status: 'ready',
     path: './src/games/memory-match/index.html',
   }
   ```

4. Set `status: 'coming-soon'` while it is unfinished. Set `status: 'ready'` and supply a valid `path` when it can be played.
5. Test the lobby and game link at desktop and phone widths.

The registry renders cards automatically. A game does not need custom lobby markup. Use a unique `id`, keep descriptions short, and use a light background color so the card stays readable.

## Architecture rules for future contributors and AI assistants

- **Find the game registry first:** `src/games/registry.js` is the source of truth for the game catalogue.
- **Keep the lobby stable:** `index.html`, `styles.css`, and `src/app.js` implement the shared lobby. Avoid rewriting them to add a game.
- **One game, one folder:** put a game's rules, UI, styles, and assets in its own folder under `src/games/<game-id>/`.
- **Use the registry to expose it:** add or update one registry entry; do not hardcode game cards in the lobby.
- **Keep shared design reusable:** use the existing typography, rounded cards, pastel palette, and mobile-first responsive behaviour.
- **Do not claim multiplayer is live:** the current create/join forms are front-end previews. Real private rooms, room discovery, shared state, and live invitations require a backend/realtime service.
- **GitHub Pages is static hosting:** it can serve the lobby and game pages, but it cannot itself host a private-room database or realtime server.

## Current milestone

- Responsive kindergarten-style landing page
- Party creation preview with invite code and copy-link interaction
- Join form with basic invite-code format checking
- Extensible game registry and empty-state design
- Real room persistence, multi-user synchronization, and playable games: planned
