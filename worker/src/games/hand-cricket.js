const VALUES=[0,1,2,3,4,5,6,"fist"];
const WICKETS=[1,2,3];
const TEAM_OVERS=[1,2,3,5,10,20];
const INDIVIDUAL_BALLS=[6,12,18,30,60];
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
  const eligibleRound=s.roundOrder.filter(id=>pool.includes(id));
  if(!eligibleRound.length||eligibleRound.every(id=>s.bowlingRound[id])){
    s.roundOrder=pool.slice().sort((a,b)=>
      Math.floor(s.stats[a].ballsBowled/6)-Math.floor(s.stats[b].ballsBowled/6)||
      s.stats[a].ballsBowled-s.stats[b].ballsBowled||s.playerOrder.indexOf(a)-s.playerOrder.indexOf(b));
    s.bowlingRound={};
  }else s.roundOrder=eligibleRound;
  const candidates=s.roundOrder.filter(id=>!s.bowlingRound[id]);
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
  s.completedAt=Date.now();
}
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
  else{runs=bat;reason=runs===0?"Dot ball":"Runs scored";}
  const team=s.config.mode==="team"?s.battingTeam:null;
  const batterStats=s.stats[batter],bowlerStats=s.stats[bowler];
  const batterBefore=s.currentInningsRuns[batter]||0;
  batterStats.balls++;bowlerStats.ballsBowled++;
  batterStats.runs+=runs;bowlerStats.runsConceded+=runs;
  s.currentInningsRuns[batter]=batterBefore+runs;
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
    const score=s.teamScores[team],limit=s.config.unlimited?Infinity:s.config.limit*6;
    const inningsDone=score.balls>=limit||!eligibleBatters(s,team).length;
    if(inningsDone){
      for(const id of s.playerOrder)refreshHighest(s,id);
      if(s.overBalls.length)saveOver(s,s.overBalls.length===6);
      if(s.innings===1)startTeamInnings(s,s.bowlingTeam,2);
      else finish(s,score.runs>s.teamScores[s.bowlingTeam].runs?team:score.runs===s.teamScores[s.bowlingTeam].runs?null:s.bowlingTeam);
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
    const inningsDone=ballsDone||s.individualWickets>=s.config.wickets;
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
  guide:"🏏 HAND CRICKET — PLAY GUIDE\n\nTHE IDEA\nOne player bats while another bowls. Both secretly lock a number from 0 to 6. Choices are revealed together only after both have locked in.\n\nHOW A BALL WORKS\n• If the numbers are different, the batter scores the number they chose.\n• If both choose the same number, the batter is OUT.\n• If Fist is enabled: Fist vs Fist is OUT. If only one player chooses Fist, the other player's number is scored.\n• A dot ball scores 0. Every delivery counts as one ball, including a wicket.\n\nTEAM MATCH\nPlayers choose Red or Blue, then each team elects a captain. The Red team bats first. Each innings ends when its over limit is reached or its eligible batters have used all their wickets. Batters rotate after a dismissal; a player with wickets left can bat again later. The bowling captain selects a bowler for each six-ball over. A bowler cannot bowl consecutive overs, except in a two-player match. The chase ends as soon as the target is passed, or when the innings ends.\n\nODD PLAYER / WILDCARD\nWhen teams have an odd number of players, one player from the larger team is the wildcard. The host chooses whether the wildcard can bat for either team, bowl for either team, or do both. A wildcard can never bat and bowl the same delivery; if they are batting, they cannot bowl against themselves. Wickets are counted separately for each team's innings, and runs always belong to the team the wildcard is batting for.\n\nINDIVIDUAL TOURNAMENT\nEvery player bats one innings with the same ball allocation (or until their wicket allowance is used). Other players take turns bowling. A bowler rotation round gives every eligible bowler one over before anyone gets a second; totals are balanced across the tournament. If an innings ends part-way through an over, the next batter takes the crease and the current bowler completes that over.\n\nSCORECARDS & RESULTS\nThe live board shows runs, wickets, overs, run rate and (during a limited chase) balls remaining and required run rate. Batting and bowling figures, over summaries and the complete ball history stay visible. Personal milestones are announced at 50, 100, 150 and 200; team milestones at 50, 100 and 150. Final standings show the top scorer and best bowling figures. There is no Player of the Match award.\n\nRECONNECTING\nThe server is the source of truth. If you reconnect, the current innings, locked choices, scorecard and ball history are restored.",
  emoji:"🏏",color:"#c9e4d2",entry:"./src/games/hand-cricket/index.html",
  players:{min:2,max:8},interactionModel:"simultaneous",lateJoinPolicy:"wait",spectators:{supported:true},
  canStart(ctx){const n=activeIds(ctx).length;return n>=2&&n<=8?{ok:true}:{ok:false,reason:"Hand Cricket needs 2–8 connected players."};},
  createInitialState(ctx){
    const ids=activeIds(ctx);
    return {phase:"settings",playerOrder:ids,config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:5},
      teams:{},teamVotes:{red:{},blue:{}},captains:{red:null,blue:null},runoff:{red:[],blue:[]},wildcardId:null,
      stats:makeStats(ids),teamScores:{red:{runs:0,wickets:0,balls:0},blue:{runs:0,wickets:0,balls:0}},
      wicketLosses:{red:{},blue:{}},battingQueue:{red:[],blue:[]},history:[],completedOvers:[],overBalls:[],
      milestones:[],pending:{},innings:1,individualIndex:0,individualBalls:0,individualWickets:0,
      currentInningsRuns:{},bowlingRound:{},roundOrder:[],lastBowlerId:null,overBowlerId:null,
      currentBatterId:null,currentBowlerId:null,batterSelectionOpen:false,bowlerSelectionOpen:false,winnerTeam:null,lastDelivery:null,lastEvents:[]};
  },
  getPublicState(s){
    if(!s)return null;
    const {pending,...pub}=s;
    return {...pub,pendingPlayers:Object.keys(pending||{})};
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
    if(next.captains.red===id)next.captains.red=next.playerOrder.find(x=>next.teams[x]==="red")||null;
    if(next.captains.blue===id)next.captains.blue=next.playerOrder.find(x=>next.teams[x]==="blue")||null;
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
      const c=a.config||{},limitList=c.mode==="team"?TEAM_OVERS:INDIVIDUAL_BALLS;
      if(!["team","individual"].includes(c.mode)||!WICKETS.includes(c.wickets)||!["bat-only","bowl-only","bat-bowl"].includes(c.oddPlayerMode)||typeof c.allowFist!=="boolean"||typeof c.unlimited!=="boolean"||(!c.unlimited&&!limitList.includes(c.limit)))return {ok:false,reason:"One or more settings are invalid."};
      return {ok:true};
    }
    if(a.type==="start-match")return s.phase==="settings"&&host?{ok:true}:{ok:false,reason:"Only the host can start the match."};
    if(a.type==="choose-team"){
      const counts={red:s.playerOrder.filter(pid=>s.teams[pid]==="red").length,blue:s.playerOrder.filter(pid=>s.teams[pid]==="blue").length};
      const cap=Math.ceil(s.playerOrder.length/2);
      return s.phase==="teams"&&TEAMS.includes(a.team)&&!s.teams[id]&&counts[a.team]<cap?{ok:true}:{ok:false,reason:"That team is full or your team choice is already locked."};
    }
    if(a.type==="vote-captain"){
      const team=teamOf(s,id),candidates=s.runoff[team]?.length?s.runoff[team]:s.playerOrder.filter(pid=>teamOf(s,pid)===team);
      return s.phase==="captains"&&team&&!s.teamVotes[team]?.[id]&&candidates.includes(a.candidateId)?{ok:true}:{ok:false,reason:"Choose one captain vote from your own team."};
    }
    if(a.type==="select-batter"){
      return s.config.mode==="team"&&s.phase==="playing"&&id===s.captains[s.battingTeam]&&eligibleBatters(s,s.battingTeam).includes(a.playerId)&&!Object.keys(s.pending).length&&s.batterSelectionOpen?{ok:true}:{ok:false,reason:"The batting captain can choose one eligible batter at the start or after a wicket."};
    }
    if(a.type==="select-bowler"){
      const candidates=eligibleBowlers(s,s.bowlingTeam,s.currentBatterId),alternatives=candidates.filter(pid=>pid!==s.lastBowlerId);
      return s.config.mode==="team"&&s.phase==="playing"&&id===s.captains[s.bowlingTeam]&&candidates.includes(a.playerId)&&(!alternatives.length||a.playerId!==s.lastBowlerId)&&s.overBalls.length===0&&s.bowlerSelectionOpen&&!Object.keys(s.pending).length?{ok:true}:{ok:false,reason:"Only your bowling captain can choose one eligible bowler before an over begins."};
    }
    if(a.type==="submit-ball"){
      if(s.phase!=="playing"||![s.currentBatterId,s.currentBowlerId].includes(id))return {ok:false,reason:"You are not batting or bowling this ball."};
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
        if(!red.length||!blue.length)return n;
        if(n.playerOrder.length%2){const larger=red.length>blue.length?red:blue;n.wildcardId=larger[0]||null;}
        n.battingQueue={red:red.slice(),blue:blue.slice()};
        if(n.wildcardId&&n.config.oddPlayerMode!=="bowl-only"){
          for(const team of TEAMS)if(!n.battingQueue[team].includes(n.wildcardId))n.battingQueue[team].push(n.wildcardId);
        }
        n.phase="captains";
        for(const team of TEAMS)if(n.battingQueue[team].length===1)n.captains[team]=n.battingQueue[team][0];
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
    if(a.type==="select-batter"){n.currentBatterId=a.playerId;n.batterSelectionOpen=false;return n;}
    if(a.type==="select-bowler"){n.currentBowlerId=a.playerId;n.overBowlerId=a.playerId;n.bowlerSelectionOpen=false;return n;}
    if(a.type==="submit-ball"){
      if(n.config.mode==="team"){n.bowlerSelectionOpen=false;n.batterSelectionOpen=false;}
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
      const red=s.teamScores.red,blue=s.teamScores.blue;
      return {outcome:s.winnerTeam?"winner":red.runs===blue.runs?"draw":"winner",winnerTeam:s.winnerTeam,scores:{red,blue},topScorer:s.playerOrder.map(id=>({id,runs:s.stats[id].runs})).sort((a,b)=>b.runs-a.runs)[0]||null,bestBowler:s.playerOrder.map(id=>({id,wickets:s.stats[id].wicketsTaken,runs:s.stats[id].runsConceded})).sort((a,b)=>b.wickets-a.wickets||a.runs-b.runs)[0]||null,history:s.history.length};
    }
    const ranking=s.playerOrder.map(id=>({playerId:id,nickname:nameOf(ctx,id),...s.stats[id]})).sort((a,b)=>b.runs-a.runs||b.highestScore-a.highestScore||a.balls-b.balls);
    return {outcome:"winner",ranking,topScorer:ranking[0]||null,bestBowler:ranking.slice().sort((a,b)=>b.wicketsTaken-a.wicketsTaken||a.runsConceded-b.runsConceded)[0]||null,history:s.history.length};
  }
};
