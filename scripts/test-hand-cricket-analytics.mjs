import assert from "node:assert/strict";
import { buildHandCricketAnalytics, buildTeamPlayerScorecard, buildHandCricketExport } from "../src/games/hand-cricket/analytics.js";

const state = {
  config: { mode: "team" },
  history: [
    { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batterName:"A", runs:3, out:false, batChoice:3, bowlChoice:2, superOver:false },
    { innings:1, battingTeam:"red", batterId:"a", bowlerId:"c", batterName:"A", runs:2, out:true, reason:"Matching numbers", batChoice:4, bowlChoice:4, superOver:false },
    { innings:1, battingTeam:"red", batterId:"b", bowlerId:"c", batterName:"B", runs:1, out:false, batChoice:1, bowlChoice:6, superOver:false },
    { innings:2, battingTeam:"blue", batterId:"c", bowlerId:"a", batterName:"C", runs:5, out:false, batChoice:5, bowlChoice:2, superOver:false },
    { innings:2, battingTeam:"blue", batterId:"c", bowlerId:"a", batterName:"C", runs:2, out:true, reason:"Matching numbers", batChoice:2, bowlChoice:2, superOver:false },
    { innings:3, battingTeam:"red", batterId:"a", bowlerId:"c", runs:6, out:true, batChoice:6, bowlChoice:6, superOver:true }
  ]
};
const result=buildHandCricketAnalytics(state);
assert.equal(result.deliveries.length,5,"Super Over deliveries are excluded");
assert.equal(result.players.a.battingRuns,5);
assert.equal(result.players.a.dismissals,1);
assert.equal(result.players.c.wickets,1);
assert.equal(result.matchups.find(x=>x.batterId==="a"&&x.bowlerId==="c").runs,5);
assert.equal(result.matchups.find(x=>x.batterId==="a"&&x.bowlerId==="c").balls,2);
assert.equal(result.matchups.find(x=>x.batterId==="a"&&x.bowlerId==="c").dismissals,1);
assert.equal(result.matchups.find(x=>x.batterId==="a"&&x.bowlerId==="c").dismissalChoices[0],"4");
assert.equal(result.players.a.innings.find(x=>x.innings===1).runs,5);
assert.equal(result.players.a.innings.find(x=>x.innings===1).dismissalTeamRuns,5);
assert.equal(result.players.c.victims.length,1);
assert.equal(result.fallOfWickets.red[0].batterRuns,5);
assert.equal(result.fallOfWickets.red[0].teamRuns,5);
assert.equal(result.overall.ballsPerWicket,2.5);
assert.equal(result.overall.runsPerDismissedBatter,6);
assert.equal(result.overall.battingChoiceDistribution.reduce((n,x)=>n+x.count,0),5);
assert.equal(result.overall.choiceDistribution.reduce((n,x)=>n+x.count,0),10);
assert.equal(result.players.a.battingDistribution.reduce((n,x)=>n+x.count,0),2);
assert.equal(result.players.a.bowlingDistribution.reduce((n,x)=>n+x.count,0),2);

const individual=buildHandCricketAnalytics({
 config:{mode:"individual"},
 history:[
  {innings:1,batterId:"p1",bowlerId:"p2",runs:4,out:false,batChoice:4,bowlChoice:2,superOver:false},
  {innings:1,batterId:"p1",bowlerId:"p2",runs:3,out:true,batChoice:3,bowlChoice:3,superOver:false},
  {innings:2,batterId:"p2",bowlerId:"p1",runs:2,out:false,batChoice:2,bowlChoice:1,superOver:false}
 ]
});
assert.equal(individual.innings.length,2);
assert.equal(individual.players.p1.innings[0].runs,7);
assert.equal(individual.players.p1.innings[0].dismissed,true);
assert.equal(individual.overall.runsPerDismissedBatter,7);
assert.equal(individual.fallOfWickets.red.length,0);
const empty=buildHandCricketAnalytics({config:{mode:"team"},history:[]});
assert.equal(empty.overall.ballsPerWicket,null);
assert.equal(empty.overall.runsPerDismissedBatter,null);

