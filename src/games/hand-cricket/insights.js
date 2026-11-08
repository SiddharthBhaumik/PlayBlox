const CHOICES = ["1", "2", "3", "4", "5", "6", "fist"];
const NUMERIC_CHOICES = ["1", "2", "3", "4", "5", "6"];

const choiceOf = value => value === "fist" ? "fist" : NUMERIC_CHOICES.includes(String(value)) ? String(value) : null;
const emptyCounts = () => Object.fromEntries(CHOICES.map(choice => [choice, 0]));
const sum = values => values.reduce((total, value) => total + value, 0);
const mean = values => values.length ? sum(values) / values.length : null;
const rate = (numerator, denominator) => denominator ? numerator / denominator : null;
const nicknameFor = (id, roster) => roster.find(player => player.id === id)?.nickname || "Player";

function distribution(deliveries, field) {
  const counts = emptyCounts();
  for (const delivery of deliveries) {
    const choice = choiceOf(delivery[field]);
    if (choice) counts[choice]++;
  }
  const total = sum(Object.values(counts));
  return CHOICES.map(choice => ({
    choice,
    count: counts[choice],
    probability: rate(counts[choice], total),
    percent: total ? counts[choice] * 100 / total : 0
  }));
}

function entropy(distributionRows, possibleChoices) {
  const probabilities = distributionRows.map(row => row.probability).filter(value => value > 0);
  const bits = probabilities.length
    ? -sum(probabilities.map(probability => probability * Math.log2(probability)))
    : 0;
  const maximumBits = Math.log2(possibleChoices);
  return {
    bits,
    maximumBits,
    normalized: maximumBits ? bits / maximumBits : null
  };
}

function conditionalTable(rows, contextField, outcomeField) {
  const counts = Object.fromEntries(CHOICES.map(choice => [choice, emptyCounts()]));
  for (const row of rows) {
    const context = choiceOf(row[contextField]);
    const outcome = choiceOf(row[outcomeField]);
    if (context && outcome) counts[context][outcome]++;
  }
  return Object.fromEntries(CHOICES.map(context => {
    const total = sum(Object.values(counts[context]));
    return [context, {
      total,
      counts: counts[context],
      probabilities: Object.fromEntries(CHOICES.map(outcome => [
        outcome, rate(counts[context][outcome], total)
      ]))
    }];
  }));
}

function transitionStats(segments) {
  const counts = Object.fromEntries(CHOICES.map(choice => [choice, emptyCounts()]));
  let transitions = 0, repeats = 0, switches = 0, upward = 0, downward = 0;
  let numericTransitions = 0;

  for (const deliveries of segments) {
    let previous = null;
    for (const delivery of deliveries) {
      const current = choiceOf(delivery.batChoice);
      if (!current) continue;
      if (previous) {
        counts[previous][current]++;
        transitions++;
        if (previous === current) repeats++;
        else switches++;
        if (NUMERIC_CHOICES.includes(previous) && NUMERIC_CHOICES.includes(current)) {
          numericTransitions++;
          if (Number(current) > Number(previous)) upward++;
          if (Number(current) < Number(previous)) downward++;
        }
      }
      previous = current;
    }
  }

  const matrix = Object.fromEntries(CHOICES.map(from => {
    const total = sum(Object.values(counts[from]));
    return [from, {
      total,
      counts: counts[from],
      probabilities: Object.fromEntries(CHOICES.map(to => [
        to, rate(counts[from][to], total)
      ]))
    }];
  }));

  return {
    transitions,
    repeats,
    switches,
    repeatRate: rate(repeats, transitions),
    switchRate: rate(switches, transitions),
    numericTransitions,
    upwardSwitches: upward,
    downwardSwitches: downward,
    upwardSwitchRate: rate(upward, numericTransitions),
    downwardSwitchRate: rate(downward, numericTransitions),
    matrix
  };
}

function outcomeContext(delivery) {
  if (delivery.out) return "after-wicket";
  if (delivery.runs >= 5) return "after-5-or-6-runs";
  if (delivery.runs >= 3) return "after-3-or-4-runs";
  if (delivery.runs >= 1) return "after-1-or-2-runs";
  return "after-other-outcome";
}

