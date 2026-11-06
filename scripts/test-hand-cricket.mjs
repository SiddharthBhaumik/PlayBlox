import assert from "node:assert/strict";
import { handCricket } from "../worker/src/games/hand-cricket.js";

const player=id=>({id,nickname:"Player "+id,isHost:id==="p1",connected:true,role:"player"});
const makePlayers=n=>Array.from({length:n},(_,i)=>player("p"+(i+1)));
const context=(id,players)=>({player:players.find(p=>p.id===id),players,room:{gameId:"hand-cricket",lifecycle:"playing"}});
const rawAction=(players,state,id,a)=>handCricket.reduceAction(context(id,players),state,a);
const completeToss=(players,state,call="heads",preferredBattingTeam="red")=>{
 const caller=state.tossCallerId;
 state=rawAction(players,state,caller,{type:"call-toss",call});
 const winner=state.tossWinnerTeam,choice=winner===preferredBattingTeam?"bat":"bowl";
 return rawAction(players,state,state.captains[winner],{type:"choose-toss",choice});
};
const action=(players,state,id,a)=>{
 const next=rawAction(players,state,id,a);
 return next.phase==="toss-call"?completeToss(players,next):next;
};
const submit=(players,state,id,choice)=>action(players,state,id,{type:"submit-ball",choice});
const chooseTeams=async(players,state,teams)=>{
 for(const [id,team] of teams){assert.equal((await handCricket.validateAction(context(id,players),state,{type:"choose-team",team})).ok,true);state=action(players,state,id,{type:"choose-team",team});}
 return state;
};
const confirmTeamSelections=(players,state)=>{
 if(state.config.mode!=="team")return state;
 if(state.batterSelectionOpen){
  const captain=state.captains[state.battingTeam];
  const eligible=state.battingQueue[state.battingTeam].filter(id=>(state.wicketLosses[state.battingTeam]?.[id]||0)<state.config.wickets&&!(id===state.wildcardId&&state.config.oddPlayerMode==="bowl-only")&&(state.bowlerSelectionOpen||id!==state.currentBowlerId));
  const batter=eligible.includes(state.currentBatterId)?state.currentBatterId:eligible[0];
  assert.ok(batter,"A batter must be available for captain confirmation");
  state=action(players,state,captain,{type:"select-batter",playerId:batter});
 }
 if(state.bowlerSelectionOpen){
  const captain=state.captains[state.bowlingTeam];
  const eligible=state.playerOrder.filter(id=>(state.teams[id]===state.bowlingTeam||(id===state.wildcardId&&state.config.oddPlayerMode!=="bat-only"))&&(state.batterSelectionOpen||id!==state.currentBatterId)&&(state.playerOrder.length<=2||id!==state.lastBowlerId));
  const bowler=eligible.includes(state.currentBowlerId)?state.currentBowlerId:eligible[0];
  assert.ok(bowler,"A bowler must be available for captain confirmation");
  state=action(players,state,captain,{type:"select-bowler",playerId:bowler});
 }
 return state;
};
const playBall=(players,state,batChoice=1,bowlChoice=2)=>{
 state=confirmTeamSelections(players,state);
 const batter=state.currentBatterId,bowler=state.currentBowlerId;
 state=submit(players,state,batter,batChoice);
 assert.equal(handCricket.getPublicState(state).pendingPlayers.length,1);
 assert.equal("pending" in handCricket.getPublicState(state),false,"Unrevealed choices must never be public");
 assert.equal(handCricket.getPrivateState(state,batter).choice,batChoice,"A player may see their own locked choice");
 state=submit(players,state,bowler,bowlChoice);
 return state;
};

