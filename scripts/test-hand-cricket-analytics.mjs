import assert from "node:assert/strict";
import { buildHandCricketAnalytics } from "../src/games/hand-cricket/analytics.js";

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
console.log("Hand Cricket analytics tests passed.");
