const VALUES=[1,2,3,4,5,6,"fist"];
const WICKETS=[1,2,3];

const TEAMS=["red","blue"];
const clone=value=>JSON.parse(JSON.stringify(value));
const nameOf=(ctx,id)=>ctx.players.find(p=>p.id===id)?.nickname||"Player";
const activeIds=ctx=>ctx.players.filter(p=>p.role==="player"&&p.connected).map(p=>p.id);
const emptyStats=()=>({runs:0,balls:0,wickets:0,ballsBowled:0,runsConceded:0,wicketsTaken:0,highestScore:0});
const makeStats=ids=>Object.fromEntries(ids.map(id=>[id,emptyStats()]));
const overs=balls=>Math.floor(balls/6)+"."+balls%6;
const teamOf=(s,id)=>s.teams?.[id]||null;
const totalWickets=(s,team)=>Object.values(s.wicketLosses?.[team]||{}).reduce((n,x)=>n+x,0);
const eligibleBatters=(s,team)=>s.playerOrder.filter(id=>{
  const wildcard=id===s.wildcardId&&s.config.oddPlayerMode!=="bowl-only";
  return (teamOf(s,id)===team||wildcard)&&(s.wicketLosses[team]?.[id]||0)<s.config.wickets;
});
const eligibleBowlers=(s,team,batterId)=>s.playerOrder.filter(id=>{
  const wildcard=id===s.wildcardId&&s.config.oddPlayerMode!=="bat-only";
  return (teamOf(s,id)===team||wildcard)&&id!==batterId;
});
function nextBatter(s,team,after=null){
  const q=s.battingQueue[team]||[],start=q.indexOf(after);
  for(let i=1;i<=q.length;i++){const id=q[(Math.max(-1,start)+i)%q.length];if(eligibleBatters(s,team).includes(id))return id;}
  return eligibleBatters(s,team)[0]||null;
}
function nextTeamBowler(s,batterId,team){
  const pool=eligibleBowlers(s,team,batterId);if(!pool.length)return null;
  const nonConsecutive=s.playerOrder.length<=2?pool:pool.filter(id=>id!==s.lastBowlerId);
  return (nonConsecutive.length?nonConsecutive:pool).slice().sort((a,b)=>
    (s.stats[a].ballsBowled-s.stats[b].ballsBowled)||s.playerOrder.indexOf(a)-s.playerOrder.indexOf(b))[0];
}
function nextIndividualBowler(s,batterId){
  const pool=s.playerOrder.filter(id=>id!==batterId);
  if(!pool.length)return null;
  const rank=(a,b)=>
    Math.floor(s.stats[a].ballsBowled/6)-Math.floor(s.stats[b].ballsBowled/6)||
    (s.stats[a].lastBowledAt||0)-(s.stats[b].lastBowledAt||0)||
    s.playerOrder.indexOf(a)-s.playerOrder.indexOf(b);
  const current=s.roundOrder.filter(id=>pool.includes(id));
  const added=pool.filter(id=>!current.includes(id));
  if(!s.roundOrder.length||pool.every(id=>s.bowlingRound[id])){
    s.roundOrder=pool.slice().sort(rank);
    s.bowlingRound={};
  }else{
    // A new innings can make its previous batter eligible to bowl. Add them
    // to the live round without giving already-used bowlers another turn.
    s.roundOrder=[...current,...added].sort(rank);
  }
  const candidates=s.roundOrder.filter(id=>pool.includes(id)&&!s.bowlingRound[id]);
  const noRepeat=s.playerOrder.length<=2?candidates:candidates.filter(id=>id!==s.lastBowlerId);
  const chosen=(noRepeat.length?noRepeat:candidates)[0]||null;
  if(chosen)s.bowlingRound[chosen]=true;
  return chosen;
}
function milestoneEvents(s,before,after,team,playerId){
  const thresholds=team?[50,100,150]:[50,100,150,200];
  const scope=team?"team:"+team:"player:"+playerId,events=[];
  for(const threshold of thresholds){
    const key=scope+":"+threshold;
    if(before<threshold&&after>=threshold&&!s.milestones.includes(key)){
      s.milestones.push(key);events.push({type:"milestone",scope,threshold,playerId,team});
    }
  }
  return events;
}
function refreshHighest(s,id){
  s.stats[id].highestScore=Math.max(s.stats[id].highestScore,s.currentInningsRuns[id]||0);
}
function finish(s,winnerTeam=null){
  for(const id of s.playerOrder)refreshHighest(s,id);
  s.phase="finished";s.winnerTeam=winnerTeam;s.currentBatterId=null;s.currentBowlerId=null;s.pending={};
  s.superOverActive=false;s.completedAt=Date.now();
}
function requestSuperOverVote(s){
  s.superOverRounds=s.superOverRounds||[];
  if(!s.superOverRound&&!s.regulationScores)s.regulationScores=clone(s.teamScores);
  s.superOverRounds.push({round:s.superOverRound||0,scores:clone(s.teamScores)});
  s.phase="super-over-vote";s.superOverActive=false;s.superOverVote={red:null,blue:null};
  s.currentBatterId=null;s.currentBowlerId=null;s.pending={};s.overBalls=[];
}
function startSuperOver(s){
  s.superOverRound=(s.superOverRound||0)+1;s.superOverActive=true;s.superOverVote={red:null,blue:null};
  s.teamScores={red:{runs:0,wickets:0,balls:0},blue:{runs:0,wickets:0,balls:0}};
  s.wicketLosses={red:{},blue:{}};
  startTeamInnings(s,"red",1);
}
const economyOf=x=>x.ballsBowled?x.runsConceded/(x.ballsBowled/6):Infinity;
const strikeRateOf=x=>x.balls?x.runs/x.balls*100:0;
const cmpDesc=(a,b)=>a===b?0:b-a;
const cmpAsc=(a,b)=>a===b?0:a-b;
const compareBestBatter=(a,b)=>cmpDesc(a.runs,b.runs)||cmpDesc(a.highestScore,b.highestScore)||cmpDesc(strikeRateOf(a),strikeRateOf(b));
const compareBestBowler=(a,b)=>cmpDesc(a.wicketsTaken,b.wicketsTaken)||cmpAsc(economyOf(a),economyOf(b))||cmpAsc(a.runsConceded,b.runsConceded);
const compareIndividual=(a,b)=>cmpDesc(a.runs,b.runs)||cmpDesc(a.wicketsTaken,b.wicketsTaken)||cmpDesc(a.highestScore,b.highestScore)||cmpAsc(economyOf(a),economyOf(b))||cmpDesc(strikeRateOf(a),strikeRateOf(b))||cmpAsc(a.runsConceded,b.runsConceded);
const allTied=(rows,compare)=>rows.length?rows.filter(row=>compare(row,rows[0])===0):[];
function saveOver(s,complete=true){
  if(!s.overBalls.length)return;
  s.completedOvers.push({innings:s.innings||null,battingTeam:s.battingTeam||null,balls:s.overBalls.slice(),runs:s.overBalls.reduce((n,d)=>n+d.runs,0),wickets:s.overBalls.filter(d=>d.out).length,bowlerId:s.overBowlerId,complete});
  s.lastBowlerId=s.overBowlerId;s.overBalls=[];
}
function closeOver(s){
  if(s.overBalls.length!==6)return;
  saveOver(s,true);
  if(s.config.mode==="team"){s.bowlerSelectionOpen=true;s.currentBowlerId=nextTeamBowler(s,s.currentBatterId,s.bowlingTeam);}
  else s.currentBowlerId=nextIndividualBowler(s,s.currentBatterId);
  s.overBowlerId=s.currentBowlerId;
}
function startTeamInnings(s,team,innings){
  s.innings=innings;s.battingTeam=team;s.bowlingTeam=team==="red"?"blue":"red";
  s.currentInningsRuns={};
  for(const id of s.playerOrder)s.currentInningsRuns[id]=0;
  s.currentBatterId=nextBatter(s,team);
  s.batterSelectionOpen=true;s.bowlerSelectionOpen=true;
  s.lastBowlerId=null;s.currentBowlerId=nextTeamBowler(s,s.currentBatterId,s.bowlingTeam);
  s.overBowlerId=s.currentBowlerId;s.overBalls=[];s.pending={};s.phase="playing";
  if(!s.currentBatterId)finish(s,innings===2?s.bowlingTeam:null);
  else if(!s.currentBowlerId)finish(s,null);
}
function startIndividualInnings(s,index,{keepOver=false}={}){
  if(index>=s.playerOrder.length){finish(s,null);return;}
  const batter=s.playerOrder[index];
  s.individualIndex=index;s.individualBatterId=batter;s.currentBatterId=batter;
  s.individualBalls=0;s.individualWickets=0;s.currentInningsRuns={};
  for(const id of s.playerOrder)s.currentInningsRuns[id]=0;
  s.pending={};
  if(!keepOver){
    s.overBalls=[];
    s.currentBowlerId=nextIndividualBowler(s,batter);
    s.overBowlerId=s.currentBowlerId;
  }
  if(!s.currentBowlerId){startIndividualInnings(s,index+1);return;}
  s.phase="playing";
}
function completeIndividualInnings(s){
  refreshHighest(s,s.currentBatterId);
  const next=s.individualIndex+1;
  if(next>=s.playerOrder.length){if(s.overBalls.length)saveOver(s,s.overBalls.length===6);finish(s,null);return;}
  // The next batter inherits the unfinished over and its bowler.
  const carry=s.overBalls.length>0&&s.currentBowlerId&&s.currentBowlerId!==s.playerOrder[next];
  if(s.overBalls.length&&!carry)saveOver(s,false);
  startIndividualInnings(s,next,{keepOver:Boolean(carry)});
}
function resolveDelivery(s,ctx){
  const batter=s.currentBatterId,bowler=s.currentBowlerId;
  const bat=s.pending[batter],bowl=s.pending[bowler];
  let out=false,runs=0,reason="";
  if(bat==="fist"&&bowl==="fist"){out=true;reason="Both chose Fist";}
  else if(bat==="fist"||bowl==="fist"){runs=bat==="fist"?bowl:bat;reason="One player chose Fist";}
  else if(bat===bowl){out=true;reason="Matching numbers";}
  else{runs=bat;reason="Runs scored";}
  const team=s.config.mode==="team"?s.battingTeam:null;
  const batterStats=s.stats[batter],bowlerStats=s.stats[bowler];
  s.bowlingSequence=(s.bowlingSequence||0)+1;bowlerStats.lastBowledAt=s.bowlingSequence;
  const batterBefore=s.currentInningsRuns[batter]||0;
  batterStats.balls++;bowlerStats.ballsBowled++;
  batterStats.runs+=runs;bowlerStats.runsConceded+=runs;
  s.currentInningsRuns[batter]=batterBefore+runs;
  refreshHighest(s,batter);
  if(team)s.batterSelectionOpen=Boolean(out);
  if(out){
    batterStats.wickets++;bowlerStats.wicketsTaken++;
    if(team){s.wicketLosses[team][batter]=(s.wicketLosses[team][batter]||0)+1;s.teamScores[team].wickets++;}
    else s.individualWickets++;
  }
  if(team){s.teamScores[team].runs+=runs;s.teamScores[team].balls++;}
  const personalBefore=batterStats.runs-runs;
  const events=milestoneEvents(s,personalBefore,batterStats.runs,null,batter);
  if(team)events.push(...milestoneEvents(s,s.teamScores[team].runs-runs,s.teamScores[team].runs,team,batter));
  const delivery={
    ball:team?s.teamScores[team].balls:s.individualBalls+1,
    innings:team?s.innings:s.individualIndex+1,battingTeam:team,
    batterId:batter,bowlerId:bowler,batterName:nameOf(ctx,batter),bowlerName:nameOf(ctx,bowler),
    batChoice:bat,bowlChoice:bowl,out,runs,reason,at:Date.now()
  };
  s.history.push(delivery);s.overBalls.push(delivery);s.lastDelivery=delivery;s.pending={};
  if(team){
    if(out){refreshHighest(s,batter);s.currentBatterId=nextBatter(s,team,batter);}
    const score=s.teamScores[team],limit=s.superOverActive?6:s.config.unlimited?Infinity:s.config.limit*6;
    const inningsDone=score.balls>=limit||!eligibleBatters(s,team).length;
    if(inningsDone){
      for(const id of s.playerOrder)refreshHighest(s,id);
      if(s.overBalls.length)saveOver(s,s.overBalls.length===6);
      if(s.innings===1)startTeamInnings(s,s.bowlingTeam,2);
      else{
        const winner=score.runs>s.teamScores[s.bowlingTeam].runs?team:score.runs===s.teamScores[s.bowlingTeam].runs?null:s.bowlingTeam;
        if(!winner)requestSuperOverVote(s);else finish(s,winner);
      }
    }else{
      if(!s.currentBatterId)s.currentBatterId=nextBatter(s,team);
      if(s.innings===2&&score.runs>s.teamScores[s.bowlingTeam].runs){if(s.overBalls.length)saveOver(s,false);finish(s,team);}
      else{
        if(score.balls%6===0)closeOver(s);
        if(!s.currentBowlerId)s.currentBowlerId=nextTeamBowler(s,s.currentBatterId,s.bowlingTeam),s.overBowlerId=s.currentBowlerId;
        if(!s.currentBatterId||!s.currentBowlerId)finish(s,s.innings===2?s.bowlingTeam:null);
      }
    }
  }else{
    s.individualBalls++;
    const ballsDone=!s.config.unlimited&&s.individualBalls>=s.config.limit;
    // In an individual tournament, each player gets one batting innings.
    // A single dismissal ends that innings regardless of the team wicket setting.
    const inningsDone=out||ballsDone;
    if(inningsDone){
      // Finish this ball's place in the six-ball over before choosing a fresh bowler.
      const overComplete=s.overBalls.length===6;
      if(overComplete)saveOver(s,true);
      completeIndividualInnings(s);
    }else if(s.overBalls.length===6)closeOver(s);
  }
  return {delivery,events};
}
export const handCricket={
  id:"hand-cricket",name:"Hand Cricket",
  description:"A simultaneous number-pick cricket match: bat smart, bowl smart, and build the score.",
  guide:"🏏 HAND CRICKET — COMPLETE PLAY GUIDE\n\nTHE AIM\nTeam match: score more runs than the opposing team. Individual tournament: finish with the highest total runs. Every ball is a simultaneous contest between one batter and one bowler.\n\nONE BALL, TWO HAND CHOICES\n1. The batter and bowler each secretly choose a number from 1 to 6.\n2. Neither player sees the other's choice before locking in.\n3. Once both choices are locked, the server reveals them together with animated hand gestures.\n4. Every delivery counts as one ball, including a wicket.\nOnly numbers 1–6 can be selected; zero is not part of the game.\n\nHOW RUNS AND WICKETS WORK\n• Different numbers: the batter scores the number they chose.\n• Matching numbers: the batter is OUT.\n• If Fist is enabled, either player may choose ✊ Fist.\n• Fist vs Fist: the batter is OUT.\n• Only one player chooses Fist: the other player's number is scored.\nThere are no separate four- or six-run boundary bonuses.\n\nMATCH SETTINGS\nThe host configures the match before continuing. Other players can see the settings but cannot change them.\n• Match format: Team-wise or Individual tournament.\n• Wickets per player: in team matches, how many dismissals a player can take before elimination. Individual-tournament innings end on the first dismissal.\n• Allow Fist: enables or disables the Fist choice.\n• Team-wise duration: choose overs per innings or Unlimited. One over is six balls.\n• Individual duration: choose balls per player or Unlimited.\n• Unlimited: a team innings continues until its eligible batters have used all their wickets; an individual innings ends on the first dismissal. A chase can still end immediately when the target is passed.\n• After a dismissal, a player with wickets remaining returns to the back of the batting queue.\n\nSAVE SETTINGS AND CONTINUE\n• Save settings stores the current choices and shares them with everyone. It does not begin the match; the host can still change the settings.\n• Continue saves the current choices and moves the game into the next setup stage (team selection for a team match, or the first innings for an individual tournament). After continuing, settings are locked.\n\nTEAM-WISE MATCH\n1. With an even number of players, choose Red or Blue. With an odd number, choose Red, Blue or the separate Wildcard Player option. Red and Blue must always have equal numbers; the wildcard is outside both teams. You may change your choice until everyone has selected.\n2. Each team elects a captain. Every teammate gets one private vote. A tie among the top candidates triggers a runoff vote.\n3. Red bats first. The batting captain chooses the next eligible batter; the bowling captain chooses a bowler at the start of each over.\n4. An over is six balls. The same bowler completes all six balls, even if a wicket falls. The previous bowler cannot bowl the next over, except in a two-player match.\n5. Batters rotate after each dismissal. A player with wickets remaining can return later in the queue.\n6. Teams swap roles for the second innings. The chasing team wins as soon as it passes the target; otherwise the completed scores decide the result.\n\nODD PLAYER — THE WILDCARD\nWith an odd number of players, exactly one player selects the separate Wildcard Player option. The Red and Blue teams remain equal in size. The host chooses the wildcard's role:\n• Bat only: may bat for either team, but cannot bowl.\n• Bowl only: may bowl for either team, but cannot bat.\n• Bat and bowl: may bat or bowl for either team.\nThe wildcard can never bat and bowl in the same delivery. If the wildcard is batting for a team, they cannot bowl against themselves. Their wicket allowance is tracked separately for each team, and runs count for the team they are batting for.\n\nINDIVIDUAL TOURNAMENT\nEveryone bats one innings with the same ball allocation (or Unlimited). A player's innings ends immediately on their first dismissal, or when their ball allocation is used up. The team-match wicket allowance does not apply in this format. Other players rotate as bowlers; nobody bowls in their own innings. A fair bowling round gives every eligible bowler one over before anyone gets a second. If an innings ends part-way through an over, the next batter takes the crease and the current bowler finishes that over unless doing so would make them bowl against themselves.\n\nSCORECARD, HIGH SCORE AND HISTORY\n• The live scoreboard shows team scores or individual standings.\n• The scorecard is shown in both formats. HS (Highest Score) is each player's best single-innings score; it is not limited to individual tournaments and is not dependent on choosing one wicket. The wicket setting only controls how many dismissals a player can take.\n• Batting figures include runs, balls, highest score, wickets lost and strike rate. Bowling figures include overs, runs conceded, wickets taken and economy.\n• Overs use overs.balls notation: 8.2 means 8 overs and 2 balls (50 balls).\n• RR is the batting run rate. During a limited chase, the board also shows balls remaining and required run rate (RRR).\n• The chase panel shows how many more wickets the bowling team needs to win.\n• Completed overs show each delivery and the over total.\n• Ball-by-ball history records every delivery in the current match, including batter, bowler, both choices and the outcome. It is not capped at a fixed number of balls; scroll the history panel to see earlier deliveries. Reconnecting restores the full history.\n• Personal milestones are 50, 100, 150 and 200 runs; team milestones are 50, 100 and 150 runs.\n\nSUPER OVER\nIf the two team scores are tied after the regular match, both team captains independently vote Yes or No. A Super Over happens only when both vote Yes. Each team gets one six-ball over, with the match's configured wicket allowance. If either captain votes No, the match stays tied. If a Super Over is tied, both captains vote again; another Super Over is played only if both vote Yes. This repeats until a team wins or a captain declines.\n\nTHE RESULT\nThe result screen shows the winner or tie, final score and Super Over history when applicable. Team awards are Best Batter (most runs, then highest score, then strike rate; all exact ties share the award) and Best Bowler (most wickets, then lowest economy, then fewest runs conceded; all exact ties share the award). Individual tournament ranking is total runs, bowling wickets taken, highest score, bowling economy (lower is better), strike rate (higher is better), then bowling runs conceded (lower is better). Players tied on every criterion share a rank.\n\nRECONNECTING\nThe server is the source of truth. If you reconnect, the current innings, locked-choice status, scorecard, completed overs and full ball history are restored.",
  emoji:"🏏",color:"#c9e4d2",entry:"./src/games/hand-cricket/index.html",
  players:{min:2,max:8},interactionModel:"simultaneous",lateJoinPolicy:"wait",spectators:{supported:true},
  canStart(ctx){const n=activeIds(ctx).length;return n>=2&&n<=8?{ok:true}:{ok:false,reason:"Hand Cricket needs 2–8 connected players."};},
  createInitialState(ctx){
    const ids=activeIds(ctx);
    return {phase:"settings",playerOrder:ids,config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:5},
      teams:{},teamVotes:{red:{},blue:{}},captains:{red:null,blue:null},runoff:{red:[],blue:[]},wildcardId:null,superOverActive:false,superOverRound:0,superOverVote:{red:null,blue:null},superOverRounds:[],regulationScores:null,
      stats:makeStats(ids),bowlingSequence:0,teamScores:{red:{runs:0,wickets:0,balls:0},blue:{runs:0,wickets:0,balls:0}},
      wicketLosses:{red:{},blue:{}},battingQueue:{red:[],blue:[]},history:[],completedOvers:[],overBalls:[],
      milestones:[],pending:{},innings:1,individualIndex:0,individualBalls:0,individualWickets:0,
      currentInningsRuns:{},bowlingRound:{},roundOrder:[],lastBowlerId:null,overBowlerId:null,
      currentBatterId:null,currentBowlerId:null,batterSelectionOpen:false,bowlerSelectionOpen:false,winnerTeam:null,lastDelivery:null,lastEvents:[]};
  },
  getPublicState(s){
    if(!s)return null;
    const {pending,teamVotes,superOverVote,...pub}=s;
    return {...pub,pendingPlayers:Object.keys(pending||{}),captainVotesCast:{
      red:Object.keys(teamVotes?.red||{}),blue:Object.keys(teamVotes?.blue||{})
    },superOverVotesCast:{red:superOverVote?.red!==null&&superOverVote?.red!==undefined,blue:superOverVote?.blue!==null&&superOverVote?.blue!==undefined}};
  },
  getPrivateState(s,id){return s?.playerOrder.includes(id)?{hasSubmitted:s.pending?.[id]!==undefined,choice:s.pending?.[id]??null}:null;},
  onPlayerLeave(ctx,s,id){
    if(!s)return null;
    const next=clone(s),oldTeam=teamOf(next,id),removedIndex=next.playerOrder.indexOf(id);
    next.playerOrder=next.playerOrder.filter(x=>x!==id);
    if(next.config.mode==="individual"&&removedIndex<next.individualIndex)next.individualIndex--;
    delete next.pending[id];delete next.stats[id];delete next.currentInningsRuns[id];
    for(const team of TEAMS){
      next.battingQueue[team]=(next.battingQueue[team]||[]).filter(x=>x!==id);
      delete next.wicketLosses[team][id];delete next.teamVotes[team][id];
      if(next.runoff[team]?.includes(id))next.runoff[team]=next.runoff[team].filter(x=>x!==id);
    }
    delete next.teams[id];
    if(next.playerOrder.length<2)return null;
    if(next.currentBatterId===id){
      if(next.config.mode==="team"){
        next.currentBatterId=nextBatter(next,next.battingTeam,id);
        if(!next.currentBatterId){
          if(next.innings===1)startTeamInnings(next,next.bowlingTeam,2);
          else finish(next,next.bowlingTeam);
        }
      }else{
        startIndividualInnings(next,Math.min(next.individualIndex,next.playerOrder.length-1));
      }
    }
    if(next.currentBowlerId===id&&next.phase==="playing"){
      next.currentBowlerId=next.config.mode==="team"?nextTeamBowler(next,next.currentBatterId,next.bowlingTeam):nextIndividualBowler(next,next.currentBatterId);
      next.overBowlerId=next.currentBowlerId;
      if(!next.currentBowlerId)finish(next,next.config.mode==="team"&&next.innings===2?next.bowlingTeam:null);
    }
    if(next.captains.red===id){next.captains.red=next.playerOrder.find(x=>next.teams[x]==="red")||null;if(next.phase==="super-over-vote")next.superOverVote.red=null;}
    if(next.captains.blue===id){next.captains.blue=next.playerOrder.find(x=>next.teams[x]==="blue")||null;if(next.phase==="super-over-vote")next.superOverVote.blue=null;}
    if(next.config.mode==="team"&&(!next.playerOrder.some(x=>next.teams[x]==="red")||!next.playerOrder.some(x=>next.teams[x]==="blue")))return null;
    if(next.phase==="captains"&&oldTeam&&next.captains[oldTeam])next.teamVotes[oldTeam]={};
    return next;
  },
  validateAction(ctx,s,a){
    if(!s||!Array.isArray(s.playerOrder))return {ok:false,reason:"The match state is unavailable."};
    const id=ctx.player.id,host=Boolean(ctx.player.isHost);
    if(!s.playerOrder.includes(id))return {ok:false,reason:"You are not an active player."};
    if(!a||typeof a.type!=="string")return {ok:false,reason:"Choose a valid action."};
    if(s.phase==="finished")return {ok:false,reason:"The match has finished."};
    if(a.type==="update-settings"){
      if(s.phase!=="settings"||!host)return {ok:false,reason:"Only the host can change match settings."};
      const c=a.config||{};
      if(!["team","individual"].includes(c.mode)||!WICKETS.includes(c.wickets)||!["bat-only","bowl-only","bat-bowl"].includes(c.oddPlayerMode)||typeof c.allowFist!=="boolean"||typeof c.unlimited!=="boolean"||(!c.unlimited&&(!Number.isInteger(c.limit)||c.limit<1||c.limit>120)))return {ok:false,reason:"One or more settings are invalid."};
      return {ok:true};
    }
    if(a.type==="start-match")return s.phase==="settings"&&host?{ok:true}:{ok:false,reason:"Only the host can start the match."};
    if(a.type==="choose-team"){
      const odd=s.playerOrder.length%2===1,cap=Math.floor(s.playerOrder.length/2);
      const validTeam=TEAMS.includes(a.team)||(odd&&a.team==="wildcard");
      const counts={red:s.playerOrder.filter(pid=>pid!==id&&s.teams[pid]==="red").length,blue:s.playerOrder.filter(pid=>pid!==id&&s.teams[pid]==="blue").length,wildcard:s.playerOrder.filter(pid=>pid!==id&&s.teams[pid]==="wildcard").length};
      const room=a.team==="wildcard"?counts.wildcard<1:counts[a.team]<cap;
      return s.phase==="teams"&&validTeam&&room?{ok:true}:{ok:false,reason:"That option is full or unavailable. You can change your choice while team selection remains open."};
    }
    if(a.type==="vote-super-over"){
      const team=TEAMS.find(t=>s.captains[t]===id);
      return s.phase==="super-over-vote"&&team&&s.superOverVote?.[team]===null&&["yes","no"].includes(a.vote)?{ok:true}:{ok:false,reason:"Only an unvoted team captain can vote Yes or No on the Super Over."};
    }
    if(a.type==="vote-captain"){
      const team=teamOf(s,id),candidates=s.runoff[team]?.length?s.runoff[team]:s.playerOrder.filter(pid=>teamOf(s,pid)===team);
      return s.phase==="captains"&&TEAMS.includes(team)&&!s.teamVotes[team]?.[id]&&candidates.includes(a.candidateId)?{ok:true}:{ok:false,reason:"Choose one captain vote from your own team."};
    }
    if(a.type==="select-batter"){
      const eligible=eligibleBatters(s,s.battingTeam).filter(pid=>s.bowlerSelectionOpen||pid!==s.currentBowlerId);
      return s.config.mode==="team"&&s.phase==="playing"&&id===s.captains[s.battingTeam]&&eligible.includes(a.playerId)&&!Object.keys(s.pending).length&&s.batterSelectionOpen?{ok:true}:{ok:false,reason:"The batting captain must choose an eligible batter who is not the confirmed bowler."};
    }
    if(a.type==="select-bowler"){
      const batterId=s.batterSelectionOpen?null:s.currentBatterId;
      const candidates=eligibleBowlers(s,s.bowlingTeam,batterId),alternatives=candidates.filter(pid=>pid!==s.lastBowlerId);
      return s.config.mode==="team"&&s.phase==="playing"&&id===s.captains[s.bowlingTeam]&&candidates.includes(a.playerId)&&(!alternatives.length||a.playerId!==s.lastBowlerId)&&s.overBalls.length===0&&s.bowlerSelectionOpen&&!Object.keys(s.pending).length?{ok:true}:{ok:false,reason:"Only your bowling captain can choose one eligible bowler before an over begins."};
    }
    if(a.type==="submit-ball"){
      if(s.phase!=="playing"||![s.currentBatterId,s.currentBowlerId].includes(id))return {ok:false,reason:"You are not batting or bowling this ball."};
      if(s.config.mode==="team"&&(s.batterSelectionOpen||s.bowlerSelectionOpen||!s.currentBatterId||!s.currentBowlerId||s.currentBatterId===s.currentBowlerId))return {ok:false,reason:"The ball cannot start until both captains confirm an eligible batter and bowler."};
      if(s.pending[id]!==undefined)return {ok:false,reason:"Your choice is already locked."};
      if(!VALUES.includes(a.choice)||(!s.config.allowFist&&a.choice==="fist"))return {ok:false,reason:"Choose a valid number"+(s.config.allowFist?" or Fist.":".")};
      return {ok:true};
    }
    return {ok:false,reason:"Unknown Hand Cricket action."};
  },
  reduceAction(ctx,s,a){
    const n=clone(s),id=ctx.player.id;
    if(a.type==="update-settings"){n.config={...n.config,...a.config};return n;}
    if(a.type==="start-match"){
      if(n.config.mode==="individual")startIndividualInnings(n,0);
      else n.phase="teams";
      return n;
    }
    if(a.type==="choose-team"){
      n.teams[id]=a.team;
      if(n.playerOrder.every(pid=>n.teams[pid])){
        const red=n.playerOrder.filter(pid=>n.teams[pid]==="red"),blue=n.playerOrder.filter(pid=>n.teams[pid]==="blue");
        n.wildcardId=n.playerOrder.find(pid=>n.teams[pid]==="wildcard")||null;
        const expected=Math.floor(n.playerOrder.length/2);
        if(red.length!==expected||blue.length!==expected||(n.playerOrder.length%2===1)!==Boolean(n.wildcardId))return n;
        n.battingQueue={red:red.slice(),blue:blue.slice()};
        if(n.wildcardId&&n.config.oddPlayerMode!=="bowl-only"){
          for(const team of TEAMS)n.battingQueue[team].push(n.wildcardId);
        }
        n.phase="captains";
        for(const team of TEAMS)if(red.length===1&&team==="red"||blue.length===1&&team==="blue")n.captains[team]=team==="red"?red[0]:blue[0];
        if(n.captains.red&&n.captains.blue)startTeamInnings(n,"red",1);
      }
      return n;
    }
    if(a.type==="vote-captain"){
      const team=teamOf(n,id);n.teamVotes[team][id]=a.candidateId;
      const members=n.playerOrder.filter(pid=>teamOf(n,pid)===team);
      if(members.every(pid=>n.teamVotes[team][pid])){
        const tally={};for(const vote of Object.values(n.teamVotes[team]))tally[vote]=(tally[vote]||0)+1;
        const high=Math.max(...Object.values(tally)),leaders=Object.keys(tally).filter(pid=>tally[pid]===high);
        if(leaders.length===1)n.captains[team]=leaders[0];
        else{n.runoff[team]=leaders;n.teamVotes[team]={};}
      }
      if(n.captains.red&&n.captains.blue)startTeamInnings(n,"red",1);
      return n;
    }
    if(a.type==="vote-super-over"){
      const team=TEAMS.find(t=>n.captains[t]===id);n.superOverVote[team]=a.vote;
      if(TEAMS.every(t=>n.superOverVote[t]!==null)){
        if(TEAMS.some(t=>n.superOverVote[t]==="no"))finish(n,null);
        else startSuperOver(n);
      }
      return n;
    }
    if(a.type==="select-batter"){n.currentBatterId=a.playerId;n.batterSelectionOpen=false;return n;}
    if(a.type==="select-bowler"){n.currentBowlerId=a.playerId;n.overBowlerId=a.playerId;n.bowlerSelectionOpen=false;return n;}
    if(a.type==="submit-ball"){
      n.pending[id]=a.choice;
      if(n.pending[n.currentBatterId]!==undefined&&n.pending[n.currentBowlerId]!==undefined){
        const resolved=resolveDelivery(n,ctx);n.lastEvents=resolved.events;
        if(n.overBalls.length===6)closeOver(n);
      }
      return n;
    }
    return n;
  },
  getStatus(ctx,s){return s.phase==="finished"?"finished":"active";},
  getResults(ctx,s){
    if(s.config.mode==="team"){
      const rows=s.playerOrder.map(id=>({id,...s.stats[id],nickname:nameOf(ctx,id)}));
      const bestBatters=allTied(rows.slice().sort(compareBestBatter),compareBestBatter).map(x=>({id:x.id,runs:x.runs,highestScore:x.highestScore,strikeRate:strikeRateOf(x)}));
      const bestBowlers=allTied(rows.slice().sort(compareBestBowler),compareBestBowler).map(x=>({id:x.id,wicketsTaken:x.wicketsTaken,runsConceded:x.runsConceded,ballsBowled:x.ballsBowled,economy:economyOf(x)}));
      return {outcome:s.winnerTeam?"winner":s.teamScores.red.runs===s.teamScores.blue.runs?"draw":"winner",winnerTeam:s.winnerTeam,scores:{red:s.teamScores.red,blue:s.teamScores.blue},regulationScores:s.regulationScores,superOverRounds:s.superOverRounds||[],bestBatters,bestBowlers,history:s.history.length};
    }
    const ranking=s.playerOrder.map(id=>({playerId:id,nickname:nameOf(ctx,id),...s.stats[id],economy:economyOf(s.stats[id]),strikeRate:strikeRateOf(s.stats[id])})).sort(compareIndividual);
    return {outcome:"winner",ranking,history:s.history.length};
  }
};