// Team-match coin toss: caller selection, captain-only actions and server result.
{
 const tossPlayers=makePlayers(4);
 let toss=handCricket.createInitialState(context("p1",tossPlayers));
 toss=rawAction(tossPlayers,toss,"p1",{type:"start-match",config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:2}});
 toss=await chooseTeams(tossPlayers,toss,[["p1","red"],["p2","red"],["p3","blue"],["p4","blue"]]);
 toss=rawAction(tossPlayers,toss,"p1",{type:"vote-captain",candidateId:"p1"});
 toss=rawAction(tossPlayers,toss,"p2",{type:"vote-captain",candidateId:"p1"});
 toss=rawAction(tossPlayers,toss,"p3",{type:"vote-captain",candidateId:"p3"});
 toss=rawAction(tossPlayers,toss,"p4",{type:"vote-captain",candidateId:"p3"});
 assert.equal(toss.phase,"toss-call");
 assert.ok([toss.captains.red,toss.captains.blue].includes(toss.tossCallerId));
 const caller=toss.tossCallerId,callerTeam=Object.keys(toss.captains).find(team=>toss.captains[team]===caller);
 const otherCaptain=toss.captains[callerTeam==="red"?"blue":"red"];
 assert.equal((await handCricket.validateAction(context(otherCaptain,tossPlayers),toss,{type:"call-toss",call:"heads"})).ok,false);
 assert.equal((await handCricket.validateAction(context(caller,tossPlayers),toss,{type:"call-toss",call:"sideways"})).ok,false);
 assert.equal((await handCricket.validateAction(context(caller,tossPlayers),toss,{type:"call-toss",call:"heads"})).ok,true);
 toss=rawAction(tossPlayers,toss,caller,{type:"call-toss",call:"heads"});
 assert.equal(toss.phase,"toss-choice");
 assert.ok(["heads","tails"].includes(toss.tossResult));
 assert.equal(toss.tossWinnerTeam,toss.tossResult==="heads"?callerTeam:(callerTeam==="red"?"blue":"red"));
 const winner=toss.tossWinnerTeam,loser=winner==="red"?"blue":"red";
 assert.equal((await handCricket.validateAction(context(toss.captains[loser],tossPlayers),toss,{type:"choose-toss",choice:"bat"})).ok,false);
 assert.equal((await handCricket.validateAction(context(toss.captains[winner],tossPlayers),toss,{type:"choose-toss",choice:"bowl"})).ok,true);
 toss=rawAction(tossPlayers,toss,toss.captains[winner],{type:"choose-toss",choice:"bowl"});
 assert.equal(toss.phase,"playing");
 assert.equal(toss.battingTeam,loser);
 assert.equal(toss.tossBattingTeam,loser);
}

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
assert.equal(state.batterSelectionOpen,true);
assert.equal(state.bowlerSelectionOpen,true);
assert.equal((await handCricket.validateAction(context("p1",players),state,{type:"submit-ball",choice:1})).ok,false,
  "A ball must be blocked until the batting captain confirms the batter");
state=action(players,state,"p1",{type:"select-batter",playerId:"p1"});
assert.equal((await handCricket.validateAction(context("p1",players),state,{type:"submit-ball",choice:1})).ok,false,
  "A ball must remain blocked until the bowling captain confirms the bowler");
assert.equal((await handCricket.validateAction(context("p3",players),state,{type:"select-bowler",playerId:"p3"})).ok,true);
state=action(players,state,"p3",{type:"select-bowler",playerId:"p3"});
assert.equal(state.batterSelectionOpen,false);
assert.equal(state.bowlerSelectionOpen,false);
assert.equal((await handCricket.validateAction(context("p3",players),state,{type:"select-bowler",playerId:"p4"})).ok,false,
  "A captain may lock one bowler choice at the start of an over");
assert.equal((await handCricket.validateAction(context("p1",players),state,{type:"submit-ball",choice:1})).ok,true,
  "A ball becomes available only after both captain confirmations");

