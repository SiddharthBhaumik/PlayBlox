/**
 * Wavelength: individual leaderboard, with every player giving one clue per round.
 * One round is a complete rotation through the player order. Five rotations are played.
 */
const ROUNDS_TO_WIN = 5;
const pointsForDistance = distance => distance <= 5 ? 4 : distance <= 12 ? 3 : distance <= 20 ? 2 : distance <= 30 ? 1 : 0;

export const wavelength = {
  id: "wavelength",
  name: "Wavelength",
  description: "Give clues, read the room, and compete for the best individual score.",
  guide: "GOAL: Earn the most individual points over 5 rounds. In every round, EACH player gets one turn as clue-giver, so everyone gets a chance to set a spectrum and clue.\n\nCLUE-GIVER: Choose a secret target from 0–100, set the two ends of the spectrum (for example, Cold ↔ Hot), and write a clue. Your target stays hidden until all guesses are locked.\n\nGUESSERS: Discuss the clue and place your own guess. You cannot change it after submitting. Each guesser earns points based on how close their own guess is to the target.\n\nSCORING: Each guesser can earn 0–4 points for their guess. The clue-giver also earns 0–4 points based on how close the average of the group's guesses is to the target. Scores are individual; the player with the most points at the end wins.\n\nROUNDS: One round means every player has been the clue-giver once. After 5 full rotations, the leaderboard shows the winner. Rematches reset scores and skip the guide.",
  emoji: "🎯",
  color: "#d9f0e7",
  entry: "./src/games/wavelength/index.html",
  players: { min: 2, max: 8 },
  interactionModel: "simultaneous",
  lateJoinPolicy: "spectate",
  spectators: { supported: true },

  canStart(context) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    return players.length >= 2 && players.length <= 8
      ? { ok: true }
      : { ok: false, reason: "Wavelength needs 2–8 connected players." };
  },

  createInitialState(context) {
    const playerOrder = context.players.filter(player => player.role === "player" && player.connected).map(player => player.id);
    return {
      playerOrder, round: 1, totalRounds: ROUNDS_TO_WIN, turnNumber: 1,
      score: 0, scores: Object.fromEntries(playerOrder.map(id => [id, 0])),
      clueGiverIndex: 0, phase: "clue", target: null, leftLabel: "", rightLabel: "",
      clue: "", guesses: {}, submittedPlayerIds: [], history: [], lastRound: null,
    };
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.playerOrder)) return { ok: false, reason: "The game state is invalid." };
    if (state.phase === "finished") return { ok: false, reason: "The game has finished." };
    const id = context.player.id;
    if (!Number.isInteger(action?.round) || action.round !== state.round
      || !Number.isInteger(action?.turnNumber) || action.turnNumber !== state.turnNumber) {
      return { ok: false, reason: "That action belongs to an earlier turn. Sync and try again." };
    }
    if (!state.playerOrder.includes(id)) return { ok: false, reason: "Only selected players can play." };
    const clueGiverId = state.playerOrder[state.clueGiverIndex];
    if (state.phase === "clue") {
      if (id !== clueGiverId) return { ok: false, reason: "Wait for the clue-giver to set the spectrum and clue." };
      if (action?.type !== "set-clue" || !Number.isInteger(action.target) || action.target < 0 || action.target > 100
        || typeof action.clue !== "string" || !action.clue.trim() || action.clue.trim().length > 180
        || typeof action.leftLabel !== "string" || typeof action.rightLabel !== "string"
        || !action.leftLabel.trim() || !action.rightLabel.trim()
        || action.leftLabel.trim().length > 32 || action.rightLabel.trim().length > 32) {
        return { ok: false, reason: "Choose a target, two short spectrum labels, and a clue." };
      }
      return { ok: true };
    }
    if (state.phase === "guess") {
      if (id === clueGiverId) return { ok: false, reason: "The clue-giver cannot guess this turn." };
      if (state.guesses?.[id] !== undefined) return { ok: false, reason: "Your guess is already locked." };
      if (action?.type !== "guess" || !Number.isInteger(action.value) || action.value < 0 || action.value > 100) {
        return { ok: false, reason: "Place your guess between 0 and 100." };
      }
      return { ok: true };
    }
    return { ok: false, reason: "This phase does not accept actions." };
  },

  reduceAction(context, state, action) {
    if (action.type === "set-clue") {
      return { ...state, phase: "guess", target: action.target, leftLabel: action.leftLabel.trim(),
        rightLabel: action.rightLabel.trim(), clue: action.clue.trim(), guesses: {}, submittedPlayerIds: [] };
    }
    const guesses = { ...state.guesses, [context.player.id]: action.value };
    const guesserIds = state.playerOrder.filter(id => id !== state.playerOrder[state.clueGiverIndex]);
    const submittedPlayerIds = guesserIds.filter(id => guesses[id] !== undefined);
    if (submittedPlayerIds.length < guesserIds.length) return { ...state, guesses, submittedPlayerIds };

    const average = guesserIds.reduce((sum, id) => sum + guesses[id], 0) / guesserIds.length;
    const distance = Math.round(Math.abs(average - state.target));
    const clueGiverId = state.playerOrder[state.clueGiverIndex];
    const scores = { ...state.scores };
    const guessPoints = Object.fromEntries(guesserIds.map(id => {
      const playerDistance = Math.round(Math.abs(guesses[id] - state.target));
      const points = pointsForDistance(playerDistance);
      scores[id] = (scores[id] || 0) + points;
      return [id, { distance: playerDistance, points }];
    }));
    const clueGiverPoints = pointsForDistance(distance);
    scores[clueGiverId] = (scores[clueGiverId] || 0) + clueGiverPoints;
    const roundResult = { round: state.round, turnNumber: state.turnNumber, clueGiverId,
      clue: state.clue, leftLabel: state.leftLabel, rightLabel: state.rightLabel,
      target: state.target, guesses, average: Math.round(average), distance,
      clueGiverPoints, guessPoints, scores: { ...scores } };
    const lastTurnInRound = state.clueGiverIndex === state.playerOrder.length - 1;
    const finished = lastTurnInRound && state.round >= state.totalRounds;
    const nextClueGiverIndex = (state.clueGiverIndex + 1) % state.playerOrder.length;
    return { ...state, phase: finished ? "finished" : "clue",
      round: lastTurnInRound ? (finished ? state.round : state.round + 1) : state.round,
      turnNumber: state.turnNumber + 1, scores, clueGiverIndex: nextClueGiverIndex,
      target: null, leftLabel: "", rightLabel: "", clue: "", guesses: {}, submittedPlayerIds: [],
      lastRound: roundResult, history: [...state.history, roundResult] };
  },

  getPublicState(state) {
    if (!state) return state;
    return {
      playerOrder: state.playerOrder, round: state.round, totalRounds: state.totalRounds,
      turnNumber: state.turnNumber, score: 0, scores: state.scores,
      clueGiverIndex: state.clueGiverIndex, phase: state.phase,
      leftLabel: state.leftLabel, rightLabel: state.rightLabel, clue: state.clue,
      submittedPlayerIds: state.submittedPlayerIds, lastRound: state.lastRound, history: state.history,
    };
  },

  getStatus(context, state) { return state.phase === "finished" ? "finished" : "active"; },
  getResults(context, state) {
    return { outcome: "complete", scores: state.scores, totalRounds: state.totalRounds,
      playerOrder: state.playerOrder, history: state.history };
  },
};
