import {renderGameGuide,renderGamePlayerPanel,setupHostEndRound} from "../shared/game-shell.js";
import {setupGameLifecycle} from "../shared/game-lifecycle.js";
import {buildHandCricketAnalytics} from "./analytics.js";
const API=window.PLAYBLOX_API_BASE_URL||(["localhost","127.0.0.1"].includes(location.hostname)?"http://localhost:8787":"https://playblox-party-service.playblox-party.workers.dev");
const params=new URLSearchParams(location.search),code=(params.get("party")||"").toUpperCase(),token=code?sessionStorage.getItem("playblox:"+code+":token"):null;
const $=id=>document.getElementById(id);
let room=null,state=null,privateState=null,myId=null,version=0,socket=null,reconnect=null,heartbeat=null,delay=1000,leaving=false,lastDeliveryAt=0,lastPhase=null,overPage=0,historyPage=0,scoreTeamTab="red",scoreTypeTab="batting",finalOverPage=0,finalHistoryPage=0,finalOversOpen=false,finalHistoryOpen=false,noticeTimer=null,lastWildcardPriorityNoticeAt=0;
const endpoint="/api/rooms/"+encodeURIComponent(code);
$("back-to-lobby").href="../../../"+(code?"?party="+encodeURIComponent(code)+"&lobby=1":"");
async function api(path,options={}){const r=await fetch(API+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||"Request failed");e.stateVersion=d.stateVersion;throw e;}return d;}
const lifecycle=setupGameLifecycle({root:document.querySelector("main"),getRoom:()=>room,getPlayerId:()=>myId,api,backToLobby:()=>$("back-to-lobby").href});
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function player(id){return room?.players?.find(p=>p.id===id);}
function isHost(){return Boolean(player(myId)?.isHost);}
function send(action){return api(endpoint+"/game/action",{method:"POST",body:JSON.stringify({actionId:crypto.randomUUID(),expectedStateVersion:version,action})});}
async function act(action){try{const r=await send(action);version=r.stateVersion??version;await sync();}catch(e){$("notice").textContent=e.message;if(Number.isInteger(e.stateVersion))version=e.stateVersion;await sync().catch(()=>{});}}
function showNotice(s){$("notice").textContent=s;}
function showTimedNotice(s,duration=10000){
 showNotice(s);
 if(noticeTimer)clearTimeout(noticeTimer);
 noticeTimer=setTimeout(()=>{if($("notice").textContent===s)$("notice").textContent="";},duration);
}
function setConnection(s,off=false){$("connection-status").textContent=s;$("connection-status").classList.toggle("offline",off);}
function renderSettings(){
 const c=state.config,host=isHost(),teamMode=c.mode==="team";
 $("setup-panel").hidden=false;$("match-panel").hidden=true;
 $("setup-panel").innerHTML='<div class="hc-section-label">MATCH SETTINGS</div><h2>Set up the match</h2><p class="hc-muted">The host configures the rules for everyone. Settings are applied when the host continues.</p><div class="hc-form-grid"><label>Match format<select id="mode" '+(!host?'disabled':'')+'><option value="team">Team-wise match</option><option value="individual">Individual tournament</option></select></label><label id="wickets-wrap">Wickets per player<select id="wickets" '+(!host?'disabled':'')+'><option value="1">1 wicket</option><option value="2">2 wickets</option><option value="3">3 wickets</option></select></label><label id="odd-setting">Odd-player role<select id="odd" '+(!host?'disabled':'')+'><option value="bat-only">Bat only</option><option value="bowl-only">Bowl only</option><option value="bat-bowl">Bat and bowl</option></select></label><label>Allow Fist<select id="fist" '+(!host?'disabled':'')+'><option value="true">Yes</option><option value="false">No</option></select></label><label>Innings duration<select id="unlimited" '+(!host?'disabled':'')+'><option value="false">Limited</option><option value="true">Unlimited</option></select></label><label id="limit-wrap"><span id="limit-label">'+(teamMode?'Overs per innings':'Balls per player')+'</span><input id="limit" type="number" min="1" max="120" step="1" value="'+c.limit+'" '+(!host?'disabled':'')+' /></label></div><div class="hc-setting-notes"><p><b>Limited:</b> team innings end after the selected overs; each individual player stops batting after their selected total balls or configured wickets are exhausted.</p><p><b>Unlimited:</b> team matches continue until the batting side runs out of wickets; individual tournaments continue until every player exhausts their configured wickets. A chase can still end when the target is passed.</p><p><b>Wickets:</b> in an individual tournament, every dismissal ends the current batting turn. Players with wickets and balls remaining return to the back of the batting queue; exhausted players can still bowl.</p></div>'+(host?'<div class="hc-actions"><button id="start-match" class="hc-primary">Continue →</button></div>':'<p class="hc-muted">Waiting for the host to configure and continue.</p>');
 $("mode").value=c.mode;$("wickets").value=String(c.wickets);$("odd").value=c.oddPlayerMode;$("fist").value=String(c.allowFist);$("unlimited").value=String(c.unlimited);$("limit").value=String(c.limit);$("odd-setting").hidden=!teamMode;$("limit-wrap").hidden=c.unlimited;
 const updateVisibility=()=>{$("odd-setting").hidden=$("mode").value!=="team";$("limit-label").textContent=$("mode").value==="team"?"Overs per innings":"Balls per player";$("limit-wrap").hidden=$("unlimited").value==="true";};
 $("mode").onchange=updateVisibility;$("unlimited").onchange=updateVisibility;
 if(host){
  $("start-match").onclick=async()=>{
   const config={mode:$("mode").value,wickets:Number($("wickets").value),oddPlayerMode:$("odd").value,allowFist:$("fist").value==="true",unlimited:$("unlimited").value==="true",limit:Number($("limit").value)};
   if(!["team","individual"].includes(config.mode)){showNotice("Choose a valid match format.");return;}
   if(![1,2,3].includes(config.wickets)){showNotice("Choose between 1 and 3 wickets per player.");return;}
   if(config.mode==="team"&&!["bat-only","bowl-only","bat-bowl"].includes(config.oddPlayerMode)){showNotice("Choose a valid wildcard role.");return;}
   if(!config.unlimited&&(!Number.isInteger(config.limit)||config.limit<1||config.limit>120)){showNotice("Enter a whole number of balls or overs between 1 and 120.");return;}
   try{const r=await send({type:"start-match",config});version=r.stateVersion??version;await sync();}
   catch(e){showNotice(e.message);if(Number.isInteger(e.stateVersion))version=e.stateVersion;await sync().catch(()=>{});}
  };
 }
 showNotice("The host can change settings until continuing. Read the guide if this is your first match.");
}
function renderTeams(){
 $("setup-panel").hidden=false;$("match-panel").hidden=true;
 const selected=state.teams[myId],assigned=state.playerOrder.filter(id=>state.teams[id]).length,odd=state.playerOrder.length%2===1,cap=Math.floor(state.playerOrder.length/2),redCount=state.playerOrder.filter(id=>state.teams[id]==="red").length,blueCount=state.playerOrder.filter(id=>state.teams[id]==="blue").length,wildCount=state.playerOrder.filter(id=>state.teams[id]==="wildcard").length;
 const choices=[["red","🔴 RED TEAM",redCount,cap],["blue","🔵 BLUE TEAM",blueCount,cap],...(odd?[["wildcard","⭐ WILDCARD PLAYER",wildCount,1]]:[])];
 $("setup-panel").innerHTML='<div class="hc-section-label">TEAM SELECTION</div><h2>Choose your side</h2><p class="hc-muted">'+assigned+' / '+state.playerOrder.length+' players selected. '+(odd?'Red and Blue each have '+cap+' places; one separate wildcard place is available.':'Red and Blue each have '+cap+' places.')+'</p><div class="hc-team-pick">'+choices.map(([key,label,count,max])=>'<button data-team="'+key+'" class="hc-team '+key+'" '+(count-(selected===key?1:0)>=max?'disabled':'')+'>'+label+' · '+count+'/'+max+'</button>').join("")+'</div><p class="hc-muted">'+(selected?'Your current choice: '+selected.toUpperCase()+'. You can change it until everyone has selected.':'Select a place. You can change your choice until everyone has selected.')+'</p><div class="hc-roster-grid">'+["red","blue",...(odd?["wildcard"]:[])].map(t=>'<div><b class="'+(t==="wildcard"?"":t+"-text")+'">'+t.toUpperCase()+'</b>'+state.playerOrder.filter(id=>state.teams[id]===t).map(id=>'<p>'+esc(player(id)?.nickname||"Player")+(id===myId?" (you)":"")+'</p>').join("")+'</div>').join("")+'</div>';
 $("setup-panel").querySelectorAll("[data-team]").forEach(b=>b.onclick=()=>act({type:"choose-team",team:b.dataset.team}));
 showNotice("Choose Red, Blue"+(odd?" or Wildcard Player":"")+". Your choice remains editable until all players have selected.");
}
function renderCaptains(){
 $("setup-panel").hidden=false;$("match-panel").hidden=true;
 const team=state.teams[myId];
 if(team==="wildcard"){$("setup-panel").innerHTML='<div class="hc-section-label">CAPTAIN ELECTION</div><h2>Team captains are being elected</h2><p class="hc-muted">As the wildcard player, you are not part of either team captain vote. The match will begin when both teams have elected their captains.</p>';showNotice("Waiting for Red and Blue to elect their captains.");return;}
 const members=state.playerOrder.filter(id=>state.teams[id]===team),runoff=state.runoff[team]||[],voted=(state.captainVotesCast?.[team]||[]).includes(myId),votesCast=(state.captainVotesCast?.[team]||[]).length,candidates=runoff.length?runoff:members;
 if(state.captains[team]){$("setup-panel").innerHTML='<div class="hc-section-label">CAPTAIN ELECTION</div><h2>'+team.toUpperCase()+' captain selected</h2><p class="hc-muted">'+esc(player(state.captains[team])?.nickname||"Your captain")+' will lead your team. Waiting for the other team.</p>';showNotice("Your team captain has been selected.");return;}
 $("setup-panel").innerHTML='<div class="hc-section-label">CAPTAIN ELECTION</div><h2>'+team.toUpperCase()+' captain vote</h2><p class="hc-muted">'+(runoff.length?"The vote was tied. Vote again among the tied players.":"Choose who should lead your team. Your choice stays secret until every teammate has voted.")+'</p><div class="hc-candidates">'+candidates.map(id=>'<button class="hc-candidate" data-candidate="'+id+'" '+(voted?'disabled':'')+'>'+esc(player(id)?.nickname||"Player")+(id===myId?' (you)':'')+'</button>').join("")+'</div><p class="hc-muted">'+(voted?'Your vote is locked. Waiting for your teammates.':"One vote per player.")+' · '+votesCast+'/'+members.length+' votes received</p>';
 $("setup-panel").querySelectorAll("[data-candidate]").forEach(b=>b.onclick=()=>act({type:"vote-captain",candidateId:b.dataset.candidate}));
 showNotice("Both teams must elect a captain. A tie triggers another vote between tied candidates.");
}
function statRows(ids,kind){return ids.map(id=>{const s=state.stats[id]||{},balls=s.balls||0,bowled=s.ballsBowled||0,economy=bowled?(s.runsConceded/(bowled/6)).toFixed(2):"—";return kind==="batting"?'<tr><td>'+esc(player(id)?.nickname||"Player")+'</td><td>'+s.runs+'</td><td>'+balls+'</td><td>'+s.highestScore+'</td><td>'+s.wickets+'</td><td>'+(balls?(s.runs/balls*100).toFixed(1):"—")+'</td></tr>':'<tr><td>'+esc(player(id)?.nickname||"Player")+'</td><td>'+Math.floor(bowled/6)+'.'+bowled%6+'</td><td>'+s.runsConceded+'</td><td>'+s.wicketsTaken+'</td><td>'+economy+'</td></tr>';}).join("");}
function renderScorecard(target=$("scorecard")){const teamMode=state.config.mode==="team",team=teamMode?scoreTeamTab:null,kind=scoreTypeTab;const ids=teamMode?state.playerOrder.filter(id=>state.teams[id]===team||(id===state.wildcardId&&((kind==="batting"&&state.config.oddPlayerMode!=="bowl-only")||(kind==="bowling"&&state.config.oddPlayerMode!=="bat-only")))):state.playerOrder;const tabs=(teamMode?'<div class="hc-score-team-tabs"><button data-score-team="red" class="'+(team==="red"?"active":"")+'">🔴 Red</button><button data-score-team="blue" class="'+(team==="blue"?"active":"")+'">🔵 Blue</button></div>':"")+'<div class="hc-score-type-tabs"><button data-score-type="batting" class="'+(kind==="batting"?"active":"")+'">Batting</button><button data-score-type="bowling" class="'+(kind==="bowling"?"active":"")+'">Bowling</button></div>';const head=kind==="batting"?'<tr><th>Player</th><th>R</th><th>B</th><th>HS</th><th>W</th><th>SR</th></tr>':'<tr><th>Bowler</th><th>O</th><th>RC</th><th>W</th><th>Econ</th></tr>';target.innerHTML=tabs+'<div class="hc-table-wrap"><table><thead>'+head+'</thead><tbody>'+statRows(ids,kind)+'</tbody></table></div><p class="hc-key">'+(kind==="batting"?"R runs · B balls faced · HS highest score · W wickets lost · SR strike rate":"O overs bowled · RC runs conceded · W wickets taken · Econ economy")+'</p>';target.querySelectorAll("[data-score-team]").forEach(x=>x.onclick=()=>{scoreTeamTab=x.dataset.scoreTeam;renderScorecard(target);});target.querySelectorAll("[data-score-type]").forEach(x=>x.onclick=()=>{scoreTypeTab=x.dataset.scoreType;renderScorecard(target);});}