// A complete over stays with its bowler; the next over cannot use that bowler again.
state=playBall(players,state,1,2);
assert.equal(state.stats.p1.highestScore,1,"Highest score updates live in the scorecard");
for(let i=1;i<6;i++)state=playBall(players,state,1,2);
assert.equal(state.teamScores.red.runs,6);
assert.equal(state.teamScores.red.balls,6);
assert.equal(state.completedOvers.length,1);
assert.equal(state.completedOvers[0].balls.length,6);
assert.equal(state.completedOvers[0].bowlerId,"p3");
const bowlingTie=structuredClone(state);
bowlingTie.stats.p1={...bowlingTie.stats.p1,wicketsTaken:2,runsConceded:30,ballsBowled:18};
bowlingTie.stats.p2={...bowlingTie.stats.p2,wicketsTaken:2,runsConceded:12,ballsBowled:6};
assert.equal(handCricket.getResults(context("p1",players),bowlingTie).bestBowlers[0].id,"p1","Wickets rank first and economy breaks a wicket tie");
const batterTie=structuredClone(bowlingTie);
for(const id of ["p1","p2"])Object.assign(batterTie.stats[id],{runs:40,balls:20,highestScore:25});
const tiedBatters=handCricket.getResults(context("p1",players),batterTie).bestBatters;
assert.deepEqual(tiedBatters.map(x=>x.id),["p1","p2"],"All players tied on runs, highest score and strike rate share Best Batter");
const bowlerTie=structuredClone(bowlingTie);
Object.assign(bowlerTie.stats.p2,{wicketsTaken:2,runsConceded:30,ballsBowled:18});
const tiedBowlers=handCricket.getResults(context("p1",players),bowlerTie).bestBowlers;
assert.deepEqual(tiedBowlers.map(x=>x.id),["p1","p2"],"All players tied on wickets, economy and runs conceded share Best Bowler");
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
wicketState=playBall(players,wicketState,5,5);
assert.equal(wicketState.teamScores.red.wickets,1);
assert.equal(wicketState.stats.p1.wickets,1);
assert.equal(wicketState.currentBatterId,"p2");
assert.equal(wicketState.batterSelectionOpen,true,"A wicket requires the batting captain to confirm the next batter");
assert.equal(wicketState.bowlerSelectionOpen,false,"The same bowler continues the current over");
assert.equal((await handCricket.validateAction(context("p2",players),wicketState,{type:"submit-ball",choice:1})).ok,false,
  "The next ball is blocked until the next batter is confirmed");


// Highest Score is the maximum of separate batting turns, while Runs remains cumulative.
{
 const hsPlayers=makePlayers(4);
 let hs=handCricket.createInitialState(context("p1",hsPlayers));
 hs=action(hsPlayers,hs,"p1",{type:"update-settings",config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:true,limit:1}});
 hs=action(hsPlayers,hs,"p1",{type:"start-match"});
 hs=await chooseTeams(hsPlayers,hs,[["p1","red"],["p2","red"],["p3","blue"],["p4","blue"]]);
 hs=action(hsPlayers,hs,"p1",{type:"vote-captain",candidateId:"p1"});
 hs=action(hsPlayers,hs,"p2",{type:"vote-captain",candidateId:"p1"});
 hs=action(hsPlayers,hs,"p3",{type:"vote-captain",candidateId:"p3"});
 hs=action(hsPlayers,hs,"p4",{type:"vote-captain",candidateId:"p3"});
 hs=playBall(hsPlayers,hs,5,2);
 assert.equal(hs.stats.p1.runs,5);
 assert.equal(hs.stats.p1.highestScore,5);
 hs=playBall(hsPlayers,hs,3,3);
 assert.equal(hs.currentBatterId,"p2");
 hs=playBall(hsPlayers,hs,4,4);
 assert.equal(hs.currentBatterId,"p1","A player with wickets remaining may return for another batting turn");
 assert.equal(hs.currentInningsRuns.p1,0,"The returning player's new innings starts at zero");
 hs=playBall(hsPlayers,hs,2,1);
 assert.equal(hs.stats.p1.runs,7,"Runs remain cumulative across the player's batting turns");
 assert.equal(hs.stats.p1.highestScore,5,"High Score remains the best single batting turn, not the sum of turns");
}

