import {renderGameGuide,renderGamePlayerPanel,setupHostEndRound} from "../shared/game-shell.js";
import {setupGameLifecycle} from "../shared/game-lifecycle.js";
const API=window.PLAYBLOX_API_BASE_URL||(["localhost","127.0.0.1"].includes(location.hostname)?"http://localhost:8787":"https://playblox-party-service.playblox-party.workers.dev");
const params=new URLSearchParams(location.search),code=(params.get("party")||"").toUpperCase(),token=code?sessionStorage.getItem("playblox:"+code+":token"):null;
const $=id=>document.getElementById(id);
let room=null,state=null,privateState=null,myId=null,version=0,socket=null,reconnect=null,heartbeat=null,delay=1000,leaving=false,lastDeliveryAt=0,lastPhase=null,audioContext=null;
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
function setConnection(s,off=false){$("connection-status").textContent=s;$("connection-status").classList.toggle("offline",off);}
function renderSettings(){
 const c=state.config,host=isHost();
 $("setup-panel").hidden=false;$("match-panel").hidden=true;
 $("setup-panel").innerHTML='<div class="hc-section-label">MATCH SETTINGS</div><h2>Set up the match</h2><p class="hc-muted">The host controls the settings. Everyone can see changes as they happen.</p>'+
 '<div class="hc-form-grid"><label>Match format<select id="mode" '+(!host?'disabled':'')+'><option value="team">Team-wise match</option><option value="individual">Individual tournament</option></select></label>'+
 '<label>Wickets per player<select id="wickets" '+(!host?'disabled':'')+'><option value="1">1 wicket</option><option value="2">2 wickets</option><option value="3">3 wickets</option></select></label>'+
 '<label id="odd-setting">Odd-player role<select id="odd" '+(!host?'disabled':'')+'><option value="bat-only">Bat only</option><option value="bowl-only">Bowl only</option><option value="bat-bowl">Bat and bowl</option></select></label>'+
 '<label>Allow Fist<select id="fist" '+(!host?'disabled':'')+'><option value="true">Yes</option><option value="false">No</option></select></label>'+
 '<label id="limit-setting">Innings limit<select id="limit" '+(!host?'disabled':'')+'><option value="2">2 overs / balls</option><option value="3">3 overs / balls</option><option value="5">5 overs / balls</option><option value="10">10 overs / balls</option><option value="20">20 overs / balls</option></select></label>'+
 '<label>Duration<select id="unlimited" '+(!host?'disabled':'')+'><option value="false">Limited</option><option value="true">Unlimited</option></select></label></div>'+
 (host?'<div class="hc-actions"><button id="save-settings" class="hc-primary">Save settings</button><button id="start-match" class="hc-secondary">Continue →</button></div>':'<p class="hc-muted">Waiting for the host to configure and start the match.</p>');
 $("mode").value=c.mode;$("wickets").value=String(c.wickets);$("odd").value=c.oddPlayerMode;$("fist").value=String(c.allowFist);$("limit").value=String(c.limit);$("unlimited").value=String(c.unlimited);
 $("mode").addEventListener("change",()=>{$("odd-setting").hidden=$("mode").value!=="team";$("limit-setting").querySelector("label");$("limit-setting").firstChild.textContent=$("mode").value==="team"?"Overs per innings":"Balls per player";});
 $("odd-setting").hidden=c.mode!=="team";$("limit-setting").firstChild.textContent=c.mode==="team"?"Overs per innings":"Balls per player";
 if(host){$("save-settings").onclick=()=>act({type:"update-settings",config:{mode:$("mode").value,wickets:Number($("wickets").value),oddPlayerMode:$("odd").value,allowFist:$("fist").value==="true",unlimited:$("unlimited").value==="true",limit:Number($("limit").value)}});$("start-match").onclick=()=>act({type:"start-match"});}
 showNotice("Configure the rules, then continue to team selection or the individual tournament.");
}
function renderTeams(){
 $("setup-panel").hidden=false;$("match-panel").hidden=true;
 const selected=state.teams[myId],assigned=state.playerOrder.filter(id=>state.teams[id]).length;
 $("setup-panel").innerHTML='<div class="hc-section-label">TEAM SELECTION</div><h2>Choose your side</h2><p class="hc-muted">'+assigned+' / '+state.playerOrder.length+' players assigned. Teams need at least one player each.</p><div class="hc-team-pick"><button data-team="red" class="hc-team red" '+(selected?'disabled':'')+'>🔴 RED TEAM</button><button data-team="blue" class="hc-team blue" '+(selected?'disabled':'')+'>🔵 BLUE TEAM</button></div><p class="hc-muted">'+(selected?'You are on '+selected.toUpperCase()+'. Waiting for the others.':'Choose one team. Team choices are locked once selected.')+'</p><div class="hc-roster-grid">'+["red","blue"].map(t=>'<div><b class="'+t+'-text">'+t.toUpperCase()+'</b>'+state.playerOrder.filter(id=>state.teams[id]===t).map(id=>'<p>'+esc(player(id)?.nickname||"Player")+'</p>').join("")+'</div>').join("")+'</div>';
 $("setup-panel").querySelectorAll("[data-team]").forEach(b=>b.onclick=()=>act({type:"choose-team",team:b.dataset.team}));
 showNotice("Choose Red or Blue. When everyone is assigned, each team elects its captain.");
}
function renderCaptains(){
 $("setup-panel").hidden=false;$("match-panel").hidden=true;
 const team=state.teams[myId],members=state.playerOrder.filter(id=>state.teams[id]===team),runoff=state.runoff[team]||[],votes=state.teamVotes[team]||{},voted=Boolean(votes[myId]);
 const candidates=runoff.length?runoff:members;
 $("setup-panel").innerHTML='<div class="hc-section-label">CAPTAIN ELECTION</div><h2>'+team.toUpperCase()+' captain vote</h2><p class="hc-muted">'+(runoff.length?"The vote was tied. Vote again among the tied players.":"Choose who should lead your team. Votes are private until everyone has voted.")+'</p><div class="hc-candidates">'+candidates.map(id=>'<button class="hc-candidate" data-candidate="'+id+'" '+(voted?'disabled':'')+'>'+esc(player(id)?.nickname||"Player")+(id===myId?' (you)':'')+'</button>').join("")+'</div><p class="hc-muted">'+(voted?'Your vote is locked. Waiting for your teammates.':"One vote per player.")+'</p>';
 $("setup-panel").querySelectorAll("[data-candidate]").forEach(b=>b.onclick=()=>act({type:"vote-captain",candidateId:b.dataset.candidate}));
 showNotice("Both teams must elect a captain. A tie triggers another vote between tied candidates.");
}
function statRows(ids){
 return ids.map(id=>{const s=state.stats[id]||{};return '<tr><td>'+esc(player(id)?.nickname||"Player")+'</td><td>'+s.runs+'</td><td>'+s.balls+'</td><td>'+s.wickets+'</td><td>'+ (s.balls?((s.runs/s.balls)*100).toFixed(1):"—")+'</td><td>'+Math.floor((s.ballsBowled||0)/6)+'.'+((s.ballsBowled||0)%6)+'</td><td>'+s.runsConceded+'</td></tr>';}).join("");
}
function renderScoreboard(){
 if(state.config.mode==="team"){
  const batting=state.battingTeam,other=state.bowlingTeam,score=state.teamScores[batting],opp=state.teamScores[other],target=state.innings===2?opp.runs+1:null,remaining=state.config.unlimited?null:Math.max(0,state.config.limit*6-score.balls);
  $("scoreboard").innerHTML='<div class="hc-score-team '+batting+'"><span>'+batting.toUpperCase()+' '+(state.innings===2?'· CHASING':'· BATTING')+'</span><strong>'+score.runs+'<small>/'+score.wickets+'</small></strong><b>'+Math.floor(score.balls/6)+'.'+score.balls%6+' overs</b></div><div class="hc-score-team '+other+'"><span>'+other.toUpperCase()+' · '+(state.innings===1?'BOWLING':'TARGET')+'</span><strong>'+opp.runs+'<small>/'+opp.wickets+'</small></strong><b>'+Math.floor(opp.balls/6)+'.'+opp.balls%6+' overs</b></div>'+
  (state.innings===2?'<div class="hc-chase"><b>'+(Math.max(0,target-score.runs))+' runs required</b>'+(remaining===null?'':' · '+remaining+' balls remaining · RRR '+(remaining?((target-score.runs)*6/remaining).toFixed(2):'—'))+'<small>Bowling team needs '+Math.max(0,Math.ceil((state.playerOrder.filter(id=>state.teams[id]===batting).length*state.config.wickets)-Object.values(state.wicketLosses[batting]||{}).reduce((a,b)=>a+b,0)))+' more wickets.</small></div>':'');
 }else{
  const rank=state.playerOrder.map(id=>({id,r:state.stats[id]?.runs||0})).sort((a,b)=>b.r-a.r);
  $("scoreboard").innerHTML='<div class="hc-individual-head"><span>INDIVIDUAL TOURNAMENT</span><b>Player standings</b></div><div class="hc-rank">'+rank.map((x,i)=>'<div><b>#'+(i+1)+' '+esc(player(x.id)?.nickname||"Player")+'</b><strong>'+x.r+' runs</strong></div>').join("")+'</div>';
 }
}
function renderPlay(){
 $("setup-panel").hidden=true;$("match-panel").hidden=false;$("result-panel").hidden=true;
 const bat=state.currentBatterId,bowl=state.currentBowlerId,batPlayer=player(bat),bowlPlayer=player(bowl),mine=privateState?.hasSubmitted;
 $("phase-label").textContent=state.config.mode==="team"?"INNINGS "+state.innings+" · OVER "+(Math.floor((state.teamScores[state.battingTeam]?.balls||0)/6)+1):"PLAYER INNINGS · "+(state.individualBalls||0)+" BALLS";
 $("players-at-crease").innerHTML='<div class="hc-role batter"><small>🏏 BATTER</small><b>'+esc(batPlayer?.nickname||"Waiting")+'</b><span>'+(bat===myId?'YOU ARE BATTING':'')+'</span></div><div class="hc-vs">VS</div><div class="hc-role bowler"><small>🎯 BOWLER</small><b>'+esc(bowlPlayer?.nickname||"Waiting")+'</b><span>'+(bowl===myId?'YOU ARE BOWLING':'')+'</span></div>';
 const myRole=myId===bat?"batter":myId===bowl?"bowler":null;
 let choice='';
 if(myRole){
  const waiting=mine?'<p class="hc-locked">✓ Choice locked. Waiting for '+(myRole==="batter"?bowlPlayer?.nickname:batPlayer?.nickname)+'…</p>':'<p class="hc-muted">Choose your number. The reveal happens when both choices are locked.</p>';
  choice='<div class="hc-choice"><h3>'+(myRole==="batter"?"Your batting choice":"Your bowling choice")+'</h3><div class="hc-numbers">'+[0,1,2,3,4,5,6].map(n=>'<button data-choice="'+n+'" '+(mine?'disabled':'')+'>'+n+'</button>').join("")+(state.config.allowFist?'<button class="fist" data-choice="fist" '+(mine?'disabled':'')+'>✊ Fist</button>':'')+'</div>'+waiting+'</div>';
  if(!mine)$("choice-area").innerHTML=choice;else $("choice-area").innerHTML=choice;
  $("choice-area").querySelectorAll("[data-choice]").forEach(b=>b.onclick=()=>act({type:"submit-ball",choice:b.dataset.choice==="fist"?"fist":Number(b.dataset.choice)}));
 }else $("choice-area").innerHTML='<div class="hc-waiting">Waiting for both players to lock their choices…<div class="hc-pips"><i></i><i></i><i></i></div></div>';
 renderCaptainControls();renderScoreboard();
 const ids=state.config.mode==="team"?state.playerOrder:state.playerOrder;
 $("scorecard").innerHTML='<div class="hc-table-wrap"><table><thead><tr><th>Player</th><th>R</th><th>B</th><th>W</th><th>SR</th><th>O</th><th>RC</th></tr></thead><tbody>'+statRows(ids)+'</tbody></table></div><p class="hc-key">R runs · B balls faced · W wickets · SR strike rate · O overs bowled · RC runs conceded</p>';
 $("over-summary").innerHTML=(state.overBalls||[]).map((d,i)=>'<span class="hc-ball '+(d.out?'out':d.runs?'run':'dot')+'">'+(d.out?'W':d.runs)+'</span>').join("")+'<b>'+(state.overBalls||[]).reduce((n,d)=>n+d.runs,0)+' runs this over</b>';
 $("ball-history").innerHTML=(state.history||[]).slice().reverse().slice(0,60).map((d)=>'<div class="hc-history-row"><b>'+esc(d.batterName)+'</b><span>'+d.batChoice+' vs '+d.bowlChoice+'</span><strong class="'+(d.out?'out-text':'')+'">'+(d.out?'OUT':d.runs+' run'+(d.runs===1?'':'s'))+'</strong><small>'+d.reason+'</small></div>').join("")||'<p class="hc-muted">No balls bowled yet.</p>';
 if(state.lastDelivery&&state.lastDelivery.at!==lastDeliveryAt){
  lastDeliveryAt=state.lastDelivery.at;
  if($("motion-toggle").checked){$("notice").classList.remove("hc-reveal");void $("notice").offsetWidth;$("notice").classList.add("hc-reveal");}
  const d=state.lastDelivery;
  $("notice").textContent=d.out?"WICKET! "+d.batterName+" is OUT":d.runs?d.batterName+" scores "+d.runs+" run"+(d.runs===1?"":"s"):"DOT BALL";
  playSound(d.out?"wicket":d.runs?"run":"dot");
  for(const event of state.lastEvents||[])if(event.type==="milestone")playSound("milestone");
}
 renderGamePlayerPanel({container:$("game-players"),room,gameState:state,myPlayerId:myId});
}
function renderCaptainControls(){
 const controls=[];
 if(state.config.mode==="team"){
  if(myId===state.captains[state.battingTeam]&&(state.teamScores[state.battingTeam]?.balls===0||state.lastDelivery?.out)){
   const eligible=state.battingQueue[state.battingTeam].filter(id=>(state.wicketLosses[state.battingTeam]?.[id]||0)<state.config.wickets&&!(id===state.wildcardId&&state.config.oddPlayerMode==="bowl-only"));
   controls.push('<div class="hc-captain"><label>Captain · choose next batter<select id="next-batter">'+eligible.map(id=>'<option value="'+id+'" '+(id===state.currentBatterId?'selected':'')+'>'+esc(player(id)?.nickname)+'</option>').join("")+'</select></label><button id="pick-batter" class="hc-secondary">Set batter</button></div>');
  }
  if(myId===state.captains[state.bowlingTeam]&&(state.teamScores[state.battingTeam]?.balls||0)%6===0&&(!state.overBalls||state.overBalls.length===0)){
   const eligible=state.playerOrder.filter(id=>(state.teams[id]===state.bowlingTeam||(id===state.wildcardId&&state.config.oddPlayerMode!=="bat-only"))&&id!==state.currentBatterId&&(state.playerOrder.length<=2||id!==state.lastBowlerId));
   controls.push('<div class="hc-captain"><label>Captain · choose next bowler<select id="next-bowler">'+eligible.map(id=>'<option value="'+id+'">'+esc(player(id)?.nickname)+'</option>').join("")+'</select></label><button id="pick-bowler" class="hc-secondary" '+(!eligible.length?'disabled':'')+'>Set bowler</button></div>');
  }
 }
 $("captain-controls").innerHTML=controls.join("");
 if($("pick-batter"))$("pick-batter").onclick=()=>act({type:"select-batter",playerId:$("next-batter").value});
 if($("pick-bowler"))$("pick-bowler").onclick=()=>act({type:"select-bowler",playerId:$("next-bowler").value});
}
function renderFinished(){
 $("setup-panel").hidden=true;$("match-panel").hidden=true;$("result-panel").hidden=false;
 if(state.config.mode==="team"){
  $("result-panel").innerHTML='<div class="hc-section-label">FULL TIME</div><h2>'+(state.winnerTeam?state.winnerTeam.toUpperCase()+" TEAM WINS!":"MATCH TIED")+'</h2><div class="hc-final-scores"><b>RED '+state.teamScores.red.runs+'/'+state.teamScores.red.wickets+'</b><b>BLUE '+state.teamScores.blue.runs+'/'+state.teamScores.blue.wickets+'</b></div>';
 }else{
  const rank=state.playerOrder.map(id=>({id,...state.stats[id]})).sort((a,b)=>b.runs-a.runs);
  $("result-panel").innerHTML='<div class="hc-section-label">TOURNAMENT COMPLETE</div><h2>Final standings</h2>'+rank.map((p,i)=>'<div class="hc-final-row"><b>#'+(i+1)+' '+esc(player(p.id)?.nickname||"Player")+'</b><strong>'+p.runs+' runs · '+p.balls+' balls</strong></div>').join("");
 }
 $("result-panel").innerHTML+='<p class="hc-muted">No Player of the Match award is assigned.</p>';
 renderGamePlayerPanel({container:$("game-players"),room,gameState:state,myPlayerId:myId});
 showNotice("Match complete. Your scorecard and ball history remain available in the match state.");
}
function playSound(kind){
 if(!$("sound-toggle").checked)return;
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  audioContext ||= new Audio();if(audioContext.state==="suspended")audioContext.resume();
  const now=audioContext.currentTime,osc=audioContext.createOscillator(),gain=audioContext.createGain();
  const tones={run:[620,.11],dot:[260,.07],wicket:[150,.24],milestone:[880,.18],victory:[1040,.32]};
  const [frequency,duration]=tones[kind]||tones.dot;
  osc.type=kind==="wicket"?"triangle":"sine";osc.frequency.setValueAtTime(frequency,now);
  if(kind==="wicket")osc.frequency.exponentialRampToValueAtTime(75,now+duration);
  gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.12,now+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  osc.connect(gain);gain.connect(audioContext.destination);osc.start(now);osc.stop(now+duration+.02);
 }catch{}
}
function render(){
 if(!room||!state)return;
 lifecycle();$("room-label").textContent=(room.name||"Party")+" · "+code;
 if(room.lifecycle==="results"||state.phase==="finished"){renderFinished();if(lastPhase!=="finished")playSound("victory");}
 else if(state.phase==="settings")renderSettings();
 else if(state.phase==="teams")renderTeams();
 else if(state.phase==="captains")renderCaptains();
 else renderPlay();
 $("return-lobby").hidden=!isHost();$("leave-game").hidden=false;
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
async function endRound(button){if(!isHost())return;if(!confirm("End this match and return everyone to the party lobby?"))return;button.disabled=true;try{await api(endpoint+"/game/reset",{method:"POST",body:"{}"});location.href=$("back-to-lobby").href;}catch(e){showNotice(e.message);button.disabled=false;}}
setupHostEndRound($("return-lobby"),{getRoom:()=>room,getPlayerId:()=>myId,onEnd:endRound});
$("leave-game").onclick=async()=>{if(!confirm("Leave this game and return to the party?"))return;leaving=true;try{await api(endpoint+"/game/leave",{method:"POST",body:"{}"});location.href=$("back-to-lobby").href;}catch(e){leaving=false;showNotice(e.message);}};
window.addEventListener("beforeunload",()=>{leaving=true;if(reconnect)clearTimeout(reconnect);if(heartbeat)clearInterval(heartbeat);socket?.close();});
connect();