let analyticsTab="overview",analyticsTeam="both",analyticsSelected=[];
function analyticsRate(r,b){return b?(r*600/b).toFixed(1):"—";}
function analyticsBarChart(rows,labelKey,valueKey){
 const max=Math.max(1,...rows.map(x=>Number(x[valueKey])||0));
 return '<div class="hc-analytics-bars">'+rows.map(x=>'<div class="hc-analytics-bar-row"><span>'+esc(x[labelKey])+'</span><div><i style="width:'+Math.max(0,(Number(x[valueKey])||0)/max*100)+'%"></i></div><b>'+x[valueKey]+'</b></div>').join("")+'</div>';
}
function analyticsLineChart(series){
 const all=series.flatMap(s=>s.points),maxBall=Math.max(1,...all.map(p=>p.ball)),maxRuns=Math.max(1,...all.map(p=>p.runs)),colors=["#e7bd65","#62a8e8","#86c99a","#d98bd0"];
 const paths=series.map((s,i)=>{
  const pts=s.points.map(p=>(40+p.ball/maxBall*520)+","+(180-p.runs/maxRuns*150)).join(" ");
  const marks=s.points.filter(p=>p.out).map(p=>'<circle cx="'+(40+p.ball/maxBall*520)+'" cy="'+(180-p.runs/maxRuns*150)+'" r="4" fill="#f07870"><title>Wicket at ball '+p.ball+'</title></circle>').join("");
  return '<polyline points="'+pts+'" fill="none" stroke="'+colors[i%colors.length]+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+marks;
 }).join("");
 return '<div class="hc-analytics-chart"><svg viewBox="0 0 600 220" role="img" aria-label="Cumulative runs progression"><path d="M40 20V180H570" fill="none" stroke="#63766d"/><path d="M40 105H570M40 55H570" stroke="#40554b" stroke-dasharray="4 5"/><text x="8" y="24" fill="#aebfb4" font-size="10">'+maxRuns+'</text><text x="20" y="184" fill="#aebfb4" font-size="10">0</text>'+paths+'<text x="40" y="204" fill="#aebfb4" font-size="10">Start</text><text x="550" y="204" fill="#aebfb4" font-size="10">Balls</text></svg></div><div class="hc-analytics-legend">'+series.map((s,i)=>'<span><i style="background:'+colors[i%colors.length]+'"></i>'+esc(s.label)+'</span>').join("")+'</div>';
}
function renderAnalytics(container){
 if(!container||!state)return;
 const teamMode=state.config.mode==="team",data=buildHandCricketAnalytics(state);
 const visibleDeliveries=teamMode&&analyticsTeam!=="both"?data.deliveries.filter(d=>d.battingTeam===analyticsTeam):data.deliveries;
 const visibleIds=teamMode?state.playerOrder.filter(id=>analyticsTeam==="both"||state.teams[id]===analyticsTeam||visibleDeliveries.some(d=>(d.batterId===id||d.bowlerId===id)&&d.battingTeam===analyticsTeam)):state.playerOrder.slice();
 const totalsFor=(id,kind)=>{
  const ds=visibleDeliveries.filter(d=>kind==="batting"?d.batterId===id:d.bowlerId===id),runs=ds.reduce((n,d)=>n+d.runs,0),wickets=ds.filter(d=>d.out).length;
  return kind==="batting"?{runs,balls:ds.length,wickets,rate:analyticsRate(runs,ds.length)}:{runs,balls:ds.length,wickets,rate:ds.length?(runs*6/ds.length).toFixed(2):"—"};
 };
 const series=data.innings.filter(s=>!teamMode||analyticsTeam==="both"||s.team===analyticsTeam).map(s=>({label:(s.superOver?"Super Over "+s.round+" ":"Innings ")+(s.team?s.team.toUpperCase():player(s.playerId)?.nickname||"Player"),points:s.points}));
 const selected=analyticsSelected.filter(id=>visibleIds.includes(id));
 const tabs=teamMode?["overview","graph","stages","batting","bowling","comparison"]:["overview","graph","stages","batting","bowling","rankings","comparison"];
 const labels={overview:"Overview",graph:"Run Graph",stages:"Stages",batting:"Batting",bowling:"Bowling",rankings:"Rankings",comparison:"Comparison"};
 let body="";
 if(analyticsTab==="overview"){
  if(teamMode){
   const teams=analyticsTeam==="both"?["red","blue"]:[analyticsTeam];
   body='<div class="hc-analytics-team-cards">'+teams.map(t=>{const ds=visibleDeliveries.filter(d=>d.battingTeam===t),runs=ds.reduce((n,d)=>n+d.runs,0),wickets=ds.filter(d=>d.out).length,balls=ds.length;return '<article><small>'+t.toUpperCase()+' TEAM</small><strong>'+runs+'/'+wickets+'</strong><span>'+Math.floor(balls/6)+'.'+balls%6+' overs · RR '+(balls?(runs*6/balls).toFixed(2):"0.00")+'</span></article>';}).join("")+'</div>';
  }else body=analyticsBarChart(visibleIds.map(id=>({name:player(id)?.nickname||"Player",...totalsFor(id,"batting")})),"name","runs");
  const topBat=visibleIds.map(id=>({id,name:player(id)?.nickname||"Player",...totalsFor(id,"batting")})).sort((a,b)=>b.runs-a.runs)[0];
  const topBowl=visibleIds.map(id=>({id,name:player(id)?.nickname||"Player",...totalsFor(id,"bowling")})).sort((a,b)=>b.wickets-a.wickets||Number(a.rate)-Number(b.rate))[0];
  body+='<div class="hc-analytics-insights"><article><small>TOP RUN SCORER</small><b>'+(topBat?esc(topBat.name):"—")+'</b><span>'+(topBat?topBat.runs+" runs · SR "+topBat.rate:"No deliveries yet")+'</span></article><article><small>MOST WICKETS</small><b>'+(topBowl?esc(topBowl.name):"—")+'</b><span>'+(topBowl?topBowl.wickets+" wickets · "+topBowl.runs+" conceded":"No deliveries yet")+'</span></article></div>';
  if(!state.config.unlimited&&teamMode&&state.innings===2&&state.phase==="playing"){
   const batting=state.battingTeam,score=state.teamScores[batting],target=state.teamScores[state.bowlingTeam].runs+1,remaining=Math.max(0,state.config.limit*6-score.balls);
   body+='<p class="hc-muted hc-analytics-chase">'+Math.max(0,target-score.runs)+' runs required · '+remaining+' balls remaining · Required RR '+(remaining?((target-score.runs)*6/remaining).toFixed(2):"—")+'</p>';
  }
 }else if(analyticsTab==="graph")body=series.length?analyticsLineChart(series):'<p class="hc-muted">Run progression will appear after the first delivery.</p>';
 else if(analyticsTab==="stages"){
  const rows=data.stages.filter(x=>visibleIds.includes(x.playerId));
  const makeTable=(items,kind)=>'<h4>'+kind+'</h4><div class="hc-table-wrap"><table><thead><tr><th>Player</th><th>Stage</th><th>'+(kind==="Batting"?"Runs":"Conceded")+'</th><th>Balls</th><th>'+(kind==="Batting"?"SR":"Wickets")+'</th></tr></thead><tbody>'+items.map(x=>'<tr><td>'+esc(player(x.playerId)?.nickname||"Player")+'</td><td>'+esc(x.stage)+'</td><td>'+(kind==="Batting"?x.runs:x.conceded)+'</td><td>'+x.balls+'</td><td>'+(kind==="Batting"?analyticsRate(x.runs,x.balls):x.wickets)+'</td></tr>').join("")+'</tbody></table></div>';
  body=makeTable(rows.filter(x=>x.kind==="batting"),"Batting")+makeTable(rows.filter(x=>x.kind==="bowling"),"Bowling")+'<p class="hc-muted">'+(state.config.unlimited?"Unlimited matches use two-over / twelve-ball stage blocks.":"Limited matches are divided into Early, Middle and Final thirds.")+'</p>';
 }else if(analyticsTab==="batting"||analyticsTab==="bowling"){
  const kind=analyticsTab,ids=visibleIds.filter(id=>visibleDeliveries.some(d=>(kind==="batting"?d.batterId:d.bowlerId)===id));
  body='<div class="hc-table-wrap"><table><thead><tr><th>Player</th><th>'+(kind==="batting"?"Runs":"Conceded")+'</th><th>Balls</th><th>'+(kind==="batting"?"Dismissals":"Wickets")+'</th><th>'+(kind==="batting"?"SR":"Economy")+'</th></tr></thead><tbody>'+ids.map(id=>{const x=totalsFor(id,kind);return '<tr><td>'+esc(player(id)?.nickname||"Player")+'</td><td>'+x.runs+'</td><td>'+x.balls+'</td><td>'+x.wickets+'</td><td>'+x.rate+'</td></tr>';}).join("")+'</tbody></table></div>';
 }else if(analyticsTab==="rankings"){
  const rows=visibleIds.map(id=>({id,name:player(id)?.nickname||"Player",...totalsFor(id,"batting"),bowl:totalsFor(id,"bowling")})).sort((a,b)=>b.runs-a.runs||b.bowl.wickets-a.bowl.wickets);
  body='<div class="hc-analytics-rankings">'+rows.map((x,i)=>'<div><b>#'+(i+1)+' '+esc(x.name)+'</b><span>'+x.runs+' runs · '+x.bowl.wickets+' wickets · SR '+x.rate+'</span></div>').join("")+'</div>';
 }else if(analyticsTab==="comparison"){
  body='<p class="hc-muted">Select at least two players. In Both Teams mode you can compare players across Red and Blue.</p><div class="hc-compare-select">'+visibleIds.map(id=>'<label><input type="checkbox" data-compare-player="'+id+'" '+(selected.includes(id)?"checked":"")+'><span>'+esc(player(id)?.nickname||"Player")+(teamMode?" · "+(state.teams[id]==="red"?"Red":state.teams[id]==="blue"?"Blue":"Wildcard"):"")+'</span></label>').join("")+'</div>';
  if(selected.length>=2){
   const rows=selected.map(id=>({id,name:player(id)?.nickname||"Player",bat:totalsFor(id,"batting"),bowl:totalsFor(id,"bowling")}));
   body+='<div class="hc-table-wrap"><table><thead><tr><th>Player</th><th>Runs</th><th>SR</th><th>Wickets</th><th>Economy</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+x.bat.runs+'</td><td>'+x.bat.rate+'</td><td>'+x.bowl.wickets+'</td><td>'+x.bowl.rate+'</td></tr>').join("")+'</tbody></table></div>';
   body+=analyticsBarChart(rows.map(x=>({name:x.name,runs:x.bat.runs})),"name","runs");
  }
 }
 container.innerHTML=(teamMode?'<div class="hc-analytics-team-filter">'+["both","red","blue"].map(t=>'<button data-analytics-team="'+t+'" class="'+(analyticsTeam===t?"active":"")+'">'+(t==="both"?"Both Teams":t.toUpperCase())+'</button>').join("")+'</div>':"")+'<div class="hc-analytics-tabs">'+tabs.map(t=>'<button data-analytics-tab="'+t+'" class="'+(analyticsTab===t?"active":"")+'">'+labels[t]+'</button>').join("")+'</div><div class="hc-analytics-content">'+body+'</div>';
 container.querySelectorAll("[data-analytics-team]").forEach(b=>b.onclick=()=>{analyticsTeam=b.dataset.analyticsTeam;analyticsSelected=[];renderAnalytics(container);});
 container.querySelectorAll("[data-analytics-tab]").forEach(b=>b.onclick=()=>{analyticsTab=b.dataset.analyticsTab;renderAnalytics(container);});
 container.querySelectorAll("[data-compare-player]").forEach(b=>b.onchange=()=>{const id=b.dataset.comparePlayer;analyticsSelected=b.checked?[...new Set([...analyticsSelected,id])]:analyticsSelected.filter(x=>x!==id);renderAnalytics(container);});
}

