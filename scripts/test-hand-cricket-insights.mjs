import assert from "node:assert/strict";
import { buildHandCricketInsights } from "../src/games/hand-cricket/insights.js";

const state = {
  config: { mode: "team", allowFist: false },
  history: [
    { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:5, bowlChoice:2, runs:5, out:false, superOver:false },
    { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:5, bowlChoice:1, runs:5, out:false, superOver:false },
    { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:6, bowlChoice:3, runs:6, out:false, superOver:false },
    { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:3, bowlChoice:3, runs:0, out:true, superOver:false },
    { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:2, bowlChoice:4, runs:2, out:false, superOver:false },
    { innings:1, battingTeam:"red", batterId:"b", bowlerId:"c", batChoice:1, bowlChoice:6, runs:1, out:false, superOver:false },
    { innings:1, battingTeam:"red", batterId:"b", bowlerId:"c", batChoice:4, bowlChoice:4, runs:0, out:true, superOver:false },
    { innings:2, battingTeam:"blue", batterId:"c", bowlerId:"a", batChoice:4, bowlChoice:2, runs:4, out:false, superOver:false },
    { innings:2, battingTeam:"blue", batterId:"c", bowlerId:"a", batChoice:6, bowlChoice:1, runs:6, out:false, superOver:false },
    { innings:2, battingTeam:"blue", batterId:"c", bowlerId:"a", batChoice:1, bowlChoice:1, runs:0, out:true, superOver:false },
    { innings:3, battingTeam:"red", batterId:"a", bowlerId:"c", batChoice:6, bowlChoice:6, runs:0, out:true, superOver:true }
  ]
};
const roster = [
  {id:"a", nickname:"Alice"},
  {id:"b", nickname:"Bob"},
  {id:"c", nickname:"Charlie"}
];

const result = buildHandCricketInsights(state, roster);
assert.equal(result.deliveryCount, 10, "Super Over deliveries are excluded from regular-innings insights");
assert.equal(result.overall.deliveries, 10);
assert.equal(result.overall.runs, 29);
assert.equal(result.overall.bowlerCorrectPredictions, 3);
assert.equal(result.overall.bowlerPredictionAccuracy, 0.3);
assert.equal(result.overall.averageNumericBattingSelection, 3.7);
assert.equal(result.overall.highNumberRate, 0.4);
assert.equal(result.overall.battingSelectionDistribution.find(x => x.choice === "5").count, 2);
assert.equal(result.overall.bowlingSelectionDistribution.reduce((n, x) => n + x.count, 0), 10);

const alice = result.players.a;
assert.equal(alice.username, "Alice");
assert.equal(alice.batting.deliveries, 5);
assert.equal(alice.batting.runs, 18);
assert.equal(alice.batting.averageNumericSelection, 4.2);
assert.equal(alice.batting.highNumberRate, 0.6);
assert.equal(alice.batting.transitions.transitions, 4);
assert.equal(alice.batting.transitions.repeats, 1);
assert.equal(alice.batting.transitions.switches, 3);
assert.equal(alice.batting.transitions.matrix["5"].counts["5"], 1);
assert.equal(alice.batting.transitions.matrix["5"].counts["6"], 1);
assert.equal(alice.batting.selectionsAfterPreviousOutcome["after-5-or-6-runs"].total, 3);
assert.equal(alice.batting.selectionsAfterPreviousOutcome["after-wicket"].counts["2"], 1);
assert.equal(alice.bowling.predictionAccuracy, 1 / 3);
assert.equal(alice.bowling.predictionAccuracyByBatterChoice["1"].correct, 1);

const matchup = result.matchups.find(row => row.batterId === "a" && row.bowlerId === "c");
assert.equal(matchup.batterUsername, "Alice");
assert.equal(matchup.bowlerUsername, "Charlie");
assert.equal(matchup.deliveries, 5);
assert.equal(matchup.runs, 18);
assert.equal(matchup.dismissals, 1);
assert.equal(matchup.predictionAccuracy, 0.2);
assert.equal(matchup.batterChoiceGivenBowlerChoice["3"].total, 2);
assert.equal(matchup.batterChoiceGivenBowlerChoice["3"].counts["6"], 1);
assert.equal(matchup.batterChoiceGivenBowlerChoice["3"].counts["3"], 1);
assert.equal(matchup.batterChoiceAfterBowlerPreviousChoice["2"].counts["5"], 1);

const empty = buildHandCricketInsights({config:{mode:"individual",allowFist:false},history:[]});
assert.equal(empty.deliveryCount, 0);
assert.equal(empty.overall.runsPerDelivery, null);
assert.equal(empty.overall.battingSelectionEntropy.bits, 0);
assert.equal(empty.players.a, undefined);

const withFist = buildHandCricketInsights({
  config:{mode:"individual",allowFist:true},
  history:[
    {batterId:"a",bowlerId:"b",batChoice:"fist",bowlChoice:3,runs:3,out:false},
    {batterId:"a",bowlerId:"b",batChoice:"fist",bowlChoice:"fist",runs:0,out:true}
  ]
}, roster);
assert.equal(withFist.overall.uniformRandomPredictionBaseline, 1/7);
assert.equal(withFist.players.a.batting.fistRate, 1);
assert.equal(withFist.players.a.batting.selectionDistribution.find(x=>x.choice==="fist").count, 2);

const individual = buildHandCricketInsights({
  config:{mode:"individual",allowFist:false},
  history:[
    {innings:1,batterId:"a",bowlerId:"b",batChoice:2,bowlChoice:1,runs:2,out:false},
    {innings:1,batterId:"a",bowlerId:"b",batChoice:4,bowlChoice:4,runs:0,out:true},
    {innings:2,batterId:"b",bowlerId:"a",batChoice:6,bowlChoice:2,runs:6,out:false}
  ]
}, roster);
assert.equal(individual.teamMode, false);
assert.equal(individual.players.a.batting.deliveries, 2);
assert.equal(individual.players.a.bowling.deliveries, 1);


const separatedAppearances = buildHandCricketInsights({
  config:{mode:"team",allowFist:false},
  history:[
    {innings:1,battingTeam:"red",batterId:"a",bowlerId:"c",batChoice:2,bowlChoice:1,runs:2,out:false},
    {innings:1,battingTeam:"red",batterId:"b",bowlerId:"c",batChoice:4,bowlChoice:2,runs:4,out:false},
    {innings:1,battingTeam:"red",batterId:"a",bowlerId:"c",batChoice:6,bowlChoice:3,runs:6,out:false}
  ]
}, roster);
assert.equal(separatedAppearances.players.a.batting.transitions.transitions, 0,
  "A returning batter's separate appearance must not create a false transition from their earlier turn");

console.log("Hand Cricket phase-one insights tests passed.");
