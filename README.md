# PlayBlox

- [Tic-Tac-Toe](./src/games/tic-tac-toe/index.html)
- [Bullet Matrix](./src/games/bullet-matrix/index.html)
- [Questionable Answers](./src/games/questionable-answers/index.html)


## Adding a game

Every game must include a concise, player-facing `guide` in both registries:

- `src/games/registry.js` — lobby card and player-facing metadata.
- `worker/src/games/<game>.js` — server-side game contract.

The guide should explain the objective, what a player does on each turn/phase, and how a round ends. Keep it readable in a short modal; avoid developer instructions.

Example:

```js
guide: "Explain the goal, the actions players can take, and how to win.",
```

The server rejects game registrations without a non-empty guide. When the host starts a game, selected players are sent to the guide dialog first. Each selected player must confirm that they have read it; the round stays locked until everyone confirms. Rematches show the guide again.

The lobby uses the frontend registry to render selectable game cards. Keep the game ID, name, player limits, guide, and other public metadata aligned between the frontend and server registries. The selected game is stored in the party room and broadcast to everyone in the lobby.
