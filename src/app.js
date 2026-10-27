/**
 * PlayBlox lobby behaviour.
 * Keep the lobby independent from individual games. Game metadata and future
 * launch handlers belong in src/games/registry.js, not in this file.
 */
import { renderGameCards, gameRegistry } from './games/registry.js';

const $ = (id) => document.getElementById(id);
$('year').textContent = new Date().getFullYear();
renderGameCards($('games-grid'), gameRegistry);

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function openPartyDialog({ code, partyName, hostName }) {
  const inviteUrl = new URL('./?party=' + encodeURIComponent(code), window.location.href).href;
  $('room-code').textContent = code;
  $('dialog-title').textContent = 'Your party is ready!';
  $('dialog-description').textContent = 'Nice one, ' + hostName + '! “' + partyName + '” has a preview invite code to share.';
  $('copy-invite').textContent = '📋 Copy invite link';
  $('copy-invite').dataset.inviteUrl = inviteUrl;
  $('party-dialog').showModal();
}

function showFeedback(id, message, success = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle('success', success);
  element.classList.add('visible');
}

$('create-party-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const hostName = $('host-name').value.trim();
  const partyName = $('party-name').value.trim() || hostName + "'s Party";
  if (hostName) openPartyDialog({ code: makeRoomCode(), partyName, hostName });
});

$('join-party-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const nickname = $('guest-name').value.trim();
  const raw = $('invite-code').value.trim();
  if (!nickname || !raw) return;

  let code = raw.toUpperCase();
  try {
    const url = new URL(raw);
    if (url.searchParams.has('party')) code = url.searchParams.get('party').toUpperCase();
  } catch { /* The user may have entered a plain room code. */ }
  code = code.replace(/[^A-Z0-9]/g, '');

  if (code.length < 4 || code.length > 12) {
    showFeedback('join-feedback', 'Hmm, that invite looks a little wonky. Check the code or paste the full invite link from your buddy.');
    return;
  }
  showFeedback('join-feedback', 'Hey, ' + nickname + '! The code ' + code + ' looks valid. Actual room lookup and joining will be enabled when the multiplayer service is connected.', true);
});

$('copy-invite').addEventListener('click', async () => {
  const url = $('copy-invite').dataset.inviteUrl || '';
  try {
    await navigator.clipboard.writeText(url);
    $('copy-invite').textContent = '✅ Invite link copied!';
  } catch {
    window.prompt('Copy your party invite link:', url);
  }
});
$('close-dialog').addEventListener('click', () => $('party-dialog').close());
$('party-dialog').addEventListener('click', (event) => {
  if (event.target === $('party-dialog')) $('party-dialog').close();
});

const incomingCode = new URLSearchParams(window.location.search).get('party');
if (incomingCode) {
  $('invite-code').value = incomingCode;
  $('join-party-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
}
