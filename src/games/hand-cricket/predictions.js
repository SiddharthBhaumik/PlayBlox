const NUMERIC_CHOICES = ["1", "2", "3", "4", "5", "6"];
const ALL_CHOICES = [...NUMERIC_CHOICES, "fist"];

const sum = values => values.reduce((total, value) => total + value, 0);
const choiceOf = value => value === "fist" ? "fist" : NUMERIC_CHOICES.includes(String(value)) ? String(value) : null;
const rate = (numerator, denominator) => denominator ? numerator / denominator : null;
const emptyCounts = choices => Object.fromEntries(choices.map(choice => [choice, 0]));
const keyOf = (...parts) => JSON.stringify(parts);

function outcomeContext(delivery) {
  if (delivery.out) return "after-wicket";
  if (delivery.runs >= 5) return "after-5-or-6-runs";
  if (delivery.runs >= 3) return "after-3-or-4-runs";
  if (delivery.runs >= 1) return "after-1-or-2-runs";
  return "after-other-outcome";
}

function normalizedPrior(counts, choices, prior, strength) {
  const total = sum(choices.map(choice => counts?.[choice] || 0));
  const denominator = total + strength;
  return Object.fromEntries(choices.map(choice => [
    choice,
    denominator
      ? ((counts?.[choice] || 0) + strength * (prior[choice] || 0)) / denominator
      : prior[choice]
  ]));
}

function topChoice(probabilities, choices) {
  return choices.reduce((best, choice) =>
    probabilities[choice] > probabilities[best] ? choice : best, choices[0]);
}

function scorePrediction(probabilities, actual, choices) {
  const epsilon = 1e-12;
  const logLoss = -Math.log(Math.max(epsilon, probabilities[actual] || 0));
  const brierScore = sum(choices.map(choice =>
    ((probabilities[choice] || 0) - (choice === actual ? 1 : 0)) ** 2
  ));
  return {
    correct: topChoice(probabilities, choices) === actual,
    logLoss,
    brierScore,
    confidence: probabilities[topChoice(probabilities, choices)]
  };
}

function createMetric() {
  return { predictions: 0, correct: 0, logLossTotal: 0, brierScoreTotal: 0, confidenceTotal: 0 };
}

function addMetric(metric, probabilities, actual, choices) {
  const score = scorePrediction(probabilities, actual, choices);
  metric.predictions++;
  metric.correct += Number(score.correct);
  metric.logLossTotal += score.logLoss;
  metric.brierScoreTotal += score.brierScore;
  metric.confidenceTotal += score.confidence;
  return score;
}

function finalizeMetric(metric) {
  return {
    predictions: metric.predictions,
    correct: metric.correct,
    accuracy: rate(metric.correct, metric.predictions),
    meanLogLoss: rate(metric.logLossTotal, metric.predictions),
    meanBrierScore: rate(metric.brierScoreTotal, metric.predictions),
    meanConfidence: rate(metric.confidenceTotal, metric.predictions)
  };
}

function disabledResult(reason) {
  return {
    version: 1,
    enabled: false,
    teamMode: false,
    disabledReason: reason,
    scope: "regular-innings",
    scoredDeliveries: 0,
    models: {},
    recentPredictions: [],
    nextPrediction: null
  };
}

/**
 * Prequential prediction/backtesting for team-mode Hand Cricket.
 *
 * Each delivery is predicted before its current batter choice is added to any
 * history. The current bowler choice is also unavailable to the prediction:
 * only that bowler's previous choice in this exact matchup may be used.
 */
