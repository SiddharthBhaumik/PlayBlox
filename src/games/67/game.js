import { renderGameGuide } from "../shared/game-shell.js";
import { setupGameLifecycle } from "../shared/game-lifecycle.js";
const API=window.PLAYBLOX_API_BASE_URL||(["localhost","127.0.0.1"].includes(location.hostname)?"http://localhost:8787":"https://playblox-party-service.playblox-party.workers.dev");
const params=new URLSearchParams(location.search),code=(params.get("party")||"").toUpperCase(),token=code?sessionStorage.getItem("playblox:"+code+":token"):null;
const $=id=>document.getElementById(id);
const ACTIONS=["addition","subtraction","multiplication","division","switch","set-total","reverse"];
const INFO={addition:["➕","Addition"],subtraction:["➖","Subtraction"],multiplication:["✖️","Multiply"],division:["➗","Division"],switch:["🔀","Switch"],"set-total":["🎯","Set Total"],reverse:["🔁","Reverse"]};
const SPECIAL={ "delayed-fate":["⏳","Delayed Fate"],bookmark:["🔖","Bookmark"],"chain-reaction":["⛓️","Chain Reaction"],equalizer:["⚖️","Equalizer"],"blind-spot":["🙈","Blind Spot"],glitch:["🌀","Glitch"]};
let room=null,state=null,privateState=null,myId=null,version=0,socket=null,generation=0,reconnectTimer=null,heartbeat=null,reconnectDelay=1000,acting=false,selectedCard=null,selectedDie=null,digit="tens",lastEvent=0,lastPrivateEvent=0,popupTimer=null,lastDiceSignature="";
const back="../../../?party="+encodeURIComponent(code)+"&lobby=1";
$("back-to-lobby").href=back;
const lifecycle=setupGameLifecycle({root:document.querySelector("main"),getRoom:()=>room,getPlayerId:()=>myId,api,backToLobby:()=>back});
async function api(path,options={}){const r=await fetch(API+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error||"The request failed.");e.stateVersion=d.stateVersion;throw e;}return d;}
const myTurn=()=>Boolean(state&&state.currentPlayerId===myId&&room?.lifecycle==="playing");
const canInterrupt=()=>Boolean(state&&state.currentPlayerId!==myId&&room?.lifecycle==="playing");
const effective=card=>{let t=card;for(const g of privateState?.glitchMappings||[]){if(t===g.a)t=g.b;else if(t===g.b)t=g.a;}return privateState?.selection?.original===card?privateState.selection.effective:t;};
const needsDie=t=>t!=="set-total"&&t!=="reverse";
function error(message){$("error-message").textContent=message||"";}
function notify(message,major=false){const node=$("event-popup");node.textContent=message;node.classList.toggle("major",major);node.hidden=false;if(popupTimer)clearTimeout(popupTimer);popupTimer=setTimeout(()=>{node.hidden=true;},major?2600:1800);}
function renderSeats(){
 const root=$("player-seats"),ids=state?.playerOrder||[],n=ids.length||1,colors=["#f4c77f","#a8c9dd","#d8b0a2","#b6cba3","#c5b5df","#e4b9cb","#a9c8b9","#e5d39a"];
 root.classList.toggle("has-winner",Boolean(state?.winnerId));
 root.replaceChildren(...ids.map((id,i)=>{const p=room.players?.find(x=>x.id===id),a=-Math.PI/2+i*Math.PI*2/n,x=50+Math.cos(a)*(n<=3?39:43),y=50+Math.sin(a)*(n<=3?39:42),el=document.createElement("div");el.className="player-seat"+(id===state.currentPlayerId?" is-current":"")+(id===myId?" is-you":"")+(id===state.winnerId?" is-winner":"");el.style.left=x+"%";el.style.top=y+"%";const avatar=document.createElement("div");avatar.className="seat-avatar";avatar.style.setProperty("--seat-color",colors[i%8]);
  const initial=document.createElement("span");initial.className="avatar-initial";initial.textContent=[...(p?.nickname||state.playerNames?.[id]||"?")][0]?.toUpperCase()||"?";avatar.append(initial);
  if(id===state.winnerId){for(const side of ["left","right"]){const arm=document.createElement("span");arm.className="winner-arm arm-"+side;avatar.append(arm);}}
  const name=document.createElement("strong");name.className="seat-name";name.textContent=p?.nickname||state.playerNames?.[id]||"Player";const status=document.createElement("small");status.className="seat-state";status.textContent=id===state.winnerId?"WINNER!":id===state.currentPlayerId?"Playing now":"At the table";el.append(avatar,name,status);return el;}));
}
function renderEffects(){
 const e=state.effects||{},labels=[];if(e.chainReaction)labels.push("⛓️ Chain Reaction · "+(e.chainReaction.dice?e.chainReaction.dice.join(" + "):"dice obscured"));if(e.blindSpotCount)labels.push("🙈 Blind Spot × "+e.blindSpotCount);
 $("effect-strip").replaceChildren(...labels.map(t=>{const s=document.createElement("span");s.className="effect-chip";s.textContent=t;return s;}));
}
function renderDice(){
 const dice=privateState?.dice||[];
 document.querySelectorAll(".die").forEach((b,i)=>{const v=dice[i];b.querySelector("strong").textContent=v==null?"?":v;b.classList.toggle("hidden-die",v==null);b.classList.toggle("selected",selectedDie===i);b.disabled=!myTurn()||Boolean(privateState?.selection)||acting;});
 const signature=JSON.stringify([dice,privateState?.hiddenDice,privateState?.diceSource]);if(signature!==lastDiceSignature){lastDiceSignature=signature;document.querySelectorAll(".die").forEach(b=>{b.classList.remove("rolling");void b.offsetWidth;b.classList.add("rolling");});}
 $("dice-source").textContent=privateState?.diceSource==="chain-reaction"?"CHAIN DICE":"D6 + D7";
 const hidden=privateState?.hiddenDice?.length||0;
 $("dice-hint").textContent=hidden===2?"Both dice are hidden. Choose one without seeing it, or use both with Set Total.":hidden===1?"One die is hidden. You may still choose it; it is revealed when your move resolves.":"Choose a die for most actions. Set Total uses both dice; Reverse needs no die.";
}
function renderHand(){
 const cards=privateState?.hand?.actions||[];
 $("action-hand").replaceChildren(...cards.map(type=>{const b=document.createElement("button");b.type="button";b.className="action-card";b.classList.toggle("selected",selectedCard===type);b.disabled=!myTurn()||Boolean(privateState?.selection)||acting;const icon=document.createElement("span");icon.textContent=INFO[type][0];const label=document.createElement("small");label.textContent=INFO[type][1];b.append(icon,label);b.addEventListener("click",()=>{selectedCard=type;render();});return b;}));
 const special=privateState?.hand?.special;
 $("special-card").textContent=special?SPECIAL[special][0]+" "+SPECIAL[special][1]:"No special card";
 $("play-special").textContent=special?"Play "+SPECIAL[special][1]:"No special card";
 $("play-special").disabled=!myTurn()||!special||privateState?.specialUsedThisTurn||acting;
 $("glitch-controls").hidden=special!=="glitch";
 for(const id of ["glitch-a","glitch-b"]){const old=$(id).value;$(id).replaceChildren(...ACTIONS.map(t=>new Option(INFO[t][1],t)));$(id).value=ACTIONS.includes(old)?old:(id==="glitch-a"?"addition":"multiplication");}
 if($("glitch-a").value===$("glitch-b").value)$("glitch-b").value=ACTIONS.find(t=>t!==$("glitch-a").value);
 $("special-hint").textContent=special==="delayed-fate"?"Select an action first. You can trigger the stored move during another player’s turn, before they confirm their action.":special==="bookmark"?"Save this total, then restore it during another player’s turn, before they confirm their action.":special==="glitch"?"Choose two different action cards to swap secretly.":special?"This does not consume your action card. You can still make a normal move.":"Your next special card arrives when your action hand refills.";
 const mark=privateState?.bookmark;$("bookmark-row").hidden=!mark;$("bookmark-copy").textContent=mark?"🔖 Saved total: "+mark.total+" · usable before another player confirms":"";$("restore-bookmark").disabled=!privateState?.canRestoreBookmark||acting;$("delayed-row").hidden=!privateState?.canUseDelayedFate;$("delayed-copy").textContent=privateState?.pendingDelayed?"⏳ Stored Delayed Fate × "+privateState.pendingDelayed:"";$("use-delayed-fate").disabled=!privateState?.canUseDelayedFate||acting;
 $("digit-choice").hidden=!selectedCard||effective(selectedCard)!=="switch";document.querySelectorAll("[data-digit]").forEach(b=>b.classList.toggle("selected",b.dataset.digit===digit));
 const selection=privateState?.selection,t=selection?.effective|| (selectedCard?effective(selectedCard):null);
 let preview="Select an action card to prepare your move.";
 if(selection)preview="Ready: "+INFO[selection.effective][1]+(selection.delayed?" · Delayed Fate will postpone this action":"")+". Confirm to resolve your turn.";
 else if(selectedCard&&t==="set-total")preview="Both dice set the total: D6 is the tens digit, D7 is the ones digit.";
 else if(selectedCard&&t==="reverse")preview="Reverse the two digits. A single-digit total is treated as 0X.";
 else if(selectedCard&&selectedDie===null)preview="Choose D6 or D7 for "+INFO[t][1]+".";
 else if(selectedCard&&t==="switch")preview="Choose which digit to replace, then confirm.";
 else if(selectedCard)preview=INFO[t][1]+" is ready. You may play your special card before confirming.";
 $("selection-preview").textContent=preview;
 const ready=Boolean(selection)||(selectedCard&&(t==="set-total"||t==="reverse"||(selectedDie!==null&&(t!=="switch"||digit))));
 $("confirm-action").textContent=selection?"Confirm action":"Lock in action";$("confirm-action").disabled=!myTurn()||!ready||acting;
}
function renderHistory(){const root=$("event-history");if(!root||!state)return;const events=state.roundHistory||[];root.replaceChildren(...events.map(event=>{const li=document.createElement("li");li.textContent=event.message||"An action took place.";if(event.formula)li.textContent+=" · "+event.formula+" → "+event.total;return li;}));$("history-round").textContent="Round "+(state.roundNumber||1)+" · "+events.length+" events";}
function render(){
 if(!room||!state)return;lifecycle();renderGameGuide({room,code,token,apiBaseUrl:API,myPlayerId:myId});
 $("room-label").textContent=(room.name||"Party")+" · "+code;$("connection-status").textContent="Connected";
 $("shared-total").textContent=state.total;$("total-caption").textContent=state.total===67?"SIX SEVEN!":"Target: exactly 67";
 const who=room.players?.find(p=>p.id===state.currentPlayerId)?.nickname||state.playerNames?.[state.currentPlayerId]||"A player";
 $("turn-banner").textContent=state.winnerId?"🏆 "+(state.playerNames?.[state.winnerId]||"A player")+" landed on 67!":myTurn()?"It's your turn. Make your move.":who+" is changing the total…";
 $("total-core").classList.toggle("is-winning",Boolean(state.winnerId));renderSeats();renderEffects();renderDice();renderHand();renderHistory();
 if(state.lastEvent&&state.lastEvent.id!==lastEvent){lastEvent=state.lastEvent.id;let msg=state.lastEvent.message||"The total changed.";if(state.lastEvent.formula)msg+=" · "+state.lastEvent.formula+" → "+(state.lastEvent.calculated??state.lastEvent.total)+(state.lastEvent.capped?" → "+state.lastEvent.total+(state.lastEvent.calculated>85?" (MAXIMUM)":" (MINIMUM)"):"");$("event-message").textContent=msg;
  if(["total-changed","delayed-resolved","bookmark-restored"].includes(state.lastEvent.type)){const core=$("total-core");core.classList.remove("is-changing","action-addition","action-subtraction","action-multiplication","action-division","action-switch","action-set-total","action-reverse");if(state.lastEvent.effectiveType)core.classList.add("action-"+state.lastEvent.effectiveType);void core.offsetWidth;core.classList.add("is-changing");}
  if(state.lastEvent.type==="special-public"&&state.lastEvent.special==="equalizer"&&!privateState?.selection){selectedCard=null;selectedDie=null;}
  if(state.lastEvent.type==="special-public"&&["chain-reaction","blind-spot","equalizer"].includes(state.lastEvent.special)){notify(msg,true);const panel=document.querySelector(".table-panel");panel.classList.remove("special-flash");void panel.offsetWidth;panel.classList.add("special-flash");}
  else if(state.lastEvent.type==="delayed-resolved"||state.lastEvent.type==="bookmark-restored"||(state.lastEvent.type==="total-changed"&&state.lastEvent.originalType!==state.lastEvent.effectiveType))notify(msg,false);
 }
 const pe=privateState?.privateEvent;if(pe&&pe.id!==lastPrivateEvent){lastPrivateEvent=pe.id;$("action-status").textContent=pe.message||"Your special card was activated.";}
 $("result-panel").hidden=room.lifecycle!=="results";
 if(room.lifecycle==="results"){const winner=room.players?.find(p=>p.id===state.winnerId)?.nickname||state.playerNames?.[state.winnerId]||"The winner";$("result-copy").textContent=winner+" wins by landing exactly on 67. Watch their avatar do the 6–7!";}
}
async function act(action){const interrupt=["use-delayed-fate","restore-bookmark"].includes(action?.type);if(acting||(!myTurn()&&!(interrupt&&canInterrupt())))return;acting=true;error("");$("action-status").textContent="Sending move…";render();try{const r=await api("/api/rooms/"+encodeURIComponent(code)+"/game/action",{method:"POST",body:JSON.stringify({actionId:crypto.randomUUID(),expectedStateVersion:version,action})});version=r.stateVersion??version;$("action-status").textContent="Move confirmed.";}catch(e){error(e.message);if(Number.isInteger(e.stateVersion))version=e.stateVersion;}finally{acting=false;render();}}
function actionPayload(){const t=effective(selectedCard);return{type:"select-action",card:selectedCard,dieIndex:selectedDie??0,digit};}
$("confirm-action").addEventListener("click",async()=>{if(privateState?.selection){await act({type:"confirm-action"});selectedCard=null;selectedDie=null;return;}if(!selectedCard)return;await act(actionPayload());selectedCard=null;selectedDie=null;});
document.querySelectorAll(".die").forEach(b=>b.addEventListener("click",()=>{if(!myTurn()||privateState?.selection)return;selectedDie=Number(b.dataset.die);render();}));
document.querySelectorAll("[data-digit]").forEach(b=>b.addEventListener("click",()=>{digit=b.dataset.digit;render();}));
$("play-special").addEventListener("click",async()=>{
 const special=privateState?.hand?.special;if(!special)return;
 if(special==="delayed-fate"&&!privateState?.selection){if(!selectedCard){error("Choose an action card first.");return;}const t=effective(selectedCard);if(needsDie(t)&&selectedDie===null){error("Choose a die first.");return;}await act(actionPayload());selectedCard=null;selectedDie=null;}
 const a={type:"activate-special"};if(special==="glitch")a.swap=[$("glitch-a").value,$("glitch-b").value];await act(a);
});
$("restore-bookmark").addEventListener("click",()=>act({type:"restore-bookmark"}));
$("use-delayed-fate").addEventListener("click",()=>act({type:"use-delayed-fate"}));
function connect(){
 const gen=++generation;if(socket)try{socket.close();}catch{}
 if(!code||!token){error("Party session not found. Return to the lobby and join again.");$("connection-status").textContent="Session missing";return;}
 $("connection-status").textContent="Connecting…";socket=new WebSocket(API.replace(/^http/,"ws")+"/api/rooms/"+encodeURIComponent(code)+"/ws?token="+encodeURIComponent(token));const current=socket;
 current.addEventListener("open",()=>{if(gen!==generation||current!==socket)return;reconnectDelay=1000;if(heartbeat)clearInterval(heartbeat);heartbeat=setInterval(()=>{if(current.readyState===WebSocket.OPEN)current.send(JSON.stringify({type:"ping"}));},15000);});
 current.addEventListener("message",e=>{if(gen!==generation||current!==socket)return;let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.room&&["room-snapshot","room-updated","game-started","game-guide","guide-progress"].includes(m.type)){room=m.room;myId=m.playerId||myId;state=room.gameState||state;privateState=m.privateState??privateState;version=m.stateVersion??room.stateVersion??version;if(room.lifecycle==="lobby"){location.href=back;return;}if(privateState?.selection){selectedCard=null;selectedDie=null;}render();}
  if(m.type==="game-state"){state=m.gameState;privateState=m.privateState??privateState;version=m.stateVersion??version;if(room){room.lifecycle=m.lifecycle;room.gameState=state;room.stateVersion=version;room.results=m.results;}if(!privateState?.selection){selectedCard=null;selectedDie=null;}render();}
  if(m.type==="error")error(m.message||"A connection error occurred.");
 });
 current.addEventListener("close",()=>{if(gen!==generation||current!==socket)return;if(heartbeat)clearInterval(heartbeat);$("connection-status").textContent="Reconnecting…";reconnectTimer=setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(15000,reconnectDelay*2);});
 current.addEventListener("error",()=>{try{current.close();}catch{}});
}
window.addEventListener("beforeunload",()=>{if(reconnectTimer)clearTimeout(reconnectTimer);if(heartbeat)clearInterval(heartbeat);if(socket)socket.close();});
connect();
