import { renderGameGuide } from "../shared/game-shell.js";
import { setupGameLifecycle } from "../shared/game-lifecycle.js";
const API=window.PLAYBLOX_API_BASE_URL||(["localhost","127.0.0.1"].includes(location.hostname)?"http://localhost:8787":"https://playblox-party-service.playblox-party.workers.dev");
const params=new URLSearchParams(location.search),code=(params.get("party")||"").toUpperCase(),token=code?sessionStorage.getItem("playblox:"+code+":token"):null;
const $=id=>document.getElementById(id);let room=null,state=null,privateState=null,playerId=null,version=0,socket=null,generation=0;
const api=async(path,options={})=>{let response;try{response=await fetch(API+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),Authorization:"Bearer "+token,...(options.headers||{})}})}catch{throw Error("Could not reach the party service.")}const data=await response.json().catch(()=>({}));if(!response.ok){const e=Error(data.error||"Something went wrong.");e.stateVersion=data.stateVersion;throw e}return data};
const syncLifecycle=setupGameLifecycle({root:document.querySelector("main"),getRoom:()=>room,getPlayerId:()=>playerId,api,backToLobby:()=>"../../../?party="+encodeURIComponent(code)+"&lobby=1"});
function member(id){return room?.players.find(p=>p.id===id)}
function teamIds(t){return (state?.playerOrder||[]).filter(id=>state.teams?.[id]===t)}
function myTeam(){return state?.teams?.[playerId]}
function showError(message){$("game-error").textContent=message||""}
async function act(action){const result=await api("/api/rooms/"+encodeURIComponent(code)+"/game/action",{method:"POST",body:JSON.stringify({actionId:crypto.randomUUID(),expectedStateVersion:version,action})});version=result.stateVersion;await sync()}
async function sync(){const d=await api("/api/rooms/"+encodeURIComponent(code));room=d.room;state=room.gameState;version=room.stateVersion||0;render()}
function render(){
 if(!room||!state)return;syncLifecycle();renderGameGuide({room,code,token,apiBaseUrl:API, myPlayerId:playerId});
 $("room-label").textContent=(room.name||"Party")+" · "+code;
 $("team-panel").hidden=state.phase!=="teams";$("play-panel").hidden=state.phase==="teams";
 const teams=state.teams||{},mine=teams[playerId];
 $("team-roster").replaceChildren();
 for(const t of ["blue","red"]){const ids=teamIds(t),line=document.createElement("p");line.textContent=(t==="blue"?"🔵 Blue":"🔴 Red")+": "+ids.map(id=>member(id)?.nickname||"Player").join(", ");$("team-roster").append(line)}
 $("choose-blue").disabled=mine==="blue";$("choose-red").disabled=mine==="red";
 if(state.phase==="teams")return;
 $("my-team").textContent=mine?(mine==="blue"?"🔵 BLUE TEAM":"🔴 RED TEAM"):"SPECTATING";
 $("my-team").className="team-pill "+(mine||"");
 $("round-label").textContent="Round "+state.round;
 for(const t of ["blue","red"]){
  const ids=teamIds(t);$(""+t+"-members").textContent=ids.map(id=>member(id)?.nickname||"Player").join(" · ");
  const words=$(""+t+"-words");words.replaceChildren();
  if(mine===t)(privateState?.words||[]).forEach((word,i)=>{const item=document.createElement("div");item.className="word";item.innerHTML="<b>"+(i+1)+"</b><span></span>";item.querySelector("span").textContent=word;words.append(item)});
  $(""+t+"-score").textContent="Interceptions: "+(state.interceptions?.[t]||0)+" · Miscommunications: "+(state.miscommunications?.[t]||0);
 }
 const finished=state.phase==="finished";$("result-panel").hidden=!finished;$("clue-panel").hidden=finished||state.phase!=="clues";$("decode-panel").hidden=finished||state.phase!=="decode";$("waiting-panel").hidden=finished||!["clues","decode"].includes(state.phase);
 if(finished){$("result-title").textContent=(state.winner==="blue"?"🔵 Blue":"🔴 Red")+" team wins!";$("result-copy").textContent=state.finishReason||"";return}
 if(state.phase==="clues"){
  const team=mine,clueGiver=team?teamIds(team)[state.clueGiverIndex[team]]:null,isGiver=playerId===clueGiver&&!state.submitted?.[team];
  $("clue-panel").hidden=!isGiver;$("waiting-panel").hidden=isGiver;
  if(isGiver){$("clue-title").textContent="You're giving clues for "+team.toUpperCase();$("private-code").textContent="Your secret code: "+(privateState?.code?.join("")||"•••");$("clue-help").textContent="Clue 1 refers to digit 1–4, then clue 2, then clue 3. Only your team can see its four words."}
  else $("waiting-title").textContent="Waiting for "+(team?team.toUpperCase():"both")+" team's clue-giver";
 }
 if(state.phase==="decode"){
  $("waiting-panel").hidden=false;
  for(const t of ["blue","red"]){const list=$(""+t+"-clues");list.replaceChildren();(state.clues?.[t]||[]).forEach(clue=>{const li=document.createElement("li");li.textContent=clue;list.append(li)})}
  const team=mine,already=team&&state.ownGuesses?.[team]&&state.intercepts?.[team];
  $("decode-panel").hidden=!team||Boolean(already);$("waiting-title").textContent=already?"Your team has submitted. Waiting for the other team…":"Waiting for your team's decode and interception";
  if(team&&!already)$("waiting-panel").hidden=true;
 }
}
async function chooseTeam(team){try{await act({type:"choose-team",team})}catch(e){showError(e.message);if(e.stateVersion)version=e.stateVersion;try{await sync()}catch{}}}
$("choose-blue").addEventListener("click",()=>chooseTeam("blue"));$("choose-red").addEventListener("click",()=>chooseTeam("red"));
$("submit-clues").addEventListener("click",async()=>{const clues=[1,2,3].map(i=>$("clue-"+i).value.trim());if(clues.some(x=>!x)){showError("Enter all three clues.");return}try{await act({type:"submit-clues",clues});[1,2,3].forEach(i=>$("clue-"+i).value="");showError("")}catch(e){showError(e.message)}});
$("submit-codes").addEventListener("click",async()=>{const own=$("own-code").value.trim(),intercept=$("intercept-code").value.trim();if(!/^[1-4]{3}$/.test(own)||!/^[1-4]{3}$/.test(intercept)){showError("Both codes must be three digits using 1–4.");return}try{await act({type:"submit-both",ownCode:own,interceptCode:intercept});$("own-code").value="";$("intercept-code").value="";showError("")}catch(e){showError(e.message);try{await sync()}catch{}}});
function connect(){const gen=++generation;if(socket)try{socket.close()}catch{}if(!code||!token){showError("Party session not found. Return to the lobby and join again.");return}socket=new WebSocket(API.replace(/^http/,"ws")+"/api/rooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));const current=socket;current.addEventListener("message",event=>{if(gen!==generation||current!==socket)return;let m;try{m=JSON.parse(event.data)}catch{return}if(m.type==="room-snapshot"||m.type==="room-updated"||m.type==="game-guide"||m.type==="game-started"||m.type==="guide-progress"){room=m.room;playerId=m.playerId||playerId;state=room?.gameState||state;privateState=m.privateState??privateState;version=room?.stateVersion??version;if(room?.lifecycle==="lobby"){location.href="../../../?party="+encodeURIComponent(code);return}render()}if(m.type==="game-state"){state=m.gameState;privateState=m.privateState??null;version=m.stateVersion;if(room){room.gameState=state;room.lifecycle=m.lifecycle;room.stateVersion=version}render()}if(m.type==="error")showError(m.message)});current.addEventListener("close",()=>{if(gen===generation&&current===socket)setTimeout(connect,1500)})}
if(code&&token){sync().catch(e=>showError(e.message));connect()}else showError("Open Decrypto from a party lobby.");