// Team selection remains editable until all players have selected, and the
// explicit wildcard place keeps Red and Blue equal for odd player counts.
const five=makePlayers(5);
let balanced=handCricket.createInitialState(context("p1",five));
balanced=action(five,balanced,"p1",{type:"update-settings",config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:1}});
balanced=action(five,balanced,"p1",{type:"start-match"});
balanced=action(five,balanced,"p1",{type:"choose-team",team:"red"});
balanced=action(five,balanced,"p1",{type:"choose-team",team:"blue"});
assert.equal(balanced.teams.p1,"blue","A player can change their choice before selection closes");
balanced=await chooseTeams(five,balanced,[["p2","red"],["p3","blue"],["p4","red"],["p5","wildcard"]]);
assert.equal(balanced.phase,"captains");
assert.equal(five.filter(p=>balanced.teams[p.id]==="red").length,2);
assert.equal(five.filter(p=>balanced.teams[p.id]==="blue").length,2);
assert.equal(balanced.wildcardId,"p5");

// Three-player wildcard is available to both teams in bat-and-bowl mode.
const three=makePlayers(3);
let odd=handCricket.createInitialState(context("p1",three));
odd=action(three,odd,"p1",{type:"update-settings",config:{mode:"team",wickets:1,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:1}});
odd=action(three,odd,"p1",{type:"start-match"});
odd=await chooseTeams(three,odd,[["p1","red"],["p2","blue"],["p3","wildcard"]]);
assert.equal(odd.wildcardId,"p3");
assert.equal(odd.captains.red,"p1");
assert.equal(odd.captains.blue,"p2");
assert.equal(odd.batterSelectionOpen,true);
assert.equal(odd.bowlerSelectionOpen,true);
assert.equal((await handCricket.validateAction(context("p1",three),odd,{type:"submit-ball",choice:1})).ok,false,
  "Three-player wildcard matches must also wait for both captain confirmations");
assert.deepEqual(three.filter(p=>odd.teams[p.id]==="red").map(p=>p.id),["p1"]);
assert.deepEqual(three.filter(p=>odd.teams[p.id]==="blue").map(p=>p.id),["p2"]);
assert.ok(odd.battingQueue.blue.includes("p3"));
assert.ok(odd.battingQueue.red.includes("p3"));

// With one batter per team and one wicket each, one dismissal ends that team's innings.
// The wicket count must not leak into the opposing team's separate allowance.
const pair=[player("p1"),player("p2")];
let oneEach=handCricket.createInitialState(context("p1",pair));
oneEach=action(pair,oneEach,"p1",{type:"update-settings",config:{mode:"team",wickets:1,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:true,limit:1}});
oneEach=action(pair,oneEach,"p1",{type:"start-match"});
oneEach=await chooseTeams(pair,oneEach,[["p1","red"],["p2","blue"]]);
assert.equal(oneEach.phase,"playing");
assert.equal(oneEach.currentBatterId,"p1");
oneEach=playBall(pair,oneEach,3,3);
assert.equal(oneEach.innings,2,"A one-player batting side is all out after its one allowed wicket");
assert.equal(oneEach.teamScores.red.wickets,1,"The first side records exactly one wicket");
assert.equal(oneEach.wicketLosses.red.p1,1);
assert.equal(oneEach.wicketLosses.blue.p2||0,0,"The second side starts with a separate wicket allowance");
assert.equal(oneEach.currentBatterId,"p2");
oneEach=playBall(pair,oneEach,4,4);
assert.equal(oneEach.teamScores.blue.wickets,1,"The second side also gets only its own one wicket");
assert.equal(oneEach.phase,"super-over-vote","A tied match proceeds to captain Super Over voting");
oneEach=action(pair,oneEach,"p1",{type:"vote-super-over",vote:"no"});
oneEach=action(pair,oneEach,"p2",{type:"vote-super-over",vote:"yes"});
assert.equal(oneEach.phase,"finished","One captain declining leaves the one-player match tied");

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

// Individual tournament: configured wickets allow a batter to return after dismissal.
// Rotation must complete one full round before anyone receives another turn.
const rotationPlayers=makePlayers(3);
let rotation=handCricket.createInitialState(context("p1",rotationPlayers));
const rotationConfig={mode:"individual",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:true,limit:6};
assert.equal((await handCricket.validateAction(context("p1",rotationPlayers),rotation,{type:"start-match",config:rotationConfig})).ok,true,
  "Continue accepts valid settings directly");
