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
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function renderPlayers(room) {
  let list = $('party-players');
  if (!list) {
    list = document.createElement('div');
    list.id = 'party-players';
    list.className = 'party-players';
    $('room-code').insertAdjacentElement('afterend', list);
  }
  list.replaceChildren();
  const count = document.createElement('p');
  count.className = 'dialog-note';
  count.textContent = `Players: ${room.playerCount}/${room.playerCap}`;
  const names = document.createElement('p');
  names.textContent = room.players.map(p => p.nickname + (p.isHost ? ' (host)' : '')).join(' · ');
  list.append(count, names);
}

function connectRoom(code, token) {
  if (roomSocket) roomSocket.close();
  if (!API_BASE_URL) return;
  roomSocket = new WebSocket(API_BASE_URL.replace(/^http/, 'ws') +
    `/api/rooms/${encodeURIComponent(code)}/ws?token=${encodeURIComponent(token)}`);
  roomSocket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (['room-snapshot', 'room-updated'].includes(message.type) && message.room) renderPlayers(message.room);
  });
}

function openParty({ room, token, hostName = '' }) {
  $('room-code').textContent = room.code;
  $('dialog-title').textContent = room.name || 'Your party is ready!';
  $('dialog-description').textContent = hostName
    ? `Nice one, ${hostName}! Share this invite with your friends.`
    : 'You joined the party! Share the invite link with other friends.';
  $('copy-invite').textContent = '📋 Copy invite link';
  $('copy-invite').dataset.inviteUrl = new URL('./?party=' + encodeURIComponent(room.code), location.href).href;
  renderPlayers(room);
  $('party-dialog').showModal();
  connectRoom(room.code, token);
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
    openParty({ room: result.room, token: result.playerToken, hostName });
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
    const result = await api('/api/rooms/' + encodeURIComponent(code) + '/join', {
      method: 'POST', body: JSON.stringify({ nickname }),
    });
    sessionStorage.setItem('playblox:' + result.room.code + ':token', result.playerToken);
    feedback('join-feedback', 'You joined the party!', true);
    openParty({ room: result.room, token: result.playerToken });
  } catch (error) {
    feedback('join-feedback', error.message);
  } finally { button.disabled = false; }
});

$('copy-invite').addEventListener('click', async () => {
  const url = $('copy-invite').dataset.inviteUrl || '';
  try {
    await navigator.clipboard.writeText(url);
    $('copy-invite').textContent = '✅ Invite link copied!';
  } catch { window.prompt('Copy your party invite link:', url); }
});
function closePartyDialog() {
  if (roomSocket) { roomSocket.close(); roomSocket = null; }
  $('party-dialog').close();
}
$('close-dialog').addEventListener('click', closePartyDialog);
$('party-dialog').addEventListener('click', event => {
  if (event.target === $('party-dialog')) closePartyDialog();
});

const incomingCode = new URLSearchParams(location.search).get('party');
if (incomingCode) {
  $('invite-code').value = incomingCode;
  $('join-party-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
}
