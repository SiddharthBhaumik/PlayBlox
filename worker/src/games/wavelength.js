/**
 * Wavelength (cooperative party variant).
 * The clue-giver privately chooses a target and writes a clue. Everyone else
 * places a guess on the spectrum; the shared score is awarded by group accuracy.
 * The target and pending guesses are withheld from public state until reveal.
 */
const ROUNDS_TO_WIN = 5;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const wavelength = {
  id: "wavelength",
  name: "Wavelength",
  description: "Give a clue, read the room, and work together to land on a hidden point of the spectrum.",
  guide: "GOAL: Build a shared score together over 5 rounds. One clue-giver chooses a secret point on a spectrum and gives a clue. Everyone else discusses the clue and places one guess.\n\nCLUE-GIVER: Choose a target from 0–100, set the two ends of the spectrum (for example, Cold ↔ Hot), and write a clue that helps the group find your target. Your target stays hidden until guesses lock.\n\nGUESSERS: Read the clue and use the spectrum slider to place your guess. Talk it out before locking in. You cannot change a guess after submitting.\n\nSCORING: Once all guessers lock in, the target is revealed. The server compares the group's average guess with the target and awards 4 points for a distance of 0–5, 3 for 6–12, 2 for 13–20, 1 for 21–30, and 0 for a larger miss. The score is shared by everyone.\n\nROTATION: The clue-giver changes each round. After 5 rounds, see your team score. Rematches keep the same players but start a fresh score and skip the guide.",
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
      playerOrder, round: 1, totalRounds: ROUNDS_TO_WIN, score: 0,
      clueGiverIndex: 0, phase: "clue", target: null, leftLabel: "", rightLabel: "",
      clue: "", guesses: {}, submittedPlayerIds: [], history: [], lastRound: null,
    };
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.playerOrder)) return { ok: false, reason: "The game state is invalid." };
    if (state.phase === "finished") return { ok: false, reason: "The game has finished." };
    const id = context.player.id;
    if (!Number.isInteger(action?.round) || action.round !== state.round) return { ok: false, reason: "That action belongs to an earlier round. Sync and try again." };
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
      if (id === clueGiverId) return { ok: false, reason: "The clue-giver cannot guess this round." };
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

    const values = guesserIds.map(id => guesses[id]);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const distance = Math.round(Math.abs(average - state.target));
    const points = distance <= 5 ? 4 : distance <= 12 ? 3 : distance <= 20 ? 2 : distance <= 30 ? 1 : 0;
    const roundResult = { round: state.round, clueGiverId: state.playerOrder[state.clueGiverIndex],
      clue: state.clue, leftLabel: state.leftLabel, rightLabel: state.rightLabel,
      target: state.target, guesses, average: Math.round(average), distance, points };
    const score = state.score + points;
    const finished = state.round >= state.totalRounds;
    return { ...state, phase: finished ? "finished" : "clue", round: finished ? state.round : state.round + 1,
      score, clueGiverIndex: (state.clueGiverIndex + 1) % state.playerOrder.length,
      target: null, leftLabel: "", rightLabel: "", clue: "", guesses: {}, submittedPlayerIds: [],
      lastRound: roundResult, history: [...state.history, roundResult] };
  },

  getPublicState(state) {
    if (!state) return state;
    return {
      playerOrder: state.playerOrder, round: state.round, totalRounds: state.totalRounds,
      score: state.score, clueGiverIndex: state.clueGiverIndex, phase: state.phase,
      leftLabel: state.leftLabel, rightLabel: state.rightLabel, clue: state.clue,
      submittedPlayerIds: state.submittedPlayerIds,
      lastRound: state.lastRound, history: state.history,
    };
  },

  getStatus(context, state) { return state.phase === "finished" ? "finished" : "active"; },
  getResults(context, state) {
    return { outcome: "complete", score: state.score, totalRounds: state.totalRounds,
      maxScore: state.totalRounds * 4, history: state.history };
  },
};