rotation=action(rotationPlayers,rotation,"p1",{type:"start-match",config:rotationConfig});
assert.deepEqual(rotation.individualQueue,["p1","p2","p3"]);
rotation=playBall(rotationPlayers,rotation,4,4);
assert.equal(rotation.currentBatterId,"p1","A batter stays at the crease after the first wicket when wickets remain");
assert.equal(rotation.stats.p1.wickets,1);
assert.deepEqual(rotation.individualQueue,["p1","p2","p3"],"The active batter remains at the front of the queue");
rotation=playBall(rotationPlayers,rotation,5,5);
assert.equal(rotation.currentBatterId,"p2","The next player starts only after p1 exhausts both wickets");
assert.deepEqual(rotation.individualQueue,["p2","p3"],"An exhausted batter is removed from the batting queue");
rotation=playBall(rotationPlayers,rotation,6,6);
assert.equal(rotation.currentBatterId,"p2","p2 also continues batting after their first wicket");
rotation=playBall(rotationPlayers,rotation,3,3);
assert.equal(rotation.currentBatterId,"p3","p2 leaves the batting queue after exhausting the second wicket");
assert.notEqual(rotation.currentBowlerId,"p3","A player cannot bowl against themselves when their batting innings begins");

// Limited individual tournaments count balls cumulatively across a player's turns.
// Exhausting balls removes the player from batting rotation, not from bowling.
const ballLimitPlayers=makePlayers(3);
let ballLimit=handCricket.createInitialState(context("p1",ballLimitPlayers));
const ballLimitConfig={mode:"individual",wickets:3,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:3};
ballLimit=action(ballLimitPlayers,ballLimit,"p1",{type:"start-match",config:ballLimitConfig});
ballLimit=playBall(ballLimitPlayers,ballLimit,2,2); // p1 wicket, ball 1
assert.equal(ballLimit.currentBatterId,"p1","A wicket alone does not end the turn while balls remain");
ballLimit=playBall(ballLimitPlayers,ballLimit,1,2); // p1 ball 2
assert.equal(ballLimit.currentBatterId,"p1","The batter continues until the ball allowance is exhausted");
ballLimit=playBall(ballLimitPlayers,ballLimit,1,2); // p1 ball 3: allocation exhausted
assert.equal(ballLimit.stats.p1.balls,3,"The ball allocation is cumulative across turns");
assert.equal(ballLimit.currentBatterId,"p2","A player who uses all allocated balls leaves the batting queue");
assert.equal(ballLimit.individualQueue.includes("p1"),false,"A ball-exhausted player is removed from batting rotation");
assert.equal(ballLimit.playerOrder.includes("p1"),true,"A ball-exhausted player remains in the tournament and can bowl");
ballLimit=playBall(ballLimitPlayers,ballLimit,3,3); // p2 wicket, ball 1
assert.equal(ballLimit.currentBatterId,"p2","A new batter also continues after a wicket while balls remain");
ballLimit=playBall(ballLimitPlayers,ballLimit,1,2); // p2 ball 2
ballLimit=playBall(ballLimitPlayers,ballLimit,1,2); // p2 ball 3
assert.equal(ballLimit.currentBatterId,"p3","The next player starts when p2 reaches the cumulative ball limit");
assert.equal((await handCricket.validateAction(context("p1",ballLimitPlayers),handCricket.createInitialState(context("p1",ballLimitPlayers)),{type:"start-match",config:{...ballLimitConfig,unlimited:true,limit:0}})).ok,true,
  "Unlimited mode does not require a finite ball allocation");

