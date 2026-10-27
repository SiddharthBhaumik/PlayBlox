/**
 * Server-side game module registry. Register game modules here; shared room
 * code calls their contract hooks and must not branch on individual game IDs.
 */
import { ticTacToe } from "./tic-tac-toe.js";

const serverGames = new Map();

export function registerServerGame(game) {
  if (!game || typeof game.id !== "string" || !/^[a-z0-9-]+$/.test(game.id)) throw new TypeError("A game needs a stable lowercase id.");
  if (serverGames.has(game.id)) throw new Error("Duplicate game id: " + game.id);
  if (!["turn-based", "simultaneous", "realtime"].includes(game.interactionModel)) throw new TypeError("Invalid interactionModel for " + game.id);
  if (!["participate", "spectate", "wait"].includes(game.lateJoinPolicy)) throw new TypeError("Invalid lateJoinPolicy for " + game.id);
  if (!game.players || !Number.isInteger(game.players.min) || !Number.isInteger(game.players.max) || game.players.min < 1 || game.players.max < game.players.min) {
    throw new TypeError("Invalid player limits for " + game.id);
  }
  serverGames.set(game.id, Object.freeze({ ...game }));
}

registerServerGame(ticTacToe);

export function getServerGame(id) { return serverGames.get(id) || null; }
export function listServerGames() {
  return [...serverGames.values()].map(({ id, name, description, players, interactionModel, lateJoinPolicy }) =>
    ({ id, name, description, players, interactionModel, lateJoinPolicy }));
}
