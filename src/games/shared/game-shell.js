/**
 * Shared PlayBlox game-shell utilities.
 * Import these from each game's module instead of reimplementing the party roster
 * and host end-round control in every game.
 */
const cssUrl = new URL("./game-shell.css", import.meta.url).href;
if (!document.querySelector('link[data-playblox-game-shell]')) {
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = cssUrl;
  stylesheet.dataset.playbloxGameShell = "true";
  document.head.append(stylesheet);
}

export function renderGamePlayerPanel({ container, room, gameState = null, myPlayerId = null }) {
  if (!container || !room) return;
  container.replaceChildren();
  const players = Array.isArray(room.players) ? room.players : [];
  if (!players.length) {
    const empty = document.createElement("li");
    empty.textContent = "No players in this party yet.";
    container.append(empty);
    return;
  }
  for (const player of players) {
    const item = document.createElement("li");
    item.className = "game-player";
    const isCurrentTurn = Boolean(gameState?.currentPlayerId && player.id === gameState.currentPlayerId);
    item.classList.toggle("is-turn", isCurrentTurn);
    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.setAttribute("aria-hidden", "true");
    dot.classList.toggle("is-offline", player.connected === false);
    const info = document.createElement("span");
    info.className = "game-player-info";
    const name = document.createElement("strong");
    name.textContent = (player.nickname || "Player") + (player.id === myPlayerId ? " (you)" : "");
    const detail = document.createElement("small");
    if (player.connected === false) detail.textContent = "Reconnecting…";
    else if (player.isHost) detail.textContent = "Host" + (gameState?.symbols?.[player.id] ? " · " + gameState.symbols[player.id] : "");
    else if (player.role === "spectator") detail.textContent = "Watching";
    else if (player.role === "waiting") detail.textContent = "Waiting";
    else if (gameState?.symbols?.[player.id]) detail.textContent = "Player · " + gameState.symbols[player.id];
    else detail.textContent = player.role === "player" ? "Player" : (player.role || "Player");
    info.append(name, detail);
    item.append(dot, info);
    container.append(item);
  }
}

export function setupHostEndRound(button, { getRoom, getPlayerId, onEnd }) {
  if (!button) return;
  const sync = () => {
    const room = getRoom();
    const player = room?.players?.find(entry => entry.id === getPlayerId());
    button.hidden = !player?.isHost;
  };
  button.addEventListener("click", () => {
    const room = getRoom();
    const player = room?.players?.find(entry => entry.id === getPlayerId());
    if (!player?.isHost) return;
    onEnd(button);
  });
  return sync;
}


const guideDialogs = new Map();
export function renderGameGuide({ room, code, token, apiBaseUrl, myPlayerId }) {
  if (!room || room.lifecycle === "lobby" || !room.game?.guide) return;
  const isRequired = (room.guidePlayerIds || []).includes(myPlayerId);
  if (!isRequired) return;
  let dialog = guideDialogs.get(code);
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "playblox-guide-dialog";
    dialog.innerHTML = '<div class="guide-dialog-emoji" aria-hidden="true">📖</div><p class="section-kicker">BEFORE YOU PLAY</p><h2 class="guide-dialog-title"></h2><p class="guide-dialog-copy"></p><p class="guide-dialog-progress" role="status"></p><button class="primary-button guide-dialog-ready" type="button">I’ve read the guide — start when everyone is ready</button>';
    document.body.append(dialog);
    guideDialogs.set(code, dialog);
    dialog.querySelector(".guide-dialog-ready").addEventListener("click", async () => {
      const button = dialog.querySelector(".guide-dialog-ready");
      button.disabled = true;
      dialog.querySelector(".guide-dialog-progress").textContent = "Confirming…";
      try {
        const response = await fetch(apiBaseUrl + "/api/rooms/" + encodeURIComponent(code) + "/game/guide-ready", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: "{}",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not confirm the guide.");
        dialog.querySelector(".guide-dialog-progress").textContent = result.lifecycle === "playing" ? "Everyone is ready. Starting!" : result.readyCount + " of " + result.requiredCount + " players are ready. Waiting for the others…";
      } catch (error) {
        dialog.querySelector(".guide-dialog-progress").textContent = error.message;
        button.disabled = false;
      }
    });
  }
  dialog.querySelector(".guide-dialog-title").textContent = room.game.name + " — how to play";
  dialog.querySelector(".guide-dialog-copy").textContent = room.game.guide;
  const readyIds = room.guideReadyPlayerIds || [];
  const readyCount = readyIds.length, requiredCount = (room.guidePlayerIds || []).length;
  const button = dialog.querySelector(".guide-dialog-ready");
  if (readyIds.includes(myPlayerId)) {
    button.disabled = true;
    button.textContent = "✓ Guide read";
    dialog.querySelector(".guide-dialog-progress").textContent = readyCount + " of " + requiredCount + " players are ready. The round starts when everyone confirms.";
  } else {
    button.disabled = false;
    button.textContent = "I’ve read the guide — start when everyone is ready";
    dialog.querySelector(".guide-dialog-progress").textContent = readyCount + " of " + requiredCount + " players are ready.";
  }
  if (room.lifecycle === "guide") {
    if (!dialog.open) dialog.showModal();
  } else if (dialog.open) {
    dialog.close();
  }
}
