/**
 * Genie's Guess — server-authoritative rules.
 *
 * Players take turns as the Thinker. The Thinker silently picks any real or
 * fictional character; the genie asks questions, and only the Thinker answers.
 * The genie guesses when confident. The Thinker scores by stumping the genie.
 * Everyone else watches the questions and answers live.
 *
 * The genie's next move is always recomputed from the turn's event log via
 * genie-engine.js, so reducers stay pure and "undo" cannot desynchronise.
 */
import { ANSWER_VALUES, MAX_GUESSES, MAX_QUESTIONS, decide, getCharacter, getQuestion } from "./genie-engine.js";
import { GENIE_CHARACTERS } from "./genie-data.js";

const GUIDE = "GOAL: Stump the genie! Each round, every player takes one turn as the Thinker.\n\nTHINKER: Silently think of a real person or fictional character — don't tell anyone. The genie asks yes/no questions and only the Thinker answers: Yes, Probably, Don't know, Probably not, or No. Misclicked? Use Undo to take back your last answer.\n\nTHE GENIE GUESSES: When it feels confident, the genie names a character. Tell it whether it is right. It gets up to 3 guesses and 25 questions per turn.\n\nSCORING: Stump the genie completely and earn 3 points. If the genie only gets it on its second or third guess, earn 1 point. A first-guess hit earns 0. When stumped, the Thinker can reveal who they were thinking of.\n\nEVERYONE ELSE: Watch the questions and answers live and try to work out the character before the genie does.\n\nThe round ends after every player has been the Thinker once. Replay keeps cumulative scores. If a Thinker disconnects, the host can skip their turn.";

const POINTS = { stumped: 3, lateGuess: 1, firstGuess: 0 };
const HISTORY_LIMIT = 60;
const NAME_LIMIT = 60;

function randomSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }

function characterSummary(id) {
  const character = getCharacter(id);
  return character ? { id: character.id, name: character.name, emoji: character.emoji, description: character.description } : null;
}

/** Recompute what the genie does next from the turn log. */
function advanceGenie(turn) {
  const decision = decide(turn.events, turn.seed);
  const questionCount = turn.events.filter(event => event.type === "answer").length;
  const guessCount = turn.events.filter(event => event.type === "guess").length;
  const base = { ...turn, questionCount, guessCount, confidence: Math.round(decision.confidence * 100) };
  if (decision.type === "question") {
    return { ...base, phase: "asking", questionId: decision.questionId, questionText: getQuestion(decision.questionId).text, guess: null };
  }
  if (decision.type === "guess") {
    return { ...base, phase: "guessing", questionId: null, questionText: null, guess: characterSummary(decision.characterId) };
  }
  return { ...base, phase: "reveal", questionId: null, questionText: null, guess: null, outcome: "stumped" };
}

function newTurn(thinkerId) {
  return advanceGenie({ thinkerId, seed: randomSeed(), events: [], outcome: null, points: 0, revealName: null });
}

function startTurnFor(state, index) {
  const thinkerId = state.playerOrder[index];
  const turn = newTurn(thinkerId);
  return { ...state, turnIndex: index, thinkerId, currentPlayerId: thinkerId, turn, phase: turn.phase };
}

function finishTurn(state, outcome) {
  const guessCount = state.turn.events.filter(event => event.type === "guess").length;
  const points = outcome === "stumped" ? POINTS.stumped : guessCount > 1 ? POINTS.lateGuess : POINTS.firstGuess;
  const scores = { ...state.scores, [state.thinkerId]: (state.scores[state.thinkerId] || 0) + points };
  return { ...state, scores, phase: "reveal", turn: { ...state.turn, phase: "reveal", outcome, points, questionId: null, questionText: null } };
}

/** Move to the next player who hasn't been Thinker this round, or finish the round. */
function nextTurn(state) {
  const completed = state.completedThinkerIds.includes(state.thinkerId)
    ? state.completedThinkerIds : [...state.completedThinkerIds, state.thinkerId];
  const base = { ...state, completedThinkerIds: completed };
  for (let step = 1; step <= base.playerOrder.length; step++) {
    const index = (base.turnIndex + step) % base.playerOrder.length;
    if (!completed.includes(base.playerOrder[index])) return startTurnFor(base, index);
  }
  return { ...base, phase: "finished", thinkerId: null, currentPlayerId: null, turn: null };
}

