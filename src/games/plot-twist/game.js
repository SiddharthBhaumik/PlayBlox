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
let socket = null, room = null, gameState = null, privateState = null, stateVersion = 0, myPlayerId = null;
let reconnectTimer = null, heartbeatTimer = null, reconnectDelay = 1000, generation = 0, leaving = false, submitting = false;

$("back-to-lobby").href = "../../../" + (code ? "?party=" + encodeURIComponent(code) + "&lobby=1" : "");
const playerName = id => room?.players.find(player => player.id === id)?.nickname || "Player";
const isHost = () => room?.players.find(player => player.id === myPlayerId)?.isHost === true;
function help(message, error = false) {
  $("game-help").textContent = message;
  $("game-help").classList.toggle("error", error);
}
function connection(message, offline = false) {
  $("connection-status").textContent = message;
  $("connection-status").classList.toggle("offline", offline);
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API_BASE_URL + path, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: "Bearer " + token, ...(options.headers || {}) },
    });
  } catch { throw new Error("Could not reach the party service."); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.stateVersion = data.stateVersion;
    throw error;
  }
  return data;
}
async function syncRoom() {
  const data = await api("/api/rooms/" + encodeURIComponent(code));
  room = data.room; gameState = room.gameState; stateVersion = room.stateVersion || 0;
  render();
}
async function sendAction(action) {
  return api("/api/rooms/" + encodeURIComponent(code) + "/game/action", {
    method: "POST",
    body: JSON.stringify({ actionId: crypto.randomUUID(), expectedStateVersion: stateVersion, action }),
  });
}
const syncLifecycle = setupGameLifecycle({
  root: document.querySelector("main"), getRoom: () => room, getPlayerId: () => myPlayerId,
  api, backToLobby: () => $("back-to-lobby").href,
});

function setPanel(id, visible) { $(id).hidden = !visible; }
function renderRevealedLine(line, index) {
  const row = document.createElement("article"); row.className = "revealed-line";
  const number = document.createElement("span"); number.className = "revealed-line-number"; number.textContent = String(index + 1);
  const copy = document.createElement("div"); copy.className = "revealed-line-copy";
  const text = document.createElement("p"); text.textContent = line.text;
  const author = document.createElement("small"); author.textContent = "WRITTEN BY " + (line.authorName || playerName(line.playerId)).toUpperCase();
  copy.append(text, author); row.append(number, copy); return row;
}
function renderAllStories(stories) {
  const root = $("all-stories"); root.replaceChildren();
  stories.forEach((story, index) => {
    const article = document.createElement("article"); article.className = "full-story";
    const title = document.createElement("h3"); title.textContent = "Story " + (index + 1);
    article.append(title);
    story.lines.forEach((line, lineIndex) => {
      const row = document.createElement("div"); row.className = "full-story-line";
      const text = document.createElement("p"); text.textContent = line.text;
      const author = document.createElement("small"); author.textContent = "LINE " + (lineIndex + 1) + " · " + (line.authorName || playerName(line.playerId));
      row.append(text, author); article.append(row);
    });
    root.append(article);
  });
}
function render() {
  if (!room || !gameState) return;
  syncLifecycle();
  renderGameGuide({ room, code, token, apiBaseUrl: API_BASE_URL, myPlayerId });
  $("room-label").textContent = (room.name || "Party") + " · " + code;
  renderGamePlayerPanel({ container: $("player-roster"), room, gameState: null, myPlayerId });
  const phase = gameState.phase;
  const finished = phase === "finished";
  $("phase-pill").textContent = ({
    setup: "Host settings", starter: "Opening lines", writing: "Story writing",
    reveal: "Grand reveal", finished: "Stories complete",
  })[phase] || "Plot Twist";
  $("round-label").textContent = phase === "writing"
    ? "Writing round " + gameState.round
    : phase === "starter" ? "Opening lines" : "Each story · " + (gameState.linesPerStory || 3) + " lines";
  const submitted = (gameState.submittedPlayerIds || []).includes(myPlayerId);
  const host = isHost();
  setPanel("setup-panel", phase === "setup" && host);
  if (phase === "setup" && host) {
    $("line-count").value = String(gameState.linesPerStory || 6);
    $("line-count-value").textContent = $("line-count").value;
  }
  if (phase === "setup" && !host) {
    setPanel("waiting-panel", true);
    $("waiting-title").textContent = "The host is setting up the stories…";
    $("waiting-copy").textContent = "The host will choose how many lines each story gets.";
  } else if (phase !== "setup") {
    setPanel("waiting-panel", false);
  }
  setPanel("starter-panel", phase === "starter" && !submitted);
  setPanel("writing-panel", phase === "writing" && !submitted && Boolean(privateState?.latestLine));
  setPanel("waiting-panel", (phase === "setup" && !host) || ((phase === "starter" || phase === "writing") && submitted) || (phase === "writing" && !privateState?.latestLine && !submitted) || (phase === "reveal" && !host));
  if (phase === "starter" && submitted) {
    $("waiting-title").textContent = "Your opening line is locked!";
    $("waiting-copy").textContent = "Waiting for everyone to finish their opening line.";
  }
  if (phase === "writing" && submitted) {
    $("waiting-title").textContent = "Your line is locked!";
    $("waiting-copy").textContent = "The stories are moving around the group. Waiting for everyone else.";
  }
  if (phase === "starter" || phase === "writing") {
    $("submitted-count").textContent = (gameState.submittedCount || 0) + " / " + gameState.playerCount + " submitted";
    $("submitted-bar").style.width = ((gameState.submittedCount || 0) / Math.max(1, gameState.playerCount) * 100) + "%";
  }
  if (phase === "writing" && privateState?.latestLine) {
    $("story-number").textContent = "STORY " + privateState.storyNumber;
    $("latest-line").textContent = privateState.latestLine;
  }
  setPanel("reveal-panel", phase === "reveal");
  setPanel("finished-panel", finished);
  if (phase === "reveal") {
    const stories = gameState.revealedStories || [];
    const current = stories[gameState.revealStoryIndex];
    $("reveal-heading").textContent = "Story " + (gameState.revealStoryIndex + 1);
    $("reveal-subheading").textContent = "The group wrote " + gameState.linesPerStory + " lines. Here's how it unfolded.";
    const lines = $("revealed-lines"); lines.replaceChildren();
    (current?.lines || []).forEach((line, index) => lines.append(renderRevealedLine(line, index)));
    $("reveal-progress").textContent = "Story " + (gameState.revealStoryIndex + 1) + " · Line " + (gameState.revealLineIndex + 1) + " of " + gameState.linesPerStory;
    $("reveal-next").hidden = !host;
    $("reveal-wait").hidden = host;
    $("reveal-next").disabled = submitting;
    $("reveal-next").textContent = gameState.revealLineIndex + 1 >= gameState.linesPerStory
      ? (gameState.revealStoryIndex + 1 >= gameState.playerCount ? "Finish reveal →" : "Next story →")
      : "Reveal next line →";
  }
  if (finished) renderAllStories(gameState.revealedStories || []);
  $("confirm-settings").disabled = submitting;
  $("submit-starter").disabled = submitting;
  $("submit-line").disabled = submitting;
}
$("line-count").addEventListener("input", () => { $("line-count-value").textContent = $("line-count").value; });

