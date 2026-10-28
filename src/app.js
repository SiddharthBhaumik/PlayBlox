import { renderGameCards, gameRegistry } from './games/registry.js';

const $ = (id) => document.getElementById(id);
const API_BASE_URL = window.PLAYBLOX_API_BASE_URL
  || (['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8787'
    : 'https://playblox-party-service.playblox-party.workers.dev');
let roomSocket = null;
let socketGeneration = 0;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let leavingLobby = false;
let explicitlyReturningToLobby = new URLSearchParams(location.search).get('lobby') === '1';

$('year').textContent = new Date().getFullYear();
renderGameCards($('games-grid'), gameRegistry);
let selectedGameId = null;
function selectedGame() { return gameRegistry.find(game => game.id === selectedGameId && game.status === 'ready' && game.players); }
function renderGameChoices(room = latestLobbyRoom) {
  const container = $('lobby-game-select');
  if (!container) return;
  const playable = gameRegistry.filter(game => game.status === 'ready' && game.players && game.guide);
  const me = room?.players?.find(player => player.id === activePlayerId);
  const hostView = Boolean(me?.isHost) && room?.lifecycle === 'lobby';
  const connectedPlayers = (room?.players || []).filter(player =>
    player.connected && player.role !== 'spectator' && player.role !== 'waiting'
  ).length;
  container.replaceChildren(...playable.map(game => {
    const card = document.createElement('button');
    card.type = 'button';
    const needsMorePlayers = connectedPlayers < game.players.min;
    card.className = 'lobby-game-choice' + (selectedGameId === game.id ? ' is-selected' : '') + (needsMorePlayers ? ' needs-more-players' : '');
    card.disabled = !hostView || needsMorePlayers;
    card.setAttribute('aria-pressed', String(selectedGameId === game.id));
    card.style.setProperty('--game-color', game.color || '#e8e0ff');
    const emoji = document.createElement('span'); emoji.className = 'lobby-game-choice-emoji'; emoji.textContent = game.emoji || '🎮';
    const title = document.createElement('strong'); title.textContent = game.name;
    const desc = document.createElement('small'); desc.textContent = game.description || 'A party game';
    const limits = document.createElement('small'); limits.className = 'game-choice-limits'; limits.textContent = game.players.min === game.players.max ? game.players.min + ' players' : game.players.min + '–' + game.players.max + ' players';
    const status = document.createElement('span'); status.className = 'game-choice-status';
    status.textContent = needsMorePlayers
      ? 'Need ' + (game.players.min - connectedPlayers) + ' more connected player' + (game.players.min - connectedPlayers === 1 ? '' : 's')
      : selectedGameId === game.id ? '✓ Selected by host' : (hostView ? 'Choose game' : 'Not selected');
    card.append(emoji,title,desc,limits,status);
    card.addEventListener('click', async () => {
      if (!hostView || !activeRoomCode || !activePlayerToken) return;
      selectedGameId = game.id;
      renderGameChoices(room);
      selectedParticipantIds = new Set();
      renderParticipantPicker(room);
      try {
        await api('/api/rooms/' + encodeURIComponent(activeRoomCode) + '/game/select', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + activePlayerToken },
          body: JSON.stringify({ gameId: game.id }),
        });
      } catch (error) { gameFeedback(error.message); }
    });
    return card;
  }));
  const chosen = gameRegistry.find(game => game.id === (selectedGameId || room?.selectedGameId));
  $('selected-game-summary').textContent = chosen ? '🎯 Host selected: ' + chosen.name + ' — ' + chosen.description : 'The host has not selected a game yet.';
  $('start-game').hidden = Boolean(me && !me.isHost);
  $('start-game').disabled = !hostView || !selectedGame();
  if (!playable.length) gameFeedback('No playable games with guides are registered yet.');
}

function feedback(id, message, success = false) {
  const node = $(id);
  node.textContent = message;
  node.classList.toggle('success', success);
  node.classList.add('visible');
}

async function api(path, options = {}) {
  if (!API_BASE_URL) throw new Error('The multiplayer service is not configured on the live site yet.');
  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
    });
  } catch {
    throw new Error('Could not reach the party service. Please try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 405 && /\/game\/select$/.test(path)
      ? 'The multiplayer service rejected game selection (405). Deploy the latest worker version, then refresh the lobby.'
      : (data.error || 'Something went wrong. Please try again.');
    const error = new Error(message); error.status = response.status; throw error;
  }
  return data;
}

