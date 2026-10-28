/**
 * Wavelength: individual leaderboard, with every player giving one clue per round.
 * One round is a complete rotation through the player order. Five rotations are played.
 */
import { SPECTRUMS } from "./wavelength-spectrums.js";

const ROUNDS_TO_WIN = 5;
const randomSpectrum = (current = null) => {\n  let pair = SPECTRUMS[Math.floor(Math.random() * SPECTRUMS.length)];\n  if (current && SPECTRUMS.length > 1) {\n    while (pair.left === current.leftLabel && pair.right === current.rightLabel) pair = SPECTRUMS[Math.floor(Math.random() * SPECTRUMS.length)];\n  }\n  return { leftLabel: pair.left, rightLabel: pair.right };\n};\nconst REROLLS_PER_TURN = 2;
const pointsForDistance = distance => distance <= 5 ? 4 : distance <= 12 ? 3 : distance <= 20 ? 2 : distance <= 30 ? 1 : 0;

export const wavelength = {
  id: "wavelength",
  name: "Wavelength",
  description: "Give clues, read the room, and compete for the best individual score.",
  guide: "GOAL: Earn the most individual points over 5 rounds. Each player gives one clue per full rotation.\n\nCLUE-GIVER: The game randomly selects two ends from a bank of 500 spectrum pairs and secretly randomizes a target from 0–100. You can see the target marker; the other players cannot. Write a clue that helps the group find the target. The target stays hidden from guessers until all guesses are locked.\n\nGUESSERS: The spectrum and clue are shown to everyone. Discuss them together, then place your own guess. Your guess locks when submitted.\n\nSCORING: Guessers earn 4 points for distance 0–5, 3 for 6–12, 2 for 13–20, 1 for 21–30, and 0 for 31+. The clue-giver earns points using the distance between the target and the average of all guesses. Scores are individual.\n\nROUNDS: One round is a full rotation where everyone gives one clue. After 5 rotations, the leaderboard shows the winner. Rematches reset scores and skip the guide.",
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
      clueGiverIndex: 0, phase: "clue", target: Math.floor(Math.random() * 101), ...randomSpectrum(),
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
      if (action?.type !== "set-clue" || typeof action.clue !== "string" || !action.clue.trim() || action.clue.trim().length > 180) {
        return { ok: false, reason: "Write a clue for the hidden target." };
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
      return { ...state, phase: "guess", clue: action.clue.trim(), guesses: {}, submittedPlayerIds: [] };
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
      target: Math.floor(Math.random() * 101), ...randomSpectrum(state), rerollsUsed: 0, clue: "", guesses: {}, submittedPlayerIds: [],
      lastRound: roundResult, history: [...state.history, roundResult] };
  },

  getPrivateState(state, playerId) {
    if (!state || !Array.isArray(state.playerOrder)) return null;
    const clueGiverId = state.playerOrder[state.clueGiverIndex];
    return playerId === clueGiverId && state.phase === "clue" ? { target: state.target } : null;
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
