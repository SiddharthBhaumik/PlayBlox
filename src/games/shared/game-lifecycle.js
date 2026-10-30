/**
 * Shared end-of-game lifecycle UI for every PlayBlox game.
 * Games provide only their current room/player state and their existing API helper.
 * The server remains authoritative for votes and lifecycle transitions.
 */
const lifecycleInstances = new WeakMap();

function lobbyDestination(code, fallback) {
  const gamePath = window.location.pathname;
  const marker = gamePath.indexOf("/src/games/");
  const projectRoot = marker >= 0 ? gamePath.slice(0, marker + 1) : "/";
  const target = new URL(projectRoot, window.location.origin);
  target.searchParams.set("party", code);
  target.searchParams.set("lobby", "1");
  // Prefer the repository-aware path derived from the game URL. This avoids
  // accidentally navigating to the domain root on GitHub project Pages.
  return target.href || fallback;
}

export function setupGameLifecycle({ root, getRoom, getPlayerId, api, backToLobby }) {
  if (!root) return () => {};
  let panel = lifecycleInstances.get(root);
  if (!panel) {
    panel = document.createElement("section");
    panel.className = "playblox-lifecycle";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = '<p class="playblox-lifecycle-kicker">WHAT HAPPENS NEXT?</p><h2 class="playblox-lifecycle-title">Round complete</h2><p class="playblox-lifecycle-status"></p><div class="playblox-lifecycle-votes"></div><details class="playblox-lifecycle-manage"><summary>Manage party</summary><div class="playblox-lifecycle-kick-list"></div></details><div class="playblox-lifecycle-actions"><button type="button" class="playblox-lifecycle-replay">↻ Replay / Continue</button><button type="button" class="playblox-lifecycle-lobby">↩ Return to lobby</button><button type="button" class="playblox-lifecycle-leave">Leave game and return to lobby</button><button type="button" class="playblox-lifecycle-end">End game for everyone</button></div><p class="playblox-lifecycle-error" role="alert"></p>';
    root.append(panel);
    lifecycleInstances.set(root, panel);
    const status = panel.querySelector(".playblox-lifecycle-status");
    const votes = panel.querySelector(".playblox-lifecycle-votes");
    const error = panel.querySelector(".playblox-lifecycle-error");
    const replay = panel.querySelector(".playblox-lifecycle-replay");
    const lobby = panel.querySelector(".playblox-lifecycle-lobby");
    const end = panel.querySelector(".playblox-lifecycle-end");
    const leave = panel.querySelector(".playblox-lifecycle-leave");
    const submit = async (choice, button) => {
      const room = getRoom();
      if (!room || button.disabled) return;
      button.disabled = true; error.textContent = "";
      try {
        const result = await api("/api/rooms/" + encodeURIComponent(room.code) + "/game/rematch", {
          method: "POST", body: JSON.stringify({ choice }),
        });
        if (result.status === "lobby") {
          location.assign(lobbyDestination(room.code, backToLobby?.()));
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
    leave.addEventListener("click", async () => {
      if (!window.confirm("Leave this game and return to the party lobby? You will remain in the party.")) return;
      leave.disabled = true; error.textContent = "";
      try {
        const room = getRoom();
        const result = await api("/api/rooms/" + encodeURIComponent(room.code) + "/game/leave", { method: "POST", body: "{}" });
        location.assign(lobbyDestination(room.code, backToLobby?.()));
      } catch (e) { error.textContent = e.message || "Could not leave the game."; leave.disabled = false; }
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
    panel.hidden = !room || (!finished && !player?.isHost && player?.role !== "player");
    panel.querySelector(".playblox-lifecycle-title").textContent = finished ? "Round complete" : "Game in progress";
    panel.querySelector(".playblox-lifecycle-replay").hidden = !finished || !(room.gameState?.playerOrder || []).includes(getPlayerId());
    panel.querySelector(".playblox-lifecycle-replay").textContent = "↻ Replay / Continue";
    panel.querySelector(".playblox-lifecycle-lobby").hidden = !finished || !(room.gameState?.playerOrder || []).includes(getPlayerId());
    panel.querySelector(".playblox-lifecycle-end").hidden = !player?.isHost || finished;
    panel.querySelector(".playblox-lifecycle-leave").hidden = !room.gameState?.playerOrder?.includes(getPlayerId());
    const votes = room?.rematchVotes || {};
    const participantIds = room?.gameState?.playerOrder || [];
    const activeIds = participantIds.filter(id => room.players.some(p => p.id === id && p.role === "player"));
    const decided = activeIds.filter(id => votes[id] === "replay").length;
    panel.querySelector(".playblox-lifecycle-status").textContent = finished
      ? decided + " of " + activeIds.length + " remaining players have voted to replay. Returning to the lobby ends the match for everyone."
      : (player?.isHost ? "The host can end the game for everyone. Any player can leave the game and return to the party lobby." : "You can leave this game and return to the party lobby without leaving the party.");
    panel.querySelector(".playblox-lifecycle-votes").hidden = !finished;
    panel.querySelector(".playblox-lifecycle-votes").textContent = finished ? participantIds.filter(id => room.players.some(p => p.id === id && p.role === "player")).map(id => {
      const name = room.players.find(p => p.id === id)?.nickname || "Player";
      return name + ": " + (votes[id] === "replay" ? "Replay" : "Waiting");
    }).join(" · ") : "";
    const manageParty = panel.querySelector(".playblox-lifecycle-manage");
    const kickList = panel.querySelector(".playblox-lifecycle-kick-list");
    kickList.replaceChildren();
    if (player?.isHost) {
      const heading = document.createElement("strong");
      heading.textContent = "Party members";
      kickList.append(heading);
      room.players.filter(member => member.id !== getPlayerId()).forEach(member => {
        const row = document.createElement("div"); row.className = "playblox-kick-row";
        const name = document.createElement("span"); name.textContent = member.nickname + (member.role === "player" ? " · Playing" : member.role === "spectator" ? " · Spectating" : " · Waiting");
        const kick = document.createElement("button"); kick.type = "button"; kick.textContent = "Kick";
        kick.addEventListener("click", async () => {
          if (!window.confirm("Remove " + member.nickname + " from this party?")) return;
          kick.disabled = true;
          try {
            await api("/api/rooms/" + encodeURIComponent(room.code) + "/kick", {
              method: "POST", body: JSON.stringify({ playerId: member.id }),
            });
          } catch (e) {
            panel.querySelector(".playblox-lifecycle-error").textContent = e.message || "Could not remove that player.";
            kick.disabled = false;
          }
        });
        row.append(name, kick); kickList.append(row);
      });
      kickList.hidden = false;
      manageParty.hidden = false;
    } else manageParty.hidden = true;
    panel.querySelector(".playblox-lifecycle-replay").disabled = votes[getPlayerId()] === "replay";
    panel.querySelector(".playblox-lifecycle-lobby").disabled = false;
    panel.querySelector(".playblox-lifecycle-error").textContent = "";
  };
}