export function buildHandCricketPredictions(state, options = {}) {
  if (state?.config?.mode !== "team") {
    return disabledResult("Hand Cricket predictions are available in team mode only.");
  }

  const allowFist = state?.config?.allowFist === true;
  const choices = allowFist ? ALL_CHOICES : NUMERIC_CHOICES;
  const uniform = Object.fromEntries(choices.map(choice => [choice, 1 / choices.length]));
  const priorStrength = Number.isFinite(options.priorStrength)
    ? Math.max(0, options.priorStrength) : 3;
  const minContextSamples = Number.isInteger(options.minContextSamples)
    ? Math.max(1, options.minContextSamples) : 2;

  const deliveries = (Array.isArray(state.history) ? state.history : [])
    .filter(delivery => !delivery.superOver
      && ["red", "blue"].includes(delivery.battingTeam)
      && [1, 2].includes(delivery.innings)
      && delivery.batterId && delivery.bowlerId
      && choiceOf(delivery.batChoice)
      && choiceOf(delivery.bowlChoice)
      && (allowFist || (delivery.batChoice !== "fist" && delivery.bowlChoice !== "fist")));

  const modelNames = [
    "uniform",
    "batter-frequency",
    "batter-previous-choice",
    "batter-previous-outcome",
    "same-matchup-previous-bowler-choice"
  ];
  const metrics = Object.fromEntries(modelNames.map(name => [name, createMetric()]));
  const recentPredictions = [];

  // All maps are scoped to one batter's one team innings, or one matchup in
  // that same innings. This prevents evidence crossing innings or matches.
  const batterCounts = new Map();
  const lastDeliveryByBatter = new Map();
  const transitionCountsByBatter = new Map();
  const outcomeCountsByBatter = new Map();
  const lastBowlerChoiceByMatchup = new Map();
  const matchupTransitionCounts = new Map();

  const getCounts = (map, key) => {
    if (!map.has(key)) map.set(key, emptyCounts(choices));
    return map.get(key);
  };
  const getNestedCounts = (map, key, context) => {
    if (!map.has(key)) map.set(key, new Map());
    const nested = map.get(key);
    if (!nested.has(context)) nested.set(context, emptyCounts(choices));
    return nested.get(context);
  };

  for (let index = 0; index < deliveries.length; index++) {
    const delivery = deliveries[index];
    const batterKey = keyOf(delivery.innings, delivery.battingTeam, delivery.batterId);
    const matchupKey = keyOf(delivery.innings, delivery.battingTeam, delivery.batterId, delivery.bowlerId);
    const previousBatterDelivery = lastDeliveryByBatter.get(batterKey);
    const previousMatchupBowlerChoice = lastBowlerChoiceByMatchup.get(matchupKey);

    // Construct every forecast using prior deliveries only.
    const marginalCounts = getCounts(batterCounts, batterKey);
    const marginal = normalizedPrior(marginalCounts, choices, uniform, priorStrength);
    const previousChoice = previousBatterDelivery
      ? choiceOf(previousBatterDelivery.batChoice) : null;
    const previousOutcome = previousBatterDelivery
      ? outcomeContext(previousBatterDelivery) : null;

    const transitionCounts = previousChoice
      ? getNestedCounts(transitionCountsByBatter, batterKey, previousChoice) : emptyCounts(choices);
    const outcomeCounts = previousOutcome
      ? getNestedCounts(outcomeCountsByBatter, batterKey, previousOutcome) : emptyCounts(choices);
    const matchupCounts = previousMatchupBowlerChoice
      ? getNestedCounts(matchupTransitionCounts, matchupKey, previousMatchupBowlerChoice) : emptyCounts(choices);

    const forecasts = {
      uniform,
      "batter-frequency": marginal,
      "batter-previous-choice": previousChoice
        ? normalizedPrior(transitionCounts, choices, marginal, priorStrength) : marginal,
      "batter-previous-outcome": previousOutcome
        ? normalizedPrior(outcomeCounts, choices, marginal, priorStrength) : marginal,
      "same-matchup-previous-bowler-choice": previousMatchupBowlerChoice
        ? normalizedPrior(matchupCounts, choices, marginal, priorStrength) : marginal
    };

    const actual = choiceOf(delivery.batChoice);
    const scored = {};
    for (const modelName of modelNames) {
      scored[modelName] = addMetric(metrics[modelName], forecasts[modelName], actual, choices);
    }

    recentPredictions.push({
      deliveryIndex: index,
      innings: delivery.innings,
      battingTeam: delivery.battingTeam,
      batterId: delivery.batterId,
      bowlerId: delivery.bowlerId,
      actual,
      predictions: Object.fromEntries(modelNames.map(modelName => [modelName, {
        choice: topChoice(forecasts[modelName], choices),
        confidence: forecasts[modelName][topChoice(forecasts[modelName], choices)],
        probabilities: forecasts[modelName],
        correct: scored[modelName].correct
      }]))
    });
    if (recentPredictions.length > 12) recentPredictions.shift();

    // Only after scoring do we reveal this delivery to the historical models.
    if (previousBatterDelivery) {
      const priorChoice = choiceOf(previousBatterDelivery.batChoice);
      getNestedCounts(transitionCountsByBatter, batterKey, priorChoice)[actual]++;
      getNestedCounts(outcomeCountsByBatter, batterKey, outcomeContext(previousBatterDelivery))[actual]++;
    }
    if (previousMatchupBowlerChoice) {
      getNestedCounts(matchupTransitionCounts, matchupKey, previousMatchupBowlerChoice)[actual]++;
    }
    marginalCounts[actual]++;
    lastDeliveryByBatter.set(batterKey, delivery);
    lastBowlerChoiceByMatchup.set(matchupKey, choiceOf(delivery.bowlChoice));
  }

  const nextPrediction = (() => {
    const batterId = state.currentBatterId;
    const bowlerId = state.currentBowlerId;
    const innings = state.innings;
    const battingTeam = state.battingTeam;
    if (state.phase !== "playing" || !batterId || !bowlerId
      || ![1, 2].includes(innings) || !["red", "blue"].includes(battingTeam)) return null;

    const batterKey = keyOf(innings, battingTeam, batterId);
    const matchupKey = keyOf(innings, battingTeam, batterId, bowlerId);
    const previousBatterDelivery = lastDeliveryByBatter.get(batterKey);
    const previousMatchupBowlerChoice = lastBowlerChoiceByMatchup.get(matchupKey);
    const marginalCounts = getCounts(batterCounts, batterKey);
    const marginal = normalizedPrior(marginalCounts, choices, uniform, priorStrength);
    const previousChoice = previousBatterDelivery ? choiceOf(previousBatterDelivery.batChoice) : null;
    const previousOutcome = previousBatterDelivery ? outcomeContext(previousBatterDelivery) : null;
    const transitionCounts = previousChoice
      ? getNestedCounts(transitionCountsByBatter, batterKey, previousChoice) : emptyCounts(choices);
    const outcomeCounts = previousOutcome
      ? getNestedCounts(outcomeCountsByBatter, batterKey, previousOutcome) : emptyCounts(choices);
    const matchupCounts = previousMatchupBowlerChoice
      ? getNestedCounts(matchupTransitionCounts, matchupKey, previousMatchupBowlerChoice) : emptyCounts(choices);

    const forecasts = {
      uniform,
      "batter-frequency": marginal,
      "batter-previous-choice": previousChoice
        ? normalizedPrior(transitionCounts, choices, marginal, priorStrength) : marginal,
      "batter-previous-outcome": previousOutcome
        ? normalizedPrior(outcomeCounts, choices, marginal, priorStrength) : marginal,
      "same-matchup-previous-bowler-choice": previousMatchupBowlerChoice
        ? normalizedPrior(matchupCounts, choices, marginal, priorStrength) : marginal
    };
    const contexts = {
      batterFrequencySamples: sum(choices.map(choice => marginalCounts[choice])),
      previousBatterChoice: previousChoice,
      previousOutcome,
      previousChoiceContextSamples: sum(choices.map(choice => transitionCounts[choice])),
      previousOutcomeContextSamples: sum(choices.map(choice => outcomeCounts[choice])),
      previousSameMatchupBowlerChoice: previousMatchupBowlerChoice,
      sameMatchupContextSamples: sum(choices.map(choice => matchupCounts[choice]))
    };

    return {
      innings,
      battingTeam,
      batterId,
      bowlerId,
      contexts,
      models: Object.fromEntries(modelNames.map(modelName => {
        const probabilities = forecasts[modelName];
        const choice = topChoice(probabilities, choices);
        const contextSamples = modelName === "batter-previous-choice"
          ? contexts.previousChoiceContextSamples
          : modelName === "batter-previous-outcome"
            ? contexts.previousOutcomeContextSamples
            : modelName === "same-matchup-previous-bowler-choice"
              ? contexts.sameMatchupContextSamples
              : contexts.batterFrequencySamples;
        return [modelName, {
          choice,
          confidence: probabilities[choice],
          probabilities,
          contextSamples,
          sufficientlySupported: modelName === "uniform"
            || (modelName === "batter-frequency" && contextSamples >= minContextSamples)
            || contextSamples >= minContextSamples
        }];
      }))
    };
  })();

  return {
    version: 1,
    enabled: true,
    teamMode: true,
    scope: "regular-innings",
    choiceLabels: choices,
    scoredDeliveries: deliveries.length,
    settings: { priorStrength, minContextSamples },
    models: Object.fromEntries(modelNames.map(name => [name, finalizeMetric(metrics[name])])),
    recentPredictions,
    nextPrediction
  };
}
