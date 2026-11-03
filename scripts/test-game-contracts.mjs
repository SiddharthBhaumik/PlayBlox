import assert from "node:assert/strict";
import { gameRegistry } from "../src/games/registry.js";
import { listServerGames, getServerGame } from "../worker/src/games/registry.js";
import { SPECTRUMS } from "../worker/src/games/wavelength-spectrums.js";
import { wouldYouRather } from "../worker/src/games/would-you-rather.js";
import { sixtySeven } from "../worker/src/games/67.js";

assert.ok(SPECTRUMS.length >= 500, "Wavelength must provide at least 500 spectrum pairs");
assert.equal(new Set(SPECTRUMS.map(pair => `${pair.left}|${pair.right}`)).size, SPECTRUMS.length, "Wavelength spectrum pairs must be unique");

const serverGames = listServerGames();
const player = (id) => ({ id, nickname: `Player ${id}`, isHost: id === "p1", connected: true, role: "player" });

for (const frontend of gameRegistry.filter(game => game.status === "ready" || game.status === "beta")) {
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

assert.equal(serverGames.length, gameRegistry.filter(game => game.status === "ready" || game.status === "beta").length,
  "Every ready frontend game must have exactly one server game module");

console.log(`Game smoke tests passed for ${serverGames.length} server-authoritative games.`);

const wyrPlayers = [player("p1"), player("p2"), player("p3")];
const wyrContext = (currentPlayer) => ({
  room: { code: "ABC234", name: "Test Party", gameId: "would-you-rather", lifecycle: "playing" },
  player: currentPlayer,
  players: wyrPlayers,
  game: { id: "would-you-rather", interactionModel: "simultaneous", lateJoinPolicy: "spectate" },
});
assert.equal((await wouldYouRather.canStart(wyrContext(wyrPlayers[0]))).ok, true);
let wyrState = wouldYouRather.createInitialState(wyrContext(wyrPlayers[0]));
assert.equal(wyrState.currentMasterId, "p1");
assert.equal((await wouldYouRather.validateAction(wyrContext(wyrPlayers[0]), wyrState, {
  type: "set-question", turnNumber: 1, question: "Test?", optionA: "A", optionB: "B", predictedPercentA: 50,
})).ok, true);
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[0]), wyrState, {
  type: "set-question", question: "Test?", optionA: "A", optionB: "B", predictedPercentA: 50,
});
assert.equal(wyrState.phase, "answers");
assert.equal("predictedPercentA" in wouldYouRather.getPublicState(wyrState).currentQuestion, false,
  "The master's percentage prediction must remain hidden until reveal");
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[1]), wyrState, {
  type: "submit-answer", choice: "A", targetId: "p3", predictedChoice: "B",
});
assert.equal(wyrState.phase, "answers", "Answers should remain private until every answerer submits");
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[2]), wyrState, {
  type: "submit-answer", choice: "B", targetId: "p2", predictedChoice: "A",
});
assert.equal(wyrState.history.length, 1);
assert.equal(wyrState.history[0].masterPoints, 10);
assert.equal(wyrState.scores.p1, 10);
assert.equal(wyrState.scores.p2, 3);
assert.equal(wyrState.scores.p3, 3);
assert.equal(wyrState.currentMasterId, "p2");

wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[1]), wyrState, {
  type: "set-question", question: "Round one, turn two?", optionA: "A", optionB: "B", predictedPercentA: 50,
});
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[0]), wyrState, {
  type: "submit-answer", choice: "A", targetId: "p3", predictedChoice: "B",
});
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[2]), wyrState, {
  type: "submit-answer", choice: "B", targetId: "p1", predictedChoice: "A",
});
assert.equal(wyrState.phase, "question");
assert.equal(wyrState.turnNumber, 3);
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[2]), wyrState, {
  type: "set-question", question: "Round one, turn three?", optionA: "A", optionB: "B", predictedPercentA: 50,
});
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[0]), wyrState, {
  type: "submit-answer", choice: "A", targetId: "p2", predictedChoice: "B",
});
wyrState = wouldYouRather.reduceAction(wyrContext(wyrPlayers[1]), wyrState, {
  type: "submit-answer", choice: "B", targetId: "p1", predictedChoice: "A",
});
assert.equal(wyrState.phase, "finished", "A round should finish after every player has been Question Master once");

const scoresBeforeContinue = { ...wyrState.scores };
const historyBeforeContinue = wyrState.history.length;
const nextWyrState = wouldYouRather.startNextRound(wyrContext(wyrPlayers[0]), wyrState, "continue");
assert.equal(nextWyrState.round, 2);
assert.equal(nextWyrState.phase, "question");
assert.equal(nextWyrState.turnNumber, 1);
assert.equal(nextWyrState.currentMasterId, "p1");
assert.deepEqual(nextWyrState.scores, scoresBeforeContinue, "Continue must preserve every player's cumulative score");
assert.equal(nextWyrState.history.length, historyBeforeContinue, "Continue must preserve the previous round history");
assert.deepEqual(nextWyrState.completedMasterIds, [], "Every player gets a fresh Question Master turn in the next round");
const twoPlayerContext = { ...wyrContext(wyrPlayers[0]), players: wyrPlayers.slice(0, 2) };
assert.equal((await wouldYouRather.canStart(twoPlayerContext)).ok, true,
  "Would You Rather must support the minimum two-player game");


