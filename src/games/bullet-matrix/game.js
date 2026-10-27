import { renderGamePlayerPanel, setupHostEndRound } from "../shared/game-shell.js";
const API_BASE_URL = window.PLAYBLOX_API_BASE_URL || (["localhost","127.0.0.1"].includes(location.hostname) ? "http://localhost:8787" : "https://playblox-party-service.playblox-party.workers.dev");
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const code = (params.get("party") || "").toUpperCase();
const token = code ? sessionStorage.getItem("playblox:" + code + ":token") : null;
let socket = null, room = null, gameState = null, stateVersion = 0, myPlayerId = null;
let reconnectTimer = null, heartbeatTimer = null, reconnectDelay = 1000, generation = 0, leaving = false;
let selectedAction = null, selectedTargets = {}, shieldStrength = 1, submitting = false;
$("back-to-lobby").href = "../../../" + (code ? "?party=" + encodeURIComponent(code) + "&lobby=1" : "");
function setConnection(message, offline=false){$("connection-status").textContent=message;$("connection-status").classList.toggle("offline",offline)}
function help(message,error=false){$("game-help").textContent=message;$("game-help").classList.toggle("error",error)}
function currentPlayer(){return room?.players.find(p=>p.id===myPlayerId)}
function isAlive(){return Boolean(gameState?.alivePlayerIds?.includes(myPlayerId))}
function finished(){return room?.lifecycle==="results" || Boolean(gameState?.winnerId || gameState?.isDraw)}
function render(){
 if(!room||!gameState)return;
 $("room-label").textContent=(room.name||"Party")+" · "+code;
 $("round-label").textContent="Round "+(finished() ? (gameState.lastRound?.round || gameState.round || 1) : (gameState.round || 1));
 renderGamePlayerPanel({container:$("game-players"),room,gameState,myPlayerId});
 const alive=gameState.alivePlayerIds||[];
 $("player-grid").replaceChildren(...(gameState.playerOrder||[]).map(id=>{
  const p=room.players.find(x=>x.id===id);const card=document.createElement("article");card.className="player-card"+(id===myPlayerId?" me":"")+(alive.includes(id)?"":" eliminated");
  const name=document.createElement("div");name.className="player-name";name.textContent=(p?.nickname||"Player")+(id===myPlayerId?" (you)":"");
  const ammo=document.createElement("div");ammo.className="player-ammo";ammo.textContent="● "+(gameState.ammo?.[id]??0);
  const status=document.createElement("div");status.className="player-state";status.textContent=!alive.includes(id)?"Eliminated":(gameState.submittedPlayerIds||[]).includes(id)?"Action locked":"Alive · action hidden";
  card.append(name,ammo,status);return card;
 }));
 const done=finished(), aliveMe=isAlive(), submitted=(gameState.submittedPlayerIds||[]).includes(myPlayerId);
 $("action-panel").hidden=done||!aliveMe||submitted;
 $("round-reveal").hidden=!gameState.lastRound;
 $("match-result").hidden=!done;
 $("return-lobby").hidden=!currentPlayer()?.isHost;
 $("leave-game").hidden=Boolean(currentPlayer()?.isHost);
 $("leave-game").disabled=leaving;
 if(done){
  $("winner-title").textContent=gameState.winnerId?"🏆 "+(room.players.find(p=>p.id===gameState.winnerId)?.nickname||"A player")+" wins!": "Everyone was eliminated";
  $("winner-copy").textContent=gameState.isDraw?"No player survived this round.": "The last surviving player wins Bullet Matrix.";
  $("rematch-prompt").hidden=!(gameState.playerOrder||[]).includes(myPlayerId);
  const votes=room.rematchVotes||{},voted=Boolean(votes[myPlayerId]);
  $("play-again").disabled=voted;$("play-again").textContent=voted?"Waiting for others…":"Play again";
  $("rematch-status").textContent=voted?"Your rematch vote is in. Waiting for the other players.":"Everyone from the match must agree to play again.";
 }else if(!aliveMe){$("round-banner").textContent="You're spectating the remaining players."}
 else if(submitted){$("round-banner").textContent="Your action is locked. Waiting for "+Math.max(0,alive.length-(gameState.submittedPlayerIds||[]).length)+" player(s).";$("action-note").textContent="Your choice is hidden from everyone until the round resolves."}
 else {$("round-banner").textContent="Choose one action. All choices reveal together."; }
 renderReveal();
 if(!done&&!aliveMe)help("You are eliminated. You can watch the match until it ends.");
 else if(!done)help(currentPlayer()?.isHost?"The host can end the match and return everyone to the lobby at any time.":"Your choices stay secret until every living player submits.");
}
function renderReveal(){
 const reveal=$("round-reveal");const last=gameState?.lastRound;if(!last){reveal.hidden=true;return}
 reveal.hidden=false;$("round-details").replaceChildren();
 const actions=last.actions||{};
 for(const id of gameState.playerOrder||[]){
  const p=room.players.find(x=>x.id===id);const action=actions[id];if(!action)continue;
  let text=action.type==="reload"?"reloaded (+1 bullet)":action.type==="shield"?"shielded exactly "+action.strength+" bullet(s)": "shot "+action.targets.map(t=>t.bullets+" at "+(room.players.find(x=>x.id===t.targetId)?.nickname||"a player")).join(", ");
  if(last.eliminatedPlayerIds?.includes(id))text+=" · ELIMINATED";
  const row=document.createElement("div");row.className="round-detail";row.textContent=(p?.nickname||"Player")+": "+text+(last.reasons?.[id]?" — "+last.reasons[id]:"");$("round-details").append(row);
 }
 if(!finished())$("round-banner").textContent="Round "+last.round+" resolved · "+(last.eliminatedPlayerIds?.length?last.eliminatedPlayerIds.length+" player(s) eliminated":"no eliminations");
}
function renderActionForm(){
 const form=$("action-form");form.replaceChildren();form.hidden=!selectedAction;
 document.querySelectorAll("[data-action]").forEach(b=>b.classList.toggle("selected",b.dataset.action===selectedAction));
 $("submit-action").disabled=!selectedAction||submitting||!isAlive()||(gameState?.submittedPlayerIds||[]).includes(myPlayerId);
 if(!selectedAction){$("selection-summary").textContent="Choose one action for this round.";return}
 if(selectedAction==="reload"){$("selection-summary").textContent="Reload to gain one bullet.";return}
 if(selectedAction==="shield"){
  const label=document.createElement("label");label.className="form-row";label.textContent="Exact bullets to block (1–100)";
  const input=document.createElement("input");input.type="number";input.min="1";input.max="100";input.step="1";input.value=String(shieldStrength);input.addEventListener("input",()=>{shieldStrength=Number(input.value);$("selection-summary").textContent="Shield strength: "+input.value;});label.append(input);form.append(label);$("selection-summary").textContent="Shield strength must exactly match all incoming bullets.";return
 }
 const targets=(gameState.playerOrder||[]).filter(id=>id!==myPlayerId&&(gameState.alivePlayerIds||[]).includes(id));
 if(!targets.length){$("selection-summary").textContent="No valid targets.";return}
 for(const id of targets){
  const p=room.players.find(x=>x.id===id);const row=document.createElement("label");row.className="target-row";
  const name=document.createElement("span");name.textContent=(p?.nickname||"Player")+" · "+(gameState.ammo?.[myPlayerId]||0)+" bullet(s) available";
  const input=document.createElement("input");input.type="number";input.min="0";input.max=String(gameState.ammo?.[myPlayerId]||0);input.step="1";input.value=String(selectedTargets[id]||0);input.setAttribute("aria-label","Bullets to fire at "+(p?.nickname||"player"));
  input.addEventListener("input",()=>{selectedTargets[id]=Number(input.value)||0;const total=Object.values(selectedTargets).reduce((a,b)=>a+(Number(b)||0),0);$("selection-summary").textContent=total+" bullet(s) allocated · "+(gameState.ammo?.[myPlayerId]||0)+" available";$("submit-action").disabled=total<1||total>(gameState.ammo?.[myPlayerId]||0)||submitting;});
  row.append(name,input);form.append(row);
 }
 $("selection-summary").textContent="Allocate at least one bullet; total cannot exceed your inventory.";$("submit-action").disabled=true;
}
document.querySelectorAll("[data-action]").forEach(button=>button.addEventListener("click",()=>{selectedAction=button.dataset.action;selectedTargets={};renderActionForm()}));
$("submit-action").addEventListener("click",async()=>{
 if(!selectedAction||submitting)return;
 let action={type:selectedAction};
 if(selectedAction==="shield"){if(!Number.isInteger(shieldStrength)||shieldStrength<1||shieldStrength>100){help("Shield strength must be a whole number from 1 to 100.",true);return}action.strength=shieldStrength}
 if(selectedAction==="shoot"){action.targets=Object.entries(selectedTargets).filter(([,bullets])=>Number.isInteger(bullets)&&bullets>0).map(([targetId,bullets])=>({targetId,bullets}));const total=action.targets.reduce((s,t)=>s+t.bullets,0);if(total<1||total>(gameState.ammo?.[myPlayerId]||0)){help("Allocate a valid number of bullets.",true);return}}
 submitting=true;$("submit-action").disabled=true;
 try{await api("/api/rooms/"+encodeURIComponent(code)+"/game/action",{method:"POST",body:JSON.stringify({actionId:crypto.randomUUID(),expectedStateVersion:stateVersion,action:{...action,round:gameState.round}})});selectedAction=null;selectedTargets={};await syncRoom();help("Action submitted privately.");}
 catch(e){help(e.message,true);if(Number.isInteger(e.stateVersion))stateVersion=e.stateVersion;try{await syncRoom()}catch{}}
 finally{submitting=false;renderActionForm();if(gameState&&!finished()&&isAlive()&&!(gameState.submittedPlayerIds||[]).includes(myPlayerId))$("submit-action").disabled=!selectedAction}
});
async function api(path,options={}){const response=await fetch(API_BASE_URL+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(data.error||"The request failed.");e.status=response.status;e.stateVersion=data.stateVersion;throw e}return data}
async function syncRoom(){const data=await api("/api/rooms/"+encodeURIComponent(code));applyRoom(data.room)}
function applyRoom(next){room=next;myPlayerId=next.players.find(p=>p.id===myPlayerId)?.id||myPlayerId;if(next.lifecycle==="lobby"){location.href=$("back-to-lobby").href;return}gameState=next.gameState||gameState;stateVersion=next.stateVersion??stateVersion;render()}
function connect(){
 const gen=++generation;if(socket){try{socket.close()}catch{}}
 if(!code||!token){setConnection("Party session not found",true);help("Go back to the party lobby and join again to play.",true);return}
 setConnection(reconnectDelay>1000?"Reconnecting…":"Connecting…");
 socket=new WebSocket(API_BASE_URL.replace(/^http/,"ws")+"/api/rooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));const current=socket;
 current.addEventListener("open",()=>{if(gen!==generation||current!==socket)return;reconnectDelay=1000;setConnection("Server connected");if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(current.readyState===WebSocket.OPEN)current.send(JSON.stringify({type:"ping"}))},15000)});
 current.addEventListener("message",event=>{if(gen!==generation||current!==socket)return;let m;try{m=JSON.parse(event.data)}catch{return}
  if(m.room&&["room-snapshot","room-updated","game-started"].includes(m.type)){room=m.room;myPlayerId=m.playerId||myPlayerId;gameState=room.gameState||gameState;stateVersion=room.stateVersion??stateVersion;if(room.lifecycle==="lobby"){location.href=$("back-to-lobby").href;return}render()}
  if(m.type==="rematch-vote"){if(room)room.rematchVotes=m.votes||{};render()}
  if(m.type==="game-state"){gameState=m.gameState;stateVersion=m.stateVersion;if(room){room.lifecycle=m.lifecycle;room.gameState=gameState;room.stateVersion=stateVersion;room.results=m.results}render()}
  if(m.type==="error")help(m.message||"A connection error occurred.",true);
 });
 current.addEventListener("close",()=>{if(gen!==generation||current!==socket||leaving)return;if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}setConnection("Connection interrupted · reconnecting",true);reconnectTimer=setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(15000,reconnectDelay*2)});
 current.addEventListener("error",()=>{try{current.close()}catch{}});
}
async function endRound(button){if(!currentPlayer()?.isHost){help("Only the host can end the match.",true);return}if(!confirm("End this match and return everyone to the party lobby?"))return;button.disabled=true;try{await api("/api/rooms/"+encodeURIComponent(code)+"/game/reset",{method:"POST",body:"{}"});location.href=$("back-to-lobby").href}catch(e){help(e.message,true);button.disabled=false}}
async function voteRematch(playAgain){$("play-again").disabled=true;$("no-rematch").disabled=true;try{const r=await api("/api/rooms/"+encodeURIComponent(code)+"/game/rematch",{method:"POST",body:JSON.stringify({playAgain})});if(r.status==="waiting"){room.rematchVotes=r.votes||{};render()}else if(r.status==="lobby")location.href=$("back-to-lobby").href}catch(e){help(e.message,true);$("play-again").disabled=false;$("no-rematch").disabled=false}}
$("play-again").addEventListener("click",()=>voteRematch(true));$("no-rematch").addEventListener("click",()=>voteRematch(false));
setupHostEndRound($("return-lobby"),{getRoom:()=>room,getPlayerId:()=>myPlayerId,onEnd:endRound});
$("leave-game").addEventListener("click",async()=>{if(leaving||!confirm("Leave this game and party? You will need to rejoin to play again."))return;leaving=true;$("leave-game").disabled=true;try{await api("/api/rooms/"+encodeURIComponent(code)+"/leave",{method:"POST",body:"{}"});location.href="../../../"}catch(e){leaving=false;$("leave-game").disabled=false;help(e.message,true)}});
if(code&&token){syncRoom().catch(e=>help(e.message,true));connect()}else connect();
