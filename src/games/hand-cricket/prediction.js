const CHOICES = ["1", "2", "3", "4", "5", "6", "fist"];
const NUMERIC_CHOICES = CHOICES.slice(0, 6);
const choiceOf = value => value === "fist" ? "fist" : NUMERIC_CHOICES.includes(String(value)) ? String(value) : null;
const sum = values => values.reduce((total, value) => total + value, 0);
const scopeOf = delivery => `${delivery.innings}:${delivery.battingTeam}`;
const scopedKey = (...parts) => JSON.stringify(parts);

function emptyCounts(choices) {
  return Object.fromEntries(choices.map(choice => [choice, 0]));
}

function getCounts(map, key, choices) {
  if (!map.has(key)) map.set(key, emptyCounts(choices));
  return map.get(key);
}

function probabilitiesFromCounts(counts, choices, prior, alpha) {
  const total = sum(choices.map(choice => counts[choice] || 0));
  const denominator = total + alpha;
  return Object.fromEntries(choices.map(choice => [
    choice,
    denominator
      ? ((counts[choice] || 0) + alpha * prior[choice]) / denominator
      : prior[choice]
  ]));
}

function uniformPrior(choices) {
  return Object.fromEntries(choices.map(choice => [choice, 1 / choices.length]));
}

function normalizeWeights(parts) {
  const available = parts.filter(part => part.weight > 0);
  const totalWeight = sum(available.map(part => part.weight));
  if (!totalWeight) return {};
  const choices = Object.keys(available[0].probabilities);
  return Object.fromEntries(choices.map(choice => [
    choice,
    sum(available.map(part => part.probabilities[choice] * part.weight)) / totalWeight
  ]));
}

function argmax(probabilities, choices) {
  return choices.reduce((best, choice) =>
    probabilities[choice] > probabilities[best] ? choice : best, choices[0]);
}

function scorePrediction(probabilities, actual, choices) {
  const predicted = argmax(probabilities, choices);
  const epsilon = 1e-15;
  return {
    predicted,
    correct: predicted === actual,
    logLoss: -Math.log(Math.max(epsilon, probabilities[actual] || 0)),
    brier: sum(choices.map(choice =>
      ((probabilities[choice] || 0) - (choice === actual ? 1 : 0)) ** 2
    ))
  };
}

function summarizeScores(rows) {
  if (!rows.length) return { samples: 0, accuracy: null, logLoss: null, brierScore: null };
  return {
    samples: rows.length,
    accuracy: rows.filter(row => row.correct).length / rows.length,
    logLoss: sum(rows.map(row => row.logLoss)) / rows.length,
    brierScore: sum(rows.map(row => row.brier)) / rows.length
  };
}

/**
 * Chronological, prequential prediction for regular team-mode innings.
 * Predictions use only earlier deliveries. Batter sequential patterns reset
 * after a dismissal, while a player's overall frequency and matchup history
 * remain available if that player later returns to bat.
 */
