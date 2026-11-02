import { renderGameGuide, renderGamePlayerPanel } from "../shared/game-shell.js";
import { setupGameLifecycle } from "../shared/game-lifecycle.js";
import { WOULD_YOU_RATHER_CATEGORIES, WOULD_YOU_RATHER_QUESTIONS } from "./questions.js";

const API_BASE_URL = window.PLAYBLOX_API_BASE_URL || (["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://localhost:8787"
  : "https://playblox-party-service.playblox-party.workers.dev");
const params = new URLSearchParams(location.search);
const code = (params.get("party") || "").toUpperCase();
const token = code ? sessionStorage.getItem("playblox:" + code + ":token") : null;
const $ = id => document.getElementById(id);
let socket = null, room = null, gameState = null, stateVersion = 0, myPlayerId = null;
let reconnectTimer = null, heartbeatTimer = null, reconnectDelay = 1000, generation = 0, leaving = false, submitting = false;
let draftAnswer = null, predictionTarget = "", predictionChoice = "A", draftTurnKey = "";

$("back-to-lobby").href = "../../../" + (code ? "?party=" + encodeURIComponent(code) + "&lobby=1" : "");
const player = id => room?.players.find(entry => entry.id === id);
const currentMasterId = () => gameState?.currentMasterId || null;
const isFinished = () => room?.lifecycle === "results" || gameState?.phase === "finished";
const usedLibraryQuestionIds = new Set();
for (const category of WOULD_YOU_RATHER_CATEGORIES) {
  const option = document.createElement("option");
  option.value = category.id;
  option.textContent = category.name;
  $("question-category").append(option);
}
function pickLibraryQuestion() {
  const category = $("question-category").value;
  const pool = WOULD_YOU_RATHER_QUESTIONS.filter(item =>
    (category === "all" || item.category === category) && !usedLibraryQuestionIds.has(item.id)
  );
  const available = pool.length ? pool : WOULD_YOU_RATHER_QUESTIONS.filter(item =>
    category === "all" || item.category === category
  );
  if (!available.length) return;
  const picked = available[Math.floor(Math.random() * available.length)];
  usedLibraryQuestionIds.add(picked.id);
  $("question-input").value = picked.question;
  $("option-a-input").value = picked.optionA;
  $("option-b-input").value = picked.optionB;
  $("library-hint").textContent = "Picked from " + WOULD_YOU_RATHER_CATEGORIES.find(item => item.id === picked.category).name + ". Edit it freely before sharing.";
  help("Random question selected. You can edit it before sharing.");
}
$("random-question").addEventListener("click", pickLibraryQuestion);
$("question-category").addEventListener("change", () => {
  const category = $("question-category").value;
  $("library-hint").textContent = category === "all"
    ? "500 original questions across 10 categories. You can edit any library pick."
    : "Random picks will come from " + WOULD_YOU_RATHER_CATEGORIES.find(item => item.id === category).name + ".";
});
function help(message, error = false) {
  $("game-help").textContent = message;
  $("game-help").classList.toggle("error", error);
}
function setConnection(message, offline = false) {
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
  } catch {
    throw new Error("Could not reach the party service.");
  }
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
  room = data.room;
  gameState = room.gameState;
  stateVersion = room.stateVersion || 0;
  render();
}
function sendAction(action) {
  return api("/api/rooms/" + encodeURIComponent(code) + "/game/action", {
    method: "POST",
    body: JSON.stringify({
      actionId: crypto.randomUUID(),
      expectedStateVersion: stateVersion,
      action: { ...action, turnNumber: gameState.turnNumber },
    }),
  });
}
function appendText(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  parent.append(element);
  return element;
}
function renderLeaderboard() {
  const board = $("leaderboard");
  board.replaceChildren();
  (gameState.playerOrder || []).map(id => ({
    id,
    name: player(id)?.nickname || "Player",
    score: gameState.scores?.[id] || 0,
  })).sort((a, b) => b.score - a.score).forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    const name = document.createElement("span");
    name.textContent = (index + 1) + ". " + entry.name + (entry.id === currentMasterId() ? " · Question Master" : "");
    const score = document.createElement("strong");
    score.textContent = entry.score + " pts";
    row.append(name, score);
    board.append(row);
  });
}
function renderHistory() {
  const list = $("history-list");
  list.replaceChildren();
  const history = (gameState.history || []).slice().reverse();
  $("history-count").textContent = history.length + (history.length === 1 ? " turn" : " turns");
  if (!history.length) {
    appendText(list, "p", "history-empty", "Completed turns will appear here.");
    return;
  }
  for (const result of history) {
    const card = document.createElement("article");
    card.className = "history-item";
    const header = document.createElement("div");
    header.className = "history-item-header";
    appendText(header, "strong", "", "Round " + (result.round || 1) + " · Turn " + result.turnNumber + " · " + (player(result.masterId)?.nickname || "Question Master"));
    appendText(header, "b", "history-master-points", "+" + result.masterPoints + " master pts");
    card.append(header);
    appendText(card, "p", "history-question", result.question);
    const split = document.createElement("div");
    split.className = "history-split";
    appendText(split, "span", "", "A: " + Math.round(result.actualPercentA) + "% (" + result.optionACount + ")");
    appendText(split, "span", "", "B: " + Math.round(result.actualPercentB) + "% (" + result.optionBCount + ")");
    card.append(split);
    appendText(card, "p", "history-prediction", "Master predicted A: " + result.predictedPercentA + "% · actual: " + Math.round(result.actualPercentA) + "%");
    const answerList = document.createElement("div");
    answerList.className = "history-answers";
    for (const [id, answer] of Object.entries(result.answers || {})) {
      const row = document.createElement("div");
      row.className = "history-answer";
      const choice = answer.choice === "A" ? result.optionA : result.optionB;
      appendText(row, "span", "history-player-choice", (player(id)?.nickname || "Player") + " chose " + answer.choice + ": " + choice);
      let predictionText = "No prediction";
      if (answer.predictionAttempted) {
        const targetName = player(answer.targetId)?.nickname || "another player";
        predictionText = "Predicted " + targetName + " → " + answer.predictedChoice
          + (answer.predictionCorrect ? " · correct" : " · incorrect");
      }
      appendText(row, "small", "history-prediction-detail", predictionText);
      appendText(row, "b", answer.points ? "history-points correct" : "history-points", "+" + answer.points + " pts");
      answerList.append(row);
    }
    card.append(answerList);
    list.append(card);
  }
}
function renderLastTurn() {
  const result = gameState.lastTurn;
  const panel = $("turn-reveal");
  panel.hidden = !result;
  if (!result) return;
  $("reveal-heading").textContent = "Turn " + result.turnNumber + " · " + (player(result.masterId)?.nickname || "Question Master");
  $("reveal-question").textContent = result.question;
  $("reveal-a-label").textContent = "A · " + result.optionA;
  $("reveal-b-label").textContent = "B · " + result.optionB;
  const actualA = Math.round(result.actualPercentA);
  const actualB = 100 - actualA;
  $("reveal-a-values").textContent = "Predicted " + result.predictedPercentA + "% · Actual " + actualA + "%";
  $("reveal-b-values").textContent = "Actual " + actualB + "%";
  $("reveal-meter-a").style.width = actualA + "%";
  $("reveal-meter-b").style.width = actualB + "%";
  const myPoints = result.pointsByPlayer?.[myPlayerId] || 0;
  const masterName = player(result.masterId)?.nickname || "The Question Master";
  $("reveal-score-summary").textContent = masterName + " earned " + result.masterPoints + "/10 points. You earned +" + myPoints + " points this turn.";
}
function renderQuestion() {
  const question = gameState.currentQuestion;
  const hasQuestion = Boolean(question);
  $("question-panel").hidden = !hasQuestion;
  if (!hasQuestion) return;
  $("question-text").textContent = question.question;
  $("question-option-a").textContent = question.optionA;
  $("question-option-b").textContent = question.optionB;
  $("master-prediction-copy").textContent = "The Question Master has made a secret percentage prediction. It will be revealed after everyone locks in.";
}
function renderAnswerPanel() {
  const answerers = (gameState.playerOrder || []).filter(id => id !== currentMasterId());
  const eligibleTargets = answerers.filter(id => id !== myPlayerId);
  const isMaster = myPlayerId === currentMasterId();
  const submitted = (gameState.submittedPlayerIds || []).includes(myPlayerId);
  const canAnswer = gameState.phase === "answers" && !isMaster && !submitted && !isFinished();
  $("answer-panel").hidden = !canAnswer;
  if (!canAnswer) return;
  $("answer-option-a").textContent = gameState.currentQuestion.optionA;
  $("answer-option-b").textContent = gameState.currentQuestion.optionB;
  if (!eligibleTargets.includes(predictionTarget)) predictionTarget = "";
  const targetSelect = $("prediction-target");
  targetSelect.replaceChildren();
  const skip = document.createElement("option");
  skip.value = "";
  skip.textContent = "Skip prediction";
  targetSelect.append(skip);
  for (const id of eligibleTargets) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = player(id)?.nickname || "Player";
    targetSelect.append(option);
  }
  targetSelect.value = predictionTarget;
  targetSelect.disabled = eligibleTargets.length === 0;
  $("prediction-choice-wrap").hidden = eligibleTargets.length === 0 || !predictionTarget;
  $("prediction-unavailable").hidden = eligibleTargets.length !== 0;
  $("predict-a").classList.toggle("selected", predictionChoice === "A");
  $("predict-b").classList.toggle("selected", predictionChoice === "B");
  document.querySelectorAll(".answer-choice").forEach(button => {
    button.classList.toggle("selected", button.dataset.choice === draftAnswer);
    button.disabled = submitting;
  });
  $("submit-answer").disabled = submitting || !draftAnswer;
}
function render() {
  if (!room || !gameState) return;
  syncGameLifecycle();
  renderGameGuide({ room, code, token, apiBaseUrl: API_BASE_URL, myPlayerId });
  $("room-label").textContent = (room.name || "Party") + " · " + code;
  renderGamePlayerPanel({ container: $("player-roster"), room, gameState: { currentPlayerId: currentMasterId() }, myPlayerId });
  const finished = isFinished();
  $("turn-pill").textContent = finished
    ? "Round " + (gameState.round || 1) + " complete"
    : "Round " + (gameState.round || 1) + " · Turn " + gameState.turnNumber + " of " + gameState.totalTurns;
  $("your-score").textContent = String(gameState.scores?.[myPlayerId] || 0);
  renderLeaderboard();
  const isMaster = myPlayerId === currentMasterId();
  const isQuestionPhase = gameState.phase === "question";
  const submitted = (gameState.submittedPlayerIds || []).includes(myPlayerId);
  const turnKey = gameState.turnNumber + ":" + (currentMasterId() || "finished");
  if (turnKey !== draftTurnKey) {
    draftTurnKey = turnKey;
    draftAnswer = null;
    predictionTarget = "";
    predictionChoice = "A";
  }
  $("master-panel").hidden = finished || !isQuestionPhase || !isMaster;
  $("publish-question").disabled = submitting;
  renderQuestion();
  renderAnswerPanel();
  const answerers = (gameState.playerOrder || []).filter(id => id !== currentMasterId());
  const submittedCount = (gameState.submittedPlayerIds || []).length;
  const shouldWait = !finished && (
    (isQuestionPhase && !isMaster) ||
    (gameState.phase === "answers" && (isMaster || submitted))
  );
  $("waiting-panel").hidden = !shouldWait;
  $("waiting-title").textContent = isQuestionPhase
    ? "Waiting for the Question Master…"
    : isMaster ? "Your question is with the group!" : "Choice locked";
  $("waiting-copy").textContent = isQuestionPhase
    ? "The Question Master is writing a dilemma and predicting the group split."
    : isMaster ? "The group is choosing. You'll see the percentage split when everyone has answered."
    : "Your choice is locked. The answers and predictions will be revealed together.";
  $("submitted-count").textContent = submittedCount + " / " + (gameState.phase === "answers" ? answerers.length : 0) + " answers locked";
  $("submitted-bar").style.width = (gameState.phase === "answers" && answerers.length ? submittedCount / answerers.length * 100 : 0) + "%";
  renderLastTurn();
  renderHistory();
  if (finished) {
    $("turn-reveal").hidden = false;
    $("reveal-heading").textContent = "Game complete · final turn " + (gameState.lastTurn?.turnNumber || gameState.history.length);
  }
  const question = gameState.currentQuestion;
  if (question && isMaster && gameState.phase === "answers") {
    // The master has already submitted the question and now waits for the group.
  }
  if (gameState.phase === "question" && isMaster) {
    $("master-percent-slider").value = $("master-percent-slider").value || "50";
    updateMasterMeter();
  }
}
function updateMasterMeter() {
  const value = Number($("master-percent-slider").value);
  $("master-percent").textContent = String(value);
  $("master-percent-b").textContent = (100 - value) + "%";
  $("master-meter-a").style.width = value + "%";
  $("master-meter-b").style.width = (100 - value) + "%";
}
$("master-percent-slider").addEventListener("input", updateMasterMeter);
$("prediction-target").addEventListener("change", () => {
  predictionTarget = $("prediction-target").value;
  $("prediction-choice-wrap").hidden = !predictionTarget;
});
$("predict-a").addEventListener("click", () => { predictionChoice = "A"; renderAnswerPanel(); });
$("predict-b").addEventListener("click", () => { predictionChoice = "B"; renderAnswerPanel(); });
document.querySelectorAll(".answer-choice").forEach(button => {
  button.addEventListener("click", () => {
    draftAnswer = button.dataset.choice;
    renderAnswerPanel();
  });
});
$("publish-question").addEventListener("click", async () => {
  const question = $("question-input").value.trim();
  const optionA = $("option-a-input").value.trim();
  const optionB = $("option-b-input").value.trim();
  if (!question || !optionA || !optionB) {
    help("Fill in the question and both options before sharing.", true);
    return;
  }
  submitting = true;
  render();
  try {
    await sendAction({
      type: "set-question",
      question,
      optionA,
      optionB,
      predictedPercentA: Number($("master-percent-slider").value),
    });
    await syncRoom();
    help("Your question is live. Now see how the group thinks!");
  } catch (error) {
    help(error.message, true);
    if (Number.isInteger(error.stateVersion)) stateVersion = error.stateVersion;
    try { await syncRoom(); } catch {}
  } finally {
    submitting = false;
    render();
  }
});
$("submit-answer").addEventListener("click", async () => {
  if (!draftAnswer || submitting) return;
  submitting = true;
  render();
  try {
    await sendAction({
      type: "submit-answer",
      choice: draftAnswer,
      targetId: predictionTarget || null,
      predictedChoice: predictionTarget ? predictionChoice : null,
    });
    await syncRoom();
    help("Your choice is locked. Waiting for everyone else.");
  } catch (error) {
    help(error.message, true);
    if (Number.isInteger(error.stateVersion)) stateVersion = error.stateVersion;
    try { await syncRoom(); } catch {}
  } finally {
    submitting = false;
    render();
  }
});
const syncGameLifecycle = setupGameLifecycle({
  root: document.querySelector("main"),
  getRoom: () => room,
  getPlayerId: () => myPlayerId,
  api,
  backToLobby: () => $("back-to-lobby").href,
});
function connect() {
  const gen = ++generation;
  if (socket) try { socket.close(); } catch {}
  if (!code || !token) {
    setConnection("Party session not found", true);
    help("Return to the party lobby and join again.", true);
    return;
  }
  setConnection("Connecting…");
  socket = new WebSocket(API_BASE_URL.replace(/^http/, "ws") + "/api/rooms/" + encodeURIComponent(code) + "/ws?token=" + encodeURIComponent(token));
  const current = socket;
  current.addEventListener("open", () => {
    if (gen !== generation || current !== socket) return;
    reconnectDelay = 1000;
    setConnection("Server connected");
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (current.readyState === WebSocket.OPEN) current.send(JSON.stringify({ type: "ping" }));
    }, 15000);
  });
  current.addEventListener("message", event => {
    if (gen !== generation || current !== socket) return;
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
    if (message.type === "game-state") {
      gameState = message.gameState;
      stateVersion = message.stateVersion;
      if (room) {
        room.lifecycle = message.lifecycle;
        room.gameState = gameState;
        room.stateVersion = stateVersion;
        room.results = message.results;
      }
      render();
    }
    if (message.type === "rematch-vote" && room) {
      room.rematchVotes = message.votes || {};
      render();
    }
    if (message.type === "error") help(message.message || "A connection error occurred.", true);
  });
  current.addEventListener("close", () => {
    if (gen !== generation || current !== socket || leaving) return;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    setConnection("Connection interrupted · reconnecting", true);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(15000, reconnectDelay * 2);
  });
  current.addEventListener("error", () => { try { current.close(); } catch {} });
}
if (code && token) syncRoom().catch(error => help(error.message, true));
connect();