function selectionsAfterPreviousOutcome(segments) {
  const groups = new Map();
  for (const deliveries of segments) {
    for (let index = 1; index < deliveries.length; index++) {
      const previous = deliveries[index - 1];
      const current = choiceOf(deliveries[index].batChoice);
      if (!current) continue;
      const key = outcomeContext(previous);
      if (!groups.has(key)) groups.set(key, emptyCounts());
      groups.get(key)[current]++;
    }
  }
  return Object.fromEntries([...groups].map(([context, counts]) => {
    const total = sum(Object.values(counts));
    return [context, {
      total,
      counts,
      probabilities: Object.fromEntries(CHOICES.map(choice => [choice, rate(counts[choice], total)]))
    }];
  }));
}

function recentDistributionShift(deliveries, windowSize = 8) {
  if (deliveries.length <= windowSize) {
    return { available: false, reason: "Not enough deliveries before the recent window.", recentCount: deliveries.length, earlierCount: 0 };
  }
  const earlier = deliveries.slice(0, -windowSize);
  const recent = deliveries.slice(-windowSize);
  const earlierRows = distribution(earlier, "batChoice");
  const recentRows = distribution(recent, "batChoice");
  const earlierMap = Object.fromEntries(earlierRows.map(row => [row.choice, row.probability || 0]));
  const recentMap = Object.fromEntries(recentRows.map(row => [row.choice, row.probability || 0]));
  const totalVariation = 0.5 * sum(CHOICES.map(choice => Math.abs(earlierMap[choice] - recentMap[choice])));
  return {
    available: true,
    windowSize,
    recentCount: recent.length,
    earlierCount: earlier.length,
    totalVariation,
    earlierDistribution: earlierRows,
    recentDistribution: recentRows
  };
}

function playerProfile(id, battingDeliveries, battingSegments, bowlingDeliveries, roster, allowFist) {
  const battingDistribution = distribution(battingDeliveries, "batChoice");
  const bowlingDistribution = distribution(bowlingDeliveries, "bowlChoice");
  const numericChoices = battingDeliveries.map(delivery => choiceOf(delivery.batChoice)).filter(choice => NUMERIC_CHOICES.includes(choice)).map(Number);
  const numericCount = numericChoices.length;
  const battingRuns = sum(battingDeliveries.map(delivery => delivery.runs || 0));
  const wickets = bowlingDeliveries.filter(delivery => delivery.out).length;
  const transitions = transitionStats(battingSegments);
  const numericChoiceMean = mean(numericChoices);
  const numericChoiceVariance = numericCount
    ? mean(numericChoices.map(choice => (choice - numericChoiceMean) ** 2))
    : null;
  const predictionByBatterChoice = Object.fromEntries(CHOICES.map(choice => {
    const matching = bowlingDeliveries.filter(delivery => choiceOf(delivery.batChoice) === choice);
    const correct = matching.filter(delivery => delivery.out).length;
    return [choice, { attempts: matching.length, correct, accuracy: rate(correct, matching.length) }];
  }));

  return {
    id,
    username: nicknameFor(id, roster),
    batting: {
      deliveries: battingDeliveries.length,
      runs: battingRuns,
      dismissals: battingDeliveries.filter(delivery => delivery.out).length,
      runsPerDelivery: rate(battingRuns, battingDeliveries.length),
      selectionDistribution: battingDistribution,
      numericSelectionCount: numericCount,
      averageNumericSelection: numericChoiceMean,
      numericSelectionVariance: numericChoiceVariance,
      highNumberRate: rate(numericChoices.filter(choice => choice >= 5).length, numericCount),
      fistRate: rate(battingDistribution.find(row => row.choice === "fist").count, battingDeliveries.length),
      entropy: entropy(battingDistribution, allowFist ? 7 : 6),
      transitions,
      selectionsAfterPreviousOutcome: selectionsAfterPreviousOutcome(battingSegments),
      recentDistributionShift: recentDistributionShift(battingDeliveries)
    },
    bowling: {
      deliveries: bowlingDeliveries.length,
      runsConceded: sum(bowlingDeliveries.map(delivery => delivery.runs || 0)),
      wickets,
      predictionAccuracy: rate(wickets, bowlingDeliveries.length),
      selectionDistribution: bowlingDistribution,
      predictionAccuracyByBatterChoice: predictionByBatterChoice
    }
  };
}

