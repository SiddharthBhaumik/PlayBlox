import assert from "node:assert/strict";
import { buildHandCricketAnalytics } from "../src/games/hand-cricket/analytics.js";

const state = {
  config: { mode: "team", unlimited: false, limit: 3 },
  history: [
    { innings: 1, battingTeam: "red", batterId: "a", bowlerId: "c", runs: 2, out: false },
    { innings: 1, battingTeam: "red", batterId: "a", bowlerId: "c", runs: 1, out: true },
    { innings: 1, battingTeam: "red", batterId: "b", bowlerId: "c", runs: 3, out: false },
    { innings: 2, battingTeam: "blue", batterId: "c", bowlerId: "a", runs: 4, out: false }
  ]
};
const result = buildHandCricketAnalytics(state);
assert.equal(result.playerTotals.a.runs, 3);
assert.equal(result.playerTotals.a.dismissals, 1);
assert.equal(result.playerTotals.c.wicketsTaken, 1);
assert.equal(result.innings.length, 2);
assert.deepEqual(result.innings[0].points.map(x => x.runs), [2, 3, 6]);
assert.equal(result.overs[0].balls, 3);
assert.equal(result.stages.find(x => x.playerId === "a" && x.kind === "batting").balls, 2);

const unlimited = buildHandCricketAnalytics({
  config: { mode: "team", unlimited: true, limit: 0 },
  history: Array.from({ length: 13 }, (_, i) => ({
    innings: 1, battingTeam: "red", batterId: "a", bowlerId: "b", runs: 1, out: false
  }))
});
assert.equal(unlimited.stages.find(x => x.kind === "batting" && x.stage === "Overs 1–2").balls, 12);
assert.equal(unlimited.stages.find(x => x.kind === "batting" && x.stage === "Overs 3–4").balls, 1);

const individual = buildHandCricketAnalytics({
  config: { mode: "individual", unlimited: false, limit: 6 },
  history: Array.from({ length: 6 }, (_, i) => ({
    innings: 1, batterId: "p1", bowlerId: "p2", runs: i + 1, out: false
  }))
});
assert.equal(individual.playerTotals.p1.runs, 21);
assert.equal(individual.innings[0].points.at(-1).runs, 21);
assert.equal(individual.stages.find(x => x.playerId === "p1" && x.kind === "batting" && x.stage === "Early").balls, 2);
console.log("Hand Cricket analytics tests passed.");
