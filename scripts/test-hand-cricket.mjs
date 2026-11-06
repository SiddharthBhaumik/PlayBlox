import assert from "node:assert/strict";
import { handCricket } from "../worker/src/games/hand-cricket.js";

const player=(id)=>({id,nickname:"Player "+id,isHost:id==="p1",connected:true,role:"player"});
const players=["p1","p2","p3","p4"].map(player);
const ctx=(id,all=players)=>({player:all.find(p=>p.id===id),players:all,room:{gameId:"hand-cricket",lifecycle:"playing"}});
const submit=(state,id,choice,all=players)=>handCricket.reduceAction(ctx(id,all),state,{type:"submit-ball",choice});

assert.equal((await handCricket.canStart(ctx("p1"))).ok,true);
let state=handCricket.createInitialState(ctx("p1"));
assert.equal(state.phase,"settings");
assert.equal((await handCricket.validateAction(ctx("p2"),state,{type:"update-settings",config:state.config})).ok,false,
  "Only the host can change settings");
assert.equal((await handCricket.validateAction(ctx("p1"),state,{type:"update-settings",config:{...state.config,mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:5}})).ok,true);
state=handCricket.reduceAction(ctx("p1"),state,{type:"start-match"});
assert.equal(state.phase,"teams");
for(const [id,team] of [["p1","red"],["p2","red"],["p3","blue"],["p4","blue"]]){
  assert.equal((await handCricket.validateAction(ctx(id),state,{type:"choose-team",team})).ok,true);
  state=handCricket.reduceAction(ctx(id),state,{type:"choose-team",team});
}
assert.equal(state.phase,"captains");
state=handCricket.reduceAction(ctx("p1"),state,{type:"vote-captain",candidateId:"p1"});
state=handCricket.reduceAction(ctx("p2"),state,{type:"vote-captain",candidateId:"p2"});
assert.deepEqual(state.runoff.red,["p1","p2"],"A tie must trigger a runoff");
state=handCricket.reduceAction(ctx("p1"),state,{type:"vote-captain",candidateId:"p1"});
state=handCricket.reduceAction(ctx("p2"),state,{type:"vote-captain",candidateId:"p1"});
state=handCricket.reduceAction(ctx("p3"),state,{type:"vote-captain",candidateId:"p3"});
state=handCricket.reduceAction(ctx("p4"),state,{type:"vote-captain",candidateId:"p3"});
assert.equal(state.phase,"playing");
assert.equal(state.captains.red,"p1");
assert.equal(state.captains.blue,"p3");
const batter=state.currentBatterId,bowler=state.currentBowlerId;
assert.equal(batter,"p1");
assert.equal(bowler,"p3");
state=submit(state,batter,4);
assert.equal(handCricket.getPublicState(state).pendingPlayers.length,1);
assert.equal("pending" in handCricket.getPublicState(state),false,"Unrevealed choices must not be public");
assert.equal(handCricket.getPrivateState(state,batter).choice,4,"A player may see their own locked choice");
state=submit(state,bowler,2);
assert.equal(state.teamScores.red.runs,4,"A different number scores the batter's choice");
assert.equal(state.stats.p1.runs,4);
state=submit(state,"p1",5);
state=submit(state,"p3",5);
assert.equal(state.teamScores.red.wickets,1,"Matching numbers dismiss the batter");
assert.equal(state.stats.p1.wickets,1);
assert.equal(state.currentBatterId,"p2","The next eligible batter rotates in after a wicket");

const two=[player("p1"),player("p2")],ctx2=id=>ctx(id,two);
let individual=handCricket.createInitialState(ctx2("p1"));
individual=handCricket.reduceAction(ctx2("p1"),individual,{type:"update-settings",config:{mode:"individual",wickets:1,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:5}});
individual=handCricket.reduceAction(ctx2("p1"),individual,{type:"start-match"});
assert.equal(individual.currentBatterId,"p1");
assert.equal(individual.currentBowlerId,"p2");
individual=handCricket.reduceAction(ctx2("p1"),individual,{type:"submit-ball",choice:"fist"});
individual=handCricket.reduceAction(ctx2("p2"),individual,{type:"submit-ball",choice:"fist"});
assert.equal(individual.stats.p1.wickets,1,"Fist against Fist is a wicket");
assert.equal(individual.currentBatterId,"p2","The next individual innings begins after the wicket allocation is exhausted");

console.log("Hand Cricket rules tests passed.");
