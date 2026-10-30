/**
 * Shared end-of-game lifecycle UI for every PlayBlox game.
 * Games provide only their current room/player state and their existing API helper.
 * The server remains authoritative for votes and lifecycle transitions.
 */
const lifecycleInstances = new WeakMap();

export function setupGameLifecycle({ root, getRoom, getPlayerId, api, backToLobby }) {
  if (!root) return () => {};
  let panel = lifecycleInstances.get(root);
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "playblox-lifecycle";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = '<p class="playblox-lifecycle-kicker">WHAT HAPPENS NEXT?</p><h2 class="playblox-lifecycle-title">Round complete</h2><p class="playblox-lifecycle-status"></p><div class="playblox-lifecycle-votes"></div><div class="playblox-lifecycle-actions"><button type="button" class="playblox-lifecycle-replay">↻ Replay</button><button type="button" class="playblox-lifecycle-lobby">↩ Return to lobby</button><button type="button" class="playblox-lifecycle-end">End game for everyone</button></div><p class="playblox-lifecycle-error" role="alert"></p>';
    root.append(panel);
    lifecycleInstances.set(root, panel);
    const status = panel.querySelector(".playblox-lifecycle-status");
    const votes = panel.querySelector(".playblox-lifecycle-votes");
    const error = panel.querySelector(".playblox-lifecycle-error");
    const replay = panel.querySelector(".playblox-lifecycle-replay");
    const lobby = panel.querySelector(".playblox-lifecycle-lobby");
    const end = panel.querySelector(".playblox-lifecycle-end");
    const submit = async (choice, button) => {
      const room = getRoom();
      if (!room || button.disabled) return;
      button.disabled = true; error.textContent = "";
      try {
        const result = await api("/api/rooms/" + encodeURIComponent(room.code) + "/game/rematch", {
          method: "POST", body: JSON.stringify({ choice }),
        });
        if (result.status === "lobby") {
          if (backToLobby) location.href = backToLobby;
        } else if (result.status === "waiting") {
          status.textContent = choice === "replay" ? "Your replay choice is saved. Waiting for everyone else." : "Your choice is saved.";
          votes.textContent = Object.keys(result.votes || {}).length + " of " + (room.gameState?.playerOrder || []).length + " players have chosen.";
        }
      } catch (e) { error.textContent = e.message || "Could not save your choice."; button.disabled = false; }
    };
    replay.addEventListener("click", () => submit("replay", replay));
    lobby.addEventListener("click", () => {
      if (!window.confirm("Return everyone in this match to the party lobby?")) return;
      submit("lobby", lobby);
    });
    end.addEventListener("click", async () => {
      if (!window.confirm("End the game for everyone and return to the party lobby?")) return;
      end.disabled = true; error.textContent = "";
      try {
        const room = getRoom();
        await api("/api/rooms/" + encodeURIComponent(room.code) + "/game/reset", { method: "POST", body: "{}" });
        if (backToLobby) location.href = backToLobby;
      } catch (e) { error.textContent = e.message || "Could not end the game."; end.disabled = false; }
    });
  }
  return () => {
    const room = getRoom();
    const player = room?.players?.find(entry => entry.id === getPlayerId());
    const finished = room?.lifecycle === "results";
    panel.hidden = !room || (!finished && !player?.isHost);
    panel.querySelector(".playblox-lifecycle-title").textContent = finished ? "Round complete" : "Game in progress";
    panel.querySelector(".playblox-lifecycle-replay").hidden = !finished || !(room.gameState?.playerOrder || []).includes(getPlayerId());
    panel.querySelector(".playblox-lifecycle-lobby").hidden = !finished || !(room.gameState?.playerOrder || []).includes(getPlayerId());
    panel.querySelector(".playblox-lifecycle-end").hidden = !player?.isHost;
    const votes = room?.rematchVotes || {};
    const participantIds = room?.gameState?.playerOrder || [];
    const decided = participantIds.filter(id => votes[id] === "replay").length;
    panel.querySelector(".playblox-lifecycle-status").textContent = finished
      ? decided + " of " + participantIds.length + " players have voted to replay. Returning to the lobby ends the match for everyone."
      : "Only the host can end the match early.";
    panel.querySelector(".playblox-lifecycle-votes").textContent = participantIds.map(id => {
      const name = room.players.find(p => p.id === id)?.nickname || "Player";
      return name + ": " + (votes[id] === "replay" ? "Replay" : "Waiting");
    }).join(" · ");
    panel.querySelector(".playblox-lifecycle-replay").disabled = votes[getPlayerId()] === "replay";
    panel.querySelector(".playblox-lifecycle-lobby").disabled = false;
    panel.querySelector(".playblox-lifecycle-error").textContent = "";
  };
}
