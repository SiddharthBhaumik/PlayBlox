import { setupGameLifecycle } from "../shared/game-lifecycle.js";
import { renderGameGuide } from "../shared/game-shell.js";
const API=window.PLAYBLOX_API_BASE_URL||(["localhost","127.0.0.1"].includes(location.hostname)?"http://localhost:8787":"https://playblox-party-service.playblox-party.workers.dev");
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search),code=(params.get("party")||"").toUpperCase(),token=code?sessionStorage.getItem("playblox:"+code+":token"):null;
let room=null,state=null,privateState=null,playerId=null,version=0,socket=null,generation=0,selectedFlags=[],mode="move",zoom=1,acting=false;const notifiedRoomRefills=new Set();
const back="../../../?party="+encodeURIComponent(code)+"&lobby=1";
$("back-to-lobby").href=back;$("result-lobby").href=back;
const lifecycle=setupGameLifecycle({root:document.querySelector("main"),getRoom:()=>room,getPlayerId:()=>playerId,api,backToLobby:()=>back});
function team(){return privateState?.team||state?.teams?.[playerId]||null}
function myTurn(){return Boolean(team()&&state?.turnPlayerId===playerId&&room?.lifecycle==="playing")}
function key(x,y){return x+","+y}
function coords(k){return k.split(",").map(Number)}
function adjacent(a,b){const [x,y]=coords(a),[u,v]=coords(b);return Math.abs(x-u)+Math.abs(y-v)===1}
function validFlagTile(k){const [x,y]=coords(k),blueBase=key(1,1),redBase=key(18,18);return !(state?.walls||[]).includes(k)&&!state?.rooms?.[k]&&Math.abs(x-1)+Math.abs(y-1)>3&&Math.abs(x-18)+Math.abs(y-18)>3&&!(privateState?.flags||[]).includes(k)}
function canPlaceMineAt(k){const pos=privateState?.position,knownMines=new Set((privateState?.mines||[]).map(m=>m.at));if(!pos||!adjacent(pos,k))return false;const [x,y]=coords(k);return !(state?.walls||[]).includes(k)&&!state?.rooms?.[k]&&!Object.values(state?.positions||{}).includes(k)&&!knownMines.has(k)&&!(privateState?.flags||[]).includes(k)&&Math.abs(x-1)+Math.abs(y-1)>3&&Math.abs(x-18)+Math.abs(y-18)>3}
function setError(m){$("error-message").textContent=m||""}
async function api(path,options={}){const response=await fetch(API+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok){const e=Error(data.error||"The request failed.");e.stateVersion=data.stateVersion;throw e}return data}
async function act(action){if(acting)return;acting=true;setError("");try{const d=await api("/api/rooms/"+encodeURIComponent(code)+"/game/action",{method:"POST",body:JSON.stringify({actionId:crypto.randomUUID(),expectedStateVersion:version,action})});version=d.stateVersion??version;await sync()}catch(e){setError(e.message);if(Number.isInteger(e.stateVersion))version=e.stateVersion;try{await sync()}catch{}}finally{acting=false;render()}}
async function sync(){const d=await api("/api/rooms/"+encodeURIComponent(code));room=d.room;state=room.gameState;version=room.stateVersion??version;render()}
function cellContent(k,visible,explored){
 const walls=new Set(state.walls||[]),r=state.rooms?.[k],roomStatus=privateState?.visibleRooms?.[k],mine=(privateState?.mines||[]).find(m=>m.at===k),ownFlags=privateState?.flags||[],enemyFlags=privateState?.detectedEnemyFlags||[],myPos=privateState?.position,enemyPos=privateState?.enemyPosition;
 if(k===myPos)return "🧍";if(k===enemyPos)return "👤";if(ownFlags.includes(k))return "🚩";if(mine?.owner===team())return "💣";if(mine)return "💥";
 if(walls.has(k))return "🟫";if(r){if(!visible.has(k))return r.type==="mine"?"⛏️":r.type==="power"?"✨":"🏥";if(roomStatus?.active)return r.type==="mine"?"⛏️":r.type==="power"?"✨":"🏥";if(roomStatus&&!roomStatus.active)return r.type==="mine"?"▫️":r.type==="power"?"◇":"▱";return "·";}
 if(!visible.has(k)&&!explored.has(k))return "·";
 return "";
}
function renderBoard(){
 const board=$("board");board.style.setProperty("--cell-size",zoom+"rem");
 const visible=new Set(privateState?.visible||[]),explored=new Set(privateState?.explored||[]),walls=new Set(state?.walls||[]),mineMap=new Map((privateState?.mines||[]).map(m=>[m.at,m])),jamCenter=privateState?.jamCenter?coords(privateState.jamCenter):null;
 const children=[];
 for(let y=0;y<20;y++)for(let x=0;x<20;x++){
  const k=key(x,y),r=state.rooms?.[k],roomStatus=privateState?.visibleRooms?.[k],isVisible=visible.has(k),isExplored=explored.has(k),button=document.createElement("button");
  button.type="button";button.className="tile";button.setAttribute("role","gridcell");button.dataset.tile=k;
  if(walls.has(k))button.classList.add("wall");if(r){button.classList.add("room",r.type);if(roomStatus&&!roomStatus.active)button.classList.add("room-inactive");if(roomStatus?.active)button.classList.add("room-active");}if(!isVisible&&!isExplored&&!walls.has(k)&&!r)button.classList.add("fog");if(!isVisible&&isExplored)button.classList.add("trail-"+(privateState?.trailAges?.[k]||0));if(state?.phase==="flags"){const [tx,ty]=coords(k),inBase=Math.abs(tx-1)+Math.abs(ty-1)<=3||Math.abs(tx-18)+Math.abs(ty-18)<=3;if(walls.has(k)||r||inBase){button.classList.add("flag-unavailable");button.disabled=true;}}
  if(mineMap.has(k))button.classList.add(mineMap.get(k).owner===team()?"own-mine":"spotted-mine");if(!isVisible&&r)button.classList.add("room-unseen");if(jamCenter&&privateState?.jamTurns>0&&Math.abs(x-jamCenter[0])<=1&&Math.abs(y-jamCenter[1])<=1)button.classList.add("jam-zone");if(mode==="mine"&&canPlaceMineAt(k))button.classList.add("mine-placement-option");
  if(k===privateState?.position)button.classList.add("my-position");if(k===privateState?.enemyPosition)button.classList.add("enemy-position");
  button.textContent=cellContent(k,visible,explored);if(mineMap.has(k)){const timer=document.createElement("span");timer.className="mine-timer";timer.textContent=String(mineMap.get(k).turns);timer.setAttribute("aria-label","Mine expires in "+mineMap.get(k).turns+" turns");button.append(timer)}
  if(privateState?.flags?.includes(k))button.classList.add("own-flag");
  button.title="Tile "+(x+1)+", "+(y+1)+(walls.has(k)?" · Wall":r?" · "+r.type+" room"+(roomStatus?(roomStatus.active?" · Stocked":" · Empty"):" · Status hidden"):"")+(mineMap.has(k)?" · Mine expires in "+mineMap.get(k).turns+" turns":"");
  button.addEventListener("click",()=>tileClick(k));children.push(button);
 }
 board.replaceChildren(...children);
}
function render(){
 if(!room||!state)return;lifecycle();renderGameGuide({room,code,token,apiBaseUrl:API,myPlayerId:playerId});$("room-label").textContent=(room.name||"Party")+" · "+code;$("connection-status").textContent="Connected";
 const t=team(),mine=t==="blue"?"🔵 Blue":"🔴 Red",enemy=t==="blue"?"red":"blue";
 $("team-label").textContent=mine;$("lives-label").textContent="❤️ "+(privateState?.lives?.[t]??state.lives?.[t]??2);
 $("flags-label").textContent="🚩 "+(privateState?.captured?.[t]??state.captured?.[t]??0)+" / 3";$("mines-label").textContent="💣 "+(privateState?.minesCarried??0);
 const turn=state.turnPlayerId===playerId?"Your turn":(room.players.find(p=>p.id===state.turnPlayerId)?.nickname||"Opponent")+"'s turn";$("turn-label").textContent=state.phase==="flags"?"Setup":state.phase==="finished"?"Finished":turn;
 $("turn-message").textContent=state.phase==="flags"?"Place your flags to prepare the battlefield.":myTurn()?"It's your turn. Roll, move, and use your actions.":"Wait for your opponent to finish their turn.";
 const refills=privateState?.roomRefills||[];let refillNotice="";for(const refill of refills){const id=state.turnNumber+":"+refill.at;if(!notifiedRoomRefills.has(id)){notifiedRoomRefills.add(id);refillNotice=(refill.type==="mine"?"Mine depot":refill.type==="power"?"Power room":"Medical room")+" refilled nearby!";}}$("event-message").textContent=refillNotice||state.lastEvent||"Explore the battlefield.";$("map-message").textContent=privateState?.scanTurns>0?"Scan active · all enemy mines revealed":privateState?.jamTurns>0?"🌀 Jam field follows you · "+privateState.jamTurns+" turn(s) left":"Fog of war · explored trail lasts 3 turns";
 const detected=(privateState?.detectedEnemyFlags||[]).length;$("flag-hints").textContent=detected?detected+" enemy flag"+(detected===1?"":"s")+" in your explored territory.":"Enemy flags are revealed when their tiles enter your explored territory.";
 $("die-face").textContent=state.die||"—";$("movement-label").textContent=state.rolled?"Movement remaining: "+state.movementRemaining:"Roll to begin moving.";
 $("roll-button").disabled=!myTurn()||state.rolled;$("end-turn").disabled=!myTurn()||!state.rolled;
 $("mine-mode").disabled=!myTurn()||(privateState?.minesCarried||0)<1;$("mine-mode").classList.toggle("selected",mode==="mine");
 $("activate-power").disabled=!myTurn()||!(privateState?.inventory||[]).length;
 const select=$("power-select"),old=select.value;select.replaceChildren(new Option("Choose a power-up",""));(privateState?.inventory||[]).forEach(p=>select.add(new Option(p.replace("-"," ").replace(/\b\w/g,c=>c.toUpperCase()),p)));select.value=(privateState?.inventory||[]).includes(old)?old:"";
 $("activate-power").disabled=!myTurn()||!select.value;
 $("inventory-label").textContent=(privateState?.inventory||[]).length?(privateState.inventory.join(" · ")):"No power-ups yet.";
 $("mine-hint").textContent=mode==="mine"?(privateState?.minesCarried||0)+" mine(s) ready. Click a highlighted adjacent tile to plant. You must be outside both protected bases; mines cannot go on walls, rooms, flags, players, or existing mines.":"No inventory or active-mine limit. Your mines are always visible with expiry counters. Scan reveals enemy mines; Mine Jammer creates a moving 3×3 field that temporarily jams enemy mines for 2 turns.";
 $("setup-panel").hidden=state.phase!=="flags"||Boolean(state.flagsPlaced?.[t]);$("flag-count").textContent=selectedFlags.length+" / 3 selected";$("submit-flags").disabled=selectedFlags.length!==3;
 $("result-panel").hidden=state.phase!=="finished";
 if(state.phase==="finished"){$("result-title").textContent=state.winner===t?"🏆 You win!":"💥 Match over";$("result-copy").textContent=state.finishReason||"The match has ended."}
 renderBoard();
}
async function tileClick(k){
 if(!state||acting)return;
 if(state.phase==="flags"){
  if(state.flagsPlaced?.[team()])return;
  setError("");
  if(selectedFlags.includes(k))selectedFlags=selectedFlags.filter(x=>x!==k);else if(!validFlagTile(k)){setError("Choose an open floor tile outside both protected bases and rooms.");return}else if(selectedFlags.length<3)selectedFlags.push(k);
  document.querySelectorAll(".tile").forEach(b=>b.classList.toggle("flag-selected",selectedFlags.includes(b.dataset.tile)));
  $("flag-count").textContent=selectedFlags.length+" / 3 selected";$("submit-flags").disabled=selectedFlags.length!==3;return;
 }
 if(!myTurn())return;
 if(mode==="mine"){if(!canPlaceMineAt(k)){setError("No mine placed. Choose a highlighted adjacent tile outside both protected bases, away from walls, rooms, flags, players, and other mines.");return}await act({type:"place-mine",at:k});if(!document.getElementById("error-message").textContent)mode="move";render();return}
 
 if(state.rolled&&state.movementRemaining>0&&adjacent(privateState.position,k))await act({type:"move",to:k});
}
$("submit-flags").addEventListener("click",()=>act({type:"place-flags",flags:selectedFlags}));
$("roll-button").addEventListener("click",()=>act({type:"roll"}));
$("end-turn").addEventListener("click",()=>act({type:"end-turn"}));
$("mine-mode").addEventListener("click",()=>{mode=mode==="mine"?"move":"mine";setError("");$("selection-message").textContent=mode==="mine"?"Plant a mine: choose one of the highlighted tiles next to your player.":"Select an adjacent tile to move.";render()});
$("power-select").addEventListener("change",()=>{});
$("activate-power").addEventListener("click",async()=>{const power=$("power-select").value;if(!power)return;await act({type:"activate-power",power})});
$("zoom-in").addEventListener("click",()=>{zoom=Math.min(1.8,zoom+.15);$("board").style.setProperty("--cell-size",zoom+"rem")});
$("zoom-out").addEventListener("click",()=>{zoom=Math.max(.65,zoom-.15);$("board").style.setProperty("--cell-size",zoom+"rem")});
function connect(){const gen=++generation;if(socket)try{socket.close()}catch{}if(!code||!token){setError("Party session not found. Return to the lobby and join again.");return}
 $("connection-status").textContent="Connecting…";socket=new WebSocket(API.replace(/^http/,"ws")+"/api/rooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));const current=socket;
 current.addEventListener("message",event=>{if(gen!==generation||current!==socket)return;let m;try{m=JSON.parse(event.data)}catch{return}
  if(m.type==="room-snapshot"||m.type==="room-updated"||m.type==="game-started"||m.type==="game-guide"||m.type==="guide-progress"){room=m.room;playerId=m.playerId||playerId;state=room?.gameState||state;privateState=m.privateState??privateState;version=room?.stateVersion??version;if(room?.lifecycle==="lobby"){location.href=back;return}render()}
  if(m.type==="game-state"){state=m.gameState;privateState=m.privateState??privateState;version=m.stateVersion;if(room){room.gameState=state;room.lifecycle=m.lifecycle;room.stateVersion=version;room.results=m.results}render()}
  if(m.type==="error")setError(m.message);
  if(m.type==="kicked"){location.href="../../../";alert(m.message||"The host removed you from this party.")}
 });
 current.addEventListener("open",()=>{$("connection-status").textContent="Connected"});
 current.addEventListener("close",()=>{if(gen===generation&&current===socket){$("connection-status").textContent="Reconnecting…";setTimeout(connect,1600)}});
}
if(code&&token){sync().catch(e=>setError(e.message));connect()}else setError("Open Minefield from a party lobby.");