// Unlimited individual tournaments end a player's batting eligibility only
// after all configured wickets have been used.
const wicketLimitPlayers=makePlayers(3);
let wicketLimit=handCricket.createInitialState(context("p1",wicketLimitPlayers));
wicketLimit=action(wicketLimitPlayers,wicketLimit,"p1",{type:"start-match",config:{...rotationConfig,wickets:2}});
wicketLimit=playBall(wicketLimitPlayers,wicketLimit,1,1);
assert.equal(wicketLimit.currentBatterId,"p1","The batter remains at the crease after the first of two wickets");
wicketLimit=playBall(wicketLimitPlayers,wicketLimit,1,1);
assert.equal(wicketLimit.currentBatterId,"p2","The next batter starts after p1 exhausts the configured wicket allowance");
assert.equal(wicketLimit.individualQueue.includes("p1"),false,"A player is removed after exhausting the configured wicket allowance");
assert.equal(wicketLimit.playerOrder.includes("p1"),true,"Wicket exhaustion does not remove a player from the tournament");

// 
// Individual dismissals end the current turn, but a player with wickets
// remaining returns to the back of the batting queue.
const threeWicket=makePlayers(3);
let oneDismissal=handCricket.createInitialState(context("p1",threeWicket));
oneDismissal=action(threeWicket,oneDismissal,"p1",{type:"update-settings",config:{mode:"individual",wickets:3,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:true,limit:6}});
oneDismissal=action(threeWicket,oneDismissal,"p1",{type:"start-match"});
assert.equal(oneDismissal.currentBatterId,"p1");
oneDismissal=playBall(threeWicket,oneDismissal,4,4);
assert.equal(oneDismissal.stats.p1.wickets,1);
assert.equal(oneDismissal.individualWickets,1,"The current batter's wicket count increments and is retained");
assert.equal(oneDismissal.individualIndex,1,"A dismissal does not start a new batting innings");
assert.equal(oneDismissal.currentBatterId,"p1","The same player continues batting while two wickets remain");
oneDismissal=playBall(threeWicket,oneDismissal,4,4);
oneDismissal=playBall(threeWicket,oneDismissal,4,4);
assert.equal(oneDismissal.currentBatterId,"p2","The next player's innings starts only after all three wickets are used");
assert.equal(oneDismissal.individualIndex,2);
assert.equal(oneDismissal.currentBowlerId,"p1","The previous batter can bowl in the next player's innings");
assert.equal(oneDismissal.completedOvers.length,1);
assert.equal(oneDismissal.completedOvers[0].complete,false,"The interrupted over is saved when the innings changes");

// A new innings makes its previous batter eligible to bowl. They join the
// current bowling round rather than being skipped until the next round.
const four=makePlayers(4);
let fair=handCricket.createInitialState(context("p1",four));
fair=action(four,fair,"p1",{type:"update-settings",config:{mode:"individual",wickets:2,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:false,limit:6}});
fair=action(four,fair,"p1",{type:"start-match"});
assert.equal(fair.currentBowlerId,"p2");
for(let i=0;i<6;i++)fair=playBall(four,fair,1,2);
assert.equal(fair.currentBatterId,"p2");
assert.equal(fair.currentBowlerId,"p1","The previous batter joins the current bowling round once they become eligible");

// Invalid actions cannot choose Fist when disabled or submit twice.
const noFist=handCricket.createInitialState(context("p1",two));
const started=action(two,noFist,"p1",{type:"update-settings",config:{mode:"individual",wickets:1,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:false,limit:6}});
const playing=action(two,started,"p1",{type:"start-match"});
assert.equal((await handCricket.validateAction(context("p1",two),playing,{type:"submit-ball",choice:"fist"})).ok,false);
assert.equal((await handCricket.validateAction(context("p1",two),playing,{type:"submit-ball",choice:0})).ok,false,"Zero is not selectable");
assert.equal((await handCricket.validateAction(context("p1",two),playing,{type:"submit-ball",choice:1})).ok,true,"One is selectable");
assert.equal((await handCricket.validateAction(context("p1",two),playing,{type:"submit-ball",choice:6})).ok,true,"Six is selectable");


