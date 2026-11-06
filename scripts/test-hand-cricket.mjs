import assert from "node:assert/strict";
import { handCricket } from "../worker/src/games/hand-cricket.js";

const player=id=>({id,nickname:"Player "+id,isHost:id==="p1",connected:true,role:"player"});
const makePlayers=n=>Array.from({length:n},(_,i)=>player("p"+(i+1)));
const context=(id,players)=>({player:players.find(p=>p.id===id),players,room:{gameId:"hand-cricket",lifecycle:"playing"}});
const action=(players,state,id,a)=>handCricket.reduceAction(context(id,players),state,a);
const submit=(players,state,id,choice)=>action(players,state,id,{type:"submit-ball",choice});
const chooseTeams=async(players,state,teams)=>{
 for(const [id,team] of teams){assert.equal((await handCricket.validateAction(context(id,players),state,{type:"choose-team",team})).ok,true);state=action(players,state,id,{type:"choose-team",team});}
 return state;
};
const playBall=(players,state,batChoice=1,bowlChoice=0)=>{
 const batter=state.currentBatterId,bowler=state.currentBowlerId;
 state=submit(players,state,batter,batChoice);
 assert.equal(handCricket.getPublicState(state).pendingPlayers.length,1);
 assert.equal("pending" in handCricket.getPublicState(state),false,"Unrevealed choices must never be public");
 assert.equal(handCricket.getPrivateState(state,batter).choice,batChoice,"A player may see their own locked choice");
 state=submit(players,state,bowler,bowlChoice);
 return state;
};

// Host-only settings and balanced teams.
const players=makePlayers(4);
let state=handCricket.createInitialState(context("p1",players));
assert.equal(state.phase,"settings");
assert.equal((await handCricket.canStart(context("p1",players))).ok,true);
assert.equal((await handCricket.validateAction(context("p2",players),state,{type:"update-settings",config:state.config})).ok,false);
assert.equal((await handCricket.validateAction(context("p1",players),state,{type:"update-settings",config:{...state.config,mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:2}})).ok,true);
state=action(players,state,"p1",{type:"update-settings",config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:2}});
state=action(players,state,"p1",{type:"start-match"});
state=await chooseTeams(players,state,[["p1","red"],["p2","red"],["p3","blue"],["p4","blue"]]);
assert.equal(state.phase,"captains");
state=action(players,state,"p1",{type:"vote-captain",candidateId:"p1"});
const publicVote=handCricket.getPublicState(state);
assert.equal("teamVotes" in publicVote,false,"Captain vote choices must remain private");
assert.deepEqual(publicVote.captainVotesCast.red,["p1"],"Only vote progress, not the selected candidate, is public");
state=action(players,state,"p2",{type:"vote-captain",candidateId:"p2"});
assert.deepEqual(state.runoff.red,["p1","p2"],"A tie must trigger a runoff");
state=action(players,state,"p1",{type:"vote-captain",candidateId:"p1"});
state=action(players,state,"p2",{type:"vote-captain",candidateId:"p1"});
state=action(players,state,"p3",{type:"vote-captain",candidateId:"p3"});
state=action(players,state,"p4",{type:"vote-captain",candidateId:"p3"});
assert.equal(state.phase,"playing");
assert.equal(state.currentBatterId,"p1");
assert.equal(state.currentBowlerId,"p3");
assert.equal((await handCricket.validateAction(context("p3",players),state,{type:"select-bowler",playerId:"p3"})).ok,true);
state=action(players,state,"p3",{type:"select-bowler",playerId:"p3"});
assert.equal((await handCricket.validateAction(context("p3",players),state,{type:"select-bowler",playerId:"p4"})).ok,false,
  "A captain may lock one bowler choice at the start of an over");

// A complete over stays with its bowler; the next over cannot use that bowler again.
for(let i=0;i<6;i++)state=playBall(players,state,1,0);
assert.equal(state.teamScores.red.runs,6);
assert.equal(state.teamScores.red.balls,6);
assert.equal(state.completedOvers.length,1);
assert.equal(state.completedOvers[0].balls.length,6);
assert.equal(state.completedOvers[0].bowlerId,"p3");
assert.equal(state.currentBowlerId,"p4","The same bowler cannot bowl consecutive overs");
for(let i=0;i<6;i++)state=playBall(players,state,1,0);
assert.equal(state.innings,2,"The match changes innings after the configured two overs");
assert.equal(state.completedOvers.length,2);

