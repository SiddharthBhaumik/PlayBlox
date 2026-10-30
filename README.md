# PlayBlox

- [Tic-Tac-Toe](./src/games/tic-tac-toe/index.html)
- [Bullet Matrix](./src/games/bullet-matrix/index.html)
- [Questionable Answers](./src/games/questionable-answers/index.html)
- [Decrypto](./src/games/decrypto/index.html)


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

## Active player roster contract

The server keeps two separate lists for every active match:

- `originalPlayerIds` records who started the match.
- `activePlayerIds` records who is still participating. This is the roster used for progress counters and submission quorums.

Every server game must declare `players.min` and implement:

```js
onPlayerLeave(context, state, playerId) {
  // Return a valid updated game state whose playerOrder excludes playerId.
  // Return null when the game cannot continue with the remaining players.
}
```

The shared room lifecycle calls this hook for both **Leave game and return to lobby** and host kicks. If the remaining roster meets the game's minimum and the hook returns a valid state, the match continues with the remaining players. Otherwise the party returns to the lobby. A player who leaves voluntarily stays in the party as a waiting member; a kicked player is removed from the party.

When adding a game, update this hook alongside action validation and state reduction. Recalculate every phase's expected submissions from the updated `playerOrder`; never use the original match size as the live expected count.