// A tied regulation match requires both captains to approve a six-ball Super Over.
// If that is tied, the vote repeats; declining at any stage leaves the match tied.
const soPlayers=makePlayers(4);
let so=handCricket.createInitialState(context("p1",soPlayers));
so=action(soPlayers,so,"p1",{type:"update-settings",config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:false,limit:1}});
so=action(soPlayers,so,"p1",{type:"start-match"});
so=await chooseTeams(soPlayers,so,[["p1","red"],["p2","red"],["p3","blue"],["p4","blue"]]);
so=action(soPlayers,so,"p1",{type:"vote-captain",candidateId:"p1"});
so=action(soPlayers,so,"p2",{type:"vote-captain",candidateId:"p1"});
so=action(soPlayers,so,"p3",{type:"vote-captain",candidateId:"p3"});
so=action(soPlayers,so,"p4",{type:"vote-captain",candidateId:"p3"});
for(let i=0;i<6;i++)so=playBall(soPlayers,so,1,2);
for(let i=0;i<6;i++)so=playBall(soPlayers,so,1,2);
assert.equal(so.phase,"super-over-vote");
assert.equal(so.superOverRounds.length,1);
const declined=structuredClone(so);
let noSuper=action(soPlayers,declined,"p1",{type:"vote-super-over",vote:"no"});
noSuper=action(soPlayers,noSuper,"p3",{type:"vote-super-over",vote:"yes"});
assert.equal(noSuper.phase,"finished","Either captain declining keeps the match tied");
assert.equal(noSuper.winnerTeam,null);
assert.equal((await handCricket.validateAction(context("p1",soPlayers),so,{type:"vote-super-over",vote:"yes"})).ok,true);
so=action(soPlayers,so,"p1",{type:"vote-super-over",vote:"yes"});
assert.equal(so.phase,"super-over-vote","One captain alone cannot start the Super Over");
so=action(soPlayers,so,"p3",{type:"vote-super-over",vote:"yes"});
assert.equal(so.phase,"playing");
assert.equal(so.superOverActive,true);
assert.equal(so.superOverRound,1);
for(let i=0;i<6;i++)so=playBall(soPlayers,so,1,2);
for(let i=0;i<6;i++)so=playBall(soPlayers,so,1,2);
assert.equal(so.phase,"super-over-vote","A tied Super Over triggers another captain vote");
assert.equal(so.superOverRounds.length,2);
so=action(soPlayers,so,"p1",{type:"vote-super-over",vote:"yes"});
so=action(soPlayers,so,"p3",{type:"vote-super-over",vote:"yes"});
for(let i=0;i<6;i++)so=playBall(soPlayers,so,1,2);
for(let i=0;i<6&&so.phase==="playing";i++)so=playBall(soPlayers,so,2,1);
assert.equal(so.phase,"finished");
assert.equal(so.winnerTeam,"blue","The second Super Over breaks the tie");
assert.equal(so.superOverRounds.length,2);

// Super Over batting order reverses after the tied regulation innings, and
// the Super Over is capped at two team wickets even when the match setting allows more.
const superOverOrderPlayers=makePlayers(4);
let superOverOrder=handCricket.createInitialState(context("p1",superOverOrderPlayers));
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p1",{type:"update-settings",config:{mode:"team",wickets:3,oddPlayerMode:"bat-bowl",allowFist:false,unlimited:false,limit:1}});
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p1",{type:"start-match"});
superOverOrder=await chooseTeams(superOverOrderPlayers,superOverOrder,[["p1","red"],["p2","red"],["p3","blue"],["p4","blue"]]);
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p1",{type:"vote-captain",candidateId:"p1"});
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p2",{type:"vote-captain",candidateId:"p1"});
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p3",{type:"vote-captain",candidateId:"p3"});
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p4",{type:"vote-captain",candidateId:"p3"});
for(let i=0;i<6;i++)superOverOrder=playBall(superOverOrderPlayers,superOverOrder,1,2);
for(let i=0;i<6;i++)superOverOrder=playBall(superOverOrderPlayers,superOverOrder,1,2);
assert.equal(superOverOrder.battingTeam,"blue","The regular match's second-innings team bats first in the Super Over");
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p1",{type:"vote-super-over",vote:"yes"});
superOverOrder=action(superOverOrderPlayers,superOverOrder,"p3",{type:"vote-super-over",vote:"yes"});
assert.equal(superOverOrder.battingTeam,"blue","Super Over starts with the team that batted second in the regular match");
assert.equal(superOverOrder.superOverActive,true);
superOverOrder=playBall(superOverOrderPlayers,superOverOrder,1,1);
superOverOrder=playBall(superOverOrderPlayers,superOverOrder,1,1);
assert.equal(superOverOrder.innings,2,"Two wickets end a Super Over innings even when the match allows three wickets");
assert.equal(superOverOrder.battingTeam,"red","The other team bats second in the Super Over");