let lastRoomPlayers = null;
let latestLobbyRoom = null;
let selectedParticipantIds = new Set();
let activeRoomCode = null;
let activePlayerToken = null;
let activePlayerId = null;
function gameFeedback(message, success = false) {
  const node = $('game-launch-feedback');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('success', success);
}
function openActiveGame(gameId) {
  const game = gameRegistry.find(entry => entry.id === gameId && entry.status === 'ready');
  if (!game?.path || !activeRoomCode) return;
  const url = new URL(game.path, location.href);
  url.searchParams.set('party', activeRoomCode);
  location.href = url.href;
}
function addLobbyActivity(message) {
  const feed = $('lobby-activity'); if (!feed) return;
  const item = document.createElement('li'); item.textContent = message; feed.prepend(item);
  while (feed.children.length > 8) feed.lastElementChild.remove();
}
function renderLobbyHistory(room) {
  const feed = $('lobby-activity'); if (!feed || !Array.isArray(room.history)) return;
  feed.replaceChildren(...room.history.slice(-20).reverse().map(entry => {
    const item = document.createElement('li');
    const when = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    item.textContent = when + ' · ' + (entry.message || entry.type || 'Lobby activity');
    return item;
  }));
}
function renderPlayers(room) {
  latestLobbyRoom = room;
  selectedGameId = room.selectedGameId || null;
  renderLobbyHistory(room);
  const me = room.players.find(player => player.id === activePlayerId);
  $('start-game').hidden = Boolean(me && !me.isHost);
  // Hosts may leave too; the server transfers ownership to a remaining member.
  $('leave-lobby').hidden = !me;
  $('lobby-player-count').textContent = `${room.playerCount}/${room.playerCap} players`;
  const list = $('lobby-players'); list.replaceChildren();
  room.players.forEach(player => {
    const item=document.createElement('li'); item.className='lobby-player';
    const avatar=document.createElement('span'); avatar.className='player-avatar'; avatar.textContent=[...player.nickname][0]?.toUpperCase()||'?';
    const details=document.createElement('span'); details.className='player-details';
    const name=document.createElement('strong'); name.textContent=player.nickname;
    const role=document.createElement('small'); role.textContent=player.isHost?'HOST':(player.role||'player').toUpperCase();
    const presence=document.createElement('small'); presence.className='player-presence';
    presence.textContent=player.connected===false?'Reconnecting…':'Connected';
    presence.classList.toggle('offline',player.connected===false);
    details.append(name,role,presence); item.append(avatar,details);
    if(player.isHost){const badge=document.createElement('span');badge.className='host-badge';badge.textContent='👑 Host';item.append(badge);}
    list.append(item);
  });
  if(lastRoomPlayers){
    const prev=new Set(lastRoomPlayers.map(p=>p.id)), curr=new Set(room.players.map(p=>p.id));
    room.players.filter(p=>!prev.has(p.id)).forEach(p=>addLobbyActivity(`✨ ${p.nickname} joined the lobby`));
    lastRoomPlayers.filter(p=>!curr.has(p.id)).forEach(p=>addLobbyActivity(`👋 ${p.nickname} left the lobby`));
  }
  lastRoomPlayers=room.players.map(p=>({...p}));
  renderGameChoices(room);
  renderParticipantPicker(room);
}
function renderParticipantPicker(room) {
  const panel = $('participant-picker');
  const list = $('participant-list');
  if (!panel || !list) return;
  const me = room.players.find(player => player.id === activePlayerId);
  const hostView = Boolean(me?.isHost) && room.lifecycle === 'lobby';
  panel.hidden = !hostView;
  if (!hostView) return;
  const game = gameRegistry.find(entry => entry.id === (room.selectedGameId || selectedGameId) && entry.status === 'ready');
  if (!game?.players) { panel.hidden = true; list.replaceChildren(); $('start-game').disabled = true; return; }
  const max = Math.min(game.players.max, room.playerCap || 8);
  const min = game.players.min;
  const eligible = room.players.filter(player => player.connected && player.role !== 'spectator' && player.role !== 'waiting');
  const eligibleIds = new Set(eligible.map(player => player.id));
  selectedParticipantIds = new Set([...selectedParticipantIds].filter(id => eligibleIds.has(id)));
  if (selectedParticipantIds.size === 0) eligible.slice(0, max).forEach(player => selectedParticipantIds.add(player.id));
  $('participant-picker-help').textContent = `Select ${min}–${max} connected player${max === 1 ? '' : 's'}. ${game.spectators?.supported ? 'Unselected players can watch this game.' : 'Unselected players will stay in the lobby.'}`;
  list.replaceChildren(...room.players.map(player => {
    const label = document.createElement('label');
    label.className = 'participant-option' + (player.connected ? '' : ' is-unavailable');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedParticipantIds.has(player.id);
    checkbox.disabled = !player.connected || (!checkbox.checked && selectedParticipantIds.size >= max);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedParticipantIds.add(player.id);
      else selectedParticipantIds.delete(player.id);
      renderParticipantPicker(room);
    });
    const text = document.createElement('span');
    const name = document.createElement('strong'); name.textContent = player.nickname + (player.isHost ? ' · Host' : '');
    const note = document.createElement('small');
    note.textContent = !player.connected ? 'Reconnecting — unavailable' : selectedParticipantIds.has(player.id) ? 'Selected to play' : (game.spectators?.supported ? 'Will spectate' : 'Will wait in lobby');
    text.append(name, note); label.append(checkbox, text); return label;
  }));
  const count = selectedParticipantIds.size;
  $('start-game').disabled = count < min || count > max;
  gameFeedback(count < min ? `Choose at least ${min} connected players.` : count > max ? `Choose at most ${max} players.` : `${count} of up to ${max} players selected.`);
}