export function buildHandCricketPredictions(state, options = {}) {
  if (state?.config?.mode !== "team") {
    return {
      version: 1,
      enabled: false,
      teamMode: false,
      disabledReason: "Hand Cricket predictions are available in team mode only.",
      scope: "regular-innings",
      evaluatedDeliveries: 0,
      choices: [],
      metrics: {},
      predictions: []
    };
  }

  const choices = state?.config?.allowFist === true ? CHOICES : NUMERIC_CHOICES;
  const alpha = Number.isFinite(options.alpha) && options.alpha > 0 ? options.alpha : 6;
  const minContextSamples = Number.isInteger(options.minContextSamples) && options.minContextSamples >= 1
    ? options.minContextSamples : 3;
  const deliveries = (Array.isArray(state?.history) ? state.history : []).filter(delivery =>
    delivery && typeof delivery === "object"
    && !delivery.superOver
    && ["red", "blue"].includes(delivery.battingTeam)
    && [1, 2].includes(delivery.innings)
    && delivery.batterId
    && delivery.bowlerId
    && choiceOf(delivery.batChoice)
    && choiceOf(delivery.bowlChoice)
    && choices.includes(choiceOf(delivery.batChoice))
    && choices.includes(choiceOf(delivery.bowlChoice))
  );

  const uniform = uniformPrior(choices);
  const globalCounts = new Map();
  const batterCounts = new Map();
  const batterTransitionCounts = new Map();
  const matchupCounts = new Map();
  const matchupBowlerTransitionCounts = new Map();
  const previousBatterChoice = new Map();
  const batterAppearance = new Map();
  const previousMatchupBowlerChoice = new Map();
  const scored = { uniform: [], global: [], batter: [], contextual: [] };
  const predictions = [];

  for (let index = 0; index < deliveries.length; index++) {
    const delivery = deliveries[index];
    const scope = scopeOf(delivery);
    const batterKey = scopedKey(scope, delivery.batterId);
    const appearanceIndex = batterAppearance.get(batterKey) || 0;
    const appearanceKey = scopedKey(batterKey, appearanceIndex);
    const matchupKey = scopedKey(scope, delivery.batterId, delivery.bowlerId);
    const previousBatter = previousBatterChoice.get(appearanceKey);
    const previousMatchupBowler = previousMatchupBowlerChoice.get(matchupKey);

    // Snapshot every distribution before learning from this delivery.
    const seenGlobal = getCounts(globalCounts, scope, choices);
    const globalPrior = probabilitiesFromCounts(seenGlobal, choices, uniform, alpha);
    const seenBatter = getCounts(batterCounts, batterKey, choices);
    const batterPrior = probabilitiesFromCounts(seenBatter, choices, globalPrior, alpha);

    const transitionKey = previousBatter === undefined
      ? null : scopedKey(appearanceKey, previousBatter);
    const transitionCounts = transitionKey
      ? getCounts(batterTransitionCounts, transitionKey, choices) : emptyCounts(choices);
    const transitionPrior = probabilitiesFromCounts(transitionCounts, choices, batterPrior, alpha);

    const seenMatchup = getCounts(matchupCounts, matchupKey, choices);
    const matchupPrior = probabilitiesFromCounts(seenMatchup, choices, batterPrior, alpha);

    const matchupTransitionKey = previousMatchupBowler === undefined
      ? null : scopedKey(matchupKey, previousMatchupBowler);
    const matchupTransitionCounts = matchupTransitionKey
      ? getCounts(matchupBowlerTransitionCounts, matchupTransitionKey, choices) : emptyCounts(choices);
    const matchupTransitionPrior = probabilitiesFromCounts(
      matchupTransitionCounts, choices, matchupPrior, alpha
    );

    const contextualParts = [
      { probabilities: batterPrior, weight: 0.25 },
      { probabilities: transitionPrior, weight: previousBatter !== undefined
          && sum(choices.map(choice => transitionCounts[choice])) >= minContextSamples ? 0.35 : 0 },
      { probabilities: matchupPrior, weight: sum(choices.map(choice => seenMatchup[choice])) >= minContextSamples ? 0.15 : 0 },
      { probabilities: matchupTransitionPrior, weight: previousMatchupBowler !== undefined
          && sum(choices.map(choice => matchupTransitionCounts[choice])) >= minContextSamples ? 0.25 : 0 }
    ];
    const contextual = normalizeWeights(contextualParts);
    const actual = choiceOf(delivery.batChoice);
    const distributions = { uniform, global: globalPrior, batter: batterPrior, contextual };
    const row = {
      deliveryIndex: index,
      innings: delivery.innings,
      battingTeam: delivery.battingTeam,
      batterId: delivery.batterId,
      bowlerId: delivery.bowlerId,
      batterAppearance: appearanceIndex,
      actualChoice: actual,
      previousBatterChoice: previousBatter ?? null,
      previousSameMatchupBowlerChoice: previousMatchupBowler ?? null,
      evidence: {
        global: sum(choices.map(choice => seenGlobal[choice])),
        batter: sum(choices.map(choice => seenBatter[choice])),
        batterTransition: sum(choices.map(choice => transitionCounts[choice])),
        matchup: sum(choices.map(choice => seenMatchup[choice])),
        matchupBowlerTransition: sum(choices.map(choice => matchupTransitionCounts[choice]))
      },
      models: {}
    };

    for (const [name, probabilities] of Object.entries(distributions)) {
      const score = scorePrediction(probabilities, actual, choices);
      scored[name].push(score);
      row.models[name] = {
        predictedChoice: score.predicted,
        confidence: probabilities[score.predicted],
        probabilities
      };
    }
    predictions.push(row);

    // Update only after scoring. A dismissal ends this batter's sequential
    // appearance; marginal and exact-matchup evidence deliberately survive.
    getCounts(globalCounts, scope, choices)[actual]++;
    getCounts(batterCounts, batterKey, choices)[actual]++;
    if (previousBatter !== undefined) {
      getCounts(batterTransitionCounts, transitionKey, choices)[actual]++;
    }
    getCounts(matchupCounts, matchupKey, choices)[actual]++;
    if (previousMatchupBowler !== undefined) {
      getCounts(matchupBowlerTransitionCounts, matchupTransitionKey, choices)[actual]++;
    }
    if (delivery.out === true) {
      batterAppearance.set(batterKey, appearanceIndex + 1);
    } else {
      previousBatterChoice.set(appearanceKey, actual);
    }
    previousMatchupBowlerChoice.set(matchupKey, choiceOf(delivery.bowlChoice));
  }

  return {
    version: 1,
    enabled: true,
    teamMode: true,
    scope: "regular-innings",
    evaluatedDeliveries: deliveries.length,
    choices,
    smoothing: { alpha, minContextSamples, method: "hierarchical-dirichlet" },
    metrics: Object.fromEntries(Object.entries(scored).map(([name, rows]) => [
      name, summarizeScores(rows)
    ])),
    predictions
  };
}
