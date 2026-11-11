import assert from "node:assert/strict";
import { plotTwist } from "../worker/src/games/plot-twist.js";

const players = Array.from({ length: 4 }, (_, index) => ({
  id: "p" + (index + 1), nickname: "Player " + (index + 1),
  isHost: index === 0, connected: true, role: "player",
}));
const context = player => ({
  room: { code: "ABC234", gameId: "plot-twist", lifecycle: "playing" },
  player, players,
  game: { id: "plot-twist", interactionModel: "simultaneous", lateJoinPolicy: "wait" },
});
const host = players[0];
const byId = id => players.find(player => player.id === id);

assert.equal(plotTwist.canStart(context(host)).ok, true);
assert.deepEqual(plotTwist.players, { min: 3, max: 8 });
assert.equal(plotTwist.validateAction(context(host), plotTwist.createInitialState(context(host)), { type: "set-lines", value: 2 }).ok, false);
assert.equal(plotTwist.validateAction(context(players[1]), plotTwist.createInitialState(context(host)), { type: "set-lines", value: 6 }).ok, false);

let state = plotTwist.createInitialState(context(host));
assert.equal(state.phase, "setup");
state = plotTwist.reduceAction(context(host), state, { type: "set-lines", value: 6 });
assert.equal(state.phase, "starter");
assert.equal(state.linesPerStory, 6);

for (const player of players) {
  const action = { type: "submit-line", text: "Opening from " + player.nickname };
  assert.equal(plotTwist.validateAction(context(player), state, action).ok, true);
  state = plotTwist.reduceAction(context(player), state, action);
}
assert.equal(state.phase, "writing");
assert.equal(state.round, 1);
assert.equal(Object.keys(plotTwist.getPublicState(state)).includes("stories"), false);
assert.equal(JSON.stringify(plotTwist.getPublicState(state)).includes("Opening from"), false);

// Each story gets one contribution per player before any contributor repeats.
const assignments = Object.fromEntries(state.storyOrder.map(id => [id, []]));
for (let round = 1; round <= 5; round++) {
  const roundAssignments = new Map();
  for (const player of players) {
    const privateState = plotTwist.getPrivateState(state, player.id);
    assert.equal(privateState.mode, "writing");
    assert.equal(Object.hasOwn(privateState, "storyNumber"), false, "Story identity must not be exposed to players");
    const storyId = state.roundAssignments[player.id];
    roundAssignments.set(player.id, storyId);
    const action = { type: "submit-line", text: "Round " + round + " from " + player.nickname };
    assert.equal(plotTwist.validateAction(context(player), state, action).ok, true);
    state = plotTwist.reduceAction(context(player), state, action);
  }
  for (const [playerId, storyId] of roundAssignments) assignments[storyId].push(playerId);
  if (round < 5) assert.equal(state.phase, "writing");
}
assert.equal(state.phase, "reveal");
assert.equal(state.storyOrder.every(id => state.stories[id].lines.length === 6), true);
for (const storyId of state.storyOrder) {
  const authors = assignments[storyId];
  assert.equal(new Set(authors.slice(0, 4)).size, 4, "Every player must contribute before a repeat");
  assert.equal(authors[0], authors[4], "A contributor may repeat after a full rotation");
}
assert.equal(plotTwist.validateAction(context(players[1]), state, { type: "reveal-next" }).ok, false);
assert.equal(plotTwist.validateAction(context(host), state, { type: "reveal-next" }).ok, true);

let publicState = plotTwist.getPublicState(state);
assert.equal(publicState.revealedStories[0].lines.length, 1);
assert.equal(publicState.revealedStories[1].lines.length, 0);
for (let story = 0; story < players.length; story++) {
  for (let line = 1; line < 6; line++) {
    state = plotTwist.reduceAction(context(host), state, { type: "reveal-next" });
  }
  if (story < players.length - 1) {
    assert.equal(state.phase, "reveal");
    state = plotTwist.reduceAction(context(host), state, { type: "reveal-next" });
  }
}
assert.equal(state.phase, "reveal");
state = plotTwist.reduceAction(context(host), state, { type: "reveal-next" });
assert.equal(state.phase, "finished");
assert.equal(plotTwist.getPublicState(state).revealedStories.every(story => story.lines.length === 6), true);
assert.equal(plotTwist.getResults(context(host), state).stories.length, 4);

const tooShort = { ...context(host), players: players.slice(0, 2) };
assert.equal(plotTwist.canStart(tooShort).ok, false);
assert.equal(plotTwist.canStart({ ...context(host), players: Array.from({ length: 9 }, (_, i) => ({ ...players[0], id: "x" + i })) }).ok, false);

console.log("Plot Twist mechanics tests passed: setup, private prompts, 4-player rotation, repeat cycle, host reveal, and player limits.");