function clearSocketTimers(){
  if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null;}
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
}
function connectRoom(code,token){
  const generation=++socketGeneration;
  clearSocketTimers();
  if(roomSocket){const previous=roomSocket;roomSocket=null;previous.close();}
  if(!API_BASE_URL)return;
  leavingLobby=false;
  const connect=()=>{
    if(generation!==socketGeneration||leavingLobby||activeRoomCode!==code)return;
    $('lobby-connection').textContent=reconnectAttempt?'Reconnecting to the party…':'Connecting to live lobby…';
    const socket=new WebSocket(API_BASE_URL.replace(/^http/,'ws')+`/api/rooms/${encodeURIComponent(code)}/ws?token=${encodeURIComponent(token)}`);
    roomSocket=socket;
    socket.addEventListener('message',event=>{
      if(generation!==socketGeneration||socket!==roomSocket)return;
      let message;try{message=JSON.parse(event.data)}catch{return}
      if(message.type==='room-snapshot'&&message.playerId)activePlayerId=message.playerId;
      if(['room-snapshot','room-updated','game-started','game-guide','guide-progress'].includes(message.type)&&message.room)renderPlayers(message.room);
      if(message.type==='room-snapshot'&&message.room?.lifecycle==='lobby'){
        // The lobby flag prevents redirecting back into the old round only on arrival.
        // Once the reset is confirmed, the host must be able to open the next round.
        explicitlyReturningToLobby = false;
      }
      if(message.type==='room-snapshot'&&message.room?.lifecycle&&message.room.lifecycle!=='lobby'&&message.room.gameId){
        const me=message.room.players.find(p=>p.id===activePlayerId);
        if(!explicitlyReturningToLobby&&(me?.role==='player'||me?.role==='spectator')) openActiveGame(message.room.gameId);
        else $('lobby-connection').textContent='Game in progress · you are waiting for the next round';
      }
      if(message.type==='game-guide'){
        const me=message.room?.players.find(p=>p.id===activePlayerId);
        if(me?.role==='player'||me?.role==='spectator') openActiveGame(message.room?.gameId);
      }
      if(message.type==='game-started'){
        addLobbyActivity('🎮 '+(message.room?.game?.name||'A game')+' started');
        $('lobby-connection').textContent='Game in progress · opening game…';
        const me=message.room?.players.find(p=>p.id===activePlayerId);
        if(!explicitlyReturningToLobby&&(me?.role==='player'||me?.role==='spectator')) openActiveGame(message.room?.gameId);
        else $('lobby-connection').textContent='Game in progress · you are waiting for the next round';
      }
      if(message.type==='game-state'){
        // Game-specific screens subscribe to the same shared state event.
        window.dispatchEvent(new CustomEvent('playblox:game-state',{detail:message}));
      }
      if(message.type==='error'&&/session/i.test(message.message||'')){
        $('lobby-connection').textContent='Session expired — please rejoin the party.';
        $('lobby-connection').classList.add('offline');
      }
    });
    socket.addEventListener('open',()=>{
      if(generation!==socketGeneration||socket!==roomSocket)return;
      reconnectAttempt=0;
      $('lobby-connection').textContent='Live · updates appear automatically';
      $('lobby-connection').classList.remove('offline');
      if(heartbeatTimer)clearInterval(heartbeatTimer);
      heartbeatTimer=setInterval(()=>{
        if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping'}));
      },15000);
    });
    socket.addEventListener('close',()=>{
      if(generation!==socketGeneration||socket!==roomSocket||leavingLobby)return;
      if(heartbeatTimer){clearInterval(heartbeatTimer);heartbeatTimer=null;}
      $('lobby-connection').textContent='Connection interrupted · trying to reconnect…';
      $('lobby-connection').classList.add('offline');
      reconnectAttempt++;
      const delay=Math.min(15000,1000*Math.pow(2,Math.min(reconnectAttempt-1,4)));
      reconnectTimer=setTimeout(connect,delay);
    });
    socket.addEventListener('error',()=>{try{socket.close();}catch{}});
  };
  connect();
}
function openParty({room,token}){
  activeRoomCode=room.code;activePlayerToken=token;activePlayerId=null;lastRoomPlayers=null;
  $('lobby-title').textContent=room.name||'Party lobby';$('lobby-code').textContent=room.code;
  $('lobby-invite').dataset.inviteUrl=new URL('./?party='+encodeURIComponent(room.code),location.href).href;
  $('lobby-activity').replaceChildren();addLobbyActivity('🎉 Lobby opened — invite your friends to join!');
  renderPlayers(room);
  const noticeKey='playblox:'+room.code+':notice';
  const notice=sessionStorage.getItem(noticeKey);
  if(notice){addLobbyActivity('📣 '+notice);sessionStorage.removeItem(noticeKey);}
  document.querySelectorAll('[data-home-section]').forEach(s=>s.hidden=true);
  $('lobby-screen').hidden=false;window.scrollTo({top:0,behavior:'smooth'});connectRoom(room.code,token);
}

