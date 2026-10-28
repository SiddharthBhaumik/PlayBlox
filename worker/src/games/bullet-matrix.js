/**
 * Bullet Matrix: simultaneous, server-authoritative elimination game.
 * Pending actions remain in the private Durable Object state. getPublicState
 * deliberately exposes only who has submitted until the round is resolved.
 */
const MAX_SHIELD_STRENGTH = 100;
const MAX_BULLETS_PER_TARGET = 100;

export const bulletMatrix = {
  id: "bullet-matrix",
  name: "Bullet Matrix",
  description: "Reload, shoot, and shield in secret. Predict everyone else to be the last one standing.",
  guide: "GOAL: Be the last player alive. Everyone secretly chooses one action each round. Actions resolve together only after every living player has submitted.\n\n1. RELOAD: Gain 1 bullet if no bullets hit you this round. You start with 0 bullets, so reloading is how you get ammunition. If you are hit while reloading, you are eliminated and gain no bullet.\n\n2. SHOOT: Spend bullets you already have to shoot one or more different living opponents. Choose how many bullets to send to each target; the total cannot exceed your ammunition. You cannot target yourself. Every bullet sent counts toward that target's incoming total. A target who shoots is still eliminated if any bullets hit them.\n\n3. SHIELD: Predict the exact total number of bullets that will hit you this round and enter that number as your shield strength (1–100). You survive only if the incoming total matches your choice exactly. Too many bullets, too few bullets, or no incoming bullets means you are eliminated. Shielding does not use ammunition.\n\nROUND RESOLUTION: Actions are hidden while players choose. When all living players have submitted, all shots are counted, then eliminations and successful reloads are resolved together. Eliminated players cannot take further actions. The next round begins with the remaining players.\n\nWINNING: The last surviving player wins. If every remaining player is eliminated in the same round, the match ends in a draw. Think carefully: reload to build ammunition, shoot to eliminate opponents, or shield when you can predict the exact number of incoming bullets.",
  emoji: "🔫",
  color: "#ffd9c7",
  entry: "./src/games/bullet-matrix/index.html",
  players: { min: 2, max: 8 },
  interactionModel: "simultaneous",
  lateJoinPolicy: "spectate",
  spectators: { supported: true },

  canStart(context) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    return players.length >= 2 && players.length <= 8
      ? { ok: true }
      : { ok: false, reason: "Bullet Matrix needs 2–8 connected players." };
  },

  createInitialState(context, previousState = null) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    const playerOrder = players.map(player => player.id);
    return {
      playerOrder,
      round: 1,
      ammo: Object.fromEntries(playerOrder.map(id => [id, 0])),
      alivePlayerIds: playerOrder.slice(),
      pendingActions: {},
      submittedPlayerIds: [],
      lastRound: null,
      winnerId: null,
      isDraw: false,
    };
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.alivePlayerIds) || !state.ammo) return { ok: false, reason: "The game state is invalid." };
    if (state.winnerId || state.isDraw) return { ok: false, reason: "The match has finished." };
    const id = context.player.id;
    if (!state.alivePlayerIds.includes(id)) return { ok: false, reason: "Eliminated players cannot submit actions." };
    if (state.pendingActions?.[id]) return { ok: false, reason: "Your action is already locked for this round." };
    if (!action || typeof action.type !== "string") return { ok: false, reason: "Choose Reload, Shoot, or Shield." };
    if (action.round !== state.round) return { ok: false, reason: "That action belongs to an earlier round. Sync and choose again." };

    if (action.type === "reload") return { ok: true };
    if (action.type === "shield") {
      if (!Number.isInteger(action.strength) || action.strength < 1 || action.strength > MAX_SHIELD_STRENGTH) {
        return { ok: false, reason: "Shield strength must be between 1 and 100." };
      }
      return { ok: true };
    }
    if (action.type === "shoot") {
      const targets = action.targets;
      if (!Array.isArray(targets) || targets.length < 1 || targets.length > state.alivePlayerIds.length - 1) {
        return { ok: false, reason: "Choose at least one valid target." };
      }
      const seen = new Set();
      let total = 0;
      for (const entry of targets) {
        if (!entry || typeof entry.targetId !== "string" || entry.targetId === id
          || !state.alivePlayerIds.includes(entry.targetId) || seen.has(entry.targetId)
          || !Number.isInteger(entry.bullets) || entry.bullets < 1 || entry.bullets > MAX_BULLETS_PER_TARGET) {
          return { ok: false, reason: "Each target must be a different living opponent and receive a positive whole number of bullets." };
        }
        seen.add(entry.targetId);
        total += entry.bullets;
      }
      if (total > (state.ammo[id] || 0)) return { ok: false, reason: "You don't have enough bullets for that shot allocation." };
      return { ok: true };
    }
    return { ok: false, reason: "Choose Reload, Shoot, or Shield." };
  },

  reduceAction(context, state, action) {
    const pendingActions = { ...state.pendingActions, [context.player.id]: structuredClone(action) };
    const submittedPlayerIds = state.alivePlayerIds.filter(id => Boolean(pendingActions[id]));
    const next = { ...state, pendingActions, submittedPlayerIds };
    if (submittedPlayerIds.length < state.alivePlayerIds.length) return next;

    const aliveBefore = state.alivePlayerIds.slice();
    const incoming = Object.fromEntries(aliveBefore.map(id => [id, 0]));
    for (const shooterId of aliveBefore) {
      const choice = pendingActions[shooterId];
      if (choice.type !== "shoot") continue;
      for (const target of choice.targets) incoming[target.targetId] += target.bullets;
    }

    const ammo = { ...state.ammo };
    for (const shooterId of aliveBefore) {
      const choice = pendingActions[shooterId];
      if (choice.type === "shoot") {
        ammo[shooterId] -= choice.targets.reduce((sum, target) => sum + target.bullets, 0);
      }
    }

    const eliminatedPlayerIds = [];
    const reasons = {};
    for (const id of aliveBefore) {
      const choice = pendingActions[id];
      const bulletsReceived = incoming[id];
      if (choice.type === "shield") {
        if (bulletsReceived !== choice.strength) {
          eliminatedPlayerIds.push(id);
          reasons[id] = bulletsReceived === 0
            ? "Shield strength did not match the zero incoming bullets."
            : "Shield strength did not match the incoming bullet count.";
        }
      } else if (bulletsReceived > 0) {
        eliminatedPlayerIds.push(id);
        reasons[id] = choice.type === "reload" ? "Was hit while reloading." : "Was hit during the shootout.";
      } else if (choice.type === "reload") {
        ammo[id] += 1;
      }
    }

    const eliminated = new Set(eliminatedPlayerIds);
    const alivePlayerIds = aliveBefore.filter(id => !eliminated.has(id));
    const winnerId = alivePlayerIds.length === 1 ? alivePlayerIds[0] : null;
    const isDraw = alivePlayerIds.length === 0;
    return {
      ...next,
      ammo,
      alivePlayerIds,
      pendingActions: {},
      submittedPlayerIds: [],
      round: state.round + 1,
      lastRound: {
        round: state.round,
        actions: pendingActions,
        incoming,
        eliminatedPlayerIds,
        reasons,
        alivePlayerIds: alivePlayerIds.slice(),
      },
      winnerId,
      isDraw,
    };
  },

  getPublicState(state) {
    if (!state) return state;
    return {
      playerOrder: state.playerOrder,
      round: state.round,
      ammo: state.ammo,
      alivePlayerIds: state.alivePlayerIds,
      submittedPlayerIds: state.submittedPlayerIds,
      lastRound: state.lastRound,
      winnerId: state.winnerId,
      isDraw: state.isDraw,
    };
  },

  getStatus(context, state) {
    return state.winnerId || state.isDraw ? "finished" : "active";
  },

  getResults(context, state) {
    const winner = context.players.find(player => player.id === state.winnerId);
    return {
      outcome: state.winnerId ? "winner" : state.isDraw ? "draw" : "unfinished",
      winnerId: state.winnerId,
      winnerNickname: winner?.nickname || null,
    };
  },
};
