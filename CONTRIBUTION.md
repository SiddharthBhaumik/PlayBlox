# Contributing Games to PlayBlox

This guide explains how to add a playable multiplayer game to PlayBlox and push your changes to this repository.

## 1. Set up your local copy

1. Fork this repository on GitHub, or clone it if you have permission to push branches.
2. Clone your copy and create a feature branch:

   ```bash
   git clone https://github.com/<your-username>/PlayBlox.git
   cd PlayBlox
   git switch -c add-my-game
   ```

3. Keep your changes in your branch. Do not commit secrets, API tokens, or local environment files.

## 2. Add the frontend game

Create a folder at `src/games/<game-id>/`. Use a short, lowercase, hyphenated ID, such as `word-duel`.

Create these files:

- `index.html` — the game page and its accessible controls.
- `game.css` — styles specific to this game.
- `game.js` — rendering, interaction, API requests, and reconnect handling.

Follow the structure of an existing game such as `src/games/bullet-matrix/` or `src/games/questionable-answers/`. Link the shared stylesheet with `../../../styles.css`, then load your own CSS and JavaScript module.

For party games, read the party code from the `party` query parameter and the session token from `sessionStorage` using the key `playblox:<CODE>:token`. Use the configured API base URL pattern already used by existing games. Do not put secrets in source code.

Use the shared helpers in `src/games/shared/game-shell.js` where appropriate. Keep the circular seating layout for games whose design calls for players around a table; do not replace a required circular layout with a generic player-card grid.

## 3. Implement the server-side rules

Create `worker/src/games/<game-id>.js`. Export a game object with the same contract used by the existing server games:

- `id`, `name`, `description`, `players`
- `interactionModel` (`turn-based`, `simultaneous`, or `realtime`)
- `lateJoinPolicy` (`participate`, `spectate`, or `wait`)
- `spectators: { supported: true|false }`
- `canStart(context)`
- `createInitialState(context, previousState)`
- `validateAction(context, state, action)`
- `reduceAction(context, state, action)`
- `getStatus(context, state)`
- `getResults(context, state)`

For games with private or simultaneous choices, implement `getPublicState(state)` and expose only information that every player is allowed to see. Keep pending choices, secret roles, hidden words, and unrevealed answers out of public state and WebSocket broadcasts. Validate every action on the server; never trust the frontend to enforce rules.

Use the same action endpoint as the other games: `POST /api/rooms/<CODE>/game/action`, with an `actionId`, `expectedStateVersion`, and the game-specific `action`. Follow existing examples for stale-state handling and simultaneous submissions.

Register the game in both places:

1. `src/games/registry.js` — lobby name, description, emoji/icon, color, page path, player limits, interaction model, and late-join policy.
2. `worker/src/games/registry.js` — import the server game module and call `registerServerGame(yourGame)`.

Both IDs must match exactly. Set the frontend entry's status to `ready` only when the page and server rules are implemented.

## 4. Test before pushing

Test with at least two separate browser sessions, not just one tab:

- Creating and joining a party works.
- The host can start the game and return everyone to the lobby.
- Minimum and maximum player counts are enforced.
- Invalid, duplicate, and stale actions are rejected safely.
- Private submissions remain private until the intended reveal.
- Simultaneous submissions resolve once and only once.
- Reconnects and spectators follow the declared rules.
- Mobile-sized layouts remain usable and accessible.

Run any project checks available for your changes. Also inspect the browser console and Worker logs. Do not claim a test passed unless you actually ran it.

## 5. Commit and push

Review the changes, then commit and push your branch:

```bash
git status
git diff --check
git add src/games/<game-id> src/games/registry.js worker/src/games/<game-id>.js worker/src/games/registry.js
git commit -m "Add <game name>"
git push -u origin add-my-game
```

If you are working in a fork, `origin` should point to your fork. Open a pull request from your branch into the repository's default branch and describe the rules, player limits, tests performed, and any deployment requirements.

## 6. Deploying

The frontend is published through the repository's existing GitHub Pages workflow. Server-side game changes require deploying the Cloudflare Worker from the `worker` directory with the project's configured Cloudflare account:

```bash
cd worker
npx wrangler deploy
```

Only people with the required repository and Cloudflare permissions can publish directly. Contributors without those permissions should submit a pull request and let a maintainer deploy the approved change.

## Existing examples

- `src/games/tic-tac-toe/` and `worker/src/games/tic-tac-toe.js` — turn-based game.
- `src/games/bullet-matrix/` and `worker/src/games/bullet-matrix.js` — simultaneous hidden actions.
- `src/games/questionable-answers/` and `worker/src/games/questionable-answers.js` — private submissions followed by a shared reveal.
