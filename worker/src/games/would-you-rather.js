/**
 * Would You Rather: every player hosts exactly one question turn.
 * Choices and individual predictions stay private until all answerers submit.
 */
const MAX_QUESTION_LENGTH = 240;
const MAX_OPTION_LENGTH = 100;
const validChoice = value => value === "A" || value === "B";
const currentMaster = state => state.playerOrder.find(id => !state.completedMasterIds.includes(id)) || null;
const answererIds = state => state.playerOrder.filter(id => id !== state.currentMasterId);

function resolveTurn(state) {
  const masterId = state.currentMasterId;
  const answerers = answererIds(state);
  const answers = state.answers || {};
  const optionACount = answerers.filter(id => answers[id]?.choice === "A").length;
  const actualPercentA = answerers.length ? optionACount / answerers.length * 100 : 0;
  const predictedPercentA = state.currentQuestion.predictedPercentA;
  const masterPoints = Math.max(0, Math.min(10,
    Math.round(10 * (1 - Math.abs(predictedPercentA - actualPercentA) / 100))));
  const scores = { ...state.scores, [masterId]: (state.scores[masterId] || 0) + masterPoints };
  const predictionResults = {};
  const pointsByPlayer = { [masterId]: masterPoints };

  for (const id of answerers) {
    const answer = answers[id];
    const hasPrediction = Boolean(answer?.targetId && validChoice(answer?.predictedChoice));
    const correct = hasPrediction && answers[answer.targetId]?.choice === answer.predictedChoice;
    const points = correct ? 3 : 0;
    predictionResults[id] = { attempted: hasPrediction, correct: Boolean(correct) };
    pointsByPlayer[id] = points;
    scores[id] = (scores[id] || 0) + points;
  }

  const result = {
    turnNumber: state.turnNumber,
    masterId,
    question: state.currentQuestion.question,
    optionA: state.currentQuestion.optionA,
    optionB: state.currentQuestion.optionB,
    predictedPercentA,
    actualPercentA: Number(actualPercentA.toFixed(2)),
    actualPercentB: Number((100 - actualPercentA).toFixed(2)),
    optionACount,
    optionBCount: answerers.length - optionACount,
    answererCount: answerers.length,
    masterPoints,
    answers: Object.fromEntries(answerers.map(id => [id, {
      choice: answers[id].choice,
      targetId: answers[id].targetId || null,
      predictedChoice: answers[id].predictedChoice || null,
      predictionAttempted: Boolean(answers[id].targetId && validChoice(answers[id].predictedChoice)),
      predictionCorrect: Boolean(predictionResults[id].correct),
      points: pointsByPlayer[id],
    }])),
    predictionResults,
    pointsByPlayer,
    scores: { ...scores },
  };
  const completedMasterIds = [...state.completedMasterIds, masterId];
  const finished = completedMasterIds.length >= state.playerOrder.length;
  const nextMasterId = finished ? null : state.playerOrder.find(id => !completedMasterIds.includes(id));
  return {
    ...state,
    phase: finished ? "finished" : "question",
    turnNumber: state.turnNumber + (finished ? 0 : 1),
    completedMasterIds,
    currentMasterId: nextMasterId,
    currentQuestion: null,
    answers: {},
    submittedPlayerIds: [],
    scores,
    history: [...state.history, result],
    lastTurn: result,
  };
}