// Wildcard batting has priority over a conflicting preselected bowling role.
const wildcardPriorityPlayers=makePlayers(3);
let wildcardPriority=handCricket.createInitialState(context("p1",wildcardPriorityPlayers));
wildcardPriority=action(wildcardPriorityPlayers,wildcardPriority,"p1",{type:"update-settings",config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:1}});
wildcardPriority=action(wildcardPriorityPlayers,wildcardPriority,"p1",{type:"start-match"});
wildcardPriority=await chooseTeams(wildcardPriorityPlayers,wildcardPriority,[["p1","red"],["p2","blue"],["p3","wildcard"]]);
// Model the collision case: the bowling captain's current assignment is the wildcard.
wildcardPriority.currentBowlerId="p3";
wildcardPriority.overBowlerId="p3";
// Returning to bat starts a fresh personal innings for HS, while total runs persist.
wildcardPriority.currentInningsRuns.p3=14;
wildcardPriority.stats.p3.runs=25;
wildcardPriority.stats.p3.highestScore=14;
wildcardPriority=action(wildcardPriorityPlayers,wildcardPriority,"p1",{type:"select-batter",playerId:"p3"});
assert.equal(wildcardPriority.currentInningsRuns.p3,0,"A returning batter starts a fresh innings accumulator");
assert.equal(wildcardPriority.stats.p3.runs,25,"Cumulative match runs are preserved when a player returns");
assert.equal(wildcardPriority.stats.p3.highestScore,14,"Previously recorded highest score is preserved");
assert.equal(wildcardPriority.currentBatterId,"p3","The wildcard remains the selected batter when roles conflict");
assert.notEqual(wildcardPriority.currentBowlerId,"p3","Batting priority removes the wildcard from the conflicting bowling role");
assert.equal(wildcardPriority.bowlerSelectionOpen,true,"The bowling captain must confirm a replacement bowler");
assert.equal(wildcardPriority.wildcardBowlerReplacementRequired,true,"The replacement is marked as a wildcard-priority conflict");
wildcardPriority=action(wildcardPriorityPlayers,wildcardPriority,"p2",{type:"select-bowler",playerId:"p2"});
assert.equal(wildcardPriority.currentBowlerId,"p2","The bowling captain can confirm a replacement bowler");
assert.equal(wildcardPriority.wildcardBowlerReplacementRequired,false);

// Individual tournament ranking uses the requested bowling-based tie-breaks.
const ranked=handCricket.createInitialState(context("p1",soPlayers));
ranked.config.mode="individual";
ranked.stats.p1={runs:100,balls:100,wickets:0,ballsBowled:12,runsConceded:24,wicketsTaken:2,highestScore:90};
ranked.stats.p2={runs:100,balls:100,wickets:0,ballsBowled:12,runsConceded:12,wicketsTaken:3,highestScore:70};
ranked.stats.p3={runs:100,balls:80,wickets:0,ballsBowled:12,runsConceded:12,wicketsTaken:3,highestScore:70};
ranked.stats.p4={runs:101,balls:100,wickets:0,ballsBowled:12,runsConceded:6,wicketsTaken:4,highestScore:99};
const individualResults=handCricket.getResults(context("p1",soPlayers),ranked);
assert.equal(individualResults.ranking[0].playerId,"p4","Runs remain the primary ranking criterion");
assert.equal(individualResults.ranking[1].playerId,"p3","Bowling wickets break equal-run ties before highest score");

console.log("Hand Cricket extended rules tests passed.");