$('create-party-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const hostName = $('host-name').value.trim();
  const partyName = $('party-name').value.trim() || hostName + "'s Party";
  if (!hostName) return;
  button.disabled = true;
  try {
    const result = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ hostName, partyName }) });
    sessionStorage.setItem('playblox:' + result.room.code + ':token', result.playerToken);
    sessionStorage.setItem('playblox:' + result.room.code + ':nickname', hostName);
    feedback('create-feedback', 'Your party is ready!', true);
    openParty({ room: result.room, token: result.playerToken });
  } catch (error) {
    feedback('create-feedback', error.message);
  } finally { button.disabled = false; }
});

$('join-party-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const nickname = $('guest-name').value.trim();
  const raw = $('invite-code').value.trim();
  if (!nickname || !raw) return;
  let code = raw.toUpperCase();
  try {
    const url = new URL(raw);
    if (url.searchParams.has('party')) code = url.searchParams.get('party').toUpperCase();
  } catch { /* Plain code input. */ }
  code = code.replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    feedback('join-feedback', 'Please enter a valid six-character party code or invite link.');
    return;
  }
  button.disabled = true;
  try {
    const tokenKey = 'playblox:' + code + ':token';
    const existingToken = sessionStorage.getItem(tokenKey);
    let result;
    try {
      result = await api('/api/rooms/' + encodeURIComponent(code) + '/join', { method:'POST',
        body:JSON.stringify({nickname,...(existingToken?{playerToken:existingToken}:{})}) });
    } catch(error) {
      if(error.status!==401||!existingToken) throw error;
      sessionStorage.removeItem(tokenKey);
      result=await api('/api/rooms/'+encodeURIComponent(code)+'/join',{method:'POST',body:JSON.stringify({nickname})});
    }
    sessionStorage.setItem(tokenKey,result.playerToken);
    sessionStorage.setItem('playblox:' + code + ':nickname', nickname);
    feedback('join-feedback',result.reused?'Welcome back to your lobby!':'You joined the party!',true);
    openParty({room:result.room,token:result.playerToken});
  } catch (error) {
    feedback('join-feedback', error.message);
  } finally { button.disabled = false; }
});