export const wouldYouRather = {
  id: "would-you-rather",
  name: "Would You Rather",
  description: "Predict the group split, read your friends, and earn points for knowing the room.",
  guide: "GOAL: Earn the most points by predicting how the group thinks. There are 2–8 players, and the game lasts exactly one turn per player. Every player becomes Question Master once.\n\nQUESTION MASTER: Write one Would You Rather question and two distinct options. Use the percentage meter to predict what percentage of the other players will choose Option A. Option B is the remaining percentage. The Question Master does not answer the question.\n\nEVERYONE ELSE: Secretly choose Option A or B. You may also make one optional prediction about which option another answering player will choose. You cannot predict yourself or the Question Master. In a 2-player game there is nobody else eligible to predict, so this part is skipped.\n\nREVEAL & SCORING: Choices and individual predictions stay hidden until every answering player has locked in. The Question Master earns up to 10 points: 10 minus the percentage-point difference between the predicted and actual Option A share, divided by 10 and rounded to the nearest whole point (minimum 0). Each other player earns 3 points for a correct optional prediction, otherwise 0. Skipping a prediction has no penalty.\n\nAfter the reveal, the next player becomes Question Master. The game ends after everyone has been Question Master once. A scrollable history keeps every question, choice, prediction, and turn score.",
  emoji: "🤷",
  color: "#f7dfb5",
  entry: "./src/games/would-you-rather/index.html",
  players: { min: 2, max: 8 },
  interactionModel: "simultaneous",
  lateJoinPolicy: "spectate",
  spectators: { supported: true },

  canStart(context) {
    const players = context.players.filter(player => player.role === "player" && player.connected);
    return players.length >= 2 && players.length <= 8
      ? { ok: true }
      : { ok: false, reason: "Would You Rather needs 2–8 connected players." };
  },

  createInitialState(context) {
    const playerOrder = context.players.filter(player => player.role === "player" && player.connected).map(player => player.id);
    return {
      playerOrder,
      phase: "question",
      turnNumber: 1,
      completedMasterIds: [],
      currentMasterId: playerOrder[0] || null,
      currentQuestion: null,
      answers: {},
      submittedPlayerIds: [],
      scores: Object.fromEntries(playerOrder.map(id => [id, 0])),
      history: [],
      lastTurn: null,
    };
  },

  onPlayerLeave(context, state, playerId) {
    if (!state || !Array.isArray(state.playerOrder)) return null;
    const playerOrder = state.playerOrder.filter(id => id !== playerId);
    if (playerOrder.length < this.players.min) return null;
    const completedMasterIds = (state.completedMasterIds || []).filter(id => id !== playerId);
    const scores = { ...state.scores };
    delete scores[playerId];

    if (state.phase === "finished") {
      return { ...state, playerOrder, completedMasterIds, scores };
    }

    // If the current Question Master leaves, discard that unfinished question.
    if (state.currentMasterId === playerId) {
      const nextMasterId = playerOrder.find(id => !completedMasterIds.includes(id)) || null;
      return {
        ...state, playerOrder, completedMasterIds, scores,
        phase: nextMasterId ? "question" : "finished",
        turnNumber: completedMasterIds.length + 1,
        currentMasterId: nextMasterId,
        currentQuestion: null, answers: {}, submittedPlayerIds: [],
      };
    }

    let nextState = {
      ...state, playerOrder, completedMasterIds, scores,
      answers: { ...(state.answers || {}) },
      submittedPlayerIds: (state.submittedPlayerIds || []).filter(id => id !== playerId),
    };
    delete nextState.answers[playerId];
    // A prediction about a player who left is no longer eligible.
    for (const [id, answer] of Object.entries(nextState.answers)) {
      if (answer.targetId === playerId) nextState.answers[id] = { ...answer, targetId: null, predictedChoice: null };
    }
    if (nextState.phase === "answers") {
      const expected = answererIds(nextState);
      nextState.submittedPlayerIds = expected.filter(id => nextState.answers[id] !== undefined);
      if (nextState.submittedPlayerIds.length === expected.length) nextState = resolveTurn(nextState);
    }
    return nextState;
  },

  validateAction(context, state, action) {
    if (!state || !Array.isArray(state.playerOrder)) return { ok: false, reason: "The game state is invalid." };
    if (state.phase === "finished") return { ok: false, reason: "The game has finished." };
    if (!Number.isInteger(action?.turnNumber) || action.turnNumber !== state.turnNumber) {
      return { ok: false, reason: "That action belongs to an earlier turn. Sync and try again." };
    }
    const id = context.player.id;
    if (!state.playerOrder.includes(id)) return { ok: false, reason: "Only selected players can play." };

    if (state.phase === "question") {
      if (id !== state.currentMasterId) return { ok: false, reason: "Wait for the Question Master to write the question." };
      if (action?.type !== "set-question") return { ok: false, reason: "The Question Master must submit a question and two options." };
      const question = typeof action.question === "string" ? action.question.trim() : "";
      const optionA = typeof action.optionA === "string" ? action.optionA.trim() : "";
      const optionB = typeof action.optionB === "string" ? action.optionB.trim() : "";
      if (!question || question.length > MAX_QUESTION_LENGTH) return { ok: false, reason: "Write a question (up to 240 characters)." };
      if (!optionA || !optionB || optionA.length > MAX_OPTION_LENGTH || optionB.length > MAX_OPTION_LENGTH) {
        return { ok: false, reason: "Enter both options (up to 100 characters each)." };
      }
      if (optionA.toLocaleLowerCase() === optionB.toLocaleLowerCase()) return { ok: false, reason: "Option A and Option B must be different." };
      if (!Number.isInteger(action.predictedPercentA) || action.predictedPercentA < 0 || action.predictedPercentA > 100) {
        return { ok: false, reason: "Choose a percentage from 0 to 100." };
      }
      return { ok: true };
    }

    if (state.phase === "answers") {
      if (id === state.currentMasterId) return { ok: false, reason: "The Question Master does not answer their own question." };
      if (state.answers?.[id] !== undefined) return { ok: false, reason: "Your choice is already locked." };
      if (action?.type !== "submit-answer" || !validChoice(action.choice)) return { ok: false, reason: "Choose Option A or Option B." };
      const eligibleTargets = answererIds(state).filter(targetId => targetId !== id);
      const targetId = action.targetId || null;
      const predictedChoice = action.predictedChoice || null;
      if (targetId === null && predictedChoice !== null) return { ok: false, reason: "Choose a player as well as a predicted option, or skip the prediction." };
      if (targetId !== null && (!eligibleTargets.includes(targetId) || !validChoice(predictedChoice))) {
        return { ok: false, reason: "Choose another answering player and predict A or B." };
      }
      return { ok: true };
    }
    return { ok: false, reason: "This phase does not accept actions." };
  },

  reduceAction(context, state, action) {
    if (action.type === "set-question") {
      return {
        ...state,
        phase: "answers",
        currentQuestion: {
          question: action.question.trim(),
          optionA: action.optionA.trim(),
          optionB: action.optionB.trim(),
          predictedPercentA: action.predictedPercentA,
        },
        answers: {},
        submittedPlayerIds: [],
      };
    }
    const answers = {
      ...state.answers,
      [context.player.id]: {
        choice: action.choice,
        targetId: action.targetId || null,
        predictedChoice: action.targetId ? action.predictedChoice : null,
      },
    };
    const submittedPlayerIds = answererIds(state).filter(id => answers[id] !== undefined);
    const nextState = { ...state, answers, submittedPlayerIds };
    return submittedPlayerIds.length === answererIds(state).length ? resolveTurn(nextState) : nextState;
  },

  getPublicState(state) {
    if (!state) return state;
    return {
      playerOrder: state.playerOrder,
      phase: state.phase,
      turnNumber: state.turnNumber,
      totalTurns: state.playerOrder.length,
      completedMasterIds: state.completedMasterIds,
      currentMasterId: state.currentMasterId,
      currentQuestion: state.currentQuestion ? {
        question: state.currentQuestion.question,
        optionA: state.currentQuestion.optionA,
        optionB: state.currentQuestion.optionB,
      } : null,
      submittedPlayerIds: state.submittedPlayerIds,
      scores: state.scores,
      history: state.history,
      lastTurn: state.lastTurn,
    };
  },

  getStatus(context, state) { return state.phase === "finished" ? "finished" : "active"; },
  getResults(context, state) {
    return {
      outcome: state.phase === "finished" ? "complete" : "unfinished",
      scores: state.scores,
      playerOrder: state.playerOrder,
      history: state.history,
      totalTurns: state.history.length,
    };
  },
};
