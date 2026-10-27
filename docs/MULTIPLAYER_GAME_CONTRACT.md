# PlayBlox Multiplayer Game Contract

This document defines the boundary between the shared PlayBlox platform and individual games. New games should implement this contract instead of adding game-specific branches to the lobby or party service.

## Architecture rule

Shared platform code owns identity, party membership, presence, reconnects, host permissions, game lifecycle, message routing, state versioning, and transport. A game module owns its rules, game state, accepted actions, rendering, and results.

The platform must not assume that every game is turn-based. A game can declare a turn-based, simultaneous-action, or real-time interaction model.

## Game module metadata

Each game should export a descriptor with:

- `id`: stable, URL-safe identifier.
- `name`, `description`, `emoji`, and optional `color`: catalog presentation.
- `entry`: the game's own page or client entry point.
- `players.min` and `players.max`: supported player range.
- `lateJoinPolicy`: `participate`, `spectate`, or `wait`.
- `interactionModel`: `turn-based`, `simultaneous`, or `realtime`.

The catalog can use presentation metadata without importing game rules. A game should not modify the homepage or shared lobby to appear in the catalog.

## Runtime contract

The multiplayer runtime will provide a context containing the room identifier, game identifier, current player identity, host permissions, a read-only player/presence snapshot, and helpers for sending validated game actions and subscribing to authoritative updates.

A game implementation will provide the following lifecycle hooks:

1. `createInitialState(context)` — return a JSON-serializable initial state.
2. `canStart(context)` — explain whether the current roster meets the game's start conditions.
3. `validateAction(context, state, action)` — reject invalid, unauthorized, out-of-turn, or malformed actions.
4. `reduceAction(context, state, action)` — return the next authoritative state for an accepted action.
5. `getStatus(context, state)` — report whether the game is active, finished, or waiting.
6. `getResults(context, state)` — return a serializable result summary when finished.

Hooks are game-specific, but the platform calls them through one shared interface. The platform must validate message size, sender identity, game lifecycle, and state version before passing an action to a game.

## Lifecycle and state guarantees

The shared lifecycle is `lobby → starting → playing → results → lobby`. Individual games can define setup and result presentation, but should not invent a separate party lifecycle. Every accepted state transition receives a monotonically increasing version. Retried actions should carry an action ID so the runtime can avoid applying the same action twice.

## Presence and reconnects

A temporary network loss is not an intentional leave. The platform reserves the player's seat during a reconnect grace period, publishes their connection state, and restores the same player identity when their token reconnects. Games may react to presence changes, but cannot override the shared reconnect policy.

## Adding a game checklist

1. Create a folder under `src/games/<game-id>/`.
2. Add a descriptor and implement the runtime hooks.
3. Add the descriptor to the game registry.
4. Add the game's own UI/assets and focused tests.
5. Verify start/finish conditions, invalid actions, late joins, reconnects, and host disconnects.

If adding a game requires editing the lobby, room transport, or shared lifecycle for that game's rules, the boundary has been violated and the abstraction should be improved first.
