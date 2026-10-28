# Adding a game to PlayBlox

PlayBlox is designed so that game rules live in game modules and the party, lobby,
transport, reconnection, and room lifecycle stay in shared infrastructure.

## Game boundaries

- `src/app.js`: shared party creation/joining, lobby, connection, navigation, and lifecycle UI. Do not add game-specific branches here.
- `src/games/<id>/`: the game's own HTML, CSS, and browser JavaScript.
- `src/games/registry.js`: browser-facing metadata and the entry path.
- `worker/src/games/<id>.js`: authoritative rules, state transitions, action validation, public state, and results.
- `worker/src/games/registry.js`: imports and registers server game modules.
- `worker/src/index.js`: generic room API and lifecycle. Do not branch on individual game IDs here. Add optional game-specific behavior as an explicit contract capability on that game's module.

## Add a game checklist

1. Pick one stable lowercase kebab-case ID, such as `memory-match`.
2. Add the browser entry point and its own CSS/JS under `src/games/<id>/`.
3. Implement the server module under `worker/src/games/<id>.js`. Keep authoritative state and validation on the server.
4. Register the same ID in both registries. Keep `guide`, `players`, `interactionModel`, `lateJoinPolicy`, and `spectators` consistent. The browser entry path must exist.
5. Keep private/in-progress submissions out of public state. Expose only what the other players need to see.
6. Use the existing guide-ready, start, action, finish, and rematch lifecycle rather than implementing a parallel party lifecycle.
7. If the game needs an exceptional lifecycle policy, declare a capability on the game module and have shared infrastructure consult that capability. Never check a particular game ID in shared code.
8. Run `npm test` from the repository root before committing. The checks validate JavaScript syntax, duplicate IDs, entry files, required metadata, and frontend/server registry consistency.
9. Test a party with the minimum player count, normal play, disconnect/reconnect, finish, and rematch before considering the game complete.

## Local checks

Requires Node.js 22 or later. From the repository root:

```sh
npm test
```

The GitHub Actions workflow `.github/workflows/validate-architecture.yml` runs the same checks on pushes and pull requests. These checks catch structural regressions; they do not replace browser-based multiplayer testing.
