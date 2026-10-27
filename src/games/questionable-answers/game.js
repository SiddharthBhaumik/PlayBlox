import { setupHostEndRound } from "../shared/game-shell.js";
const API_BASE_URL = window.PLAYBLOX_API_BASE_URL || (["localhost","127.0.0.1"].includes(location.hostname) ? "http://localhost:8787" : "https://playblox-party-service.playblox-party.workers.dev");
const params = new URLSearchParams(location.search);
const code = (params.get("party") || "").toUpperCase();
const token = code ? sessionStorage.getItem("playblox:" + code + ":token") : null;
const $ = id => document.getElementById(id);
let socket = null, room = null, gameState = null, stateVersion = 0, myPlayerId = null;
let reconnectTimer = null, heartbeatTimer = null, reconnectDelay = 1000, generation = 0, leaving = false, submitting = false;
$("back-to-lobby").href = "../../../" + (code ? "?party=" + encodeURIComponent(code) + "&lobby=1" : "");

function setConnection(message, offline=false) { $("connection-status").textContent=message; $("connection-status").classList.toggle("offline",offline); }
function help(message,error=false) { $("game-help").textContent=message; $("game-help").classList.toggle("error",error); }
function player(id) { return room?.players.find(p=>p.id===id); }
function isFinished() { return room?.lifecycle==="results" || gameState?.phase==="finished"; }
function isSubmitted() { return (gameState?.submittedPlayerIds||[]).includes(myPlayerId); }
function neighbor(id, offset) {
  const order=gameState?.playerOrder||[], index=order.indexOf(id);
  return index<0 ? null : player(order[(index+offset+order.length)%order.length]);
}
function renderSeats() {
  const scene=$("table-scene"), seats=$("seats"), order=gameState?.playerOrder||[];
  seats.replaceChildren();
  const w=scene.clientWidth, h=scene.clientHeight;
  const rx=Math.max(0,w/2-Math.min(76,w*.09)), ry=Math.max(0,h/2-48);
  order.forEach((id,index)=>{
    const angle=(-Math.PI/2)+(2*Math.PI*index/order.length);
    const x=w/2+Math.cos(angle)*rx, y=h/2+Math.sin(angle)*ry;
    const p=player(id), card=document.createElement("article");
    card.className="seat"+(id===myPlayerId?" you":"")+(p?.connected===false?" offline":"");
    card.style.left=x+"px"; card.style.top=y+"px";
    const avatar=document.createElement("span");avatar.className="seat-avatar";avatar.textContent=id===myPlayerId?"🙂":"👤";avatar.setAttribute("aria-hidden","true");
    const name=document.createElement("strong");name.className="seat-name";name.textContent=(p?.nickname||"Player")+(id===myPlayerId?" (you)":"");
    const status=document.createElement("span");status.className="seat-status";
    if(p?.connected===false) status.textContent="Reconnecting…";
    else if(isFinished()) status.textContent="Revealed";
    else if(gameState.phase==="assign") status.textContent=(gameState.submittedPlayerIds||[]).includes(id)?"Word locked":"Choosing a word";
    else status.textContent=(gameState.submittedPlayerIds||[]).includes(id)?"Question locked":"Writing a question";
    card.append(avatar,name,status);
    if(id===myPlayerId){const dir=document.createElement("span");dir.className="seat-direction";dir.textContent="YOUR SEAT";card.append(dir)}
    seats.append(card);
  });
}
function renderReveal() {
  const panel=$("reveal-panel"), list=$("reveal-pairs"), reveal=gameState?.reveal;
  panel.hidden=!isFinished()||!Array.isArray(reveal);list.replaceChildren();
  if(panel.hidden)return;
  reveal.forEach(pair=>{
    const card=document.createElement("article");card.className="reveal-pair";
    const route=document.createElement("div");route.className="pair-route";route.textContent=(player(pair.askerId)?.nickname||"Player")+" asks "+(player(pair.recipientId)?.nickname||"Player");
    const question=document.createElement("p");question.className="pair-question";question.textContent="“"+pair.question+"”";
    const answer=document.createElement("div");answer.className="pair-answer";answer.textContent=pair.answer;
    card.append(route,question,answer);list.append(card);
  });
}
function render() {
  if(!room||!gameState)return;
  $("room-label").textContent=(room.name||"Party")+" · "+code;
  const finished=isFinished(), phase=gameState.phase, submitted=isSubmitted();
  const submittedCount=(gameState.submittedPlayerIds||[]).length, total=(gameState.playerOrder||[]).length;
  $("phase-pill").textContent=finished?"Complete":phase==="assign"?"Round 1 of 2":"Round 2 of 2";
  $("phase-title").textContent=finished?"All answers revealed!":phase==="assign"?"Assign a secret word":"Ask the player on your left";
  $("phase-copy").textContent=finished?"All questions and their assigned answers are now revealed.":phase==="assign"?"Give the player immediately to your right a word, term, or phrase. They will not see it until the reveal.":"Write a question for the player immediately to your left. Their assigned text will automatically be the answer.";
  $("table-title").textContent=finished?"The big reveal":phase==="assign"?"Secret words":"Questions are locked";
  $("table-copy").textContent=finished?"Every question meets its assigned answer.":phase==="assign"?"Choose a word for the seat on your right.":"Questions stay private until everyone submits.";
  $("table-progress").textContent=finished?total+" / "+total+" revealed":submittedCount+" / "+total+" submitted";
  $("submission-panel").hidden=finished||submitted;
  $("submission-label").textContent=phase==="assign"?"Your secret word or phrase":"Your question for the player on your left";
  $("submission-input").maxLength=phase==="assign"?80:240;
  $("submission-input").placeholder=phase==="assign"?"A word, term, or short phrase…":"Ask something that will make the reveal interesting…";
  $("submission-hint").textContent=phase==="assign"?"Up to 80 characters. Your recipient cannot see this yet.":"Up to 240 characters. The answer is automatic and stays secret until reveal.";
  $("submit-button").textContent=phase==="assign"?"Lock in secret word":"Lock in question";
  $("submit-button").disabled=submitting;
  if(submitted){$("submission-status").textContent="Your submission is locked. Waiting for "+Math.max(0,total-submittedCount)+" player(s).";$("submission-input").value="";$("submission-input").disabled=true}
  else if(!finished){$("submission-input").disabled=false;$("submission-status").textContent=""}
  $("return-lobby").hidden=!player(myPlayerId)?.isHost;
  $("leave-game").hidden=Boolean(player(myPlayerId)?.isHost);
  $("leave-game").disabled=leaving;
  renderSeats();renderReveal();
  if(finished)help("The game is complete. Every question and automatic answer is now visible.");
  else if(submitted)help("Your submission is private. Waiting for the rest of the table.");
  else help(player(myPlayerId)?.isHost?"The host can end the game and return everyone to the lobby.":"Only the host can end the game early.");
}
async function api(path,options={}) {
  const response=await fetch(API_BASE_URL+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const e=new Error(data.error||"The request failed.");e.stateVersion=data.stateVersion;throw e}return data;
}
async function syncRoom(){const data=await api("/api/rooms/"+encodeURIComponent(code));applyRoom(data.room)}
function applyRoom(next){room=next;myPlayerId=next.players.find(p=>p.id===myPlayerId)?.id||myPlayerId;if(next.lifecycle==="lobby"){location.href=$("back-to-lobby").href;return}gameState=next.gameState||gameState;stateVersion=next.stateVersion??stateVersion;render()}
$("submit-button").addEventListener("click",async()=>{
  if(submitting||isSubmitted()||isFinished()||!gameState)return;
  const value=$("submission-input").value.trim();
  const phase=gameState.phase;
  if(!value){help(phase==="assign"?"Enter a word or phrase first.":"Enter a question first.",true);return}
  const action=phase==="assign"?{type:"assign-word",word:value}:{type:"ask-question",question:value};
  submitting=true;$("submit-button").disabled=true;
  try {
    await api("/api/rooms/"+encodeURIComponent(code)+"/game/action",{method:"POST",body:JSON.stringify({actionId:crypto.randomUUID(),expectedStateVersion:stateVersion,action:{...action,round:gameState.round}})});
    $("submission-input").value="";await syncRoom();
  } catch(e) {help(e.message,true);if(Number.isInteger(e.stateVersion))stateVersion=e.stateVersion;try{await syncRoom()}catch{}}
  finally{submitting=false;render()}
});
async function endRound(button){if(!player(myPlayerId)?.isHost)return;if(!confirm("End this game and return everyone to the party lobby?"))return;button.disabled=true;try{await api("/api/rooms/"+encodeURIComponent(code)+"/game/reset",{method:"POST",body:"{}"});location.href=$("back-to-lobby").href}catch(e){help(e.message,true);button.disabled=false}}
setupHostEndRound($("return-lobby"),{getRoom:()=>room,getPlayerId:()=>myPlayerId,onEnd:endRound});
$("leave-game").addEventListener("click",async()=>{if(leaving||!confirm("Leave this game and party? You will need to rejoin to play again."))return;leaving=true;$("leave-game").disabled=true;try{await api("/api/rooms/"+encodeURIComponent(code)+"/leave",{method:"POST",body:"{}"});location.href="../../../"}catch(e){leaving=false;$("leave-game").disabled=false;help(e.message,true)}});
function connect(){
 const gen=++generation;if(socket){try{socket.close()}catch{}}
 if(!code||!token){setConnection("Party session not found",true);help("Go back to the party lobby and join again to play.",true);return}
 setConnection("Connecting…");
 socket=new WebSocket(API_BASE_URL.replace(/^http/,"ws")+"/api/rooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));const current=socket;
 current.addEventListener("open",()=>{if(gen!==generation||current!==socket)return;reconnectDelay=1000;setConnection("Server connected");if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(current.readyState===WebSocket.OPEN)current.send(JSON.stringify({type:"ping"}))},15000)});
 current.addEventListener("message",event=>{
  if(gen!==generation||current!==socket)return;let m;try{m=JSON.parse(event.data)}catch{return}
  if(m.room&&["room-snapshot","room-updated","game-started"].includes(m.type)){room=m.room;myPlayerId=m.playerId||myPlayerId;gameState=room.gameState||gameState;stateVersion=room.stateVersion??stateVersion;if(room.lifecycle==="lobby"){location.href=$("back-to-lobby").href;return}render()}
  if(m.type==="game-state"){gameState=m.gameState;stateVersion=m.stateVersion;if(room){room.lifecycle=m.lifecycle;room.gameState=gameState;room.stateVersion=stateVersion;room.results=m.results}render()}
  if(m.type==="error")help(m.message||"A connection error occurred.",true);
 });
 current.addEventListener("close",()=>{if(gen!==generation||current!==socket||leaving)return;if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null}setConnection("Connection interrupted · reconnecting",true);reconnectTimer=setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(15000,reconnectDelay*2)});
 current.addEventListener("error",()=>{try{current.close()}catch{}});
}
window.addEventListener("resize",()=>{if(room&&gameState)renderSeats()});
if(code&&token){syncRoom().catch(e=>help(e.message,true));connect()}else connect();