const wildcardHistory = [
  {innings:1,superOver:false,superOverRound:0,battingTeam:"red",bowlingTeam:"blue",batterId:"wild",bowlerId:"blue1",runs:4,out:true,batChoice:4,bowlChoice:2},
  {innings:1,superOver:false,superOverRound:0,battingTeam:"red",bowlingTeam:"blue",batterId:"red1",bowlerId:"blue1",runs:1,out:true,batChoice:1,bowlChoice:3},
  {innings:1,superOver:false,superOverRound:0,battingTeam:"red",bowlingTeam:"blue",batterId:"wild",bowlerId:"blue1",runs:2,out:true,batChoice:2,bowlChoice:2},
  {innings:2,superOver:false,superOverRound:0,battingTeam:"blue",bowlingTeam:"red",batterId:"blue1",bowlerId:"wild",runs:3,out:false,batChoice:3,bowlChoice:1},
  {innings:2,superOver:false,superOverRound:0,battingTeam:"blue",bowlingTeam:"red",batterId:"blue1",bowlerId:"wild",runs:2,out:true,batChoice:2,bowlChoice:2},
  {innings:1,superOver:true,superOverRound:1,battingTeam:"blue",bowlingTeam:"red",batterId:"wild",bowlerId:"red1",runs:5,out:false,batChoice:5,bowlChoice:1}
];
const wildcardState = {
  config:{mode:"team",oddPlayerMode:"bat-bowl",wickets:2,allowFist:true,unlimited:false,limit:5},
  playerOrder:["red1","blue1","wild"],teams:{red1:"red",blue1:"blue",wild:"wildcard"},wildcardId:"wild",
  history:wildcardHistory,stats:{wild:{runs:11,balls:3,wickets:1,ballsBowled:2,runsConceded:5,wicketsTaken:1,highestScore:7}},
  teamScores:{red:{runs:7,wickets:1,balls:3},blue:{runs:5,wickets:1,balls:2}},
  superOverRounds:[{round:0,scores:{red:{runs:0},blue:{runs:0}}}]
};
const wildcardRed=buildTeamPlayerScorecard(wildcardState,"red","wild");
const wildcardBlue=buildTeamPlayerScorecard(wildcardState,"blue","wild");
assert.deepEqual(
  {runs:wildcardRed.runs,balls:wildcardRed.balls,highestScore:wildcardRed.highestScore,wickets:wildcardRed.wickets},
  {runs:6,balls:2,highestScore:4,wickets:2},
  "Red batting scorecard includes only wildcard deliveries while batting for Red and separates return appearances"
);
assert.deepEqual(
  {runs:wildcardBlue.runs,balls:wildcardBlue.balls,highestScore:wildcardBlue.highestScore,wickets:wildcardBlue.wickets},
  {runs:5,balls:1,highestScore:5,wickets:0},
  "Blue batting scorecard includes only wildcard deliveries while batting for Blue, including Super Overs"
);
assert.deepEqual(
  {runsConceded:wildcardRed.runsConceded,ballsBowled:wildcardRed.ballsBowled,wicketsTaken:wildcardRed.wicketsTaken},
  {runsConceded:5,ballsBowled:2,wicketsTaken:1},
  "Red bowling figures include only wildcard deliveries while bowling for Red"
);
assert.deepEqual(
  {runsConceded:wildcardBlue.runsConceded,ballsBowled:wildcardBlue.ballsBowled,wicketsTaken:wildcardBlue.wicketsTaken},
  {runsConceded:0,ballsBowled:0,wicketsTaken:0},
  "Blue bowling figures exclude wildcard bowling for Red"
);
const legacyBowling=buildTeamPlayerScorecard({history:[
  {innings:1,battingTeam:"red",batterId:"r",bowlerId:"wild",runs:2,out:false}
]},"blue","wild");
assert.equal(legacyBowling.runsConceded,2,"Older delivery history without bowlingTeam remains readable by deriving the opposite side");

const exportState={
  ...wildcardState,
  history:[
    {...wildcardHistory[0],ball:1,at:100},
    {...wildcardHistory[1],ball:2,at:200},
    {...wildcardHistory[5],ball:1,at:300}
  ],
  completedAt:999,
  winnerTeam:"red",
  completedOvers:[{innings:1,battingTeam:"red",balls:[wildcardHistory[0]],runs:4,wickets:0,complete:false}]
};
const exported=buildHandCricketExport(exportState,{name:"Test room",players:[
  {id:"red1",nickname:"Red One"},{id:"blue1",nickname:"Blue One"},{id:"wild",nickname:"Wildcard"}
]},"ABCD","2026-11-16T00:00:00.000Z");
assert.equal(exported.schemaVersion,1);
assert.equal(exported.deliveryCount,3);
assert.equal(exported.deliveries.length,3,"Export preserves every ball-by-ball delivery");
assert.deepEqual(exported.deliveries.map(d=>d.sequence),[1,2,3],"Export preserves chronological order and assigns a sequence");
assert.equal(exported.deliveries[0].bowlingTeam,"blue","Export includes the opposing bowling team");
assert.equal(exported.deliveries[2].superOver,true,"Export retains Super Over deliveries");
assert.equal(exported.deliveries[2].inningsBall,1,"Ball numbering restarts for each Super Over innings");
assert.equal(exported.deliveries[2].over,1);
assert.equal(exported.deliveries[2].ballInOver,1);
assert.equal(exported.players.find(p=>p.id==="wild").isWildcard,true);
assert.equal(exported.match.result.winnerTeam,"red");
assert.equal(exported.match.result.superOverRounds.length,1);
assert.equal(exported.completedOvers.length,1);
assert.equal(exported.aggregatePlayerStats.wild.runs,11,"Export also retains the original aggregate statistics");

console.log("Hand Cricket analytics tests passed.");