// 67 Beta: private hands, authoritative actions, special-card interactions, and win state.
const p67 = [player("p1"), player("p2")];
const ctx67 = { players: p67, player: p67[0] };
assert.equal((await sixtySeven.canStart(ctx67)).ok, true);
let s67 = sixtySeven.createInitialState(ctx67);
assert.equal(s67.total, 13);
assert.equal(s67.hands.p1.actions.length, 6);
assert.equal(new Set(s67.hands.p1.actions).size, 6);
const public67 = sixtySeven.getPublicState(s67);
assert.equal("hands" in public67, false);
assert.equal("dice" in public67, false);
assert.equal("hidden" in public67, false);
assert.equal("glitches" in public67.effects, false);
assert.equal(sixtySeven.getPrivateState(s67, "p1").hand.actions.length, 6);
assert.equal("hands" in sixtySeven.getPrivateState(s67, "p2"), false);

// Set Total uses D6 as tens and D7 as ones, and wins on exactly 67.
s67.hands.p1.actions = ["set-total"];
s67.dice = [6, 7];
s67 = sixtySeven.reduceAction(ctx67, s67, { type: "select-action", card: "set-total", dieIndex: 0 });
s67 = sixtySeven.reduceAction(ctx67, s67, { type: "confirm-action" });
assert.equal(s67.total, 67);
assert.equal(s67.winnerId, "p1");
assert.equal(sixtySeven.getStatus(ctx67, s67), "finished");

// A secret Glitch changes only the owner's private rules until its effect is used.
let glitch67 = sixtySeven.createInitialState(ctx67);
glitch67.hands.p1.special = "glitch";
glitch67 = sixtySeven.reduceAction(ctx67, glitch67, { type: "activate-special", swap: ["addition", "multiplication"] });
assert.equal(glitch67.effects.glitches.length, 1);
assert.equal(sixtySeven.getPublicState(glitch67).lastEvent.type, "turn-started");
assert.equal(sixtySeven.getPrivateState(glitch67, "p1").glitchMappings.length, 1);
assert.equal(sixtySeven.getPrivateState(glitch67, "p2").glitchMappings.length, 0);

// Delayed Fate stores the original card before Glitch transforms it.
let delayed67 = sixtySeven.createInitialState(ctx67);
delayed67.hands.p1.special = "delayed-fate";
delayed67.hands.p1.actions = ["addition"];
delayed67.effects.glitches = [{ owner: "p2", a: "addition", b: "multiplication" }];
delayed67 = sixtySeven.reduceAction(ctx67, delayed67, { type: "select-action", card: "addition", dieIndex: 0 });
assert.equal(delayed67.selection.effective, "multiplication");
delayed67 = sixtySeven.reduceAction(ctx67, delayed67, { type: "activate-special" });
assert.equal(delayed67.pending[0].type, "addition");
assert.equal(sixtySeven.getPublicState(delayed67).lastEvent.type, "turn-started");

// Bookmark can be restored on the owner's following turn.
let bookmark67 = sixtySeven.createInitialState(ctx67);
bookmark67.hands.p1.special = "bookmark";
bookmark67 = sixtySeven.reduceAction(ctx67, bookmark67, { type: "activate-special" });
bookmark67.total = 44;
bookmark67.turnNumber = 2;
assert.equal((await sixtySeven.validateAction(ctx67, bookmark67, { type: "restore-bookmark" })).ok, true);
bookmark67 = sixtySeven.reduceAction(ctx67, bookmark67, { type: "restore-bookmark" });
assert.equal(bookmark67.total, 13);
assert.equal(bookmark67.bookmarks.p1, undefined);

// Two overlapping Blind Spots hide both dice from a player affected by both.
const p67three = [...p67, player("p3")];
const ctx67three = { players: p67three, player: p67three[2] };
let blind67 = sixtySeven.createInitialState(ctx67three);
blind67.turnIndex = 2;
blind67.dice = [4, 5];
blind67.hidden = [0, 1];
blind67.effects.blinds = [{ owner: "p1" }, { owner: "p2" }];
assert.deepEqual(sixtySeven.getPrivateState(blind67, "p3").dice, [null, null]);

// Chain Reaction carries the activating player's pair to the next player's turn.
let chain67 = sixtySeven.createInitialState(ctx67);
chain67.hands.p1.actions = ["addition"];
chain67.dice = [1, 2];
chain67.effects.chain = { owner: "p1", dice: [5, 6] };
chain67 = sixtySeven.reduceAction(ctx67, chain67, { type: "select-action", card: "addition", dieIndex: 0 });
chain67 = sixtySeven.reduceAction(ctx67, chain67, { type: "confirm-action" });
assert.deepEqual(sixtySeven.getPrivateState(chain67, "p2").dice, [5, 6]);

console.log("67 Beta rule checks passed.");
