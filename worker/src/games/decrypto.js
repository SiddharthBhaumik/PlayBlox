import { DECRYPTO_WORDS } from "./decrypto-words.js";

const random = items => items[Math.floor(Math.random() * items.length)];
const shuffled = items => [...items].sort(() => Math.random() - 0.5);
const drawWords = used => {
  const pool = shuffled([...new Set(DECRYPTO_WORDS)].filter(word => !used.has(word)));
  const words = pool.slice(0, 4);
  words.forEach(word => used.add(word));
  return words;
};
const newCode = () => Array.from({length:3},()=>1+Math.floor(Math.random()*4));
const teamIds = state => ({
  blue: state.playerOrder.filter(id => state.teams[id] === "blue"),
  red: state.playerOrder.filter(id => state.teams[id] === "red"),
});
const other = team => team === "blue" ? "red" : "blue";
const teamName = team => team === "blue" ? "Blue" : "Red";
const winFor = (state, winner, reason) => ({...state,phase:"finished",winner,finishReason:reason});

export const decrypto = {
 id:"decrypto", name:"Decrypto",
 description:"Give three clues, decode your team’s secret code, and intercept the other team’s.",
 guide:"GOAL: Two teams compete to communicate secret three-digit codes without letting the opponents intercept them.\n\nTEAMS: Choose Blue or Red. Teams may be uneven, but each needs at least two players. Each team has four numbered secret words.\n\nEACH ROUND: One clue-giver per team receives a private three-digit code (each digit points to one of their four words) and gives three clues in order. Teammates use their four words and the clues to decode the code. The opposing team studies the clues and tries to intercept it.\n\nSCORING: A successful interception earns an interception token. A team that fails to decode its own code earns a miscommunication token. Two interceptions win; two miscommunications lose. Codes and secret words are private to their team.",
 emoji:"🔐", color:"#dce8ff", entry:"./src/games/decrypto/index.html",
 players:{min:4,max:8}, interactionModel:"simultaneous", lateJoinPolicy:"spectate", spectators:{supported:true},
 canStart(context) {
  const players=context.players.filter(p=>p.role==="player"&&p.connected);
  return players.length>=4&&players.length<=8?{ok:true}:{ok:false,reason:"Decrypto needs 4–8 connected players."};
 },
 createInitialState(context) {
  const playerOrder=context.players.filter(p=>p.role==="player"&&p.connected).map(p=>p.id);
  const used=new Set();
  return {playerOrder,phase:"teams",round:1,teams:{},words:{blue:drawWords(used),red:drawWords(used)},
   clueGiverIndex:{blue:0,red:0},codes:{blue:newCode(),red:newCode()},clues:{},ownGuesses:{},intercepts:{},
   interceptions:{blue:0,red:0},miscommunications:{blue:0,red:0},submitted:{blue:false,red:false},winner:null,finishReason:null};
 },
 onPlayerLeave(context,state,playerId) {
  const playerOrder=(state?.playerOrder||[]).filter(id=>id!==playerId);
  const teams={...state.teams}; delete teams[playerId];
  const next={...state,playerOrder,teams};
  const counts=teamIds(next);
  if(counts.blue.length<2&&counts.red.length>=2)return winFor(next,"red", "Blue fell below two players.");
  if(counts.red.length<2&&counts.blue.length>=2)return winFor(next,"blue", "Red fell below two players.");
  if(counts.blue.length<2||counts.red.length<2)return null;
  if(state.phase==="finished")return next;
  const clueGiverIndex={blue:(state.clueGiverIndex?.blue||0)%counts.blue.length,red:(state.clueGiverIndex?.red||0)%counts.red.length};
  return {...next,phase:state.phase==="teams"?"teams":"clues",clueGiverIndex,codes:{blue:newCode(),red:newCode()},clues:{},ownGuesses:{},intercepts:{},submitted:{blue:false,red:false}};
 },
 validateAction(context,state,action) {
  const id=context.player.id;
  if(!state||!state.playerOrder.includes(id))return {ok:false,reason:"You are not in this match."};
  if(state.phase==="finished")return {ok:false,reason:"The match is over."};
  if(action?.type==="choose-team"&&state.phase==="teams") {
   if(!["blue","red"].includes(action.team))return {ok:false,reason:"Choose Blue or Red."};
   return {ok:true};
  }
  if(state.phase==="teams")return {ok:false,reason:"Choose a team before the first round."};
  const teams=teamIds(state),team=state.teams[id];
  if(!team)return {ok:false,reason:"Your team is not assigned."};
  if(action?.type==="submit-clues"&&state.phase==="clues") {
   if(teamIds(state)[team][state.clueGiverIndex[team]]!==id)return {ok:false,reason:"Only your team's clue-giver can submit clues."};
   if(state.submitted[team])return {ok:false,reason:"Your team has already submitted its clues."};
   if(!Array.isArray(action.clues)||action.clues.length!==3||action.clues.some(c=>typeof c!=="string"||!c.trim()||c.length>100))return {ok:false,reason:"Enter three clear clues."};
   return {ok:true};
  }
  if(action?.type==="submit-both"&&state.phase==="decode") {
   if(state.ownGuesses[team]||state.intercepts[team])return {ok:false,reason:"Your team has already submitted this round."};
   if(!/^\\s*[1-4]{3}\\s*$/.test(String(action.ownCode||""))||!/^\\s*[1-4]{3}\\s*$/.test(String(action.interceptCode||"")))return {ok:false,reason:"Enter both three-digit codes using digits 1–4."};
   return {ok:true};
  }
  if(action?.type==="decode"&&state.phase==="decode") {
   if(!teams[team].includes(id)||state.ownGuesses[team])return {ok:false,reason:"Your team has already decoded this round."};
   if(!/^\s*[1-4]{3}\s*$/.test(String(action.code||"")))return {ok:false,reason:"Enter a three-digit code using digits 1–4."};
   return {ok:true};
  }
  if(action?.type==="intercept"&&state.phase==="decode") {
   const target=other(team);
   if(state.intercepts[team])return {ok:false,reason:"Your team has already attempted an interception."};
   if(!/^\s*[1-4]{3}\s*$/.test(String(action.code||"")))return {ok:false,reason:"Enter a three-digit code using digits 1–4."};
   return {ok:true};
  }
  return {ok:false,reason:"That action is not available now."};
 },
 reduceAction(context,state,action) {
  const id=context.player.id;
  if(action.type==="choose-team") {
   const teams={...state.teams,[id]:action.team};
   const counts={blue:state.playerOrder.filter(pid=>teams[pid]==="blue").length,red:state.playerOrder.filter(pid=>teams[pid]==="red").length};
   const ready=state.playerOrder.every(pid=>teams[pid])&&counts.blue>=2&&counts.red>=2;
   return {...state,teams,phase:ready?"clues":"teams"};
  }
  const team=state.teams[id];
  if(action.type==="submit-clues") {
   const clues={...state.clues,[team]:action.clues.map(c=>c.trim())};
   const submitted={...state.submitted,[team]:true};
   return submitted.blue&&submitted.red?{...state,clues,submitted,phase:"decode"}:{...state,clues,submitted};
  }
  if(action.type==="submit-both"||action.type==="decode"||action.type==="intercept") {
   const ownGuesses={...state.ownGuesses},intercepts={...state.intercepts};
   if(action.type==="submit-both"){ownGuesses[team]=String(action.ownCode).trim();intercepts[team]=String(action.interceptCode).trim();}
   else if(action.type==="decode")ownGuesses[team]=String(action.code).trim();
   else intercepts[team]=String(action.code).trim();
   const next={...state,ownGuesses,intercepts};
   if(!next.ownGuesses.blue||!next.ownGuesses.red||!next.intercepts.blue||!next.intercepts.red)return next;
   const counts=teamIds(next);
   const codes={...next.codes};
   const interceptions={...next.interceptions},miscommunications={...next.miscommunications};
   for(const t of ["blue","red"]) {
    const expected=(codes[t]||[]).join("");
    if(next.ownGuesses[t]!==expected)miscommunications[t]++;
    if(next.intercepts[t]===codes[other(t)].join(""))interceptions[t]++;
   }
   let winner=null,reason=null;
   if(interceptions.blue>=2||interceptions.red>=2) {
    winner=interceptions.blue>=2?"blue":"red";reason="Two successful interceptions.";
   } else if(miscommunications.blue>=2||miscommunications.red>=2) {
    winner=miscommunications.blue>=2?"red":"blue";reason="Two decoding mistakes.";
   }
   if(winner)return {...next,phase:"finished",winner,finishReason:reason,interceptions,miscommunications};
   const round=next.round+1;
   const nextCodes={blue:newCode(),red:newCode()};
   return {...next,phase:"clues",round,codes:nextCodes,clues:{},ownGuesses:{},intercepts:{},submitted:{blue:false,red:false},
    clueGiverIndex:{blue:(next.clueGiverIndex.blue+1)%counts.blue.length,red:(next.clueGiverIndex.red+1)%counts.red.length}};
  }
  return state;
 },
 getPrivateState(state,playerId) {
  if(!state)return null;
  const team=state.teams?.[playerId];
  if(!team)return null;
  const privateData={team,words:state.words[team]};
  if(state.phase==="clues"&&teamIds(state)[team][state.clueGiverIndex[team]]===playerId)privateData.code=state.codes[team];
  return privateData;
 },
 getPublicState(state) {
  if(!state)return state;
  return {playerOrder:state.playerOrder,phase:state.phase,round:state.round,teams:state.teams,clues:state.clues,
   submitted:state.submitted,interceptions:state.interceptions,miscommunications:state.miscommunications,
   winner:state.winner,finishReason:state.finishReason,clueGiverIndex:state.clueGiverIndex};
 },
 getStatus(context,state){return state.phase==="finished"?"finished":"active";},
 getResults(context,state){return {outcome:state.phase==="finished"?"complete":"unfinished",winner:state.winner,interceptions:state.interceptions,miscommunications:state.miscommunications};}
};