function matchupProfile(batterId, bowlerId, deliveries, roster) {
  const battingDistribution = distribution(deliveries, "batChoice");
  const bowlingDistribution = distribution(deliveries, "bowlChoice");
  const correct = deliveries.filter(delivery => delivery.out).length;
  const numericBatChoices = deliveries.map(delivery => choiceOf(delivery.batChoice))
    .filter(choice => NUMERIC_CHOICES.includes(choice)).map(Number);
  return {
    batterId,
    batterUsername: nicknameFor(batterId, roster),
    bowlerId,
    bowlerUsername: nicknameFor(bowlerId, roster),
    deliveries: deliveries.length,
    runs: sum(deliveries.map(delivery => delivery.runs || 0)),
    dismissals: correct,
    predictionAccuracy: rate(correct, deliveries.length),
    battingSelectionDistribution: battingDistribution,
    bowlingSelectionDistribution: bowlingDistribution,
    averageNumericBattingSelection: mean(numericBatChoices),
    // Choices are simultaneous. This is a retrospective association, not evidence
    // that either player saw or reacted to the other player's choice.
    batterChoiceGivenBowlerChoice: conditionalTable(deliveries, "bowlChoice", "batChoice"),
    // This is sequential context: the batter's next selection after the same
    // bowler's previous selection in this specific matchup.
    // The previous row is the previous delivery in this batter/bowler matchup,
    // not necessarily the immediately preceding match delivery (other batters
    // may have faced the bowler in between).
    batterChoiceAfterPreviousSameMatchupBowlerChoice: conditionalTable(
      deliveries.slice(1).map((delivery, index) => ({
        previousBowlerChoice: deliveries[index].bowlChoice,
        currentBatterChoice: delivery.batChoice
      })),
      "previousBowlerChoice",
      "currentBatterChoice"
    )
  };
}

