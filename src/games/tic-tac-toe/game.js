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
let reconnectDelay = 1000;
let generation = 0;
let leaving = false;

$("back-to-lobby").href = "../../../" + (code ? "?party=" + encodeURIComponent(code) : "");

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
  $("return-lobby").hidden = !finished || !room.players.find(p => p.id === myPlayerId)?.isHost;
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
  if (finished && !room.players.find(p => p.id === myPlayerId)?.isHost) {
    $("game-help").textContent = "The host will return everyone to the party lobby.";
  } else if (!finished) {
    $("game-help").textContent = "The host can return everyone to the lobby when the round is over.";
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
    currentSocket.send(JSON.stringify({ type: "ping" }));
  });
  socket.addEventListener("message", event => {
    if (myGeneration !== generation || currentSocket !== socket) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.room && ["room-snapshot", "room-updated", "game-started"].includes(message.type)) {
      const existingId = myPlayerId;
      room = message.room;
      myPlayerId = existingId || room.players.find(p => p.connected && p.nickname)?.id;
      const tokenPlayer = room.players.find(p => p.connected && p.id === myPlayerId);
      if (!tokenPlayer && !existingId) {
        // The player's ID is not in the URL; match the token-authenticated socket using the current session nickname fallback below.
        myPlayerId = room.players.find(p => p.isHost && sessionStorage.getItem("playblox:last-player:" + code) === p.nickname)?.id || myPlayerId;
      }
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
    if (message.type === "pong") currentSocket.send(JSON.stringify({ type: "ping" }));
  });
  currentSocket.addEventListener("close", () => {
    if (myGeneration !== generation || currentSocket !== socket || leaving) return;
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
$("return-lobby").addEventListener("click", async () => {
  $("return-lobby").disabled = true;
  try {
    await api("/api/rooms/" + encodeURIComponent(code) + "/game/reset", { method: "POST", body: "{}" });
  } catch (error) { showError(error.message); $("return-lobby").disabled = false; }
});
window.addEventListener("beforeunload", () => {
  leaving = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (socket) socket.close();
});
connect();
