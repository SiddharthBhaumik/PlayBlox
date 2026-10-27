import { renderGameCards, gameRegistry } from './games/registry.js';

const $ = (id) => document.getElementById(id);
const API_BASE_URL = window.PLAYBLOX_API_BASE_URL
  || (['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://localhost:8787'
    : 'https://playblox-party-service.playblox-party.workers.dev');
let roomSocket = null;

$('year').textContent = new Date().getFullYear();
renderGameCards($('games-grid'), gameRegistry);

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
  if (!response.ok) { const error = new Error(data.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
  return data;
}

let lastRoomPlayers = null;
let activeRoomCode = null;
let activePlayerToken = null;
function addLobbyActivity(message) {
  const feed = $('lobby-activity'); if (!feed) return;
  const item = document.createElement('li'); item.textContent = message; feed.prepend(item);
  while (feed.children.length > 8) feed.lastElementChild.remove();
}
function renderPlayers(room) {
  $('lobby-player-count').textContent = `${room.playerCount}/${room.playerCap} players`;
  const list = $('lobby-players'); list.replaceChildren();
  room.players.forEach(player => {
    const item=document.createElement('li'); item.className='lobby-player';
    const avatar=document.createElement('span'); avatar.className='player-avatar'; avatar.textContent=[...player.nickname][0]?.toUpperCase()||'?';
    const details=document.createElement('span'); details.className='player-details';
    const name=document.createElement('strong'); name.textContent=player.nickname;
    const role=document.createElement('small'); role.textContent=player.isHost?'HOST':'PLAYER';
    details.append(name,role); item.append(avatar,details);
    if(player.isHost){const badge=document.createElement('span');badge.className='host-badge';badge.textContent='👑 Host';item.append(badge);}
    list.append(item);
  });
  if(lastRoomPlayers){
    const prev=new Set(lastRoomPlayers.map(p=>p.id)), curr=new Set(room.players.map(p=>p.id));
    room.players.filter(p=>!prev.has(p.id)).forEach(p=>addLobbyActivity(`✨ ${p.nickname} joined the lobby`));
    lastRoomPlayers.filter(p=>!curr.has(p.id)).forEach(p=>addLobbyActivity(`👋 ${p.nickname} left the lobby`));
  }
  lastRoomPlayers=room.players.map(p=>({...p}));
}
function connectRoom(code,token){
  if(roomSocket) roomSocket.close(); if(!API_BASE_URL)return;
  roomSocket=new WebSocket(API_BASE_URL.replace(/^http/,'ws')+`/api/rooms/${encodeURIComponent(code)}/ws?token=${encodeURIComponent(token)}`);
  roomSocket.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data)}catch{return}
    if(['room-snapshot','room-updated'].includes(message.type)&&message.room)renderPlayers(message.room);});
  roomSocket.addEventListener('open',()=>{$('lobby-connection').textContent='Live · updates appear automatically';$('lobby-connection').classList.remove('offline');});
  roomSocket.addEventListener('close',()=>{if(activeRoomCode===code){$('lobby-connection').textContent='Connection closed — the host may have ended the party.';$('lobby-connection').classList.add('offline');}});
}
function openParty({room,token}){
  activeRoomCode=room.code;activePlayerToken=token;lastRoomPlayers=null;
  $('lobby-title').textContent=room.name||'Party lobby';$('lobby-code').textContent=room.code;
  $('lobby-invite').dataset.inviteUrl=new URL('./?party='+encodeURIComponent(room.code),location.href).href;
  $('lobby-activity').replaceChildren();addLobbyActivity('🎉 Lobby opened — invite your friends to join!');
  renderPlayers(room);document.querySelectorAll('[data-home-section]').forEach(s=>s.hidden=true);
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
    feedback('join-feedback',result.reused?'Welcome back to your lobby!':'You joined the party!',true);
    openParty({room:result.room,token:result.playerToken});
  } catch (error) {
    feedback('join-feedback', error.message);
  } finally { button.disabled = false; }
});

async function copyInvite(button){const url=button.dataset.inviteUrl||'';try{await navigator.clipboard.writeText(url);button.textContent='✅ Invite link copied!';}catch{window.prompt('Copy your party invite link:',url);}}
$('lobby-invite').addEventListener('click',()=>copyInvite($('lobby-invite')));
$('leave-lobby').addEventListener('click',async()=>{
 const code=activeRoomCode,token=activePlayerToken;if(!code||!token)return returnToPlayground();
 const button=$('leave-lobby');button.disabled=true;
 try{await api('/api/rooms/'+encodeURIComponent(code)+'/leave',{method:'POST',headers:{Authorization:'Bearer '+token}});}
 catch(error){addLobbyActivity('⚠️ '+error.message);}
 finally{sessionStorage.removeItem('playblox:'+code+':token');if(roomSocket){roomSocket.close();roomSocket=null;}button.disabled=false;returnToPlayground();}
});
function returnToPlayground(){if(roomSocket){roomSocket.close();roomSocket=null;}activeRoomCode=null;activePlayerToken=null;lastRoomPlayers=null;
 $('lobby-screen').hidden=true;document.querySelectorAll('[data-home-section]').forEach(s=>s.hidden=false);window.scrollTo({top:0,behavior:'smooth'});}


const incomingCode = new URLSearchParams(location.search).get('party');
if (incomingCode) {
  $('invite-code').value = incomingCode;
  $('join-party-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
}
