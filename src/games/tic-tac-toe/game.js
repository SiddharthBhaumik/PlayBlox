const API_BASE_URL = window.PLAYBLOX_API_BASE_URL
  || (["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://playblox-party-service.playblox-party.workers.dev");
const params = new URLSearchParams(location.search);
const code = (params.get("party") || "").toUpperCase();
const token = code ? sessionStorage.getItem("playblox:" + code + ":token") : null;
const $ = id => document.getElementById(id);
let socket = null;
let room = null;
let gameState = null;
let stateVersion = 0;
let myPlayerId = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let reconnectDelay = 1000;
let generation = 0;
let leaving = false;

$("back-to-lobby").href = "../../../" + (code ? "?party=" + encodeURIComponent(code) + "&lobby=1" : "");

function setConnection(message, offline = false) {
  $("connection-status").textContent = message;
  $("connection-status").classList.toggle("offline", offline);
}
function setBanner(message) { $("turn-banner").textContent = message; }
function showError(message) {
  $("game-help").textContent = message;
  $("game-help").classList.add("error");
}
function render() {
  if (!room || !gameState) return;
  $("room-label").textContent = (room.name || "Party") + " · " + code;
  const mySymbol = gameState.symbols?.[myPlayerId];
  const currentPlayer = room.players.find(p => p.id === gameState.currentPlayerId);
  const isMyTurn = gameState.currentPlayerId === myPlayerId;
  const finished = room.lifecycle === "results" || Boolean(gameState.winnerId || gameState.isDraw);
  document.querySelectorAll(".tic-cell").forEach((cell, index) => {
    const mark = gameState.board[index];
    cell.textContent = mark || "";
    cell.classList.toggle("mark-x", mark === "X");
    cell.classList.toggle("mark-o", mark === "O");
    cell.classList.toggle("winning-cell", Boolean(gameState.winningLine?.includes(index)));
    cell.disabled = Boolean(mark) || finished || !isMyTurn || !mySymbol || room.players.find(p => p.id === myPlayerId)?.role === "spectator";
    cell.setAttribute("aria-label", mark ? "Square " + (index + 1) + ": " + mark : "Empty square " + (index + 1));
  });
  $("game-result").hidden = !finished;
  const isHost = Boolean(room.players.find(p => p.id === myPlayerId)?.isHost);
  $("return-lobby").hidden = !isHost;
  $("return-lobby").textContent = finished ? "↩ Return to party lobby" : "↩ End game and return to lobby";
  $("back-to-lobby").hidden = !isHost;
  if (gameState.winnerId) {
    const winner = room.players.find(p => p.id === gameState.winnerId);
    $("game-result").textContent = (winner?.nickname || "A player") + " wins! 🎉";
    setBanner(gameState.winnerId === myPlayerId ? "You lined up three! Nice one." : (winner?.nickname || "Your opponent") + " lined up three.");
  } else if (gameState.isDraw) {
    $("game-result").textContent = "It's a draw! 🤝";
    setBanner("A perfect little stalemate.");
  } else if (!mySymbol) {
    setBanner("You're watching this round as a spectator.");
  } else if (isMyTurn) {
    setBanner("Your turn — place " + mySymbol + "!");
  } else {
    setBanner((currentPlayer?.nickname || "Your opponent") + "'s turn · " + (currentPlayer ? gameState.symbols[currentPlayer.id] : ""));
  }
  if (!finished) {
    $("game-help").textContent = isHost
      ? "The host can return everyone to the lobby at any time, including if someone disconnects."
      : "The host can return everyone to the lobby when the round is over.";
  } else if (!isHost) {
    $("game-help").textContent = "The host will return everyone to the party lobby.";
  }
}
function applyRoom(nextRoom) {
  room = nextRoom;
  myPlayerId = room.players.find(p => p.connected && p.id === myPlayerId)?.id || myPlayerId;
  if (room.lifecycle === "lobby") {
    location.href = $("back-to-lobby").href;
    return;
  }
  gameState = room.gameState || gameState;
  stateVersion = room.stateVersion ?? stateVersion;
  render();
}
async function api(path, options = {}) {
  const response = await fetch(API_BASE_URL + path, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "The request failed.");
    error.status = response.status;
    error.stateVersion = data.stateVersion;
    throw error;
  }
  return data;
}
function connect() {
  const myGeneration = ++generation;
  if (socket) { try { socket.close(); } catch {} }
  if (!code || !token) {
    setConnection("Party session not found", true);
    setBanner("Go back to the party lobby and join again to play.");
    showError("We couldn't find your saved party session in this browser tab.");
    document.querySelectorAll(".tic-cell").forEach(cell => cell.disabled = true);
    return;
  }
  setConnection(reconnectDelay > 1000 ? "Reconnecting…" : "Connecting…");
  socket = new WebSocket(API_BASE_URL.replace(/^http/, "ws") + "/api/rooms/" + encodeURIComponent(code) + "/ws?token=" + encodeURIComponent(token));
  const currentSocket = socket;
  socket.addEventListener("open", () => {
    if (myGeneration !== generation || currentSocket !== socket) return;
    reconnectDelay = 1000;
    setConnection("Live");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => { if (currentSocket.readyState === WebSocket.OPEN) currentSocket.send(JSON.stringify({ type: "ping" })); }, 15000);
  });
  socket.addEventListener("message", event => {
    if (myGeneration !== generation || currentSocket !== socket) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.room && ["room-snapshot", "room-updated", "game-started"].includes(message.type)) {
      room = message.room;
      myPlayerId = message.playerId || myPlayerId;
      gameState = room.gameState || gameState;
      stateVersion = room.stateVersion ?? stateVersion;
      if (room.lifecycle === "lobby") { location.href = $("back-to-lobby").href; return; }
      render();
    }
    if (message.type === "game-state") {
      gameState = message.gameState;
      stateVersion = message.stateVersion;
      if (room) { room.lifecycle = message.lifecycle; room.gameState = gameState; room.stateVersion = stateVersion; room.results = message.results; }
      render();
    }
    if (message.type === "error") showError(message.message || "A connection error occurred.");

  });
  currentSocket.addEventListener("close", () => {
    if (myGeneration !== generation || currentSocket !== socket || leaving) return;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    setConnection("Connection interrupted · reconnecting", true);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(15000, reconnectDelay * 2);
  });
  currentSocket.addEventListener("error", () => { try { currentSocket.close(); } catch {} });
}
async function syncRoom() {
  const data = await api("/api/rooms/" + encodeURIComponent(code));
  applyRoom(data.room);
}
document.querySelectorAll(".tic-cell").forEach(cell => {
  cell.addEventListener("click", async () => {
    if (!gameState || cell.disabled) return;
    const index = Number(cell.dataset.index);
    document.querySelectorAll(".tic-cell").forEach(button => button.disabled = true);
    try {
      const result = await api("/api/rooms/" + encodeURIComponent(code) + "/game/action", {
        method: "POST",
        body: JSON.stringify({ actionId: crypto.randomUUID(), expectedStateVersion: stateVersion, action: { type: "place-mark", index } }),
      });
      stateVersion = result.stateVersion;
      await syncRoom();
    } catch (error) {
      showError(error.message);
      if (Number.isInteger(error.stateVersion)) stateVersion = error.stateVersion;
      try { await syncRoom(); } catch {}
    }
  });
});
async function returnEveryoneToLobby(button) {
  if (!room?.players.find(p => p.id === myPlayerId)?.isHost) {
    showError("Only the host can return everyone to the party lobby.");
    return;
  }
  const confirmed = window.confirm(
    "End this round and return everyone to the party lobby? The current game will be reset."
  );
  if (!confirmed) return;
  button.disabled = true;
  try {
    await api("/api/rooms/" + encodeURIComponent(code) + "/game/reset", { method: "POST", body: "{}" });
    location.href = $("back-to-lobby").href;
  } catch (error) {
    showError(error.message);
    button.disabled = false;
  }
}
$("return-lobby").addEventListener("click", () => returnEveryoneToLobby($("return-lobby")));
$("back-to-lobby").addEventListener("click", event => {
  event.preventDefault();
  returnEveryoneToLobby($("back-to-lobby"));
});
window.addEventListener("beforeunload", () => {
  leaving = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (socket) socket.close();
});
connect();
