const VALUES = [0,1,2,3,4,5,6,"fist"];
const WICKETS = [1,2,3];
const LIMITS = [2,3,5,10,20];
const clone = value => JSON.parse(JSON.stringify(value));
const nameOf = (context,id) => context.players.find(p=>p.id===id)?.nickname || "Player";
const emptyStats = () => ({runs:0,balls:0,wickets:0,overs:0,ballsBowled:0,runsConceded:0,wicketsTaken:0});
const makeStats = ids => Object.fromEntries(ids.map(id=>[id,emptyStats()]));
const overText = balls => Math.floor(balls/6)+"."+(balls%6);
const activeIds = context => context.players.filter(p=>p.role==="player"&&p.connected).map(p=>p.id);
const teamOf = (s,id) => s.teams?.[id] || null;
const eligibleBatters = (s,team) => s.playerOrder.filter(id => {
  const wildcardCanBat = id===s.wildcardId && s.config.oddPlayerMode!=="bowl-only";
  if (teamOf(s,id)!==team && !wildcardCanBat) return false;
  return (s.wicketLosses?.[team]?.[id]||0) < s.config.wickets;
});
const eligibleBowlers = (s,team,batterId) => s.playerOrder.filter(id => {
  const wildcardCanBowl = id===s.wildcardId && s.config.oddPlayerMode!=="bat-only";
  if (teamOf(s,id)!==team && !wildcardCanBowl) return false;
  return id!==batterId;
});
function chooseNextBowler(s,batterId,team) {
  const candidates = eligibleBowlers(s,team,batterId);
  if (!candidates.length) return null;
  const last = s.lastBowlerId;
  const noBackToBack = s.playerOrder.length<=2 ? candidates : candidates.filter(id=>id!==last);
  const pool = noBackToBack.length ? noBackToBack : candidates;
  return pool.sort((a,b)=>Math.floor((s.stats[a]?.ballsBowled||0)/6)-Math.floor((s.stats[b]?.ballsBowled||0)/6) || (s.stats[a]?.ballsBowled||0)-(s.stats[b]?.ballsBowled||0) || s.playerOrder.indexOf(a)-s.playerOrder.indexOf(b))[0];
}
function selectNextBatter(s,team,afterId=null) {
  const queue = s.battingQueue[team] || [];
  const start = Math.max(-1,queue.indexOf(afterId));
  for(let offset=1;offset<=queue.length;offset++){
    const id=queue[(start+offset)%queue.length];
    if(eligibleBatters(s,team).includes(id)) return id;
  }
  return eligibleBatters(s,team)[0] || null;
}
function milestoneEvents(s,oldScore,newScore,team,playerId) {
  const thresholds = team ? [50,100,150] : [50,100,150,200];
  const scope = team ? "team:"+team : "player:"+playerId;
  const before = oldScore;
  const after = newScore;
  const events=[];
  for(const n of thresholds) if(before<n && after>=n && !s.milestones.includes(scope+":"+n)){
    s.milestones.push(scope+":"+n); events.push({type:"milestone",scope,threshold:n,playerId,team});
  }
  return events;
}
function finish(s,winnerTeam=null) {
  s.phase="finished"; s.winnerTeam=winnerTeam; s.currentBatterId=null; s.currentBowlerId=null; s.pending={};
}
function startTeamInnings(s,battingTeam,innings) {
  s.innings=innings; s.battingTeam=battingTeam; s.bowlingTeam=battingTeam==="red"?"blue":"red";
  s.teamScores[battingTeam] ||= {runs:0,wickets:0,balls:0};
  s.teamScores[s.bowlingTeam] ||= {runs:0,wickets:0,balls:0};
  s.currentBatterId=selectNextBatter(s,battingTeam);
   s.lastBowlerId=null; s.currentBowlerId=chooseNextBowler(s,s.currentBatterId,s.bowlingTeam);
  s.overBowlerId=s.currentBowlerId; s.overBalls=[];
  s.phase="playing"; s.pending={};
  if(!s.currentBatterId) finish(s,innings===2?s.bowlingTeam:null);
  else if(!s.currentBowlerId) finish(s,null);
}
function beginNextIndividual(s) {
  while(s.individualIndex<s.playerOrder.length){
    const batter=s.playerOrder[s.individualIndex];
    if(s.config.oddPlayerMode==="bowl-only" && batter===s.wildcardId){s.individualIndex++;continue;}
    s.individualBatterId=batter; s.currentBatterId=batter;
    s.individualBalls=0; s.individualWickets=0; s.pending={}; s.overBalls=[];
    s.bowlingRound={}; s.roundOrder=[];
    s.currentBowlerId=chooseIndividualBowler(s,batter);
    if(!s.currentBowlerId){s.individualIndex++;continue;}
    s.phase="playing"; return;
  }
  finish(s,null);
}
function chooseIndividualBowler(s,batterId) {
  const eligible=s.playerOrder.filter(id=>id!==batterId && !(id===s.wildcardId && s.config.oddPlayerMode==="bat-only"));
  if(!eligible.length) return null;
  if(!s.roundOrder.length || s.roundOrder.every(id=>s.bowlingRound[id])){
    s.roundOrder=eligible.slice().sort((a,b)=>(s.stats[a]?.overs||0)-(s.stats[b]?.overs||0) || (s.stats[a]?.ballsBowled||0)-(s.stats[b]?.ballsBowled||0) || s.playerOrder.indexOf(a)-s.playerOrder.indexOf(b));
    s.bowlingRound={};
  }
  const id=s.roundOrder.find(candidate=>!s.bowlingRound[candidate] && candidate!==s.lastBowlerId) || s.roundOrder.find(candidate=>!s.bowlingRound[candidate]);
  if(id) s.bowlingRound[id]=true;
  return id || null;
}
function resolveDelivery(s,context) {
  const batter=s.currentBatterId,bowler=s.currentBowlerId;
  const bat=s.pending[batter], bowl=s.pending[bowler];
  let out=false,runs=0,reason="";
  if(bat==="fist" && bowl==="fist"){out=true;reason="Both chose fist";}
  else if(bat==="fist" || bowl==="fist"){runs=bat==="fist"?bowl:bat;reason="Fist";}
  else if(bat===bowl){out=true;reason="Same number";}
  else {runs=bat;reason=runs===0?"Dot ball":"Runs";}
  const team=s.config.mode==="team"?s.battingTeam:null;
  const stats=s.stats[batter], bowlStats=s.stats[bowler];
  const batterRunsBefore=stats.runs;
  stats.balls++; bowlStats.ballsBowled++;
  if(team){s.teamScores[team].balls++;s.teamScores[team].runs+=runs;s.teamScores[team].wickets+=out?1:0;}
  stats.runs+=runs; bowlStats.runsConceded+=runs;
  if(out){
    stats.wickets++; bowlStats.wicketsTaken++;
    if(team) s.wicketLosses[team][batter]=(s.wicketLosses[team][batter]||0)+1;
    else s.individualWickets++;
  }
  const before=team?s.teamScores[team].runs-runs:batterRunsBefore;
  const events=milestoneEvents(s,before,before+runs,team,batter);
  const delivery={ball:(team?s.teamScores[team].balls:s.individualBalls+1),innings:s.innings,batterId:batter,bowlerId:bowler,batterName:nameOf(context,batter),bowlerName:nameOf(context,bowler),batChoice:bat,bowlChoice:bowl,out,runs,reason,at:Date.now()};
  s.history.push(delivery); s.overBalls.push(delivery); s.lastDelivery=delivery;
  s.pending={};
  if(team){
    s.stats[batter].balls=stats.balls;
    if(out){
      s.currentBatterId=selectNextBatter(s,team,batter);
    }
    const limit=s.config.unlimited?Infinity:s.config.limit*6;
    const inningsDone=s.teamScores[team].balls>=limit || !eligibleBatters(s,team).length;
    if(inningsDone){
      if(s.innings===1 && s.teamScores[s.bowlingTeam].runs===0){startTeamInnings(s,s.bowlingTeam,2);}
      else if(s.innings===1){startTeamInnings(s,s.bowlingTeam,2);}
      else if(s.teamScores[team].runs>s.teamScores[s.bowlingTeam].runs) finish(s,team);
      else if(s.teamScores[team].runs===s.teamScores[s.bowlingTeam].runs) finish(s,null);
      else finish(s,s.bowlingTeam);
    } else {
      if(!s.currentBatterId) s.currentBatterId=selectNextBatter(s,team,null);
      if(s.teamScores[team].runs>(s.teamScores[s.bowlingTeam]?.runs??0) && s.innings===2) finish(s,team);
      else if(s.teamScores[team].balls%6===0){
         s.lastBowlerId=s.overBowlerId;
        s.currentBowlerId=chooseNextBowler(s,s.currentBatterId,s.bowlingTeam);
        s.overBowlerId=s.currentBowlerId;
      }
      if(!s.currentBowlerId && s.phase!=="finished"){s.currentBowlerId=chooseNextBowler(s,s.currentBatterId,s.bowlingTeam);s.overBowlerId=s.currentBowlerId;}
      if(!s.currentBatterId || !s.currentBowlerId) finish(s,s.innings===2?s.bowlingTeam:null);
    }
  } else {
    s.individualBalls++; 
    const ballsDone=!s.config.unlimited && s.individualBalls>=s.config.limit;
    if(ballsDone || s.individualWickets>=s.config.wickets) {s.individualIndex++;beginNextIndividual(s);}
    else if(s.individualBalls%6===0){
      s.lastBowlerId=bowler; s.currentBowlerId=chooseIndividualBowler(s,batter);
    }
    if(!s.currentBowlerId && s.phase==="playing") {s.individualIndex++;beginNextIndividual(s);}
  }
  return {events,delivery};
}
export const handCricket = {
  id:"hand-cricket",name:"Hand Cricket",
  description:"Pick a number, read your opponent, and build an innings together.",
  guide:"HAND CRICKET · PLAYBLOX\n\nPICK: The batter and bowler secretly choose 0–6. If Fist is enabled, either player may choose Fist. Both choices are revealed together.\n\nSCORING: If the numbers differ, the batter scores the number they chose. If both choose the same number, the batter is OUT. If only one chooses Fist, the other player's number is scored. If both choose Fist, the batter is OUT.\n\nTEAM MATCH: Choose Red or Blue, elect captains by vote, and let captains choose the next batter and bowler. Each over has six balls. Batters rotate after a wicket and return later if they have wickets left.\n\nINDIVIDUAL TOURNAMENT: Everyone bats for the same ball allocation. Other players bowl in a fair rotation; each eligible bowler gets a turn in the round before anyone gets a second. Highest score wins.\n\nReconnects preserve the server score, ball history and match phase.",
  emoji:"🏏",color:"#c9e4d2",entry:"./src/games/hand-cricket/index.html",
  players:{min:2,max:8},interactionModel:"simultaneous",lateJoinPolicy:"wait",spectators:{supported:true},
  canStart(context){const n=activeIds(context).length;return n>=2&&n<=8?{ok:true}:{ok:false,reason:"Hand Cricket needs 2–8 connected players."};},
  createInitialState(context){
    const ids=activeIds(context);
    return {phase:"settings",playerOrder:ids,config:{mode:"team",wickets:2,oddPlayerMode:"bat-bowl",allowFist:true,unlimited:false,limit:5},teams:{},teamVotes:{red:{},blue:{}},captains:{red:null,blue:null},runoff:{red:[],blue:[]},wildcardId:null,stats:makeStats(ids),teamScores:{red:{runs:0,wickets:0,balls:0},blue:{runs:0,wickets:0,balls:0}},wicketLosses:{red:{},blue:{}},battingQueue:{red:[],blue:[]},history:[],overBalls:[],milestones:[],pending:{},innings:1,individualIndex:0,individualBalls:0,individualWickets:0,bowlingRound:{},roundOrder:[],lastBowlerId:null,overBowlerId:null,currentBatterId:null,currentBowlerId:null,winnerTeam:null,lastDelivery:null};
  },
  getPublicState(s){
    if(!s)return null;
    const {pending,...pub}=s;
    return {...pub,pendingPlayers:Object.keys(pending||{})};
  },
  getPrivateState(s,id){return s?.playerOrder.includes(id)?{hasSubmitted:Boolean(s.pending?.[id]),choice:s.pending?.[id]??null}:null;},
  onPlayerLeave(context,s,id){
    if(!s)return null;
    const order=s.playerOrder.filter(x=>x!==id);
    if(order.length<2)return null;
    const next=clone(s); next.playerOrder=order; delete next.pending[id]; delete next.stats[id];
    delete next.teams[id]; delete next.teamVotes.red[id]; delete next.teamVotes.blue[id];
    for(const team of ["red","blue"]){next.battingQueue[team]=next.battingQueue[team].filter(x=>x!==id);delete next.wicketLosses[team][id];}
    if(next.captains.red===id)next.captains.red=next.playerOrder.find(x=>next.teams[x]==="red")||null;
    if(next.captains.blue===id)next.captains.blue=next.playerOrder.find(x=>next.teams[x]==="blue")||null;
    if(next.currentBatterId===id || next.currentBowlerId===id) return null;
    return next;
  },
  validateAction(context,s,a){
    if(!s||!Array.isArray(s.playerOrder))return {ok:false,reason:"The match state is unavailable."};
    const id=context.player.id, host=Boolean(context.player.isHost);
    if(!s.playerOrder.includes(id))return {ok:false,reason:"You are not an active player."};
    if(!a||typeof a.type!=="string")return {ok:false,reason:"Choose a valid action."};
    if(s.phase==="finished")return {ok:false,reason:"The match has finished."};
    if(a.type==="update-settings"){
      if(s.phase!=="settings"||!host)return {ok:false,reason:"Only the host can change match settings."};
      const c=a.config||{};
      if(!["team","individual"].includes(c.mode)||!WICKETS.includes(c.wickets)||!["bat-only","bowl-only","bat-bowl"].includes(c.oddPlayerMode)||typeof c.allowFist!=="boolean"||typeof c.unlimited!=="boolean"||(!c.unlimited&&!LIMITS.includes(c.limit)))return {ok:false,reason:"One or more settings are invalid."};
      return {ok:true};
    }
    if(a.type==="start-match")return s.phase==="settings"&&host?{ok:true}:{ok:false,reason:"Only the host can start team selection or the tournament."};
    if(a.type==="choose-team"){
      const counts={red:s.playerOrder.filter(pid=>s.teams[pid]==="red").length,blue:s.playerOrder.filter(pid=>s.teams[pid]==="blue").length};
      const cap=Math.ceil(s.playerOrder.length/2);
      return s.phase==="teams"&&["red","blue"].includes(a.team)&&!s.teams[id]&&counts[a.team]<cap?{ok:true}:{ok:false,reason:"That team is full or your team choice is already locked."};
    }
    if(a.type==="vote-captain"){
      const team=teamOf(s,id);if(s.phase!=="captains"||!team||s.teamVotes[team]?.[id]||!(s.runoff[team]?.length?s.runoff[team].includes(a.candidateId):s.playerOrder.includes(a.candidateId)&&teamOf(s,a.candidateId)===team))return {ok:false,reason:"Choose one captain vote from your own team."};
      return {ok:true};
    }
    if(a.type==="select-batter")return s.config.mode==="team"&&s.phase==="playing"&&id===s.captains[s.battingTeam]&&eligibleBatters(s,s.battingTeam).includes(a.playerId)&&!Object.keys(s.pending||{}).length&&(s.teamScores[s.battingTeam].balls===0||Boolean(s.lastDelivery?.out))?{ok:true}:{ok:false,reason:"The batting captain can choose an eligible batter at the start of an innings or after a wicket."};
    if(a.type==="select-bowler"){
      const candidates=eligibleBowlers(s,s.bowlingTeam,s.currentBatterId);
      const hasAlternative=s.playerOrder.length>2&&candidates.some(pid=>pid!==s.lastBowlerId);
      return s.config.mode==="team"&&s.phase==="playing"&&id===s.captains[s.bowlingTeam]&&candidates.includes(a.playerId)&&(!hasAlternative||a.playerId!==s.lastBowlerId)&&s.overBalls.length===0?{ok:true}:{ok:false,reason:"Only your captain can select an eligible bowler at the start of an over. The previous bowler cannot bowl consecutive overs."};
    }
    if(a.type==="submit-ball"){
      if(s.phase!=="playing"||![s.currentBatterId,s.currentBowlerId].includes(id))return {ok:false,reason:"You are not batting or bowling this ball."};
      if(s.pending[id]!==undefined)return {ok:false,reason:"Your choice is already locked."};
      if(!VALUES.includes(a.choice)||(!s.config.allowFist&&a.choice==="fist"))return {ok:false,reason:"Choose a valid number"+(s.config.allowFist?" or Fist.":".")};
      return {ok:true};
    }
    return {ok:false,reason:"Unknown Hand Cricket action."};
  },
  reduceAction(context,s,a){
    const n=clone(s),id=context.player.id;
    if(a.type==="update-settings"){n.config={...n.config,...a.config};return n;}
    if(a.type==="start-match"){
      if(n.config.mode==="individual"){n.phase="playing";n.individualIndex=0;beginNextIndividual(n);}
      else n.phase="teams";
      return n;
    }
    if(a.type==="choose-team"){
      n.teams[id]=a.team;
      const assigned=n.playerOrder.every(pid=>n.teams[pid]);
      if(assigned){
        const red=n.playerOrder.filter(pid=>n.teams[pid]==="red"),blue=n.playerOrder.filter(pid=>n.teams[pid]==="blue");
        if(!red.length||!blue.length){n.phase="teams";return n;}
        if(n.playerOrder.length%2){const larger=red.length>blue.length?red:blue;n.wildcardId=larger[0]||null;}
        n.battingQueue={red:red.slice(),blue:blue.slice()};
        if(n.wildcardId&&n.config.oddPlayerMode!=="bowl-only"){
          if(!n.battingQueue.red.includes(n.wildcardId))n.battingQueue.red.push(n.wildcardId);
          if(!n.battingQueue.blue.includes(n.wildcardId))n.battingQueue.blue.push(n.wildcardId);
        }
        n.phase="captains";
        for(const t of ["red","blue"])if(n.battingQueue[t].length===1){n.captains[t]=n.battingQueue[t][0];}
      }
      return n;
    }
    if(a.type==="vote-captain"){
      const team=n.teams[id];n.teamVotes[team][id]=a.candidateId;
      const members=n.playerOrder.filter(pid=>n.teams[pid]===team);
      if(members.every(pid=>n.teamVotes[team][pid])){
        const counts={};for(const vote of Object.values(n.teamVotes[team]))counts[vote]=(counts[vote]||0)+1;
        const max=Math.max(...Object.values(counts));const winners=Object.keys(counts).filter(pid=>counts[pid]===max);
        if(winners.length===1)n.captains[team]=winners[0];
        else {n.runoff[team]=winners;n.teamVotes[team]={};}
      }
      if(n.captains.red&&n.captains.blue){
        const redCount=n.battingQueue.red.length,blueCount=n.battingQueue.blue.length;
        startTeamInnings(n,"red",1);
      }
      return n;
    }
    if(a.type==="select-batter"){n.currentBatterId=a.playerId;return n;}
    if(a.type==="select-bowler"){n.currentBowlerId=a.playerId;n.overBowlerId=a.playerId;return n;}
    if(a.type==="submit-ball"){
      n.pending[id]=a.choice;
      if(n.pending[n.currentBatterId]!==undefined&&n.pending[n.currentBowlerId]!==undefined){
        const resolved=resolveDelivery(n,context);
        n.lastEvents=resolved.events;
        if(n.config.mode==="team"&&n.phase==="playing"&&n.overBalls.length===6){n.completedOvers=n.completedOvers||[];n.completedOvers.push(n.overBalls.slice());n.overBalls=[];}
      }
      return n;
    }
    return n;
  },
  getStatus(context,s){return s.phase==="finished"?"finished":"active";},
  getResults(context,s){
    if(s.config.mode==="team"){
      const red=s.teamScores.red.runs,blue=s.teamScores.blue.runs;
      return {outcome:s.winnerTeam?"winner":red===blue?"draw":"winner",winnerTeam:s.winnerTeam,scores:{red,blue},history:s.history.length};
    }
    const ranking=s.playerOrder.map(id=>({playerId:id,nickname:nameOf(context,id),...s.stats[id]})).sort((a,b)=>b.runs-a.runs);
    return {outcome:"winner",ranking,history:s.history.length};
  },
};