function recordHistory(state) {
  const turn = state.turn;
  const correct = turn.events.find(event => event.type === "guess" && event.correct);
  const entry = {
    round: state.round,
    thinkerId: turn.thinkerId,
    outcome: turn.outcome,
    points: turn.points,
    questions: turn.events.filter(event => event.type === "answer").length,
    character: correct ? characterSummary(correct.characterId) : null,
    revealName: turn.revealName,
  };
  return { ...state, history: [...state.history, entry].slice(-HISTORY_LIMIT) };
}

function participants(context) {
  return context.players.filter(player => player.role === "player" && player.connected).map(player => player.id);
}

export const genie = {
  id: "genie",
  name: "Genie's Guess",
  description: "Think of anyone — real or fictional. Answer the genie's questions and try to stump its guesses.",
  guide: GUIDE,
  emoji: "🧞",
  color: "#e6dcff",
  entry: "./src/games/genie/index.html",
  players: { min: 1, max: 8 },
  interactionModel: "turn-based",
  lateJoinPolicy: "wait",
  spectators: { supported: true },

  canStart(context) {
    return participants(context).length >= 1
      ? { ok: true }
      : { ok: false, reason: "Genie's Guess needs at least one connected player." };
  },

  createInitialState(context, previousState = null) {
    const ids = participants(context);
    const keepScores = Array.isArray(previousState?.playerOrder);
    const scores = Object.fromEntries(ids.map(id => [id, keepScores ? previousState.scores?.[id] || 0 : 0]));
    const base = {
      round: keepScores ? (previousState.round || 0) + 1 : 1,
      playerOrder: ids,
      completedThinkerIds: [],
      scores,
      history: keepScores ? (previousState.history || []).slice(-HISTORY_LIMIT) : [],
      characterCount: GENIE_CHARACTERS.length,
      limits: { questions: MAX_QUESTIONS, guesses: MAX_GUESSES },
    };
    return startTurnFor(base, 0);
  },

  startNextRound(context, previousState) {
    const ids = (previousState?.playerOrder || []).filter(id => context.players.some(player => player.id === id && player.role === "player"));
    const base = {
      ...previousState,
      round: (previousState.round || 1) + 1,
      playerOrder: ids,
      completedThinkerIds: [],
      scores: Object.fromEntries(ids.map(id => [id, previousState.scores?.[id] || 0])),
    };
    return startTurnFor(base, 0);
  },

  onPlayerLeave(context, state, playerId) {
    if (!state || !Array.isArray(state.playerOrder)) return null;
    const playerOrder = state.playerOrder.filter(id => id !== playerId);
    if (playerOrder.length < 1) return null;
    const scores = { ...state.scores }; delete scores[playerId];
    const completedThinkerIds = state.completedThinkerIds.filter(id => id !== playerId);
    let next = { ...state, playerOrder, scores, completedThinkerIds };
    if (state.phase === "finished") return next;
    if (state.thinkerId === playerId) {
      // The Thinker left mid-turn: discard their turn and hand the lamp on.
      next.turnIndex = Math.max(-1, state.playerOrder.indexOf(playerId) - 1);
      for (let step = 1; step <= playerOrder.length; step++) {
        const index = (next.turnIndex + step + playerOrder.length) % playerOrder.length;
        if (!completedThinkerIds.includes(playerOrder[index])) return startTurnFor(next, index);
      }
      return { ...next, phase: "finished", thinkerId: null, currentPlayerId: null, turn: null };
    }
    next.turnIndex = playerOrder.indexOf(state.thinkerId);
    return next;
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.playerOrder) || !state.scores) return { ok: false, reason: "The game state is invalid." };
    if (state.phase === "finished" || !state.turn) return { ok: false, reason: "This round has finished." };
    if (!action || typeof action !== "object") return { ok: false, reason: "Send a valid action." };
    const isThinker = context.player.id === state.thinkerId;
    switch (action.type) {
      case "answer":
        if (!isThinker) return { ok: false, reason: "Only the Thinker answers the genie." };
        if (state.phase !== "asking") return { ok: false, reason: "The genie isn't asking a question right now." };
        if (action.questionId !== state.turn.questionId) return { ok: false, reason: "That question has already been answered." };
        if (!Object.hasOwn(ANSWER_VALUES, action.answer)) return { ok: false, reason: "Choose one of the five answers." };
        return { ok: true };
      case "undo": {
        if (!isThinker) return { ok: false, reason: "Only the Thinker can undo an answer." };
        if (state.phase !== "asking" && state.phase !== "guessing") return { ok: false, reason: "There is nothing to undo now." };
        const last = state.turn.events[state.turn.events.length - 1];
        if (!last || last.type !== "answer") return { ok: false, reason: "You can only undo an answer, not a guess." };
        return { ok: true };
      }
      case "guess-feedback":
        if (!isThinker) return { ok: false, reason: "Only the Thinker can tell the genie whether it is right." };
        if (state.phase !== "guessing" || !state.turn.guess) return { ok: false, reason: "The genie hasn't made a guess." };
        if (typeof action.correct !== "boolean") return { ok: false, reason: "Say whether the guess is right." };
        if (action.characterId !== state.turn.guess.id) return { ok: false, reason: "That guess is no longer current." };
        return { ok: true };
      case "skip-turn":
        if (!context.player.isHost) return { ok: false, reason: "Only the host can skip a turn." };
        if (isThinker) return { ok: false, reason: "Finish your own turn, or let the genie guess." };
        if (state.phase === "reveal") return { ok: false, reason: "This turn is already over." };
        return { ok: true };
      case "next-turn":
        if (state.phase !== "reveal") return { ok: false, reason: "The current turn hasn't finished yet." };
        if (!isThinker && !context.player.isHost) return { ok: false, reason: "Only the Thinker or host can pass the lamp on." };
        if (action.revealName !== undefined && action.revealName !== null) {
          if (typeof action.revealName !== "string" || action.revealName.trim().length > NAME_LIMIT) {
            return { ok: false, reason: `Keep the character's name under ${NAME_LIMIT} characters.` };
          }
        }
        return { ok: true };
      default:
        return { ok: false, reason: "Unknown action." };
    }
  },

  reduceAction(context, state, action) {
    const turn = state.turn;
    if (action.type === "answer") {
      const events = [...turn.events, { type: "answer", questionId: turn.questionId, answer: action.answer, value: ANSWER_VALUES[action.answer] }];
      const next = { ...state, turn: advanceGenie({ ...turn, events }) };
      next.phase = next.turn.phase;
      return next.phase === "reveal" ? finishTurn(next, "stumped") : next;
    }
    if (action.type === "undo") {
      const events = turn.events.slice(0, -1);
      const next = { ...state, turn: advanceGenie({ ...turn, events }) };
      next.phase = next.turn.phase;
      return next;
    }
    if (action.type === "guess-feedback") {
      const events = [...turn.events, { type: "guess", characterId: turn.guess.id, correct: action.correct }];
      if (action.correct) return finishTurn({ ...state, turn: { ...turn, events } }, "genie");
      const next = { ...state, turn: advanceGenie({ ...turn, events }) };
      next.phase = next.turn.phase;
      return next.phase === "reveal" ? finishTurn(next, "stumped") : next;
    }
    if (action.type === "skip-turn") {
      return nextTurn(recordHistory({ ...state, turn: { ...turn, outcome: "skipped", points: 0, revealName: null } }));
    }
    if (action.type === "next-turn") {
      const revealName = turn.outcome === "stumped" && typeof action.revealName === "string" && action.revealName.trim()
        ? action.revealName.trim().slice(0, NAME_LIMIT) : null;
      return nextTurn(recordHistory({ ...state, turn: { ...turn, revealName } }));
    }
    return state;
  },

  getPublicState(state) {
    if (!state) return state;
    if (!state.turn) return state;
    // Expose the readable Q&A log, not the engine's internal seed or numeric values.
    const log = state.turn.events.map(event => event.type === "answer"
      ? { type: "answer", questionId: event.questionId, question: getQuestion(event.questionId)?.text || "", answer: event.answer }
      : { type: "guess", character: characterSummary(event.characterId), correct: event.correct });
    const { seed, events, ...turn } = state.turn;
    const last = events[events.length - 1];
    return { ...state, turn: { ...turn, log, canUndo: Boolean(last && last.type === "answer" && state.phase !== "reveal") } };
  },

  getStatus(context, state) {
    return state?.phase === "finished" ? "finished" : "active";
  },

  getResults(context, state) {
    const ranking = [...state.playerOrder].sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));
    const top = state.scores[ranking[0]] || 0;
    const winnerIds = ranking.filter(id => (state.scores[id] || 0) === top);
    const stumps = state.history.filter(entry => entry.round === state.round && entry.outcome === "stumped").length;
    return {
      outcome: top > 0 ? (winnerIds.length > 1 ? "tie" : "winner") : "genie",
      winnerIds: top > 0 ? winnerIds : [],
      scores: state.scores,
      stumpedThisRound: stumps,
    };
  },
};
