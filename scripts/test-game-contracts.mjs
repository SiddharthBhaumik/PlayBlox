import assert from "node:assert/strict";
import { gameRegistry } from "../src/games/registry.js";
import { listServerGames, getServerGame } from "../worker/src/games/registry.js";
import { SPECTRUMS } from "../worker/src/games/wavelength-spectrums.js";

assert.ok(SPECTRUMS.length >= 500, "Wavelength must provide at least 500 spectrum pairs");
assert.equal(new Set(SPECTRUMS.map(pair => `${pair.left}|${pair.right}`)).size, SPECTRUMS.length, "Wavelength spectrum pairs must be unique");

const serverGames = listServerGames();
const player = (id) => ({ id, nickname: `Player ${id}`, isHost: id === "p1", connected: true, role: "player" });

for (const frontend of gameRegistry.filter(game => game.status === "ready")) {
  const game = getServerGame(frontend.id);
  assert.ok(game, `Missing server module for ${frontend.id}`);

  const players = Array.from({ length: frontend.players.min }, (_, index) => player(`p${index + 1}`));
  const context = {
    room: { code: "ABC234", name: "Test Party", gameId: game.id, lifecycle: "playing" },
    player: players[0],
    players,
    game: { id: game.id, interactionModel: game.interactionModel, lateJoinPolicy: game.lateJoinPolicy },
  };

  const startCheck = await game.canStart(context);
  assert.equal(startCheck?.ok, true, `${game.id} should start with its minimum valid player count`);

  const initialState = await game.createInitialState(context);
  assert.ok(initialState && typeof initialState === "object", `${game.id} must create an initial state`);
  assert.notEqual(await game.getStatus?.(context, initialState), "finished", `${game.id} should not start in a finished state`);

  const invalidAction = await game.validateAction(context, null, null);
  assert.ok(invalidAction === false || invalidAction?.ok === false,
    `${game.id} must reject an action when the game state is missing`);

  if (typeof game.getPublicState === "function") {
    const publicState = await game.getPublicState(initialState);
    assert.ok(publicState && typeof publicState === "object", `${game.id} must expose a public state object`);
    assert.doesNotThrow(() => JSON.stringify(publicState), `${game.id} public state must be JSON serializable`);
  }
}

assert.equal(serverGames.length, gameRegistry.filter(game => game.status === "ready").length,
  "Every ready frontend game must have exactly one server game module");

console.log(`Game smoke tests passed for ${serverGames.length} server-authoritative games.`);