// Matching numbers dismiss; the next batter rotates in.
let wicketState=handCricket.createInitialState(context("p1",players));
wicketState=action(players,wicketState,"p1",{type:"update-settings",config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:5}});
wicketState=action(players,wicketState,"p1",{type:"start-match"});
wicketState=await chooseTeams(players,wicketState,[["p1","red"],["p2","red"],["p3","blue"],["p4","blue"]]);
wicketState=action(players,wicketState,"p1",{type:"vote-captain",candidateId:"p1"});
wicketState=action(players,wicketState,"p2",{type:"vote-captain",candidateId:"p1"});
wicketState=action(players,wicketState,"p3",{type:"vote-captain",candidateId:"p3"});
wicketState=action(players,wicketState,"p4",{type:"vote-captain",candidateId:"p3"});
wicketState=submit(players,wicketState,"p1",5);
wicketState=submit(players,wicketState,"p3",5);
assert.equal(wicketState.teamScores.red.wickets,1);
assert.equal(wicketState.stats.p1.wickets,1);
assert.equal(wicketState.currentBatterId,"p2");

// Three-player wildcard is available to both teams in bat-and-bowl mode.
const three=makePlayers(3);
let odd=handCricket.createInitialState(context("p1",three));
odd=action(three,odd,"p1",{type:"update-settings",config:{mode:"team",wickets:1,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:1}});
odd=action(three,odd,"p1",{type:"start-match"});
odd=await chooseTeams(three,odd,[["p1","red"],["p2","red"],["p3","blue"]]);
assert.equal(odd.wildcardId,"p1");
assert.ok(odd.battingQueue.blue.includes("p1"));
assert.ok(odd.battingQueue.red.includes("p1"));

// Individual format: balls are per player, no one bowls in their own innings.
const two=[player("p1"),player("p2")];
let individual=handCricket.createInitialState(context("p1",two));
individual=action(two,individual,"p1",{type:"update-settings",config:{mode:"individual",wickets:1,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:6}});
individual=action(two,individual,"p1",{type:"start-match"});
assert.equal(individual.currentBatterId,"p1");
assert.equal(individual.currentBowlerId,"p2");
individual=submit(two,individual,"p1","fist");
individual=submit(two,individual,"p2","fist");
assert.equal(individual.stats.p1.wickets,1,"Fist against Fist is a wicket");
assert.equal(individual.currentBatterId,"p2","The next player's innings starts after the wicket allocation is exhausted");
assert.equal(individual.currentBowlerId,"p1","A player must never bowl in their own innings");
assert.equal(individual.completedOvers.length,1);
assert.equal(individual.completedOvers[0].complete,false,"A mid-over innings change records the interrupted over");
individual=submit(two,individual,"p2",3);
individual=submit(two,individual,"p1","fist");
assert.equal(individual.stats.p2.runs,3,"When only one chooses Fist, the other player's number is scored");

// A new innings makes its previous batter eligible to bowl. They join the
// current bowling round rather than being skipped until the next round.
const four=makePlayers(4);
let fair=handCricket.createInitialState(context("p1",four));
fair=action(four,fair,"p1",{type:"update-settings",config:{mode:"individual",wickets:2,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:false,limit:6}});
fair=action(four,fair,"p1",{type:"start-match"});
assert.equal(fair.currentBowlerId,"p2");
for(let i=0;i<6;i++)fair=playBall(four,fair,1,0);
assert.equal(fair.currentBatterId,"p2");
assert.equal(fair.currentBowlerId,"p1","The previous batter joins the current bowling round once they become eligible");

// Invalid actions cannot choose Fist when disabled or submit twice.
const noFist=handCricket.createInitialState(context("p1",two));
const started=action(two,noFist,"p1",{type:"update-settings",config:{mode:"individual",wickets:1,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:false,limit:6}});
const playing=action(two,started,"p1",{type:"start-match"});
assert.equal((await handCricket.validateAction(context("p1",two),playing,{type:"submit-ball",choice:"fist"})).ok,false);

console.log("Hand Cricket extended rules tests passed.");
