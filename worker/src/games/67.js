const ACTIONS=["addition","subtraction","multiplication","division","switch","set-total","reverse"];
const SPECIALS=["delayed-fate","bookmark","chain-reaction","equalizer","blind-spot","glitch"];
const clone=value=>JSON.parse(JSON.stringify(value));
const rand=max=>Math.floor(Math.random()*max);
const shuffle=items=>{const a=items.slice();for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
const hand=()=>({actions:shuffle(ACTIONS).slice(0,6),special:SPECIALS[rand(SPECIALS.length)]});
const clamp=n=>Math.max(1,Math.min(85,Math.trunc(n)));
const roll=()=>[rand(6)+1,rand(7)+1];
const current=s=>s.playerOrder[s.turnIndex];
const priority=t=>({division:0,multiplication:1,addition:2,subtraction:3,"set-total":4,switch:5,reverse:6}[t]??7);
function emit(s,type,message,extra={}){const e={id:s.eventSeq++,type,message,...extra};if(extra.privateTo){s.privateEvents[extra.privateTo]=e;return;}s.lastEvent=e;}
function transformed(s,card){let type=card;for(const g of s.effects.glitches){if(type===g.a)type=g.b;else if(type===g.b)type=g.a;}return type;}
function apply(total,type,dice,index,digit){
 const d=dice[index??0],p=String(total).padStart(2,"0");let n=total,formula="";
 if(type==="addition"){n=total+d;formula=`${total} + ${d}`;}
 else if(type==="subtraction"){n=total-d;formula=`${total} − ${d}`;}
 else if(type==="multiplication"){n=total*d;formula=`${total} × ${d}`;}
 else if(type==="division"){n=Math.floor(total/d);formula=`${total} ÷ ${d}`;}
 else if(type==="set-total"){n=dice[0]*10+dice[1];formula=`Set ${dice[0]}${dice[1]}`;}
 else if(type==="switch"){const a=p.split("");a[digit==="ones"?1:0]=String(d);n=Number(a.join(""));formula=`Switch ${digit} to ${d}`;}
 else if(type==="reverse"){n=Number(p[1]+p[0]);formula=`Reverse ${p} → ${p[1]}${p[0]}`;}
 else throw Error("Unknown action");
 return {total:clamp(n),calculated:n,formula,capped:clamp(n)!==n};
}
function draw(s,id){s.hands[id]=hand();s.handVersions[id]=(s.handVersions[id]||0)+1;}
function rollTurn(s,id){
 const chain=s.effects.chain;
 const dice=chain&&chain.owner!==id?chain.dice.slice():roll();
 const blinds=s.effects.blinds.filter(x=>x.owner!==id);
 const hidden=blinds.length>1?[0,1]:blinds.length===1?[rand(2)]:[];
 s.dice=dice;s.hidden=hidden;s.diceSource=chain&&chain.owner!==id?"chain-reaction":"roll";
}
function beginTurn(s){
 const id=current(s);
 const pending=s.pending.filter(x=>x.owner===id).sort((a,b)=>priority(a.type)-priority(b.type)||a.created-b.created);
 for(const item of pending){const r=apply(s.total,item.type,item.dice,item.index,item.digit);s.total=r.total;const revealed=item.type==="set-total"?item.dice.slice():item.type==="reverse"?[]:[item.dice[item.index??0]];emit(s,"delayed-resolved",item.name+" used Delayed Fate; their delayed action has now been applied.",{ownerId:id,special:"delayed-fate",formula:r.formula,calculated:r.calculated,total:r.total,capped:r.capped,revealedDice:revealed});}
 s.pending=s.pending.filter(x=>x.owner!==id);
 if(s.effects.chain?.owner===id)s.effects.chain=null;
 const expiredBlind=s.effects.blinds.some(x=>x.owner===id),expiredGlitch=s.effects.glitches.some(x=>x.owner===id);
 s.effects.blinds=s.effects.blinds.filter(x=>x.owner!==id);s.effects.glitches=s.effects.glitches.filter(x=>x.owner!==id);
 if((expiredBlind||expiredGlitch)&&!pending.length)emit(s,"effects-expired","Temporary effects have expired.");
 s.selection=null;s.specialUsed=false;s.restored=false;rollTurn(s,id);s.phase="select";
 if(!pending.length)emit(s,"turn-started","Turn begins: "+s.names[id],{playerId:id});
 if(s.total===67)s.winnerId=id;
}
function finishTurn(s,id){
 if(s.bookmarks[id]&&s.bookmarks[id].created<s.turnNumber){delete s.bookmarks[id];emit(s,"bookmark-expired",`${s.names[id]}'s unused Bookmark expired.`,{ownerId:id});}
 const actionEvent=["total-changed","cards-refilled"].includes(s.lastEvent?.type)?s.lastEvent:null;
 s.turnNumber++;s.turnIndex=(s.turnIndex+1)%s.playerOrder.length;beginTurn(s);
 if(actionEvent&&s.lastEvent?.type==="turn-started")s.lastEvent=actionEvent;
}
function activate(s,id,action){
 const card=s.hands[id].special;s.hands[id].special=null;s.specialUsed=true;const name=s.names[id];
 if(card==="delayed-fate"){
  const x=s.selection;s.pending.push({owner:id,name,type:x.original,dice:s.dice.slice(),index:x.index,digit:x.digit,created:s.eventSeq});
  s.selection.delayed=true;emit(s,"private-special","Your selected action is delayed until before your next turn.",{privateTo:id});
 }else if(card==="bookmark"){
  s.bookmarks[id]={total:s.total,created:s.turnNumber};emit(s,"private-special",`Bookmark saved at ${s.total}.`,{privateTo:id});
 }else if(card==="chain-reaction"){
  if(!s.effects.chain){s.effects.chain={owner:id,dice:s.dice.slice()};emit(s,"special-public",s.effects.blinds.length?`${name} activated Chain Reaction! Blind Spot is obscuring the recorded dice.`:`${name} activated Chain Reaction! Everyone else must use ${s.dice.join(" and ")} on their next turns.`,{special:card,ownerId:id,dice:s.effects.blinds.length?undefined:s.dice.slice()});}
  else emit(s,"special-public",`${name} used Chain Reaction, but an earlier Chain Reaction is still active.`,{special:card,ownerId:id});
 }else if(card==="blind-spot"){s.effects.blinds.push({owner:id});emit(s,"special-public",`${name} activated Blind Spot! Dice will be hidden from everyone else.`,{special:card,ownerId:id});}
 else if(card==="equalizer"){for(const pid of s.playerOrder)draw(s,pid);emit(s,"special-public",`${name} activated Equalizer! Everyone received a fresh hand.`,{special:card,ownerId:id});}
 else if(card==="glitch"){
  const [a,b]=action.swap;s.effects.glitches=s.effects.glitches.filter(g=>!([g.a,g.b].includes(a)&&[g.a,g.b].includes(b)));
  s.effects.glitches.push({owner:id,a,b});if(s.selection)s.selection.effective=transformed(s,s.selection.original);
  emit(s,"private-special",`Glitch activated: ${a} and ${b} are secretly swapped until your next turn.`,{privateTo:id});
 }
}
function resolve(s,id){
 const x=s.selection;
 if(x.delayed)s.privateEvents[id]={id:s.eventSeq++,type:"delayed-queued",message:"Your action is queued until before your next turn."};
 else{
  const r=apply(s.total,x.effective,s.dice,x.index,x.digit);s.total=r.total;
  const changed=x.original!==x.effective;
  emit(s,"total-changed",changed?`${s.names[id]}'s ${x.original} was changed to ${x.effective} by Glitch.`:`${s.names[id]} used ${x.original}.`,{playerId:id,originalType:x.original,effectiveType:x.effective,formula:r.formula,calculated:r.calculated,total:r.total,capped:r.capped,dice:s.dice.slice(),revealedDice:s.dice.slice()});
 }
 if(s.handVersions[id]===x.handVersion)s.hands[id].actions=s.hands[id].actions.filter(c=>c!==x.original);
 if(!s.hands[id].actions.length){draw(s,id);if(s.lastEvent?.type==="total-changed"){s.lastEvent.message+=" They received a fresh hand.";s.lastEvent.refilled=true;}else emit(s,"cards-refilled",s.names[id]+" received a fresh hand.",{playerId:id});}
 if(s.total===67)s.winnerId=id;
 if(!s.winnerId)finishTurn(s,id);
}
export const sixtySeven={
 id:"67",name:"67 Beta",description:"Change the shared total, outplay your friends, and land exactly on 67.",
 guide: "GOAL: Be the player who ends their turn with the shared total exactly at 67. The game supports 2–8 players. The total starts at 13 and is always kept between 1 and 85.\n\nDICE: Every turn uses two dice: a D6 (1–6) and a D7 (1–7). Normally, choose one die for your action. Set Total uses both dice: D6 is the tens digit and D7 is the ones digit. If Chain Reaction is active, use its recorded pair instead of rolling.\n\nACTION CARDS: Addition adds the chosen die; Subtraction subtracts it; Multiplication multiplies by it; Division divides and drops any remainder; Switch replaces the tens or ones digit with the chosen die; Set Total makes a two-digit number from both dice; Reverse swaps the two digits without using a die (single-digit totals are treated as 0X). Values below 1 become 1 and values above 85 become 85.\n\nYOUR HAND: You start with six different action cards and one special card. Use one action card and, if you wish, one special card per turn. Your cards are private. When all six action cards have been used, you receive a fresh set of six action cards and one special card; any unused special card is discarded.\n\nSPECIAL CARDS: Delayed Fate stores your selected action and applies it just before your next turn. Bookmark saves the current total so you can restore it on a later turn. Chain Reaction makes everyone else use your two dice on their next turns. Equalizer gives every player a completely fresh hand. Blind Spot hides one randomly chosen die from each other player; overlapping Blind Spots can hide both. Glitch swaps two action-card identities until your next turn, including their rules and dice requirements. Special-card effects survive an Equalizer. Chain Reaction, Blind Spot and Equalizer are announced immediately; Delayed Fate, Bookmark and Glitch remain secret until their effects are revealed.\n\nWIN: After your action and any effects resolve, if the shared total is exactly 67, you win. The winning avatar celebrates with the 6–7 gesture!",
 emoji:"🎲",color:"#f6d8b9",entry:"./src/games/67/index.html",players:{min:2,max:8},interactionModel:"turn-based",lateJoinPolicy:"wait",spectators:{supported:true},
 canStart(ctx){const p=ctx.players.filter(x=>x.role==="player"&&x.connected);return p.length>=2&&p.length<=8?{ok:true}:{ok:false,reason:"67 needs 2–8 connected players."};},
 createInitialState(ctx){const p=ctx.players.filter(x=>x.role==="player"&&x.connected),ids=p.map(x=>x.id),s={playerOrder:ids,names:Object.fromEntries(p.map(x=>[x.id,x.nickname||"Player"])),total:13,turnIndex:0,turnNumber:1,phase:"select",dice:[],hidden:[],diceSource:"roll",hands:Object.fromEntries(ids.map(id=>[id,hand()])),handVersions:Object.fromEntries(ids.map(id=>[id,1])),privateEvents:{},selection:null,specialUsed:false,restored:false,effects:{chain:null,blinds:[],glitches:[]},pending:[],bookmarks:{},winnerId:null,eventSeq:1,lastEvent:null};rollTurn(s,ids[0]);emit(s,"turn-started",`${s.names[ids[0]]}'s turn.`,{playerId:ids[0]});return s;},
 onPlayerLeave(ctx,state,id){const ids=state.playerOrder.filter(x=>x!==id);if(ids.length<2)return null;const old=current(state),index=Math.max(0,ids.indexOf(old===id?ids[(state.turnIndex||0)%ids.length]:old));const n={...state,playerOrder:ids,turnIndex:index,hands:{...state.hands},handVersions:{...state.handVersions},names:{...state.names},pending:state.pending.filter(x=>x.owner!==id),effects:{...state.effects,blinds:state.effects.blinds.filter(x=>x.owner!==id),glitches:state.effects.glitches.filter(x=>x.owner!==id),chain:state.effects.chain?.owner===id?null:state.effects.chain},bookmarks:{...state.bookmarks}};delete n.hands[id];delete n.handVersions[id];delete n.names[id];delete n.bookmarks[id];delete n.privateEvents[id];if(old===id)beginTurn(n);return n;},
 validateAction(ctx,s,a){const id=ctx.player.id;if(!s||!s.playerOrder.includes(id)||s.winnerId)return{ok:false,reason:"This game is not accepting actions."};if(current(s)!==id)return{ok:false,reason:"Wait for your turn."};const h=s.hands[id];if(a?.type==="select-action"){if(s.selection||!h.actions.includes(a.card))return{ok:false,reason:"That action card is unavailable."};const t=transformed(s,a.card);if(t!=="set-total"&&t!=="reverse"&&![0,1].includes(a.dieIndex))return{ok:false,reason:"Choose one of your dice."};if(t==="switch"&&!["tens","ones"].includes(a.digit))return{ok:false,reason:"Choose tens or ones."};return{ok:true};}
 if(a?.type==="activate-special"){if(s.specialUsed||!h.special)return{ok:false,reason:"No special card is available this turn."};if(h.special==="delayed-fate"&&!s.selection)return{ok:false,reason:"Select an action before Delayed Fate."};if(h.special==="glitch"&&(!Array.isArray(a.swap)||a.swap.length!==2||a.swap[0]===a.swap[1]||a.swap.some(x=>!ACTIONS.includes(x))))return{ok:false,reason:"Choose two different action types."};return{ok:true};}
 if(a?.type==="confirm-action")return s.selection?{ok:true}:{ok:false,reason:"Choose an action first."};
 if(a?.type==="restore-bookmark")return s.bookmarks[id]&&s.bookmarks[id].created<s.turnNumber&&!s.restored?{ok:true}:{ok:false,reason:"Your Bookmark can be restored on your next turn before it expires."};
 return{ok:false,reason:"Unknown game action."};},
 reduceAction(ctx,state,a){const id=ctx.player.id,s=clone(state);if(a.type==="select-action"){s.selection={original:a.card,effective:transformed(s,a.card),index:a.dieIndex??null,digit:a.digit||null,delayed:false,handVersion:s.handVersions[id]};}
 else if(a.type==="activate-special")activate(s,id,a);
 else if(a.type==="restore-bookmark"){s.total=s.bookmarks[id].total;delete s.bookmarks[id];s.restored=true;emit(s,"bookmark-restored",`${s.names[id]} restored the total using Bookmark.`,{ownerId:id,total:s.total});}
 else if(a.type==="confirm-action")resolve(s,id);
 return s;},
 getPrivateState(s,id){if(!s?.playerOrder.includes(id))return null;const turn=current(s)===id;return{hand:s.hands[id],dice:turn?s.dice.map((v,i)=>s.hidden.includes(i)?null:v):null,hiddenDice:turn?s.hidden.slice():[],diceSource:turn?s.diceSource:null,selection:turn?s.selection:null,glitchMappings:turn?s.effects.glitches.map(({a,b})=>({a,b})):[],bookmark:s.bookmarks[id]||null,canRestoreBookmark:Boolean(s.bookmarks[id]&&s.bookmarks[id].created<s.turnNumber),specialUsedThisTurn:turn?s.specialUsed:false,restoredBookmarkThisTurn:turn?s.restored:false,pendingDelayed:s.pending.filter(x=>x.owner===id).length,privateEvent:s.privateEvents[id]||null};},
 getPublicState(s){if(!s)return s;const blind=s.effects.blinds.length>0;const last=s.lastEvent?.special==="chain-reaction"&&blind?{...s.lastEvent,message:`${s.names[s.lastEvent.ownerId]||"A player"} activated Chain Reaction! Blind Spot is obscuring the recorded dice.`,dice:undefined}:s.lastEvent;return{playerOrder:s.playerOrder,playerNames:s.names,total:s.total,currentPlayerId:current(s),turnNumber:s.turnNumber,phase:s.phase,effects:{chainReaction:s.effects.chain?{ownerId:s.effects.chain.owner,dice:blind?null:s.effects.chain.dice}:null,blindSpotCount:s.effects.blinds.length},winnerId:s.winnerId,lastEvent:last};},
 getStatus(ctx,s){return s.winnerId?"finished":"active";},getResults(ctx,s){return{outcome:"winner",winnerId:s.winnerId,total:s.total,turnNumber:s.turnNumber};}
};