function renderScoreboard(){if(state.config.mode==="team"){const batting=state.battingTeam,other=state.bowlingTeam,score=state.teamScores[batting],opp=state.teamScores[other],target=state.innings===2?opp.runs+1:null,remaining=state.config.unlimited?null:Math.max(0,state.config.limit*6-score.balls),rrr=remaining&&target!==null?((target-score.runs)*6/remaining).toFixed(2):"—",rate=score.balls?(score.runs*6/score.balls).toFixed(2):"0.00",active=id=>id?" · "+esc(player(id)?.nickname||"Player")+" *":"";$("scoreboard").innerHTML='<div class="hc-score-team '+batting+'"><span>'+batting.toUpperCase()+' '+(state.innings===2?'· CHASING':'· BATTING')+'</span><strong>'+score.runs+'<small>/'+score.wickets+'</small></strong><b>'+Math.floor(score.balls/6)+'.'+score.balls%6+' overs · RR '+rate+'</b><small class="hc-active-player">Batting'+active(state.currentBatterId)+'</small></div><div class="hc-score-team '+other+'"><span>'+other.toUpperCase()+' · '+(state.innings===1?'BOWLING':'TARGET')+'</span><strong>'+opp.runs+'<small>/'+opp.wickets+'</small></strong><b>'+Math.floor(opp.balls/6)+'.'+opp.balls%6+' overs</b><small class="hc-active-player">Bowling'+active(state.currentBowlerId)+'</small></div>'+(state.innings===2?'<div class="hc-chase"><b>'+Math.max(0,target-score.runs)+' runs required</b>'+(remaining===null?'':' · '+remaining+' balls remaining · RRR '+rrr)+'<small>Bowling team needs '+eligibleWicketsLeft(batting)+' more wickets to win.</small></div>':'');}else{const rank=state.playerOrder.map(id=>({id,r:state.stats[id]?.runs||0,b:state.stats[id]?.balls||0})).sort((a,b)=>b.r-a.r);$("scoreboard").innerHTML='<div class="hc-individual-head"><span>INDIVIDUAL TOURNAMENT</span><b>Live player standings</b></div><div class="hc-rank">'+rank.map((x,i)=>'<div><b>#'+(i+1)+' '+esc(player(x.id)?.nickname||"Player")+'</b><strong>'+x.r+' runs</strong><small>'+(x.b?x.r/x.b*100:0).toFixed(1)+' SR</small></div>').join("")+'</div>';}}
function eligibleWicketsLeft(team){return state.playerOrder.filter(id=>(state.teams[id]===team||(id===state.wildcardId&&state.config.oddPlayerMode!=="bowl-only"))).reduce((n,id)=>n+Math.max(0,state.config.wickets-(state.wicketLosses[team]?.[id]||0)),0);}
function handGesture(choice){if(choice==="fist")return "✊";const gestures={1:"☝️",2:"✌️",3:"🤟",4:"🖖",5:"🖐️",6:"👍"};return gestures[Number(choice)]||"🖐️";}
function renderPlay(){
 $("setup-panel").hidden=true;$("match-panel").hidden=false;$("result-panel").hidden=true;
 const bat=state.currentBatterId,bowl=state.currentBowlerId,batPlayer=player(bat),bowlPlayer=player(bowl),mine=privateState?.hasSubmitted||state.pendingPlayers?.includes(myId);
 $("phase-label").textContent=state.config.mode==="team"?"INNINGS "+state.innings+" · OVER "+(Math.floor((state.teamScores[state.battingTeam]?.balls||0)/6)+1):"PLAYER INNINGS · "+(state.individualBalls||0)+" BALLS";
 const revealDelivery=state.lastDelivery&&(state.pendingPlayers||[]).length===0&&state.phase==="playing";$("players-at-crease").classList.toggle("hc-crease-revealed",revealDelivery);if(revealDelivery){const d=state.lastDelivery;$("players-at-crease").innerHTML='<div class="hc-role batter hc-role-reveal"><small>🏏 BATTER · '+esc(d.batterName)+'</small><span class="hc-hand-gesture">'+handGesture(d.batChoice)+'</span><b>'+esc(String(d.batChoice).toUpperCase())+'</b></div><div class="hc-vs">VS</div><div class="hc-role bowler hc-role-reveal"><small>🎯 BOWLER · '+esc(d.bowlerName)+'</small><span class="hc-hand-gesture">'+handGesture(d.bowlChoice)+'</span><b>'+esc(String(d.bowlChoice).toUpperCase())+'</b></div><div class="hc-inline-result '+(d.out?'out-text':'')+'">'+(d.out?'OUT · '+esc(d.reason):d.runs?d.runs+' RUN'+(d.runs===1?'':'S'):'DOT BALL')+'</div>';}else $("players-at-crease").innerHTML='<div class="hc-role batter"><small>🏏 BATTER'+(state.config.mode==="team"&&state.batterSelectionOpen?' · AWAITING CONFIRMATION':'')+'</small><b>'+esc(batPlayer?.nickname||"Waiting")+'</b><span>'+(bat===myId?'YOU ARE BATTING':'')+'</span></div><div class="hc-vs">VS</div><div class="hc-role bowler"><small>🎯 BOWLER'+(state.config.mode==="team"&&state.bowlerSelectionOpen?' · AWAITING CONFIRMATION':'')+'</small><b>'+esc(bowlPlayer?.nickname||"Waiting")+'</b><span>'+(bowl===myId?'YOU ARE BOWLING':'')+'</span></div>';
 const selectionsPending=state.config.mode==="team"&&(state.batterSelectionOpen||state.bowlerSelectionOpen||!bat||!bowl);
 const myRole=!selectionsPending?(myId===bat?"batter":myId===bowl?"bowler":null):null;
 let choice='';
 if(selectionsPending){
  const waiting=[];
  if(state.batterSelectionOpen)waiting.push("batting captain to confirm the batter");
  if(state.bowlerSelectionOpen)waiting.push("bowling captain to confirm the bowler");
  $("choice-area").innerHTML='<div class="hc-waiting">Waiting for '+waiting.join(" and ")+'…<div class="hc-pips"><i></i><i></i><i></i></div></div>';
 }else if(myRole){
  const waiting=mine?'<p class="hc-locked">✓ Choice locked. Waiting for '+(myRole==="batter"?bowlPlayer?.nickname:batPlayer?.nickname)+'…</p>':'<p class="hc-muted">Choose your number. The reveal happens when both choices are locked.</p>';
  choice='<div class="hc-choice"><h3>'+(myRole==="batter"?"Your batting choice":"Your bowling choice")+'</h3><div class="hc-numbers">'+[1,2,3,4,5,6].map(n=>'<button data-choice="'+n+'" '+(mine?'disabled':'')+'>'+n+'</button>').join("")+(state.config.allowFist?'<button class="fist" data-choice="fist" '+(mine?'disabled':'')+'>✊ Fist</button>':'')+'</div>'+waiting+'</div>';
  if(!mine)$("choice-area").innerHTML=choice;else $("choice-area").innerHTML=choice;
  $("choice-area").querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>act({type:"submit-ball",choice:b.dataset.choice==="fist"?"fist":Number(b.dataset.choice)}));
 }else $("choice-area").innerHTML='<div class="hc-waiting">Waiting for both players to lock their choices…<div class="hc-pips"><i></i><i></i><i></i></div></div>';
 renderCaptainControls();renderScoreboard();
 renderScorecard();
 renderAnalytics($("live-analytics"));
  const liveBalls=state.overBalls||[],liveRuns=liveBalls.reduce((n,d)=>n+d.runs,0),liveWickets=liveBalls.filter(d=>d.out).length;
 $("over-summary").innerHTML=(liveBalls.map(d=>'<span class="hc-ball '+(d.out?'out':d.runs?'run':'dot')+'">'+(d.out?'W':d.runs)+'</span>').join("")||'<span class="hc-muted">No balls in this over yet.</span>')+'<b>'+liveRuns+' runs · '+liveWickets+' wickets this over</b>';
 const overs=(state.completedOvers||[]).slice().reverse(),overSize=4,overPages=Math.max(1,Math.ceil(overs.length/overSize));overPage=Math.min(overPage,overPages-1);const visibleOvers=overs.slice(overPage*overSize,(overPage+1)*overSize);$("over-history").innerHTML=(visibleOvers.map((over,i)=>'<div class="hc-over-row"><div><b>Over '+(state.completedOvers.length-(overPage*overSize+i))+'</b><strong>'+over.runs+'/'+over.wickets+'</strong><small>'+esc(player(over.bowlerId)?.nickname||"Bowler")+(over.complete?'':' · partial')+'</small></div><div class="hc-over-balls">'+over.balls.map(d=>'<span class="hc-ball '+(d.out?'out':d.runs?'run':'dot')+'">'+(d.out?'W':d.runs)+'</span>').join("")+'</div></div>').join("")||'<p class="hc-muted">Completed overs will appear here.</p>')+'<div class="hc-pagination"><button data-over-page="-1" '+(overPage===0?'disabled':'')+'>← Previous</button><span>Page '+(overPage+1)+' / '+overPages+'</span><button data-over-page="1" '+(overPage>=overPages-1?'disabled':'')+'>Next →</button></div>';$("over-history").querySelectorAll("[data-over-page]").forEach(btn=>btn.onclick=()=>{overPage=Math.max(0,Math.min(overPages-1,overPage+Number(btn.dataset.overPage)));renderPlay();});const history=(state.history||[]).slice().reverse(),historySize=12,historyPages=Math.max(1,Math.ceil(history.length/historySize));historyPage=Math.min(historyPage,historyPages-1);const visibleHistory=history.slice(historyPage*historySize,(historyPage+1)*historySize);$("ball-history").innerHTML=(visibleHistory.map(d=>'<div class="hc-history-row"><b>'+esc(d.batterName)+'</b><span>'+esc(String(d.batChoice))+' vs '+esc(String(d.bowlChoice))+'</span><strong class="'+(d.out?'out-text':'')+'">'+(d.out?'OUT':d.runs+' run'+(d.runs===1?'':'s'))+'</strong><small>'+esc(d.reason)+'</small></div>').join("")||'<p class="hc-muted">No balls bowled yet.</p>')+'<div class="hc-pagination"><button data-history-page="-1" '+(historyPage===0?'disabled':'')+'>← Previous</button><span>Page '+(historyPage+1)+' / '+historyPages+'</span><button data-history-page="1" '+(historyPage>=historyPages-1?'disabled':'')+'>Next →</button></div>';$("ball-history").querySelectorAll("[data-history-page]").forEach(btn=>btn.onclick=()=>{historyPage=Math.max(0,Math.min(historyPages-1,historyPage+Number(btn.dataset.historyPage)));renderPlay();});if(state.lastDelivery&&state.lastDelivery.at!==lastDeliveryAt){lastDeliveryAt=state.lastDelivery.at;const d=state.lastDelivery;const milestoneText=(state.lastEvents||[]).filter(e=>e.type==="milestone").map(e=>(e.team?e.team.toUpperCase():d.batterName)+" "+e.threshold).join(" · ");$("notice").classList.remove("hc-reveal");void $("notice").offsetWidth;$("notice").classList.add("hc-reveal");$("notice").textContent=(d.out?"WICKET! "+d.batterName+" is OUT":d.runs?d.batterName+" scores "+d.runs+" run"+(d.runs===1?"":"s"):"DOT BALL")+(milestoneText?" · "+milestoneText:"");$("players-at-crease").classList.remove("hc-reveal");void $("players-at-crease").offsetWidth;$("players-at-crease").classList.add("hc-reveal");}
  renderGamePlayerPanel({container:$("game-players"),room,gameState:state,myPlayerId:myId});
}
function renderCaptainControls(){
 const controls=[];
 if(state.config.mode==="team"){
  if(myId===state.captains[state.battingTeam]&&state.batterSelectionOpen){
   const eligible=state.battingQueue[state.battingTeam].filter(id=>(state.wicketLosses[state.battingTeam]?.[id]||0)<state.config.wickets&&!(id===state.wildcardId&&state.config.oddPlayerMode==="bowl-only")&&(id===state.wildcardId||id!==state.currentBowlerId));
   controls.push('<div class="hc-captain"><label>Captain · confirm next batter<select id="next-batter">'+eligible.map(id=>'<option value="'+id+'" '+(id===state.currentBatterId?'selected':'')+'>'+esc(player(id)?.nickname)+'</option>').join("")+'</select></label><button id="pick-batter" class="hc-secondary" '+(!eligible.length?'disabled':'')+'>Confirm batter</button></div>');
  }
  if(myId===state.captains[state.bowlingTeam]&&state.bowlerSelectionOpen&&((!state.overBalls||state.overBalls.length===0)||state.wildcardBowlerReplacementRequired)){
   const batterId=state.currentBatterId;
   const eligible=state.playerOrder.filter(id=>(state.teams[id]===state.bowlingTeam||(id===state.wildcardId&&state.config.oddPlayerMode!=="bat-only"))&&id!==batterId&&(state.playerOrder.length<=2||id!==state.lastBowlerId));
   controls.push('<div class="hc-captain"><label>Captain · confirm next bowler<select id="next-bowler">'+eligible.map(id=>'<option value="'+id+'" '+(id===state.currentBowlerId?'selected':'')+'>'+esc(player(id)?.nickname)+'</option>').join("")+'</select></label><button id="pick-bowler" class="hc-secondary" '+(!eligible.length?'disabled':'')+'>Confirm bowler</button></div>');
  }
 }
 $("captain-controls").innerHTML=controls.join("");
 if($("pick-batter"))$("pick-batter").onclick=()=>act({type:"select-batter",playerId:$("next-batter").value});
 if($("pick-bowler"))$("pick-bowler").onclick=()=>act({type:"select-bowler",playerId:$("next-bowler").value});
}
function renderToss(){
 $("setup-panel").hidden=false;$("match-panel").hidden=true;$("result-panel").hidden=true;
 if(state.phase==="toss-call"){
  const caller=player(state.tossCallerId)?.nickname||"the selected captain",isCaller=myId===state.tossCallerId;
  $("setup-panel").innerHTML='<div class="hc-section-label">BEFORE THE FIRST INNINGS</div><h2>Coin toss</h2><p class="hc-muted">'+(isCaller?'You have been selected to call the toss. Choose Heads or Tails.':esc(caller)+' has been selected to call the toss. Waiting for their choice.')+'</p>'+(isCaller?'<div class="hc-actions"><button class="hc-primary" data-toss-call="heads">Heads</button><button class="hc-secondary" data-toss-call="tails">Tails</button></div>':'<p class="hc-muted">The toss caller will choose one side of the coin.</p>');
  $("setup-panel").querySelectorAll("[data-toss-call]").forEach(b=>b.onclick=()=>act({type:"call-toss",call:b.dataset.tossCall}));
  showNotice(isCaller?"Call Heads or Tails to start the coin toss.":"Waiting for the selected captain to call Heads or Tails.");
  return;
 }
 const winner=state.tossWinnerTeam,winningCaptain=winner?player(state.captains[winner])?.nickname||"The winning captain":"The winning captain",isWinnerCaptain=winner&&myId===state.captains[winner];
 const result=String(state.tossResult||"").toUpperCase(),call=String(state.tossCall||"").toUpperCase();
 $("setup-panel").innerHTML='<div class="hc-section-label">COIN TOSS RESULT</div><h2>'+result+'</h2><p class="hc-muted">'+esc(player(state.tossCallerId)?.nickname||"The toss caller")+' called '+call+'. '+winner.toUpperCase()+' wins the toss.</p><div class="hc-final-scores"><b>'+(winner==="red"?"🔴 RED":"🔵 BLUE")+' WON THE TOSS</b></div>'+(isWinnerCaptain?'<h3>Choose your innings</h3><p class="hc-muted">Would your team like to bat or bowl first?</p><div class="hc-actions"><button class="hc-primary" data-toss-choice="bat">Bat first</button><button class="hc-secondary" data-toss-choice="bowl">Bowl first</button></div>':'<p class="hc-muted">Waiting for '+esc(winningCaptain)+' to choose whether '+winner.toUpperCase()+' bats or bowls first.</p>');
 $("setup-panel").querySelectorAll("[data-toss-choice]").forEach(b=>b.onclick=()=>act({type:"choose-toss",choice:b.dataset.tossChoice}));
 showNotice(isWinnerCaptain?"You won the toss. Choose whether your team bats or bowls first.":"The toss is complete. Waiting for the winning captain to choose Bat or Bowl.");
}
function renderSuperOverVote(){
 $("setup-panel").hidden=false;$("match-panel").hidden=true;$("result-panel").hidden=true;
 const team=state.captains.red===myId?"red":state.captains.blue===myId?"blue":null,cast=team&&Boolean(state.superOverVotesCast?.[team]),round=(state.superOverRound||0)+1;
 $("setup-panel").innerHTML='<div class="hc-section-label">MATCH TIED</div><h2>Super Over '+round+'?</h2><p class="hc-muted">Both captains must independently vote Yes. If either votes No, the match ends tied. If both vote Yes, each team gets up to six balls and two wickets. The team that batted second in the previous innings bats first. Each captain confirms their own batter and bowler. Another tied Super Over requires another unanimous Yes vote and reverses the batting order again.</p><div class="hc-final-scores"><b>🔴 RED '+state.teamScores.red.runs+'/'+state.teamScores.red.wickets+'</b><b>🔵 BLUE '+state.teamScores.blue.runs+'/'+state.teamScores.blue.wickets+'</b></div>'+(team?'<div class="hc-actions"><button class="hc-primary" data-super-vote="yes" '+(cast?'disabled':'')+'>Yes · Play Super Over</button><button class="hc-secondary" data-super-vote="no" '+(cast?'disabled':'')+'>No · Keep the tie</button></div>':'<p class="hc-muted">Only team captains can vote. Waiting for their decisions.</p>')+'<p class="hc-muted">Red captain: '+(state.superOverVotesCast?.red?"Voted":"Waiting")+' · Blue captain: '+(state.superOverVotesCast?.blue?"Voted":"Waiting")+'</p>';
 $("setup-panel").querySelectorAll("[data-super-vote]").forEach(b=>b.onclick=()=>act({type:"vote-super-over",vote:b.dataset.superVote}));
 showNotice("A Super Over will start only if both captains vote Yes.");
}
function renderFinished(){
 $("setup-panel").hidden=true;$("match-panel").hidden=true;$("result-panel").hidden=false;
 const rows=state.playerOrder.map(id=>({id,...state.stats[id],nickname:player(id)?.nickname||"Player"}));
 const econ=x=>x.ballsBowled?x.runsConceded/(x.ballsBowled/6):Infinity,sr=x=>x.balls?x.runs/x.balls*100:0;
 const cmp=(a,b)=>a===b?0:a>b?1:-1;
 const cmpBat=(a,b)=>cmp(b.runs,a.runs)||cmp(b.highestScore,a.highestScore)||cmp(sr(b),sr(a));
 const cmpBowl=(a,b)=>cmp(b.wicketsTaken,a.wicketsTaken)||cmp(econ(a),econ(b))||cmp(a.runsConceded,b.runsConceded);
 const cmpIndividual=(a,b)=>cmp(b.runs,a.runs)||cmp(b.wicketsTaken,a.wicketsTaken)||cmp(b.highestScore,a.highestScore)||cmp(econ(a),econ(b))||cmp(sr(b),sr(a))||cmp(a.runsConceded,b.runsConceded);
 const tied=(list,compare)=>list.length?list.filter(x=>compare(x,list[0])===0):[];
 const bestBatters=tied(rows.slice().sort(cmpBat),cmpBat),bestBowlers=tied(rows.slice().sort(cmpBowl),cmpBowl);
 const overs=(state.completedOvers||[]).slice().reverse(),overSize=4,overPages=Math.max(1,Math.ceil(overs.length/overSize));finalOverPage=Math.min(finalOverPage,overPages-1);
 const history=(state.history||[]).slice().reverse(),historySize=12,historyPages=Math.max(1,Math.ceil(history.length/historySize));finalHistoryPage=Math.min(finalHistoryPage,historyPages-1);
 const visibleOvers=overs.slice(finalOverPage*overSize,(finalOverPage+1)*overSize),visibleHistory=history.slice(finalHistoryPage*historySize,(finalHistoryPage+1)*historySize);
 let headline="",summary="";
 if(state.config.mode==="team"){
  const red=state.teamScores.red,blue=state.teamScores.blue,winner=state.winnerTeam,loser=winner?(winner==="red"?"blue":"red"):null;
  let margin="MATCH TIED";if(winner){if(winner===state.battingTeam)margin="Won by "+eligibleWicketsLeft(winner)+" wickets";else margin="Won by "+Math.abs(state.teamScores[winner].runs-state.teamScores[loser].runs)+" runs";}
  headline='<h2>'+(winner?winner.toUpperCase()+" TEAM WON":"MATCH TIED")+'</h2><div class="hc-result-margin">'+margin+'</div>';
  summary='<div class="hc-final-scores"><b>🔴 RED '+red.runs+'/'+red.wickets+'<small>'+Math.floor(red.balls/6)+'.'+red.balls%6+' overs</small></b><b>🔵 BLUE '+blue.runs+'/'+blue.wickets+'<small>'+Math.floor(blue.balls/6)+'.'+blue.balls%6+' overs</small></b></div>';
  if(state.regulationScores)summary+='<h3>Regulation score · tied</h3><p class="hc-muted">Red '+state.regulationScores.red.runs+'/'+state.regulationScores.red.wickets+' · Blue '+state.regulationScores.blue.runs+'/'+state.regulationScores.blue.wickets+'</p>';
  if(state.superOverRounds?.length)summary+='<h3>Super Over history</h3>'+state.superOverRounds.map(round=>'<p class="hc-muted">'+(round.round===0?"Regulation tie":"Super Over "+round.round+" tie")+': Red '+round.scores.red.runs+'/'+round.scores.red.wickets+' · Blue '+round.scores.blue.runs+'/'+round.scores.blue.wickets+'</p>').join("");
 }else{
  const ranked=rows.slice().sort(cmpIndividual);let rank=0;
  headline='<h2>Final standings</h2>'+ranked.map((p,i)=>{if(i===0||cmpIndividual(p,ranked[i-1])!==0)rank=i+1;return '<div class="hc-final-row"><b>#'+rank+' '+esc(p.nickname)+'</b><strong>'+p.runs+' runs · '+p.wicketsTaken+' bowling wickets · HS '+p.highestScore+' · Econ '+(Number.isFinite(econ(p))?econ(p).toFixed(2):"—")+' · SR '+sr(p).toFixed(1)+' · '+p.runsConceded+' conceded</strong></div>';}).join("")+(ranked.length?'<div class="hc-result-margin">'+(ranked.length>1&&cmpIndividual(ranked[0],ranked[1])===0?"Tournament tied":"Winner: "+esc(ranked[0].nickname))+'</div>':'');
 }
 const overMarkup=visibleOvers.map((over,i)=>'<div class="hc-over-row"><div><b>'+(over.battingTeam?over.battingTeam.toUpperCase()+" · ":"")+'Over '+(state.completedOvers.length-(finalOverPage*overSize+i))+'</b><strong>'+over.runs+'/'+over.wickets+'</strong><small>'+esc(player(over.bowlerId)?.nickname||"Bowler")+(over.complete?'':' · partial')+'</small></div><div class="hc-over-balls">'+over.balls.map(d=>'<span class="hc-ball '+(d.out?'out':d.runs?'run':'dot')+'">'+(d.out?'W':d.runs)+'</span>').join("")+'</div></div>').join("")||'<p class="hc-muted">No completed overs.</p>';
 const ballMarkup=visibleHistory.map(d=>'<div class="hc-history-row"><b>'+esc(d.batterName)+'</b><span>'+esc(String(d.batChoice))+' vs '+esc(String(d.bowlChoice))+'</span><strong class="'+(d.out?'out-text':'')+'">'+(d.out?'OUT':d.runs+' run'+(d.runs===1?'':'s'))+'</strong><small>'+esc(d.reason)+'</small></div>').join("")||'<p class="hc-muted">No balls bowled.</p>';
 let awards="";
 if(state.config.mode==="team"){
  awards='<div class="hc-awards"><div><small>BEST BATTER'+(bestBatters.length===1?'':'S')+'</small>'+bestBatters.map(x=>'<b>'+esc(x.nickname)+'</b><strong>'+x.runs+' runs · HS '+x.highestScore+' · SR '+sr(x).toFixed(1)+'</strong>').join("")+'</div><div><small>BEST BOWLER'+(bestBowlers.length===1?'':'S')+'</small>'+bestBowlers.map(x=>'<b>'+esc(x.nickname)+'</b><strong>'+x.wicketsTaken+' wickets · '+(Number.isFinite(econ(x))?econ(x).toFixed(2):"—")+' economy · '+x.runsConceded+' conceded</strong>').join("")+'</div></div>';
 }
 $("result-panel").innerHTML='<div class="hc-section-label">FULL TIME</div><div class="hc-final-layout"><section class="hc-final-main">'+headline+summary+'<details class="hc-final-details" data-final-details="overs"><summary>Over-by-over summary ('+overs.length+' overs)</summary>'+overMarkup+'<div class="hc-pagination"><button data-final-over="-1" '+(finalOverPage===0?'disabled':'')+'>← Previous</button><span>Page '+(finalOverPage+1)+' / '+overPages+'</span><button data-final-over="1" '+(finalOverPage>=overPages-1?'disabled':'')+'>Next →</button></div></details><details class="hc-final-details" data-final-details="history"><summary>Ball-by-ball history ('+history.length+' deliveries)</summary>'+ballMarkup+'<div class="hc-pagination"><button data-final-history="-1" '+(finalHistoryPage===0?'disabled':'')+'>← Previous</button><span>Page '+(finalHistoryPage+1)+' / '+historyPages+'</span><button data-final-history="1" '+(finalHistoryPage>=historyPages-1?'disabled':'')+'>Next →</button></div></details>'+awards+'<div class="hc-section-label">MILESTONES</div><div class="hc-milestone-list">'+((state.milestones||[]).map(k=>'<span>'+esc(k.replaceAll(":"," · "))+'</span>').join("")||'<p class="hc-muted">No milestones reached.</p>')+'</div></section><aside class="hc-final-card"><div class="hc-section-label">FINAL SCORECARD</div><div id="scorecard"></div></aside></div>';
 renderScorecard($("result-panel").querySelector("#scorecard"));
 const finalAnalytics=$("result-panel").querySelector("#final-analytics");if(finalAnalytics)renderAnalytics(finalAnalytics);
 const overDetails=$("result-panel").querySelector('[data-final-details="overs"]'),historyDetails=$("result-panel").querySelector('[data-final-details="history"]');
 overDetails.open=finalOversOpen;historyDetails.open=finalHistoryOpen;
 overDetails.addEventListener("toggle",()=>{finalOversOpen=overDetails.open;});
 historyDetails.addEventListener("toggle",()=>{finalHistoryOpen=historyDetails.open;});
 $("result-panel").querySelectorAll("[data-final-over]").forEach(btn=>btn.onclick=()=>{finalOverPage=Math.max(0,Math.min(overPages-1,finalOverPage+Number(btn.dataset.finalOver)));renderFinished();});
 $("result-panel").querySelectorAll("[data-final-history]").forEach(btn=>btn.onclick=()=>{finalHistoryPage=Math.max(0,Math.min(historyPages-1,finalHistoryPage+Number(btn.dataset.finalHistory)));renderFinished();});
 renderGamePlayerPanel({container:$("game-players"),room,gameState:state,myPlayerId:myId});
 showNotice("Match complete. Final result, scorecard, over summaries and ball history are available.");
}
function render(){
 if(!room||!state)return;
 if(state.wildcardBattingPriorityNoticeAt&&state.wildcardBattingPriorityNoticeAt!==lastWildcardPriorityNoticeAt){
  lastWildcardPriorityNoticeAt=state.wildcardBattingPriorityNoticeAt;
  showTimedNotice("Wildcard selected to bat: batting has priority over bowling. The bowling captain must confirm a different bowler.",10000);
 }
 lifecycle();$("room-label").textContent=(room.name||"Party")+" · "+code;
 if(room.lifecycle==="results"||state.phase==="finished"){renderFinished();}
 else if(state.phase==="super-over-vote")renderSuperOverVote();
 else if(state.phase==="settings")renderSettings();
 else if(state.phase==="teams")renderTeams();
 else if(state.phase==="captains")renderCaptains();
 else if(state.phase==="toss-call"||state.phase==="toss-choice")renderToss();
 else renderPlay();

 renderGameGuide({room,code,token,apiBaseUrl:API,myPlayerId:myId});
 lastPhase=state.phase;
}
async function sync(){const d=await api(endpoint);room=d.room;state=room.gameState;version=room.stateVersion??version;privateState={hasSubmitted:Boolean(state.pendingPlayers?.includes(myId))};render();}
function connect(){
 if(!code||!token){setConnection("Party session missing",true);showNotice("Return to the party lobby and open Hand Cricket again.");return;}
 if(socket)try{socket.close();}catch{}
 setConnection("Connecting…");
 const ws=new WebSocket(API.replace(/^http/,"ws")+"/api/rooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));socket=ws;
 ws.onopen=()=>{delay=1000;setConnection("Server connected");if(heartbeat)clearInterval(heartbeat);heartbeat=setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:"ping"}));},15000);};
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.room){room=m.room;myId=m.playerId||myId;state=room.gameState||state;version=room.stateVersion??version;if(m.privateState)privateState=m.privateState;render();}
  if(m.type==="game-state"){state=m.gameState;version=m.stateVersion;if(room){room.gameState=state;room.lifecycle=m.lifecycle;room.stateVersion=version;}privateState=m.privateState||{hasSubmitted:Boolean(state.pendingPlayers?.includes(myId))};render();}
  if(m.type==="room-updated"&&m.room){room=m.room;state=room.gameState||state;render();}
  if(m.type==="error")showNotice(m.message||"Connection error.");
 };
 ws.onclose=()=>{if(leaving)return;setConnection("Connection interrupted · reconnecting",true);reconnect=setTimeout(connect,delay);delay=Math.min(15000,delay*2);};
 ws.onerror=()=>ws.close();
}
window.addEventListener("beforeunload",()=>{leaving=true;if(reconnect)clearTimeout(reconnect);if(heartbeat)clearInterval(heartbeat);socket?.close();});
connect();