async function act(action, successMessage) {
  if (submitting) return;
  submitting = true; render();
  try {
    await sendAction(action);
    await syncRoom();
    if (action.type === "submit-line") {
      $("starter-input").value = "";
      $("line-input").value = "";
    }
    if (successMessage) help(successMessage);
  } catch (error) {
    help(error.message, true);
    if (Number.isInteger(error.stateVersion)) stateVersion = error.stateVersion;
    try { await syncRoom(); } catch {}
  } finally { submitting = false; render(); }
}
$("confirm-settings").addEventListener("click", () => act({ type: "set-lines", value: Number($("line-count").value) }, "Settings locked. Write your opening line!"));
$("submit-starter").addEventListener("click", () => {
  const text = $("starter-input").value.trim();
  if (!text) { help("Write an opening line before locking it.", true); return; }
  act({ type: "submit-line", text }, "Opening line locked.");
});
$("submit-line").addEventListener("click", () => {
  const text = $("line-input").value.trim();
  if (!text) { help("Write the next line before locking it.", true); return; }
  act({ type: "submit-line", text }, "Your line is locked. The next writer will take it from here.");
});
$("reveal-next").addEventListener("click", () => act({ type: "reveal-next" }));

function connect() {
  const gen = ++generation;
  if (socket) try { socket.close(); } catch {}
  if (!code || !token) {
    connection("Party session not found", true);
    help("Return to the party lobby and join again.", true);
    return;
  }
  connection("Connecting…");
  socket = new WebSocket(API_BASE_URL.replace(/^http/, "ws") + "/api/rooms/" + encodeURIComponent(code) + "/ws?token=" + encodeURIComponent(token));
  const current = socket;
  current.addEventListener("open", () => {
    if (gen !== generation || current !== socket) return;
    reconnectDelay = 1000; connection("Server connected");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: "ping" }));
    }, 15000);
  });
  current.addEventListener("message", event => {
    if (gen !== generation || current !== socket) return;
    let message; try { message = JSON.parse(event.data); } catch { return; }
    if (message.room && ["room-snapshot", "room-updated", "game-started", "game-guide", "guide-progress"].includes(message.type)) {
      room = message.room; myPlayerId = message.playerId || myPlayerId;
      gameState = room.gameState || gameState; privateState = message.privateState ?? privateState;
      stateVersion = room.stateVersion ?? stateVersion;
      if (room.lifecycle === "lobby") { location.href = $("back-to-lobby").href; return; }
      render();
    }
    if (message.type === "game-state") {
      gameState = message.gameState; privateState = message.privateState ?? null; stateVersion = message.stateVersion;
      if (room) { room.lifecycle = message.lifecycle; room.gameState = gameState; room.stateVersion = stateVersion; }
      render();
    }
    if (message.type === "error") help(message.message || "A connection error occurred.", true);
  });
  current.addEventListener("close", () => {
    if (gen !== generation || current !== socket || leaving) return;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    connection("Connection interrupted · reconnecting", true);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(15000, reconnectDelay * 2);
  });
  current.addEventListener("error", () => { try { current.close(); } catch {} });
}
window.addEventListener("beforeunload", () => {
  leaving = true; generation++;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
});
if (code && token) { syncRoom().catch(error => help(error.message, true)); connect(); }
else connect();
