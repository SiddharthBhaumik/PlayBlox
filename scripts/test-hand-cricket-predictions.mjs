import assert from "node:assert/strict";
import { buildHandCricketPredictions } from "../src/games/hand-cricket/prediction.js";

const history = [
  { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:5, bowlChoice:2, runs:5, out:false },
  { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:5, bowlChoice:1, runs:5, out:false },
  { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:5, bowlChoice:1, runs:5, out:false },
  { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:2, bowlChoice:5, runs:2, out:false },
  { innings:1, battingTeam:"red", batterId:"b", bowlerId:"c", batChoice:4, bowlChoice:3, runs:4, out:false },
  { innings:2, battingTeam:"blue", batterId:"a", bowlerId:"c", batChoice:1, bowlChoice:2, runs:1, out:false },
  { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:6, bowlChoice:6, runs:0, out:true, superOver:true }
];
const state = { config:{mode:"team",allowFist:false}, history };
const result = buildHandCricketPredictions(state);

assert.equal(result.enabled, true);
assert.equal(result.teamMode, true);
assert.equal(result.evaluatedDeliveries, 6, "Super Over rows must be excluded");
assert.deepEqual(result.choices, ["1","2","3","4","5","6"]);
assert.equal(result.predictions.length, 6);
assert.equal(result.predictions[0].models.uniform.probabilities["1"], 1/6);
assert.equal(result.predictions[0].evidence.global, 0);
assert.equal(result.predictions[1].evidence.global, 1);
assert.equal(result.predictions[1].evidence.batter, 1);
assert.equal(result.predictions[1].previousBatterChoice, "5");
assert.equal(result.predictions[5].evidence.global, 0);
assert.equal(result.predictions[5].evidence.batter, 0);
assert.equal(result.predictions[5].previousBatterChoice, null);
assert.equal(result.predictions[1].previousSameMatchupBowlerChoice, "2");
assert.equal(result.predictions[4].previousSameMatchupBowlerChoice, null);

for (const prediction of result.predictions) {
  for (const model of Object.values(prediction.models)) {
    const probabilities = Object.values(model.probabilities);
    assert.ok(probabilities.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    assert.ok(Math.abs(probabilities.reduce((a,b)=>a+b,0)-1) < 1e-10);
    assert.equal("fist" in model.probabilities, false);
  }
}
assert.equal(result.metrics.uniform.samples, 6);
assert.equal(result.metrics.global.samples, 6);
assert.equal(result.metrics.contextual.samples, 6);
assert.ok(result.metrics.contextual.logLoss >= 0);
assert.ok(result.metrics.contextual.brierScore >= 0);

// Dismissal starts a new batter appearance: the returning batter must not
// inherit their previous sequential choice or transition evidence.
const dismissal = buildHandCricketPredictions({
  config:{mode:"team",allowFist:false},
  history:[
    {innings:1,battingTeam:"red",batterId:"a",bowlerId:"x",batChoice:5,bowlChoice:2,runs:5,out:false},
    {innings:1,battingTeam:"red",batterId:"a",bowlerId:"x",batChoice:4,bowlChoice:4,runs:0,out:true},
    {innings:1,battingTeam:"red",batterId:"b",bowlerId:"x",batChoice:3,bowlChoice:1,runs:3,out:false},
    {innings:1,battingTeam:"red",batterId:"a",bowlerId:"x",batChoice:2,bowlChoice:6,runs:2,out:false}
  ]
});
const returningBatter = dismissal.predictions[3];
assert.equal(returningBatter.batterAppearance, 1);
assert.equal(returningBatter.previousBatterChoice, null);
assert.equal(returningBatter.evidence.batterTransition, 0);
assert.equal(returningBatter.evidence.batter, 2, "Marginal batter frequency remains available after return");

const withFist = buildHandCricketPredictions({
  config:{mode:"team",allowFist:true},
  history:[{innings:1,battingTeam:"red",batterId:"a",bowlerId:"b",batChoice:"fist",bowlChoice:2,runs:2,out:false}]
});
assert.equal(withFist.choices.length, 7);
assert.equal(withFist.predictions[0].actualChoice, "fist");
assert.ok(Math.abs(withFist.predictions[0].models.uniform.probabilities.fist - 1/7) < 1e-12);

const individual = buildHandCricketPredictions({
  config:{mode:"individual",allowFist:true},
  history:[{innings:1,batterId:"a",bowlerId:"b",batChoice:6,bowlChoice:6,runs:0,out:true}]
});
assert.equal(individual.enabled, false);
assert.equal(individual.teamMode, false);
assert.equal(individual.evaluatedDeliveries, 0);
assert.deepEqual(individual.predictions, []);

console.log("Hand Cricket Phase 2 prediction tests passed.");
