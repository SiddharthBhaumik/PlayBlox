import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { gameRegistry } from "../src/games/registry.js";
import { listServerGames } from "../worker/src/games/registry.js";

const fail = (message) => { throw new Error(message); };
const unique = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) fail(`Duplicate ${label}: ${item}`);
    seen.add(item);
  }
};

unique(gameRegistry.map(game => game.id), "frontend game id");
const readyGames = gameRegistry.filter(game => game.status === "ready");
assert.ok(readyGames.length > 0, "At least one game must be ready");

for (const game of gameRegistry) {
  assert.match(game.id, /^[a-z0-9-]+$/, `Invalid frontend id: ${game.id}`);
  assert.ok(game.name?.trim(), `Missing name for ${game.id}`);
  assert.ok(game.description?.trim(), `Missing description for ${game.id}`);
  assert.ok(["ready", "coming-soon"].includes(game.status), `Invalid status for ${game.id}`);
  if (game.status !== "ready") continue;
  assert.ok(game.path, `Ready game ${game.id} has no frontend entry path`);
  assert.ok(game.guide?.trim(), `Ready game ${game.id} has no player guide`);
  assert.ok(game.players && Number.isInteger(game.players.min) && Number.isInteger(game.players.max)
    && game.players.min >= 1 && game.players.max >= game.players.min,
    `Invalid frontend player limits for ${game.id}`);
  assert.ok(existsSync(resolve(game.path.replace(/^\.\//, ""))),
    `Frontend entry does not exist for ${game.id}: ${game.path}`);
}

const serverGames = listServerGames();
unique(serverGames.map(game => game.id), "server game id");
const serverById = new Map(serverGames.map(game => [game.id, game]));
const frontendReadyIds = new Set(readyGames.map(game => game.id));
const serverIds = new Set(serverGames.map(game => game.id));

for (const game of readyGames) {
  const server = serverById.get(game.id);
  assert.ok(server, `Ready frontend game ${game.id} is missing from the server registry`);
  assert.equal(server.name, game.name, `Game name differs for ${game.id}`);
  assert.equal(server.description, game.description, `Game description differs for ${game.id}`);
  assert.equal(server.entry, game.path, `Frontend/server entry paths differ for ${game.id}`);
  assert.deepEqual(server.players, game.players, `Player limits differ for ${game.id}`);
  assert.equal(server.interactionModel, game.interactionModel, `Interaction model differs for ${game.id}`);
  assert.equal(server.lateJoinPolicy, game.lateJoinPolicy, `Late-join policy differs for ${game.id}`);
  assert.deepEqual(server.spectators, game.spectators, `Spectator support differs for ${game.id}`);
  assert.equal(server.guide, game.guide, `Guide differs between frontend and server for ${game.id}`);
  const serverModulePath = resolve("worker/src/games", `${game.id}.js`);
  assert.ok(existsSync(serverModulePath), `Server game module is missing for ${game.id}: ${serverModulePath}`);
}

for (const server of serverGames) {
  assert.ok(frontendReadyIds.has(server.id), `Server game ${server.id} is not registered as ready in the frontend`);
}

const core = await import("node:fs/promises").then(fs => fs.readFile("worker/src/index.js", "utf8"));
assert.ok(!/gameId\s*===\s*["'](?:tic-tac-toe|bullet-matrix|questionable-answers|wavelength)["']/.test(core),
  "Shared room lifecycle must not branch on individual game IDs");

console.log(`Game architecture validation passed: ${readyGames.length} frontend games match ${serverGames.length} server modules.`);