async function copyInvite(button){const url=button.dataset.inviteUrl||'';try{await navigator.clipboard.writeText(url);button.textContent='✅ Invite link copied!';}catch{window.prompt('Copy your party invite link:',url);}}
$('lobby-invite').addEventListener('click',()=>copyInvite($('lobby-invite')));

$('start-game').addEventListener('click', async () => {
  if (!activeRoomCode || !activePlayerToken) return;
  const button = $('start-game');
  button.disabled = true;
  gameFeedback('Starting game…');
  try {
    const gameId = latestLobbyRoom?.selectedGameId || selectedGameId;
    if (!gameId) throw new Error('Choose a game first.');
    await api('/api/rooms/' + encodeURIComponent(activeRoomCode) + '/game/start', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + activePlayerToken },
      body: JSON.stringify({ gameId, selectedPlayerIds: [...selectedParticipantIds] }),
    });
    // The server broadcasts game-started to every connected player, including this host.
    gameFeedback('Game starting!', true);
  } catch (error) {
    gameFeedback(error.message);
  } finally {
    button.disabled = false;
  }
});

$('leave-lobby').addEventListener('click',async()=>{
 const code=activeRoomCode,token=activePlayerToken;if(!code||!token)return returnToPlayground();
 const button=$('leave-lobby');button.disabled=true;
 try {
   await api('/api/rooms/'+encodeURIComponent(code)+'/leave',{method:'POST',headers:{Authorization:'Bearer '+token}});
   sessionStorage.removeItem('playblox:'+code+':token');
   sessionStorage.removeItem('playblox:'+code+':nickname');
   leavingLobby=true;socketGeneration++;clearSocketTimers();
   if(roomSocket){roomSocket.close();roomSocket=null;}
   returnToPlayground();
 } catch(error) {
   addLobbyActivity('⚠️ Could not leave the party: '+error.message);
   button.disabled=false;
 }
});
function returnToPlayground(){leavingLobby=true;socketGeneration++;clearSocketTimers();if(roomSocket){roomSocket.close();roomSocket=null;}activeRoomCode=null;activePlayerToken=null;activePlayerId=null;lastRoomPlayers=null;
 // Status messages belong to the current create/join attempt, not the homepage forever.
 ['create-feedback','join-feedback'].forEach(id=>{const node=$(id);if(node){node.textContent='';node.classList.remove('visible','success');}});
 $('lobby-screen').hidden=true;document.querySelectorAll('[data-home-section]').forEach(s=>s.hidden=false);window.scrollTo({top:0,behavior:'smooth'});}


const incomingCode = new URLSearchParams(location.search).get('party');
if (incomingCode) {
  const code = incomingCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const savedToken = sessionStorage.getItem('playblox:' + code + ':token');
  const savedNickname = sessionStorage.getItem('playblox:' + code + ':nickname');
  if (/^[A-Z0-9]{6}$/.test(code) && savedToken && savedNickname) {
    api('/api/rooms/' + encodeURIComponent(code) + '/join', {
      method: 'POST',
      body: JSON.stringify({ nickname: savedNickname, playerToken: savedToken }),
    }).then(async result => {
      // When the host explicitly returns from an active game, reset the shared game
      // before opening the lobby. Otherwise the lobby loads correctly but the server
      // still considers the old game active, so starting another game fails.
      if (explicitlyReturningToLobby && result.room?.lifecycle !== 'lobby'
          && result.playerId === result.room?.hostId) {
        await api('/api/rooms/' + encodeURIComponent(code) + '/game/reset', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + result.playerToken },
          body: JSON.stringify({}),
        });
        result = await api('/api/rooms/' + encodeURIComponent(code) + '/join', {
          method: 'POST',
          body: JSON.stringify({ nickname: savedNickname, playerToken: savedToken }),
        });
      }
      openParty({ room: result.room, token: result.playerToken });
    })
      .catch(() => {
        $('invite-code').value = incomingCode;
        $('join-party-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
  } else {
    $('invite-code').value = incomingCode;
    $('join-party-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}
