import { renderGameGuide, renderGamePlayerPanel } from "../shared/game-shell.js";
import { setupGameLifecycle } from "../shared/game-lifecycle.js";

const API_BASE_URL = window.PLAYBLOX_API_BASE_URL
  || (["localhost", "127.0.0.1"].includes(location.hostname)
    ? "http://localhost:8787"
    : "https://playblox-party-service.playblox-party.workers.dev");
const params = new URLSearchParams(location.search);
const code = (params.get("party") || "").toUpperCase();
const token = code ? sessionStorage.getItem("playblox:" + code + ":token") : null;
const $ = id => document.getElementById(id);
const ANSWER_LABELS = { yes: "Yes", probably: "Probably", unknown: "Don't know", "probably-not": "Probably not", no: "No" };

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
let pending = false;
let lastRevealTurnKey = null;

$("back-to-lobby").href = "../../../" + (code ? "?party=" + encodeURIComponent(code) + "&lobby=1" : "");

const nameOf = id => room?.players.find(player => player.id === id)?.nickname || "A player";
function setConnection(message, offline = false) {
  $("connection-status").textContent = message;
  $("connection-status").classList.toggle("offline", offline);
}
function setHelp(message, isError = false) {
  $("game-help").textContent = message;
  $("game-help").classList.toggle("error", isError);
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const syncGameLifecycle = setupGameLifecycle({
  root: document.querySelector("main"), getRoom: () => room, getPlayerId: () => myPlayerId, api, backToLobby: () => $("back-to-lobby").href,
});

function renderLog(turn) {
  const list = $("question-log");
  list.replaceChildren();
  const log = turn?.log || [];
  if (!log.length) { list.append(el("li", "empty", "No questions yet.")); return; }
  for (const entry of log) {
    if (entry.type === "answer") {
      const item = el("li", "", entry.question);
      item.append(el("span", "answer-chip", ANSWER_LABELS[entry.answer] || entry.answer));
      list.append(item);
    } else {
      const who = entry.character ? entry.character.emoji + " " + entry.character.name : "a character";
      list.append(el("li", "is-guess", "Genie guessed " + who + (entry.correct ? " — correct!" : " — wrong.")));
    }
  }
  list.scrollTop = list.scrollHeight;
}

function renderScores() {
  const board = $("scoreboard");
  board.replaceChildren();
  const order = [...(gameState.playerOrder || [])].sort((a, b) => (gameState.scores?.[b] || 0) - (gameState.scores?.[a] || 0));
  for (const id of order) {
    const item = el("li", "", nameOf(id) + (id === myPlayerId ? " (you)" : ""));
    item.append(el("span", "", String(gameState.scores?.[id] || 0) + " pts"));
    board.append(item);
  }
  const history = $("turn-history");
  history.replaceChildren();
  const entries = [...(gameState.history || [])].reverse();
  if (!entries.length) { history.append(el("li", "empty", "No finished turns yet.")); return; }
  for (const entry of entries) {
    let text = "Round " + entry.round + " · " + nameOf(entry.thinkerId) + ": ";
    if (entry.outcome === "genie") text += "the genie guessed " + (entry.character ? entry.character.emoji + " " + entry.character.name : "it") + " after " + entry.questions + " questions";
    else if (entry.outcome === "stumped") text += "stumped the genie" + (entry.revealName ? " with " + entry.revealName : "") + "!";
    else text += "turn skipped";
    if (entry.points) text += " (+" + entry.points + ")";
    history.append(el("li", "", text));
  }
}

function render() {
  if (!room || !gameState) return;
  syncGameLifecycle();
  renderGameGuide({ room, code, token, apiBaseUrl: API_BASE_URL, myPlayerId });
  $("room-label").textContent = (room.name || "Party") + " · " + code;
  renderGamePlayerPanel({ container: $("game-players"), room, gameState, myPlayerId });
  renderScores();

  const me = room.players.find(player => player.id === myPlayerId);
  const isHost = Boolean(me?.isHost);
  const isPlayer = me?.role === "player" && (gameState.playerOrder || []).includes(myPlayerId);
  const turn = gameState.turn;
  const finished = room.lifecycle === "results" || gameState.phase === "finished" || !turn;
  const playing = room.lifecycle === "playing";
  const isThinker = Boolean(turn && turn.thinkerId === myPlayerId);
  const thinkerName = turn ? nameOf(turn.thinkerId) : "";

  const avatar = $("genie-avatar");
  avatar.classList.toggle("is-thinking", gameState.phase === "asking");
  avatar.classList.toggle("is-happy", turn?.outcome === "genie");
  avatar.classList.toggle("is-sad", turn?.outcome === "stumped");

  $("answer-controls").hidden = true;
  $("guess-controls").hidden = true;
  $("reveal-controls").hidden = true;
  $("genie-guess").hidden = true;
  $("undo-answer").hidden = !(playing && isThinker && turn?.canUndo);
  $("skip-turn").hidden = !(playing && isHost && isPlayer && !isThinker && turn && gameState.phase !== "reveal" && !finished);

  if (finished) {
    const results = room.results;
    const winners = (results?.winnerIds || []).map(nameOf);
    $("turn-banner").textContent = winners.length ? "🏆 " + winners.join(" & ") + (winners.length > 1 ? " tie" : " wins") + " this round!" : "The genie read every mind this round. 🧞";
    $("genie-kicker").textContent = "Round " + (gameState.round || 1) + " complete";
    $("genie-text").textContent = winners.length ? "You've out-thought me… this time." : "No one can hide from the genie!";
    $("question-count").textContent = "Round over";
    $("confidence-label").textContent = "";
    $("confidence-fill").style.width = "0%";
    renderLog(null);
    $("log-panel").hidden = true;
    setHelp("Vote below to replay with the same scores, or return to the lobby.");
    return;
  }
  $("log-panel").hidden = false;
  renderLog(turn);

  const questionNumber = gameState.phase === "asking" ? turn.questionCount + 1 : turn.questionCount;
  $("question-count").textContent = "Question " + Math.min(questionNumber, gameState.limits?.questions || 25) + " of " + (gameState.limits?.questions || 25)
    + " · Guess " + Math.min(turn.guessCount + (gameState.phase === "guessing" ? 1 : 0), gameState.limits?.guesses || 3) + " of " + (gameState.limits?.guesses || 3);
  $("confidence-label").textContent = "Confidence " + (turn.confidence || 0) + "%";
  $("confidence-fill").style.width = Math.max(0, Math.min(100, turn.confidence || 0)) + "%";

  if (gameState.phase === "asking") {
    $("turn-banner").textContent = isThinker ? "You're the Thinker — answer honestly!" : thinkerName + " is the Thinker. Guess along!";
    $("genie-kicker").textContent = "Question " + questionNumber;
    $("genie-text").textContent = turn.questionText;
    if (isThinker && playing) {
      $("answer-controls").hidden = false;
      document.querySelectorAll("#answer-controls .genie-answer").forEach(button => { button.disabled = pending; });
    }
    setHelp(isThinker ? "Think of any real person or fictional character. Only you can answer." : "Only " + thinkerName + " can answer. Can you work out who it is first?");
  } else if (gameState.phase === "guessing") {
    $("turn-banner").textContent = isThinker ? "The genie has a guess for you!" : "The genie is guessing " + thinkerName + "'s character…";
    $("genie-kicker").textContent = turn.guessCount ? "Let me try again… is it" : "I think I've got it! Is it";
    $("genie-text").textContent = "";
    $("genie-guess").hidden = false;
    $("guess-emoji").textContent = turn.guess?.emoji || "❓";
    $("guess-name").textContent = (turn.guess?.name || "Someone") + "?";
    $("guess-description").textContent = turn.guess?.description || "";
    if (isThinker && playing) {
      $("guess-controls").hidden = false;
      $("guess-right").disabled = pending; $("guess-wrong").disabled = pending;
    }
    setHelp(isThinker ? "Tell the genie whether it's right. Answered something wrong? Undo your last answer." : "Waiting for " + thinkerName + " to respond.");
  } else if (gameState.phase === "reveal") {
    const stumped = turn.outcome === "stumped";
    $("turn-banner").textContent = stumped
      ? (isThinker ? "You stumped the genie! +" + turn.points + " points" : thinkerName + " stumped the genie! +" + turn.points)
      : (isThinker ? "The genie read your mind!" + (turn.points ? " +" + turn.points + " point" : "") : "The genie guessed " + thinkerName + "'s character!");
    $("genie-kicker").textContent = stumped ? "I give up!" : "I knew it!";
    const correct = (turn.log || []).find(entry => entry.type === "guess" && entry.correct)?.character;
    $("genie-text").textContent = stumped ? "You've beaten me. Who were you thinking of?" : (correct ? correct.emoji + " " + correct.name + " — the genie is never wrong!" : "");
    if (isThinker || isHost) {
      const turnKey = gameState.round + ":" + turn.thinkerId + ":" + (gameState.history || []).length;
      if (lastRevealTurnKey !== turnKey) { $("reveal-name").value = ""; lastRevealTurnKey = turnKey; }
      $("reveal-controls").hidden = !playing || !isPlayer;
      const canName = isThinker && stumped;
      $("reveal-label").hidden = !canName;
      $("reveal-name").hidden = !canName;
      const remaining = (gameState.playerOrder || []).filter(id => !(gameState.completedThinkerIds || []).includes(id) && id !== turn.thinkerId);
      $("next-turn").textContent = remaining.length ? "Pass the lamp to " + nameOf(remaining.find(id => (gameState.playerOrder || []).indexOf(id) > (gameState.playerOrder || []).indexOf(turn.thinkerId)) || remaining[0]) + " ➜" : "Finish the round ➜";
      $("next-turn").disabled = pending;
    }
    setHelp(isThinker ? "Pass the lamp when you're ready." : "Waiting for " + thinkerName + " to pass the lamp on.");
  }
  if (me?.role !== "player") setHelp("You're watching this round as a spectator.");
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

async function syncRoom() {
  const data = await api("/api/rooms/" + encodeURIComponent(code));
  room = data.room;
  if (room.lifecycle === "lobby") { location.href = $("back-to-lobby").href; return; }
  gameState = room.gameState || gameState;
  stateVersion = room.stateVersion ?? stateVersion;
  render();
}

async function sendAction(action) {
  if (pending || !gameState) return;
  pending = true;
  render();
  try {
    const result = await api("/api/rooms/" + encodeURIComponent(code) + "/game/action", {
      method: "POST",
      body: JSON.stringify({ actionId: crypto.randomUUID(), expectedStateVersion: stateVersion, action }),
    });
    stateVersion = result.stateVersion;
    pending = false;
    await syncRoom();
  } catch (error) {
    pending = false;
    setHelp(error.message, true);
    if (Number.isInteger(error.stateVersion)) stateVersion = error.stateVersion;
    try { await syncRoom(); } catch {}
  }
}

document.querySelectorAll("#answer-controls .genie-answer").forEach(button => {
  button.addEventListener("click", () => {
    if (gameState?.phase !== "asking") return;
    sendAction({ type: "answer", questionId: gameState.turn.questionId, answer: button.dataset.answer });
  });
});
$("guess-right").addEventListener("click", () => sendAction({ type: "guess-feedback", correct: true, characterId: gameState?.turn?.guess?.id }));
$("guess-wrong").addEventListener("click", () => sendAction({ type: "guess-feedback", correct: false, characterId: gameState?.turn?.guess?.id }));
$("undo-answer").addEventListener("click", () => sendAction({ type: "undo" }));
$("skip-turn").addEventListener("click", () => {
  if (!window.confirm("Skip " + nameOf(gameState?.turn?.thinkerId) + "'s turn? They won't score this turn.")) return;
  sendAction({ type: "skip-turn" });
});
$("reveal-controls").addEventListener("submit", event => {
  event.preventDefault();
  const isThinker = gameState?.turn?.thinkerId === myPlayerId;
  const name = $("reveal-name").value.trim();
  sendAction(isThinker && name ? { type: "next-turn", revealName: name } : { type: "next-turn" });
});

function connect() {
  const myGeneration = ++generation;
  if (socket) { try { socket.close(); } catch {} }
  if (!code || !token) {
    setConnection("Party session not found", true);
    $("turn-banner").textContent = "Go back to the party lobby and join again to play.";
    setHelp("We couldn't find your saved party session in this browser tab.", true);
    return;
  }
  setConnection(reconnectDelay > 1000 ? "Reconnecting…" : "Connecting…");
  socket = new WebSocket(API_BASE_URL.replace(/^http/, "ws") + "/api/rooms/" + encodeURIComponent(code) + "/ws?token=" + encodeURIComponent(token));
  const currentSocket = socket;
  socket.addEventListener("open", () => {
    if (myGeneration !== generation || currentSocket !== socket) return;
    reconnectDelay = 1000;
    setConnection("Server connected");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => { if (currentSocket.readyState === WebSocket.OPEN) currentSocket.send(JSON.stringify({ type: "ping" })); }, 15000);
  });
  socket.addEventListener("message", event => {
    if (myGeneration !== generation || currentSocket !== socket) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.room && ["room-snapshot", "room-updated", "game-started", "game-guide", "guide-progress"].includes(message.type)) {
      room = message.room;
      myPlayerId = message.playerId || myPlayerId;
      gameState = room.gameState || gameState;
      stateVersion = room.stateVersion ?? stateVersion;
      if (room.lifecycle === "lobby") { location.href = $("back-to-lobby").href; return; }
      render();
    }
    if (message.type === "rematch-vote") {
      if (room) room.rematchVotes = message.votes || {};
      render();
    }
    if (message.type === "game-state") {
      gameState = message.gameState;
      stateVersion = message.stateVersion;
      if (room) { room.lifecycle = message.lifecycle; room.gameState = gameState; room.stateVersion = stateVersion; room.results = message.results; }
      render();
    }
    if (message.type === "host-ended-round") sessionStorage.setItem("playblox:" + code + ":notice", message.message || "The host ended the round and returned everyone to the lobby.");
    if (message.type === "error") setHelp(message.message || "A connection error occurred.", true);
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

window.addEventListener("beforeunload", () => {
  leaving = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (socket) socket.close();
});
connect();
