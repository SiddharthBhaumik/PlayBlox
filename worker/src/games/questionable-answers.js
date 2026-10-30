/**
 * Questionable Answers: two private submission phases and one shared reveal.
 * Pending words and questions are never included in public room state.
 */
const MAX_WORD_LENGTH = 80;
const MAX_QUESTION_LENGTH = 240;

export const questionableAnswers = {
  id: "questionable-answers",
  name: "Questionable Answers",
  description: "Secretly assign words, ask questions, then reveal the wonderfully questionable answers.",
  guide: "Round 1: secretly assign a word or phrase to the next player in the arrow direction. Round 2: the arrows reverse; ask the previous player a question. Once everyone submits, reveal the questions and the words paired with them. Keep submissions secret until the reveal.",
  emoji: "🤔",
  color: "#e5e8ff",
  entry: "./src/games/questionable-answers/index.html",
  players: { min: 3, max: 8 },
  interactionModel: "simultaneous",
  lateJoinPolicy: "spectate",
  spectators: { supported: true },

  canStart(context) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    return players.length >= 3 && players.length <= 8
      ? { ok: true }
      : { ok: false, reason: "Questionable Answers needs 3–8 connected players." };
  },

  createInitialState(context, previousState = null) {
    const eligibleIds = context.players.filter(player => player.role === "player" && player.connected).map(player => player.id);
    // Keep the previous seating order for a replay, but exchange two seats so
    // at least one player pairing changes before the next cycle begins.
    const previousOrder = Array.isArray(previousState?.playerOrder)
      ? previousState.playerOrder.filter(id => eligibleIds.includes(id))
      : [];
    const playerOrder = previousOrder.length === eligibleIds.length
      ? previousOrder
      : [...eligibleIds];
    if (previousState?.phase === "finished" && playerOrder.length > 1) {
      const bytes = new Uint32Array(2);
      crypto.getRandomValues(bytes);
      const first = bytes[0] % playerOrder.length;
      let second = bytes[1] % (playerOrder.length - 1);
      if (second >= first) second++;
      [playerOrder[first], playerOrder[second]] = [playerOrder[second], playerOrder[first]];
    }
    return {
      playerOrder,
      phase: "assign",
      round: 1,
      assignedWords: {},
      pendingAssignments: {},
      pendingQuestions: {},
      submittedPlayerIds: [],
      reveal: null,
    };
  },

  // The word/question ring depends on every seat. Rebuild the current
  // cycle for the smaller roster so stale assignments cannot leak or deadlock.
  onPlayerLeave(context, state, playerId) {
    const playerOrder = (state?.playerOrder || []).filter(id => id !== playerId);
    if (playerOrder.length < this.players.min) return null;
    return { playerOrder, phase: "assign", round: 1, assignedWords: {},
      pendingAssignments: {}, pendingQuestions: {}, submittedPlayerIds: [], reveal: null };
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.playerOrder)) return { ok: false, reason: "The game state is invalid." };
    if (state.phase === "finished") return { ok: false, reason: "The game has finished." };
    if (!Number.isInteger(action?.round) || action.round !== state.round) return { ok: false, reason: "That submission belongs to an earlier round. Sync and try again." };
    const id = context.player.id;
    if (!state.playerOrder.includes(id)) return { ok: false, reason: "Only selected players can submit." };

    if (state.phase === "assign") {
      if (state.pendingAssignments?.[id] !== undefined) return { ok: false, reason: "Your word is already locked in." };
      if (!action || action.type !== "assign-word" || typeof action.word !== "string") return { ok: false, reason: "Enter a word, term, or phrase." };
      const word = action.word.trim();
      if (!word || word.length > MAX_WORD_LENGTH) return { ok: false, reason: "Your word must be between 1 and 80 characters." };
      return { ok: true };
    }

    if (state.phase === "questions") {
      if (state.pendingQuestions?.[id] !== undefined) return { ok: false, reason: "Your question is already locked in." };
      if (!action || action.type !== "ask-question" || typeof action.question !== "string") return { ok: false, reason: "Enter a question for the player on your left." };
      const question = action.question.trim();
      if (!question || question.length > MAX_QUESTION_LENGTH) return { ok: false, reason: "Your question must be between 1 and 240 characters." };
      return { ok: true };
    }
    return { ok: false, reason: "This phase does not accept submissions." };
  },

  reduceAction(context, state, action) {
    const id = context.player.id;
    if (state.phase === "assign") {
      const pendingAssignments = { ...state.pendingAssignments, [id]: action.word.trim() };
      const submittedPlayerIds = state.playerOrder.filter(playerId => pendingAssignments[playerId] !== undefined);
      if (submittedPlayerIds.length < state.playerOrder.length) {
        return { ...state, pendingAssignments, submittedPlayerIds };
      }
      // Seats are clockwise. A player's right neighbor is the next seat.
      const assignedWords = {};
      state.playerOrder.forEach((assignerId, index) => {
        const receiverId = state.playerOrder[(index + 1) % state.playerOrder.length];
        assignedWords[receiverId] = pendingAssignments[assignerId];
      });
      return { ...state, phase: "questions", round: 2, assignedWords, pendingAssignments: {}, submittedPlayerIds: [] };
    }

    const pendingQuestions = { ...state.pendingQuestions, [id]: action.question.trim() };
    const submittedPlayerIds = state.playerOrder.filter(playerId => pendingQuestions[playerId] !== undefined);
    if (submittedPlayerIds.length < state.playerOrder.length) {
      return { ...state, pendingQuestions, submittedPlayerIds };
    }

    // A player asks the person immediately to their left (previous seat).
    // That recipient answers automatically with their own secret assigned text.
    const pairs = state.playerOrder.map((askerId, index) => {
      const recipientId = state.playerOrder[(index - 1 + state.playerOrder.length) % state.playerOrder.length];
      return {
        askerId,
        recipientId,
        question: pendingQuestions[askerId],
        answer: state.assignedWords[recipientId],
      };
    });
    return {
      ...state,
      phase: "finished",
      round: 3,
      pendingQuestions: {},
      submittedPlayerIds: state.playerOrder.slice(),
      reveal: pairs,
    };
  },

  getPublicState(state) {
    if (!state) return state;
    const publicState = {
      playerOrder: state.playerOrder,
      phase: state.phase,
      round: state.round,
      submittedPlayerIds: state.submittedPlayerIds,
      reveal: state.phase === "finished" ? state.reveal : null,
    };
    return publicState;
  },

  getStatus(context, state) {
    return state.phase === "finished" ? "finished" : "active";
  },

  getResults(context, state) {
    return { outcome: state.phase === "finished" ? "complete" : "unfinished", pairCount: state.reveal?.length || 0 };
  },
};