export function buildHandCricketInsights(state, roster = []) {
  const teamMode = state?.config?.mode === "team";

  // Commentary insights are deliberately team-mode only. Do not merely tag
  // individual-mode results: return an empty, explicit disabled result so
  // individual history can never leak into team-mode prediction features.
  if (!teamMode) {
    return {
      version: 1,
      teamMode: false,
      enabled: false,
      disabledReason: "Hand Cricket commentary insights are available in team mode only.",
      scope: "regular-innings",
      deliveryCount: 0,
      choiceLabels: CHOICES,
      players: {},
      matchups: [],
      overall: {
        runs: 0,
        deliveries: 0,
        runsPerDelivery: null,
        runVariance: null,
        runStandardDeviation: null,
        numericBattingSelectionCount: 0,
        averageNumericBattingSelection: null,
        highNumberRate: null,
        battingSelectionDistribution: distribution([], "batChoice"),
        bowlingSelectionDistribution: distribution([], "bowlChoice"),
        battingSelectionEntropy: entropy(distribution([], "batChoice"), 6),
        bowlingSelectionEntropy: entropy(distribution([], "bowlChoice"), 6),
        bowlerPredictionAccuracy: null,
        bowlerCorrectPredictions: 0,
        uniformRandomPredictionBaseline: null,
        scoringVarianceIsPopulationVariance: true
      }
    };
  }

  // A team-mode delivery must carry the authoritative team/innings fields
  // produced by the Worker. Reject malformed or individual-style records.
  // Super Overs remain outside the regular-innings analytics scope.
  const deliveries = (state?.history || [])
    .filter(delivery => !delivery.superOver
      && ["red", "blue"].includes(delivery.battingTeam)
      && [1, 2].includes(delivery.innings))
    .map((delivery, index) => ({ ...delivery, index }))
    .filter(delivery => delivery.batterId && delivery.bowlerId
      && choiceOf(delivery.batChoice) && choiceOf(delivery.bowlChoice));

  const playerIds = new Set();
  const battingByPlayer = new Map();
  const battingSegmentsByPlayer = new Map();
  const bowlingByPlayer = new Map();
  const matchupMap = new Map();
  let previousAppearanceKey = null;
  let previousDeliveryWasOut = false;
  const overallRuns = [];
  const numericBatChoices = [];
  let correctPredictions = 0;
  let fistEnabled = state?.config?.allowFist === true;

  for (const delivery of deliveries) {
    playerIds.add(delivery.batterId);
    playerIds.add(delivery.bowlerId);
    if (!battingByPlayer.has(delivery.batterId)) battingByPlayer.set(delivery.batterId, []);
    if (!battingSegmentsByPlayer.has(delivery.batterId)) battingSegmentsByPlayer.set(delivery.batterId, []);
    if (!bowlingByPlayer.has(delivery.bowlerId)) bowlingByPlayer.set(delivery.bowlerId, []);
    const appearanceKey = [delivery.batterId, delivery.innings ?? "", delivery.battingTeam ?? ""].join("::");
    if (appearanceKey !== previousAppearanceKey || previousDeliveryWasOut) {
      battingSegmentsByPlayer.get(delivery.batterId).push([]);
    }
    previousAppearanceKey = appearanceKey;
    previousDeliveryWasOut = Boolean(delivery.out);
    battingByPlayer.get(delivery.batterId).push(delivery);
    battingSegmentsByPlayer.get(delivery.batterId).at(-1).push(delivery);
    bowlingByPlayer.get(delivery.bowlerId).push(delivery);
    const key = delivery.batterId + "::" + delivery.bowlerId;
    if (!matchupMap.has(key)) matchupMap.set(key, []);
    matchupMap.get(key).push(delivery);
    overallRuns.push(delivery.runs || 0);
    const choice = choiceOf(delivery.batChoice);
    if (NUMERIC_CHOICES.includes(choice)) numericBatChoices.push(Number(choice));
    if (delivery.out) correctPredictions++;
  }

  const players = Object.fromEntries([...playerIds].map(id => [
    id,
    playerProfile(id, battingByPlayer.get(id) || [], battingSegmentsByPlayer.get(id) || [], bowlingByPlayer.get(id) || [], roster, fistEnabled)
  ]));
  const matchups = [...matchupMap.values()].map(rows =>
    matchupProfile(rows[0].batterId, rows[0].bowlerId, rows, roster)
  );

  const battingDistribution = distribution(deliveries, "batChoice");
  const bowlingDistribution = distribution(deliveries, "bowlChoice");
  const numericMean = mean(numericBatChoices);
  const runMean = mean(overallRuns);
  const runVariance = overallRuns.length
    ? mean(overallRuns.map(runs => (runs - runMean) ** 2))
    : null;

  return {
    version: 1,
    teamMode,
    enabled: true,
    scope: "regular-innings",
    deliveryCount: deliveries.length,
    choiceLabels: CHOICES,
    players,
    matchups,
    overall: {
      runs: sum(overallRuns),
      deliveries: deliveries.length,
      runsPerDelivery: runMean,
      runVariance,
      runStandardDeviation: runVariance === null ? null : Math.sqrt(runVariance),
      numericBattingSelectionCount: numericBatChoices.length,
      averageNumericBattingSelection: numericMean,
      highNumberRate: rate(numericBatChoices.filter(choice => choice >= 5).length, numericBatChoices.length),
      battingSelectionDistribution: battingDistribution,
      bowlingSelectionDistribution: bowlingDistribution,
      battingSelectionEntropy: entropy(battingDistribution, fistEnabled ? 7 : 6),
      bowlingSelectionEntropy: entropy(bowlingDistribution, fistEnabled ? 7 : 6),
      bowlerPredictionAccuracy: rate(correctPredictions, deliveries.length),
      bowlerCorrectPredictions: correctPredictions,
      uniformRandomPredictionBaseline: 1 / (fistEnabled ? 7 : 6),
      scoringVarianceIsPopulationVariance: true
    }
  };
}
