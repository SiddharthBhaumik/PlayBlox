const SIZE=20, MAX_LIVES=3, MINE_LIFE=4;
const key=(x,y)=>x+","+y;
const xy=k=>k.split(",").map(Number);
const other=id=>id==="blue"?"red":"blue";
const inBounds=(x,y)=>x>=0&&y>=0&&x<SIZE&&y<SIZE;
const manhattan=(a,b)=>{const [x,y]=xy(a),[u,v]=xy(b);return Math.abs(x-u)+Math.abs(y-v)};
function rng(seed){let s=seed>>>0;return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
function shuffled(items,random){const a=items.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function connected(walls,start,goal){const seen=new Set([start]),q=[start];for(let i=0;i<q.length;i++){const [x,y]=xy(q[i]);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=key(nx,ny);if(inBounds(nx,ny)&&!walls.has(k)&&!seen.has(k)){if(k===goal)return true;seen.add(k);q.push(k)}}}return start===goal}
function makeMap(random){
 const blue=key(1,1),red=key(18,18);let walls;
 for(let attempt=0;attempt<40;attempt++){
  walls=new Set();
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
   const k=key(x,y),mirror=key(19-x,19-y);
   if(k>mirror)continue;
   const safe=(x<=3&&y<=3)||(x>=16&&y>=16);
   if(!safe&&random()<0.145){walls.add(k);walls.add(mirror)}
  }
  if(connected(walls,blue,red))break;
  walls.clear();
 }
 const floors=[];for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const k=key(x,y);if(!walls.has(k)&&k!==blue&&k!==red)floors.push(k)}
 const used=new Set([blue,red]);
 function paired(count,type){let made=0;for(const k of shuffled(floors,random)){if(made>=count)break;const [x,y]=xy(k),m=key(19-x,19-y);if(used.has(k)||used.has(m)||walls.has(m))continue;used.add(k);used.add(m);rooms[k]={type,active:true};rooms[m]={type,active:true};made+=2}}
 const rooms={};paired(6,"mine");paired(4,"power");paired(2,"medical");
 return {walls:[...walls],rooms,blue,red,seed:Math.floor(random()*0xffffffff)};
}
function visibleFrom(pos,radius,walls){const [x,y]=xy(pos),out=[];for(let yy=0;yy<SIZE;yy++)for(let xx=0;xx<SIZE;xx++){const k=key(xx,yy);if(Math.abs(xx-x)+Math.abs(yy-y)<=radius)out.push(k)}return out}
function randomPower(random){return ["scan","extra-life","radar","shield","speed","disarm"][Math.floor(random()*6)]}
function generateCode(){return Math.floor(1+Math.random()*6)}
function teamOf(state,id){return state.teams[id]}
function win(state,winner,reason){return {...state,phase:"finished",winner,finishReason:reason,turnPlayerId:null,movementRemaining:0,die:null}}
function updateVisibility(state,team){
 const p=state.positions[team],radius=state.scanTurns[team]>0?40:state.radarTurns[team]>0?3:2;
 const visible=visibleFrom(p,radius,new Set(state.walls));
 const explored={...state.explored,[team]:[...new Set([...(state.explored[team]||[]),...visible])]};
 return {...state,visible:{...state.visible,[team]:visible},explored};
}
function respawnRooms(state,random){
 const rooms={...state.rooms};for(const [k,r] of Object.entries(rooms)){if(!r.active&&r.respawnAt<=state.turnNumber){rooms[k]={...r,active:true,respawnAt:null}}}
 return {...state,rooms};
}
export const minefield={
 id:"minefield",name:"Minefield",description:"Navigate a shifting 20×20 battlefield, plant mines, find hidden flags, and outsmart your rival.",guide:"MINEFIELD · BETA\n\nGOAL: Capture all three enemy flags or reduce your opponent to zero lives. Each player starts with 2 lives.\n\nSETUP: Each player secretly places three flags on valid floor tiles in their own half. Enemy flag locations stay hidden; nearby area hints help you search.\n\nYOUR TURN: Roll the die, then move one tile at a time up to the rolled number. You may stop early. You can also place a mine on an adjacent empty tile and activate a power-up during the same turn. Finish with End turn.\n\nMINES: You start with none. Mine depots grant 1–2 mines. Place them on adjacent empty tiles. Your own mines are always visible to you; enemy mines are hidden until spotted. A mine costs one life and stops movement. Mines expire after four turns.\n\nROOMS: Mine depots refill mines, power rooms grant a random power-up, and medical rooms restore one life (up to 3). Rooms respawn after a random number of turns.\n\nPOWER-UPS: Scan reveals the whole board for 3 of your turns; Extra Life restores a life; Radar expands vision; Shield blocks one mine; Speed adds 2 movement; Disarm removes an adjacent mine.\n\nMAP: Every match creates a different, mirrored 20×20 map with walls and connected routes. Walls and room locations are visible to everyone. Movement, mines, flags, and resources are validated by the server. This is a beta game; rules and balance may change.",emoji:"💣",color:"#f5d9b9",entry:"./src/games/minefield/index.html",players:{min:2,max:2},interactionModel:"turn-based",lateJoinPolicy:"wait",spectators:{supported:true},
 canStart(context){const p=context.players.filter(x=>x.role==="player"&&x.connected);return p.length===2?{ok:true}:{ok:false,reason:"Minefield beta needs exactly two connected players."}},
 createInitialState(context){
  const players=context.players.filter(p=>p.role==="player"&&p.connected);const ids=players.map(p=>p.id),seed=crypto.getRandomValues(new Uint32Array(1))[0],random=rng(seed),map=makeMap(random);
  const teams={[ids[0]]:"blue",[ids[1]]:"red"};
  const state={playerOrder:ids,teams,phase:"flags",round:1,turnNumber:0,turnPlayerId:null,positions:{blue:map.blue,red:map.red},walls:map.walls,rooms:map.rooms,flags:{blue:[],red:[]},flagsPlaced:{blue:false,red:false},captured:{blue:0,red:0},lives:{blue:2,red:2},mines:{blue:0,red:0},activeMines:{},inventory:{blue:[],red:[]},scanTurns:{blue:0,red:0},radarTurns:{blue:0,red:0},shield:{blue:0,red:0},speed:{blue:0,red:0},die:null,movementRemaining:0,rolled:false,movedThisTurn:false,minePlacedThisTurn:false,powerUsedThisTurn:false,visible:{blue:[],red:[]},explored:{blue:[],red:[]},seed:map.seed,lastEvent:"Place three secret flags in your half of the map."};
  return updateVisibility(updateVisibility(state,"blue"),"red");
 },
 onPlayerLeave(context,state,playerId){const left=state?.teams?.[playerId];const playerOrder=(state?.playerOrder||[]).filter(id=>id!==playerId);if(!left)return {...state,playerOrder};const winner=other(left);return {...win({...state,playerOrder},winner,"Your opponent left the match. You win by forfeit."),forfeit:true};},
 validateAction(context,state,action){
  const id=context.player.id,team=state?.teams?.[id];if(!team||!state.playerOrder.includes(id))return {ok:false,reason:"You are not part of this match."};
  if(state.phase==="finished")return {ok:false,reason:"The match has finished."};
  if(state.phase==="flags"){if(action?.type!=="place-flags"||state.flagsPlaced[team])return {ok:false,reason:"Place your three flags once."};if(!Array.isArray(action.flags)||action.flags.length!==3||new Set(action.flags).size!==3)return {ok:false,reason:"Choose three different flag locations."};const walls=new Set(state.walls),occupiedFlags=new Set([...state.flags.blue,...state.flags.red]);for(const k of action.flags){if(typeof k!=="string")return {ok:false,reason:"Invalid flag location."};const [x,y]=xy(k);if(!inBounds(x,y)||walls.has(k)||state.rooms[k]||occupiedFlags.has(k)||manhattan(k,state.positions.blue)<=3||manhattan(k,state.positions.red)<=3)return {ok:false,reason:"Flags must be on open floor, outside both protected bases and rooms."};if(team==="blue"&&x+y>20||team==="red"&&x+y<18)return {ok:false,reason:"Place flags in your own half of the map."}}return {ok:true}}
  if(state.phase!=="playing")return {ok:false,reason:"The match is not ready."};
  if(state.turnPlayerId!==id)return {ok:false,reason:"Wait for your turn."};
  if(action?.type==="roll")return !state.rolled?{ok:true}:{ok:false,reason:"You have already rolled this turn."};
  if(action?.type==="move"){if(!state.rolled||state.movementRemaining<=0)return {ok:false,reason:"Roll first or finish your movement."};const [x,y]=xy(state.positions[team]),[nx,ny]=xy(action.to||"");if(!inBounds(nx,ny)||Math.abs(nx-x)+Math.abs(ny-y)!==1||state.walls.includes(action.to))return {ok:false,reason:"Move one adjacent tile at a time; walls block movement."};if(Object.values(state.positions).includes(action.to))return {ok:false,reason:"That tile is occupied."};return {ok:true}}
  if(action?.type==="place-mine"){if(state.minePlacedThisTurn)return {ok:false,reason:"You have already placed a mine this turn."};if(state.mines[team]<1)return {ok:false,reason:"You don't have a mine to place."};const [x,y]=xy(state.positions[team]),[nx,ny]=xy(action.at||"");if(!inBounds(nx,ny)||Math.abs(nx-x)+Math.abs(ny-y)!==1||state.walls.includes(action.at)||state.rooms[action.at]||Object.values(state.positions).includes(action.at)||state.activeMines[action.at]||manhattan(action.at,state.positions.blue)<=2||manhattan(action.at,state.positions.red)<=2)return {ok:false,reason:"Choose an empty adjacent floor tile outside both protected bases."};return {ok:true}}
  if(action?.type==="activate-power"){if(state.powerUsedThisTurn)return {ok:false,reason:"You have already activated a power-up this turn."};if(!state.inventory[team].includes(action.power))return {ok:false,reason:"You don't have that power-up."};if(action.power==="disarm"){const [x,y]=xy(state.positions[team]),[nx,ny]=xy(action.at||"");if(Math.abs(nx-x)+Math.abs(ny-y)!==1||!state.activeMines[action.at])return {ok:false,reason:"Choose an adjacent active mine to disarm."}}return {ok:true}}
  if(action?.type==="end-turn")return {ok:true};
  return {ok:false,reason:"Unknown Minefield action."};
 },
 reduceAction(context,state,action){
  const team=state.teams[context.player.id],random=rng((state.seed+state.turnNumber*997+state.round*37)>>>0);
  if(action.type==="place-flags"){const flags={...state.flags,[team]:action.flags.slice()};const flagsPlaced={...state.flagsPlaced,[team]:true};const next={...state,flags,flagsPlaced};if(flagsPlaced.blue&&flagsPlaced.red){next.phase="playing";next.turnPlayerId=state.playerOrder[0];next.lastEvent="Both players placed their flags. Blue takes the first turn."}return updateVisibility(next,team)}
  if(action.type==="roll"){const die=Math.floor(random()*6)+1,bonus=state.speed[team]>0?2:0;return {...state,die,movementRemaining:die+bonus,rolled:true,movedThisTurn:false,lastEvent:"Rolled "+die+(bonus? " (+2 speed bonus)":"")+". Move up to "+(die+bonus)+" tiles."}}
  if(action.type==="move"){
   const positions={...state.positions,[team]:action.to},activeMines={...state.activeMines},rooms={...state.rooms},lives={...state.lives},mines={...state.mines},inventory={...state.inventory},captured={...state.captured};let remaining=state.movementRemaining-1,lastEvent="Moved to "+action.to+".";
   if(activeMines[action.to]){const mine=activeMines[action.to];delete activeMines[action.to];if(state.shield[team]>0){const shield={...state.shield,[team]:state.shield[team]-1};return updateVisibility({...state,positions,activeMines,shield,movementRemaining:0,movedThisTurn:true,lastEvent:"Your shield absorbed a mine!"},team)}lives[team]=Math.max(0,lives[team]-1);remaining=0;lastEvent="BOOM! A mine cost you one life and stopped your movement."}
   if(lives[team]<=0)return win({...state,positions,activeMines,lives,movementRemaining:0,movedThisTurn:true},other(team),"Your opponent lost all their lives.");\n   const enemy=other(team),hit=(state.flags[enemy]||[]).includes(action.to);if(hit){captured[team]++;const flags={...state.flags,[enemy]:state.flags[enemy].filter(k=>k!==action.to)};if(captured[team]>=3)return win({...state,positions,activeMines,flags,captured,lives,movementRemaining:0,movedThisTurn:true},""+team,"All three enemy flags captured!");return updateVisibility({...state,positions,activeMines,flags,captured,lives,movementRemaining:0,movedThisTurn:true,lastEvent:"You captured an enemy flag!"},team)}
   if(lives[team]<=0)return win({...state,positions,activeMines,lives,movementRemaining:0,movedThisTurn:true},enemy,"Your opponent lost all their lives.");
   const room=rooms[action.to];if(room?.active){if(room.type==="mine"){mines[team]=Math.min(3,mines[team]+(Math.floor(random()*2)+1));lastEvent="Mine depot! You collected mines."}if(room.type==="power"){const power=randomPower(random);if(inventory[team].length<2)inventory[team]=[...inventory[team],power];lastEvent="Power room! You found "+power+"."}if(room.type==="medical"){lives[team]=Math.min(MAX_LIVES,lives[team]+1);lastEvent="Medical room! You recovered one life."}rooms[action.to]={...room,active:false,respawnAt:state.turnNumber+Math.floor(random()*4)+3}}
   let next={...state,positions,activeMines,rooms,lives,mines,inventory,captured,movementRemaining:remaining,movedThisTurn:true,lastEvent};return updateVisibility(next,team);
  }
  if(action.type==="place-mine"){const activeMines={...state.activeMines,[action.at]:{owner:team,turns:MINE_LIFE}};return {...state,activeMines,mines:{...state.mines,[team]:state.mines[team]-1},minePlacedThisTurn:true,lastEvent:"Mine placed at "+action.at+". You can always see your own mines."}}
  if(action.type==="activate-power"){
   const inventory={...state.inventory,[team]:state.inventory[team].filter((p,i)=>p!==action.power||state.inventory[team].indexOf(p)!==i)},scanTurns={...state.scanTurns},radarTurns={...state.radarTurns},lives={...state.lives},shield={...state.shield},speed={...state.speed},activeMines={...state.activeMines};let lastEvent="Activated "+action.power+".";
   if(action.power==="scan")scanTurns[team]=3;if(action.power==="radar")radarTurns[team]=3;if(action.power==="extra-life")lives[team]=Math.min(MAX_LIVES,lives[team]+1);if(action.power==="shield")shield[team]=1;if(action.power==="speed")speed[team]=1;if(action.power==="disarm"){delete activeMines[action.at];lastEvent="You disarmed an adjacent mine."}
   return updateVisibility({...state,inventory,scanTurns,radarTurns,lives,shield,speed,activeMines,powerUsedThisTurn:true,lastEvent},team);
  }
  if(action.type==="end-turn"){
   const activeMines={};for(const [k,m] of Object.entries(state.activeMines)){const turns=m.turns-1;if(turns>0)activeMines[k]={...m,turns}}
   const nextTeam=other(team),turnNumber=state.turnNumber+1,round=nextTeam==="blue"?state.round+1:state.round;
   let next={...state,activeMines,turnNumber,round,turnPlayerId:nextTeam,die:null,movementRemaining:0,rolled:false,movedThisTurn:false,minePlacedThisTurn:false,powerUsedThisTurn:false,speed:{...state.speed,[team]:0},scanTurns:{...state.scanTurns,[team]:Math.max(0,(state.scanTurns[team]||0)-1)},radarTurns:{...state.radarTurns,[team]:Math.max(0,(state.radarTurns[team]||0)-1)},lastEvent:"Turn passed to "+nextTeam+"."};
   next=respawnRooms(next,random);return updateVisibility(updateVisibility(next,team),nextTeam);
  }
  return state;
 },
 getPrivateState(state,playerId){
  const team=state.teams?.[playerId];if(!team)return null;const enemy=other(team),pos=state.positions[team],visible=new Set(state.visible[team]||[]),enemyPos=state.positions[enemy];
  const enemyFlags=state.flags[enemy]||[],hints=enemyFlags.map(flag=>({nearby:manhattan(flag,pos)<=4,area:xy(flag)[0]<10?"west":"east"}));
  const mines=Object.entries(state.activeMines).filter(([k,m])=>m.owner===team||visible.has(k)).map(([at,m])=>({at,owner:m.owner,turns:m.turns}));
  return {team,position:pos,enemyPosition:visible.has(enemyPos)?enemyPos:null,flags:state.flags[team],enemyFlagHints:hints,visible:[...(state.visible[team]||[])],explored:[...(state.explored[team]||[])],mines,turnPlayerId:state.turnPlayerId,die:state.die,movementRemaining:state.movementRemaining,rolled:state.rolled,inventory:state.inventory[team],minesCarried:state.mines[team],lives:state.lives,scanTurns:state.scanTurns[team],radarTurns:state.radarTurns[team],shield:state.shield[team],captured:state.captured};
 },
 getPublicState(state){if(!state)return state;return {playerOrder:state.playerOrder,phase:state.phase,round:state.round,turnNumber:state.turnNumber,turnPlayerId:state.turnPlayerId,walls:state.walls,rooms:state.rooms,flagsPlaced:state.flagsPlaced,captured:state.captured,lives:state.lives,die:state.die,movementRemaining:state.movementRemaining,rolled:state.rolled,lastEvent:state.lastEvent,seed:state.seed,positionsVisible:state.visible,};},
 getStatus(context,state){return state.phase==="finished"?"finished":"active"},
 getResults(context,state){return {outcome:state.winner?"winner":"unfinished",winner:state.winner,finishReason:state.finishReason,captured:state.captured,lives:state.lives}}
};
