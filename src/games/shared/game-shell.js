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
    if (!window.confirm("End this round and return everyone to the party lobby? The current game will be reset.")) return;
    onEnd(button);
  });
  return sync;
}
