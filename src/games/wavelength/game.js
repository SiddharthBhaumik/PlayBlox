import { renderGameGuide, renderGamePlayerPanel, setupHostEndRound } from "../shared/game-shell.js";
const API_BASE_URL = window.PLAYBLOX_API_BASE_URL || (["localhost","127.0.0.1"].includes(location.hostname) ? "http://localhost:8787" : "https://playblox-party-service.playblox-party.workers.dev");
const params = new URLSearchParams(location.search), code = (params.get("party") || "").toUpperCase();
const token = code ? sessionStorage.getItem("playblox:" + code + ":token") : null;
const $ = id => document.getElementById(id);
let socket=null, room=null, gameState=null, privateState=null, stateVersion=0, myPlayerId=null, reconnectTimer=null, heartbeatTimer=null, reconnectDelay=1000, generation=0, leaving=false, submitting=false;
$("back-to-lobby").href="../../../"+(code?"?party="+encodeURIComponent(code)+"&lobby=1":"");
const player=id=>room?.players.find(p=>p.id===id);
const clueGiverId=()=>gameState?.playerOrder?.[gameState.clueGiverIndex];
const isFinished=()=>room?.lifecycle==="results"||gameState?.phase==="finished";
function help(message,error=false){$("game-help").textContent=message;$("game-help").classList.toggle("error",error)}
function setConnection(message,offline=false){$("connection-status").textContent=message;$("connection-status").classList.toggle("offline",offline)}
async function api(path,options={}){let response;try{response=await fetch(API_BASE_URL+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),Authorization:"Bearer "+token,...(options.headers||{})}})}catch{throw new Error("Could not reach the party service.")}const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(data.error||"Something went wrong.");e.stateVersion=data.stateVersion;throw e}return data}
async function syncRoom(){const data=await api("/api/rooms/"+encodeURIComponent(code));room=data.room;gameState=room.gameState;stateVersion=room.stateVersion||0;render()}
function sendAction(action){return api("/api/rooms/"+encodeURIComponent(code)+"/game/action",{method:"POST",body:JSON.stringify({actionId:crypto.randomUUID(),expectedStateVersion:stateVersion,action:{...action,round:gameState.round,turnNumber:gameState.turnNumber}})})}
function renderHistory(){const list=$("history-list");list.replaceChildren();(gameState.history||[]).slice().reverse().forEach(result=>{const row=document.createElement("article");row.className="history-item";const title=document.createElement("strong");title.textContent="Round "+result.round+" · "+(player(result.clueGiverId)?.nickname||"Clue-giver");const detail=document.createElement("span");detail.textContent="“"+result.clue+"” · target "+result.target+" · average "+result.average+" · clue-giver +"+result.clueGiverPoints+" · your points: "+(result.guessPoints?.[myPlayerId]?.points ?? (result.clueGiverId===myPlayerId?result.clueGiverPoints:"—"));const points=document.createElement("b");const ownPoints=result.clueGiverId===myPlayerId?result.clueGiverPoints:(result.guessPoints?.[myPlayerId]?.points??0);points.textContent="+"+ownPoints+" pts for you";row.append(title,detail,points);list.append(row)})}
function render(){
 if(!room||!gameState)return;
 renderGameGuide({room,code,token,apiBaseUrl:API_BASE_URL,myPlayerId});
 $("room-label").textContent=(room.name||"Party")+" · "+code;
 renderGamePlayerPanel({container:$("player-roster"),room,gameState:{currentPlayerId:clueGiverId()},myPlayerId});
 const finished=isFinished(), isClue=gameState.phase==="clue", isGiver=myPlayerId===clueGiverId(), submitted=(gameState.submittedPlayerIds||[]).includes(myPlayerId);
 $("round-pill").textContent=finished?"Complete":"Round "+gameState.round+" of "+gameState.totalRounds+" · Turn "+gameState.turnNumber;
 $("score").textContent=String(gameState.scores?.[myPlayerId]||0);
 const board=$("leaderboard");board.replaceChildren();(gameState.playerOrder||[]).map(id=>({id,name:player(id)?.nickname||"Player",score:gameState.scores?.[id]||0})).sort((a,b)=>b.score-a.score).forEach((item,index)=>{const row=document.createElement("div");row.className="leaderboard-row";const name=document.createElement("span");name.textContent=(index+1)+". "+item.name+(item.id===clueGiverId()?" · clue-giver":"");const score=document.createElement("strong");score.textContent=item.score+" pts";row.append(name,score);board.append(row)});
 $("clue-panel").hidden=finished||!isClue||!isGiver;
 $("shared-clue-panel").hidden=finished||gameState.phase!=="guess";
 $("shared-left").textContent=gameState.leftLabel||"Not at all";$("shared-right").textContent=gameState.rightLabel||"Extremely";$("shared-clue").textContent=gameState.clue||"";
 $("clue-left").textContent=gameState.leftLabel||"Not at all";$("clue-right").textContent=gameState.rightLabel||"Extremely";$("display-left").textContent=gameState.leftLabel||"Not at all";$("display-right").textContent=gameState.rightLabel||"Extremely";
 $("guess-panel").hidden=finished||isClue||isGiver||submitted;
 // The clue-giver waits during guesses; submitted guessers and the clue phase show progress.
 const guesserIds=gameState.playerOrder.filter(id=>id!==clueGiverId());
 const submittedCount=(gameState.submittedPlayerIds||[]).length;
 const shouldWait=!finished&&((isClue&&!isGiver)||(!isClue&&(isGiver||submitted)));
 $("waiting-panel").hidden=!shouldWait;
 $("waiting-title").textContent=isClue?"Waiting for the clue-giver…":isGiver?"Your clue is out there!":submitted?"Guess locked":"The group is guessing…";
 $("waiting-copy").textContent=isClue?"The next clue-giver is getting the spectrum ready.":isGiver?"Let the group discuss. You'll see how close they got when everyone locks in.":submitted?"":"Discuss the clue together, then lock in your guess.";
 $("submitted-count").textContent=submittedCount+" / "+(gameState.phase==="guess"?guesserIds.length:0)+" guesses locked";
 $("submitted-bar").style.width=(gameState.phase==="guess"&&guesserIds.length?submittedCount/guesserIds.length*100:0)+"%";
 $("reveal-panel").hidden=!finished&&!gameState.lastRound;
 if(gameState.lastRound){
  const r=gameState.lastRound;$("reveal-panel").hidden=false;$("reveal-left").textContent=r.leftLabel;$("reveal-right").textContent=r.rightLabel;
  $("target-marker").style.left=r.target+"%";$("average-marker").style.left=r.average+"%";
  const yourGuess=r.guesses?.[myPlayerId];\n  const yourDistance=Number.isInteger(yourGuess)?Math.abs(yourGuess-r.target):null;\n  $("reveal-summary").textContent="Target "+r.target+" · your prediction "+(yourGuess??"—")+(yourDistance===null?"":" ("+yourDistance+" away)")+" · group average "+r.average+" ("+Math.abs(r.average-r.target)+" away)";
  const earned=r.clueGiverId===myPlayerId?r.clueGiverPoints:(r.guessPoints?.[myPlayerId]?.points??0);$("round-points").textContent="You earned +"+earned+" points this turn";
  $("reveal-title").textContent=finished?"Final round revealed!":"Round "+r.round+" revealed";
  renderHistory();
  if(!finished){$("reveal-panel").classList.add("previous-reveal");}else $("reveal-panel").classList.remove("previous-reveal");
 } else $("reveal-panel").hidden=true;
 $("return-lobby").hidden=!player(myPlayerId)?.isHost;
 $("replay-game").hidden=!finished;$("replay-game").disabled=Boolean(room.rematchVotes?.[myPlayerId]);
 $("leave-game").hidden=false;$("leave-game").disabled=leaving;
 $("replay-status").hidden=!finished;
 if(finished){const votes=Object.values(room.rematchVotes||{}).filter(Boolean).length;$("replay-status").textContent=votes+" of "+gameState.playerOrder.length+" players voted to play again. Everyone must agree."}
 const rerollsLeft=Math.max(0,2-(gameState.rerollsUsed||0));$("reroll-spectrum").disabled=submitting||!isClue||!isGiver||rerollsLeft===0;$("reroll-spectrum").textContent=rerollsLeft?"↻ Change pair and target ("+rerollsLeft+" left)":"No changes left this turn";$("set-clue").disabled=submitting;$("lock-guess").disabled=submitting;
 $("target-slider").value=String(privateState?.target ?? 50);$("target-slider").disabled=true;$("target-value").textContent=String(privateState?.target ?? "—");$("guess-value").textContent=$("guess-slider").value;
}

