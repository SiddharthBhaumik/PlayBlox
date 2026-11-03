const ACTIONS=["addition","subtraction","multiplication","division","switch","set-total","reverse"];
const SPECIALS=["delayed-fate","bookmark","chain-reaction","equalizer","blind-spot","glitch"];
const clone=value=>JSON.parse(JSON.stringify(value));
const rand=max=>Math.floor(Math.random()*max);
const shuffle=items=>{const a=items.slice();for(let i=a.length-1;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
// Independent weighted draws allow duplicate action cards. Weights: common 4, medium 2, rare 1.
const ACTION_WEIGHTS=[["addition",4],["subtraction",4],["multiplication",2],["division",2],["switch",1],["set-total",1],["reverse",1]];
const drawAction=()=>{const total=ACTION_WEIGHTS.reduce((n,[,w])=>n+w,0);let pick=rand(total);for(const [card,weight] of ACTION_WEIGHTS){if(pick<weight)return card;pick-=weight;}return "addition";};
const hand=()=>({actions:Array.from({length:6},drawAction),special:SPECIALS[rand(SPECIALS.length)]});
const clamp=n=>Math.max(1,Math.min(85,Math.trunc(n)));
const roll=()=>[rand(6)+1,rand(7)+1];
const current=s=>s.playerOrder[s.turnIndex];
const priority=t=>({division:0,multiplication:1,addition:2,subtraction:3,"set-total":4,switch:5,reverse:6}[t]??7);
function emit(s,type,message,extra={}){const e={id:s.eventSeq++,type,message,...extra};if(extra.privateTo){s.privateEvents[extra.privateTo]=e;return;}s.lastEvent=e;s.roundHistory.push(e);}
function transformDetails(s,card){let type=card;const owners=[];for(const g of s.effects.glitches){if(type===g.a){type=g.b;if(!owners.includes(g.owner))owners.push(g.owner);}else if(type===g.b){type=g.a;if(!owners.includes(g.owner))owners.push(g.owner);}}return{type,owners};}
function transformed(s,card){return transformDetails(s,card).type;}
function apply(total,type,dice,index,digit){
 const d=dice[index??0],p=String(total).padStart(2,"0");let n=total,formula="";
 if(type==="addition"){n=total+d;formula=`${total} + ${d}`;}
 else if(type==="subtraction"){n=total-d;formula=`${total} − ${d}`;}
 else if(type==="multiplication"){n=total*d;formula=`${total} × ${d}`;}
 else if(type==="division"){n=Math.floor(total/d);formula=`${total} ÷ ${d}`;}
 else if(type==="set-total"){n=dice[0]*10+dice[1];formula=`Set Total: D6 ${dice[0]}, D7 ${dice[1]}`;}
 else if(type==="switch"){const a=p.split("");a[digit==="ones"?1:0]=String(d);n=Number(a.join(""));formula=`Switch ${p} ${digit} to ${d}`;}
 else if(type==="reverse"){n=Number(p[1]+p[0]);formula=`Reverse ${p}`;}
 else throw Error("Unknown action");
 return {total:clamp(n),calculated:n,formula,capped:clamp(n)!==n};
}
function draw(s,id){s.hands[id]=hand();s.handVersions[id]=(s.handVersions[id]||0)+1;}
function refillActions(s,id){const fresh=hand();const special=s.hands[id].special||fresh.special;s.hands[id]={actions:fresh.actions,special};s.handVersions[id]=(s.handVersions[id]||0)+1;}
function rollTurn(s,id){
 const chain=s.effects.chain;
 const dice=chain&&chain.owner!==id?chain.dice.slice():roll();
 const blinds=s.effects.blinds.filter(x=>x.owner!==id);
 const hidden=blinds.length>1?[0,1]:blinds.length===1?[rand(2)]:[];
 s.dice=dice;s.hidden=hidden;s.diceSource=chain&&chain.owner!==id?"chain-reaction":"roll";
}
function beginTurn(s){
 const id=current(s);
 const expiredDelayed=s.pending.filter(x=>x.owner===id);s.pending=s.pending.filter(x=>x.owner!==id);
 if(expiredDelayed.length)emit(s,"delayed-expired",expiredDelayed.length===1?"An unused Delayed Fate expired.":expiredDelayed.length+" unused Delayed Fate actions expired.",{ownerId:id});
 if(s.bookmarks[id]){delete s.bookmarks[id];emit(s,"bookmark-expired",s.names[id]+"’s unused Bookmark expired.",{ownerId:id});}
 if(s.effects.chain?.owner===id)s.effects.chain=null;
 const expiredBlind=s.effects.blinds.some(x=>x.owner===id),expiredGlitch=s.effects.glitches.some(x=>x.owner===id);
 s.effects.blinds=s.effects.blinds.filter(x=>x.owner!==id);s.effects.glitches=s.effects.glitches.filter(x=>x.owner!==id);
 if(expiredBlind||expiredGlitch)emit(s,"effects-expired","Temporary effects have expired.");
 s.selection=null;s.specialUsed=false;s.restored=false;rollTurn(s,id);s.phase="select";
 emit(s,"turn-started","Turn begins: "+s.names[id],{playerId:id});
}
function finishTurn(s,id){
 const actionEvent=["total-changed","cards-refilled","delayed-resolved","bookmark-restored"].includes(s.lastEvent?.type)?s.lastEvent:null;
 s.completedTurnsThisRound.push(id);
 const roundComplete=s.playerOrder.every(pid=>s.completedTurnsThisRound.includes(pid));
 if(roundComplete){s.completedTurnsThisRound=[];s.roundNumber++;s.roundHistory=[];}
 s.turnNumber++;s.turnIndex=(s.turnIndex+1)%s.playerOrder.length;beginTurn(s);
 if(actionEvent)s.lastEvent=actionEvent;
}
function activate(s,id,action){
 const card=s.hands[id].special;s.hands[id].special=null;s.specialUsed=true;const name=s.names[id];
 if(card==="delayed-fate"){
  const x=s.selection;s.pending.push({owner:id,name,type:x.original,dice:s.dice.slice(),index:x.index,digit:x.digit,created:s.eventSeq});
  s.selection.delayed=true;emit(s,"private-special","Your action is stored. You may trigger Delayed Fate during another player’s unconfirmed action.",{privateTo:id});
 }else if(card==="bookmark"){
  s.bookmarks[id]={total:s.total,created:s.turnNumber};emit(s,"private-special",`Bookmark saved at ${s.total}.`,{privateTo:id});
 }else if(card==="chain-reaction"){
  if(!s.effects.chain){s.effects.chain={owner:id,dice:s.dice.slice()};emit(s,"special-public",s.effects.blinds.length?`${name} activated Chain Reaction! Blind Spot is obscuring the recorded dice.`:`${name} activated Chain Reaction! Everyone else must use ${s.dice.join(" and ")} on their next turns.`,{special:card,ownerId:id,dice:s.effects.blinds.length?undefined:s.dice.slice()});}
  else emit(s,"special-public",`${name} used Chain Reaction, but an earlier Chain Reaction is still active.`,{special:card,ownerId:id});
 }else if(card==="blind-spot"){s.effects.blinds.push({owner:id});emit(s,"special-public",`${name} activated Blind Spot! Dice will be hidden from everyone else.`,{special:card,ownerId:id});}
 else if(card==="equalizer"){for(const pid of s.playerOrder)draw(s,pid);emit(s,"special-public",`${name} activated Equalizer! Everyone received a fresh hand.`,{special:card,ownerId:id});}
 else if(card==="glitch"){
  const [a,b]=action.swap;s.effects.glitches=s.effects.glitches.filter(g=>!([g.a,g.b].includes(a)&&[g.a,g.b].includes(b)));
  s.effects.glitches.push({owner:id,a,b});if(s.selection){const details=transformDetails(s,s.selection.original);s.selection.effective=details.type;s.selection.glitchOwners=details.owners;}
  emit(s,"private-special",`Glitch activated: ${a} and ${b} are secretly swapped until your next turn.`,{privateTo:id});
 }
}
function resolve(s,id){
 if(!Array.isArray(s.scheduledDelayed))s.scheduledDelayed=[];
 const x=s.selection;
 if(x.delayed)s.privateEvents[id]={id:s.eventSeq++,type:"delayed-queued",message:"Your action is stored. Use Delayed Fate during another player’s unconfirmed action."};
 else{
  const r=apply(s.total,x.effective,s.dice,x.index,x.digit);s.total=r.total;
  const changed=x.original!==x.effective,owners=(x.glitchOwners||[]).map(owner=>s.names[owner]||"another player").join(", ");
  const message=changed?(s.names[id]+" used "+x.effective+" instead of "+x.original+" because Glitch was activated by "+owners+"."):(s.names[id]+" used "+x.original+".");
  const revealed=x.effective==="set-total"?s.dice.slice():x.effective==="reverse"?[]:[s.dice[x.index??0]];
  emit(s,"total-changed",message,{playerId:id,originalType:x.original,effectiveType:x.effective,formula:r.formula,calculated:r.calculated,total:r.total,capped:r.capped,revealedDice:revealed});
 }
 if(s.handVersions[id]===x.handVersion){const usedIndex=s.hands[id].actions.indexOf(x.original);if(usedIndex>=0)s.hands[id].actions.splice(usedIndex,1);}
 if(!s.hands[id].actions.length){refillActions(s,id);if(s.lastEvent?.type==="total-changed"){s.lastEvent.message+=" They received a fresh hand.";s.lastEvent.refilled=true;}else emit(s,"cards-refilled",s.names[id]+" received a fresh hand.",{playerId:id});}
 // Delayed Fate actions triggered during this turn resolve only after this player's action.
 const scheduled=s.scheduledDelayed.splice(0);
 for(const item of scheduled){
  const r=apply(s.total,item.type,item.dice,item.index,item.digit);s.total=r.total;
  const revealed=item.type==="set-total"?item.dice.slice():item.type==="reverse"?[]:[item.dice[item.index??0]];
  emit(s,"delayed-resolved",item.name+" used Delayed Fate. The stored action resolved after the current player's action.",{ownerId:item.owner,special:"delayed-fate",originalType:item.type,effectiveType:item.type,formula:r.formula,calculated:r.calculated,total:r.total,capped:r.capped,revealedDice:revealed});
 }
 if(s.total===67)s.winnerId=id;
 if(!s.winnerId)finishTurn(s,id);
}
export const sixtySeven={
 id:"67",name:"67",description:"Change the shared total, outplay your friends, and land exactly on 67.",
 guide: "# 67 — THE 6–7 NUMBER GAME\n\n**Six action cards. Seven cards in your hand. One target: 67.**\n\nThe number 67 is built into every part of the game:\n\n- **Two dice:** a six-sided die (D6) and a seven-sided die (D7).\n- **Starting total:** 6 + 7 = **13**.\n- **Winning total:** **67**.\n- **Maximum total:** 6² + 7² = **85**.\n- **Minimum total:** |6 − 7| = **1**.\n\nThe shared total always stays between **1 and 85**. Play with 2–8 players.\n\n## 1. OBJECTIVE\n\nTake turns changing the shared total. Win by finishing your turn with the total **exactly at 67**. Special cards can disrupt plans, change the rules or give you a way to undo what happened.\n\n## 2. YOUR SEVEN-CARD HAND\n\nEvery player starts with **7 cards total**:\n\n- **6 action cards**, drawn independently from the action-card pool.\n- **1 special card**, drawn separately.\n\nDuplicates are allowed. You are not guaranteed one of each action card: you could, for example, receive three Additions, two Subtractions and one Multiplication.\n\nAction-card rarity follows this order:\n\n- **Most common:** Addition and Subtraction.\n- **Less common:** Multiplication and Division.\n- **Rarest:** Switch, Set Total and Reverse. These three have equal chances.\n\nYour hand is private. Other players cannot see your cards or how many cards you have left.\n\n## 3. THE DICE\n\nEach turn normally rolls both dice:\n\n- **D6:** six sides, results 1–6.\n- **D7:** seven sides, results 1–7.\n\nFor most action cards, choose one of the two results. **Set Total** uses both dice. If Chain Reaction is active, use its recorded pair instead of rolling your own.\n\n## 4. THE SEVEN ACTION CARDS\n\n**1. Addition (+)**  \nAdd one chosen die result to the shared total.  \nExample: 30 + 6 = **36**.\n\n**2. Subtraction (−)**  \nSubtract one chosen die result.  \nExample: 30 − 6 = **24**.\n\n**3. Multiplication (×)**  \nMultiply the shared total by one chosen die result.  \nExample: 8 × 6 = **48**.\n\n**4. Division (÷)**  \nDivide the total by one chosen die result. Drop any remainder (integer division).  \nExamples: 13 ÷ 6 = **2**; 50 ÷ 6 = **8**.\n\n**5. Switch**  \nChoose the tens or ones digit and replace it with one chosen die result.  \nExample: from 45, replacing the tens digit with 6 gives **65**; replacing the ones digit gives **46**. A one-digit total is treated as having a leading zero.\n\n**6. Set Total**  \nUse both dice to build a new two-digit total: D6 gives the tens digit and D7 gives the ones digit.  \nExample: D6 = 6 and D7 = 7 → **67**.\n\n**7. Reverse**  \nSwap the two digits. It does not use a die. A one-digit total is treated as 0X.  \nExamples: 67 → **76**; 7 → **70**; 08 → **80**.\n\n## 5. TOTAL LIMITS\n\nAfter an action, the total is clamped to the range **1–85**:\n\n- A result below 1 becomes **1**.\n- A result above 85 becomes **85**.\n- A result already between 1 and 85 stays unchanged.\n\nExamples: 13 − 6 = 7; 80 + 12 = 92, so the total becomes **85**; 20 × 6 = 120, so the total becomes **85**.\n\nThe limits do not prevent you from choosing an action. They only cap its result.\n\n## 6. THE SIX SPECIAL CARDS\n\nYou hold only one special card at a time. You may play **one action card and one special card in the same turn**. Playing a special card does not use your action card. You can activate your special card at any point during your turn, even after choosing your action, but **before confirming the action**. You cannot play more than one special card in a turn.\n\n**1. Delayed Fate**  \nChoose your action and die as usual, then activate Delayed Fate. The numerical action is stored instead of being applied immediately. During another player’s turn, trigger it at any time before they confirm their action. It is queued and applies to the shared total immediately after that player’s action resolves, before the next turn begins. If you do not trigger it before your next turn begins, it expires and is discarded. It stores the original action before any Glitch transformation.\n\nYou trigger stored Delayed Fate actions individually; each uses the shared total at the moment you trigger it.\n\n**2. Bookmark**  \nSave the current shared total. During another player’s turn, at any time before they confirm their action, you may restore the shared total to the saved value. The other player’s action will then resolve from this restored total when they confirm. You may use the Bookmark during the other players’ turns before your next turn begins, even if you saved it during your own turn. If you do not restore it before your next turn begins, it expires and is discarded. Bookmark saves the number only, not your hand or cards. It is consumed when you restore it.\n\n**3. Chain Reaction**  \nRoll both dice and activate the card. Until your next turn begins, every other player uses your recorded D6 and D7 results instead of rolling their own. A second Chain Reaction cannot replace or stack with the first active one.\n\n**4. Equalizer**  \nEveryone, including you, discards all remaining cards and receives a fresh hand: 6 action cards and 1 special card. Equalizer resets hands only. Other active effects — including Delayed Fate, Bookmark, Chain Reaction, Blind Spot and Glitch — continue.\n\n**5. Blind Spot**  \nUntil your next turn begins, every other player has one randomly selected die result hidden on their turn. They may choose either the visible or hidden die, but must commit to their action and die before the hidden result is revealed. The hidden die is selected independently for each affected player.\n\nOverlapping Blind Spots hide both dice. A player can still choose either die before its result is revealed. The effect expires when its owner’s next turn begins; its owner is not affected by their own Blind Spot. If Chain Reaction is active, players use its recorded dice, and Blind Spot can hide those results too.\n\n**6. Glitch**  \nSecretly choose two different action-card types and swap their identities until your next turn begins. Each card inherits the other card’s complete rules, including whether it needs one die or both. Glitches affecting different pairs can coexist; a later Glitch replaces an earlier one only when it swaps the same pair. The activation stays secret until a changed action is used, when the Glitch owner is revealed.\n\nDelayed Fate stores the original selected action before Glitch changes it.\n\n## 7. TURN ORDER\n\n1. Expire temporary effects belonging to the player whose turn is beginning. Stored Delayed Fate actions do not resolve automatically.\n2. Roll D6 and D7, unless Chain Reaction supplies the dice.\n3. Choose an action card and the required die result(s). Follow any Blind Spot restrictions.\n4. Optionally activate your one special card before confirming.\n5. Confirm the action. The server applies it, resolves relevant effects and updates the shared total.\n6. Other players may trigger stored Delayed Fate or restore a Bookmark during your turn before you confirm your action. A triggered Delayed Fate resolves after your action, before the next turn begins.\n7. Confirming your action closes that interrupt window. If the final total is exactly 67 after the action resolves, you win.\n\n## 8. ROUND HISTORY\n\nThe **At the Table** history keeps every public action and effect for the full round. A round ends after every player has completed one turn. The history then clears for the next round. Private card activations and hidden information are never added to the public history.\n\n## 9. CARD REFILLS\n\nAction cards and special cards are consumed independently.\n\n- Using an action card discards that one card.\n- Using a special card discards that special card.\n- Spending a special card does not immediately give you another one.\n- When all 6 action cards have been used, you receive 6 fresh action cards.\n- If you still have an unused special card, you keep that exact card; it is not replaced.\n- If you have already used your special card and have none left, you receive one random special card during the refill.\n- Equalizer is a separate reset: everyone discards all remaining cards and receives 6 fresh action cards and 1 fresh random special card.\n\nBecause action cards are drawn independently, duplicates can appear in both your starting hand and later refills.\n\n## 10. EFFECT PRIORITIES & INFORMATION\n\n- Triggered Delayed Fate actions are queued individually and resolve after the current player’s action, in trigger order; each uses the shared total when it resolves.\n- Competing digit actions: Set Total → Switch → Reverse.\n- Each Bookmark belongs to its owner and can be used once during an eligible interrupt window.\n- Conflicting Glitches on the same pair: the latest activation replaces the earlier one.\n- Different Glitch pairs can coexist.\n- Overlapping Blind Spots coexist and can hide both dice.\n- Only the first active Chain Reaction applies.\n\n**Private information:** Your action cards, special card, remaining hand and hidden die results are private. Other players never see your hand or its size.\n\n**Public announcements:** Chain Reaction, Blind Spot and Equalizer are announced immediately. Delayed Fate and Bookmark activations remain private until used; their effects are then added to the public action history. Glitch activations remain secret until their effects are revealed.\n\n## 11. WIN\n\nAfter your action and all applicable effects have resolved, if the shared total is **exactly 67**, you win. Reaching 67 temporarily is not enough if the final total changes again before the turn finishes.\n\n**SIX. SEVEN. LAND ON 67.**",
 emoji:"🎲",color:"#f6d8b9",entry:"./src/games/67/index.html",players:{min:2,max:8},interactionModel:"turn-based",lateJoinPolicy:"wait",spectators:{supported:true},
 canStart(ctx){const p=ctx.players.filter(x=>x.role==="player"&&x.connected);return p.length>=2&&p.length<=8?{ok:true}:{ok:false,reason:"67 needs 2–8 connected players."};},
 createInitialState(ctx){const p=ctx.players.filter(x=>x.role==="player"&&x.connected),ids=p.map(x=>x.id),s={playerOrder:ids,names:Object.fromEntries(p.map(x=>[x.id,x.nickname||"Player"])),total:13,turnIndex:0,turnNumber:1,phase:"select",dice:[],hidden:[],diceSource:"roll",hands:Object.fromEntries(ids.map(id=>[id,hand()])),handVersions:Object.fromEntries(ids.map(id=>[id,1])),privateEvents:{},selection:null,specialUsed:false,restored:false,effects:{chain:null,blinds:[],glitches:[]},pending:[],scheduledDelayed:[],bookmarks:{},completedTurnsThisRound:[],roundNumber:1,roundHistory:[],winnerId:null,eventSeq:1,lastEvent:null};rollTurn(s,ids[0]);emit(s,"turn-started",`${s.names[ids[0]]}'s turn.`,{playerId:ids[0]});return s;},
 onPlayerLeave(ctx,state,id){const ids=state.playerOrder.filter(x=>x!==id);if(ids.length<2)return null;const old=current(state),index=Math.max(0,ids.indexOf(old===id?ids[(state.turnIndex||0)%ids.length]:old));const n={...state,playerOrder:ids,turnIndex:index,hands:{...state.hands},handVersions:{...state.handVersions},names:{...state.names},pending:state.pending.filter(x=>x.owner!==id),effects:{...state.effects,blinds:state.effects.blinds.filter(x=>x.owner!==id),glitches:state.effects.glitches.filter(x=>x.owner!==id),chain:state.effects.chain?.owner===id?null:state.effects.chain},bookmarks:{...state.bookmarks}};delete n.hands[id];delete n.handVersions[id];delete n.names[id];delete n.bookmarks[id];delete n.privateEvents[id];if(old===id)beginTurn(n);return n;},
 validateAction(ctx,s,a){const id=ctx.player.id;if(!s||!s.playerOrder.includes(id)||s.winnerId)return{ok:false,reason:"This game is not accepting actions."};
 if(a?.type==="use-delayed-fate")return current(s)!==id&&s.pending.some(x=>x.owner===id)?{ok:true}:{ok:false,reason:"Use Delayed Fate only while another player has an unconfirmed action."};
 if(a?.type==="restore-bookmark")return current(s)!==id&&Boolean(s.bookmarks[id])?{ok:true}:{ok:false,reason:"Restore Bookmark only while another player has an unconfirmed action."};
 if(current(s)!==id)return{ok:false,reason:"Wait for your turn."};const h=s.hands[id];
 if(a?.type==="select-action"){if(s.selection||!h.actions.includes(a.card))return{ok:false,reason:"That action card is unavailable."};const t=transformed(s,a.card);if(t!=="set-total"&&t!=="reverse"&&![0,1].includes(a.dieIndex))return{ok:false,reason:"Choose one of your dice."};if(t==="switch"&&!["tens","ones"].includes(a.digit))return{ok:false,reason:"Choose tens or ones."};return{ok:true};}
 if(a?.type==="activate-special"){if(s.specialUsed||!h.special)return{ok:false,reason:"No special card is available this turn."};if(h.special==="delayed-fate"&&!s.selection)return{ok:false,reason:"Select an action before Delayed Fate."};if(h.special==="glitch"&&(!Array.isArray(a.swap)||a.swap.length!==2||a.swap[0]===a.swap[1]||a.swap.some(x=>!ACTIONS.includes(x))))return{ok:false,reason:"Choose two different action types."};return{ok:true};}
 if(a?.type==="confirm-action")return s.selection?{ok:true}:{ok:false,reason:"Choose an action first."};
 return{ok:false,reason:"Unknown game action."};},
 reduceAction(ctx,state,a){const id=ctx.player.id,s=clone(state);if(!Array.isArray(s.scheduledDelayed))s.scheduledDelayed=[];
 if(a.type==="select-action"){const details=transformDetails(s,a.card);s.selection={original:a.card,effective:details.type,glitchOwners:details.owners,index:a.dieIndex??null,digit:a.digit||null,delayed:false,handVersion:s.handVersions[id]};}
 else if(a.type==="activate-special")activate(s,id,a);
 else if(a.type==="use-delayed-fate"){const index=s.pending.findIndex(x=>x.owner===id);const item=s.pending[index];s.pending.splice(index,1);s.scheduledDelayed.push(item);emit(s,"delayed-queued",item.name+" queued Delayed Fate. It will resolve after the current player finishes their action.",{ownerId:id,special:"delayed-fate"});}
 else if(a.type==="restore-bookmark"){s.total=s.bookmarks[id].total;delete s.bookmarks[id];emit(s,"bookmark-restored",s.names[id]+" restored the total using Bookmark.",{ownerId:id,total:s.total});}
 else if(a.type==="confirm-action")resolve(s,id);
 return s;},
 getPrivateState(s,id){if(!s?.playerOrder.includes(id))return null;const turn=current(s)===id,interrupt=!turn;return{hand:s.hands[id],dice:turn?s.dice.map((v,i)=>s.hidden.includes(i)?null:v):null,hiddenDice:turn?s.hidden.slice():[],diceSource:turn?s.diceSource:null,selection:turn?s.selection:null,glitchMappings:turn?s.effects.glitches.map(({a,b})=>({a,b})):[],bookmark:s.bookmarks[id]||null,canRestoreBookmark:Boolean(interrupt&&s.bookmarks[id]),specialUsedThisTurn:turn?s.specialUsed:false,pendingDelayed:s.pending.filter(x=>x.owner===id).length,canUseDelayedFate:Boolean(interrupt&&s.pending.some(x=>x.owner===id)),privateEvent:s.privateEvents[id]||null};},
 getPublicState(s){if(!s)return s;const blind=s.effects.blinds.length>0;const last=s.lastEvent?.special==="chain-reaction"&&blind?{...s.lastEvent,message:(s.names[s.lastEvent.ownerId]||"A player")+" activated Chain Reaction! Blind Spot is obscuring the recorded dice.",dice:undefined}:s.lastEvent;return{playerOrder:s.playerOrder,playerNames:s.names,total:s.total,currentPlayerId:current(s),turnNumber:s.turnNumber,roundNumber:s.roundNumber,roundHistory:s.roundHistory,actionPending:Boolean(s.selection),phase:s.phase,effects:{chainReaction:s.effects.chain?{ownerId:s.effects.chain.owner,dice:blind?null:s.effects.chain.dice}:null,blindSpotCount:s.effects.blinds.length},winnerId:s.winnerId,lastEvent:last};},
 getStatus(ctx,s){return s.winnerId?"finished":"active";},getResults(ctx,s){return{outcome:"winner",winnerId:s.winnerId,total:s.total,turnNumber:s.turnNumber};}
};