$("guess-slider").addEventListener("input",()=> $("guess-value").textContent=$("guess-slider").value);
$("reroll-spectrum").addEventListener("click",async()=>{
 submitting=true;render();
 try{await sendAction({type:"reroll-spectrum"});await syncRoom();help("New spectrum and target selected. "+Math.max(0,2-(gameState.rerollsUsed||0))+" change(s) left this turn.");}
 catch(e){help(e.message,true);if(Number.isInteger(e.stateVersion))stateVersion=e.stateVersion;try{await syncRoom()}catch{}}
 finally{submitting=false;render()}
});
$("set-clue").addEventListener("click",async()=>{
 const clue=$("clue-input").value.trim();
 if(!clue){help("Write a clue before sharing it.",true);return}
 submitting=true;render();
 try{await sendAction({type:"set-clue",clue});await syncRoom()}
 catch(e){help(e.message,true);if(Number.isInteger(e.stateVersion))stateVersion=e.stateVersion;try{await syncRoom()}catch{}}
 finally{submitting=false;render()}
});
$("lock-guess").addEventListener("click",async()=>{
 submitting=true;render();
 try{await sendAction({type:"guess",value:Number($("guess-slider").value)});await syncRoom()}
 catch(e){help(e.message,true);if(Number.isInteger(e.stateVersion))stateVersion=e.stateVersion;try{await syncRoom()}catch{}}
 finally{submitting=false;render()}
});
$("replay-game").addEventListener("click",async()=>{const b=$("replay-game");b.disabled=true;try{const r=await api("/api/rooms/"+encodeURIComponent(code)+"/game/rematch",{method:"POST",body:JSON.stringify({playAgain:true})});if(r.status==="waiting")$("replay-status").textContent="Your vote is in. Waiting for the others…"}catch(e){help(e.message,true);b.disabled=false}});
async function endRound(button){if(!player(myPlayerId)?.isHost)return;if(!confirm("End this game and return everyone to the party lobby?"))return;button.disabled=true;try{await api("/api/rooms/"+encodeURIComponent(code)+"/game/reset",{method:"POST",body:"{}"});location.href=$("back-to-lobby").href}catch(e){help(e.message,true);button.disabled=false}}
setupHostEndRound($("return-lobby"),{getRoom:()=>room,getPlayerId:()=>myPlayerId,onEnd:endRound});
$("leave-game").addEventListener("click",async()=>{if(leaving||!confirm("Leave this game and party?"))return;leaving=true;try{await api("/api/rooms/"+encodeURIComponent(code)+"/leave",{method:"POST",body:"{}"});location.href="../../../"}catch(e){leaving=false;help(e.message,true)}});
function connect(){
 const gen=++generation;if(socket)try{socket.close()}catch{}
 if(!code||!token){setConnection("Party session not found",true);help("Return to the party lobby and join again.",true);return}
 setConnection("Connecting…");socket=new WebSocket(API_BASE_URL.replace(/^http/,"ws")+"/api/rooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));const current=socket;
 current.addEventListener("open",()=>{if(gen!==generation||current!==socket)return;reconnectDelay=1000;setConnection("Server connected");if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(current.readyState===WebSocket.OPEN)current.send(JSON.stringify({type:"ping"}))},15000)});
 current.addEventListener("message",event=>{if(gen!==generation||current!==socket)return;let m;try{m=JSON.parse(event.data)}catch{return}
  if(m.room&&["room-snapshot","room-updated","game-started","game-guide","guide-progress"].includes(m.type)){room=m.room;myPlayerId=m.playerId||myPlayerId;gameState=room.gameState||gameState;privateState=m.privateState??privateState;stateVersion=room.stateVersion??stateVersion;if(room.lifecycle==="lobby"){location.href=$("back-to-lobby").href;return}render()}
  if(m.type==="game-state"){gameState=m.gameState;privateState=m.privateState??null;stateVersion=m.stateVersion;if(room){room.lifecycle=m.lifecycle;room.gameState=gameState;room.stateVersion=stateVersion}render()}
  if(m.type==="rematch-vote"&&room){room.rematchVotes=m.votes||{};render()}
  if(m.type==="error")help(m.message||"A connection error occurred.",true);
 });
 current.addEventListener("close",()=>{if(gen!==generation||current!==socket||leaving)return;if(heartbeatTimer)clearInterval(heartbeatTimer);setConnection("Connection interrupted · reconnecting",true);reconnectTimer=setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(15000,reconnectDelay*2)});
 current.addEventListener("error",()=>{try{current.close()}catch{}});
}
window.addEventListener("resize",()=>{});
if(code&&token){syncRoom().catch(e=>help(e.message,true));connect()}else connect();
