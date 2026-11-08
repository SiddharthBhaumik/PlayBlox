const rate = (numerator, denominator) => denominator ? numerator / denominator : null;

function compareMetrics(candidate, baseline) {
  if (!candidate || !baseline || candidate.samples !== baseline.samples
    || !Number.isFinite(candidate.logLoss) || !Number.isFinite(baseline.logLoss)
    || !Number.isFinite(candidate.brierScore) || !Number.isFinite(baseline.brierScore)
    || !Number.isFinite(candidate.accuracy) || !Number.isFinite(baseline.accuracy)) return null;
  return {
    logLossImprovement: baseline.logLoss - candidate.logLoss,
    relativeLogLossImprovement: baseline.logLoss > 0
      ? (baseline.logLoss - candidate.logLoss) / baseline.logLoss : null,
    brierImprovement: baseline.brierScore - candidate.brierScore,
    accuracyDifference: candidate.accuracy - baseline.accuracy
  };
}

function confidenceForSamples(samples) {
  if (samples >= 50) return "stronger";
  if (samples >= 20) return "moderate";
  return "limited";
}

/**
 * Converts prequential model outputs into conservative, evidence-labelled
 * candidates. Player tendencies are scoped to one batter in one innings.
 */
export function evaluateHandCricketInsights(predictions, options = {}) {
  if (!predictions?.enabled || predictions.teamMode !== true) {
    return {
      enabled: false,
      teamMode: false,
      candidates: [],
      disabledReason: "Hand Cricket insight evaluation is available in team mode only."
    };
  }

  const minimumSamples = Number.isInteger(options.minimumSamples) && options.minimumSamples >= 4
    ? options.minimumSamples : 12;
  const minimumPerformanceSamples = Number.isInteger(options.minimumPerformanceSamples)
    && options.minimumPerformanceSamples >= 12 ? options.minimumPerformanceSamples : 30;
  const candidates = [];
  const metrics = predictions.metrics || {};
  const contextualVsUniform = compareMetrics(metrics.contextual, metrics.uniform);
  const contextualVsGlobal = compareMetrics(metrics.contextual, metrics.global);
  const performanceSamples = metrics.contextual?.samples;

  // Require a larger evaluation sample than a descriptive tendency. A short
  // match should not produce a confident claim about model superiority.
  if (Number.isInteger(performanceSamples)
    && performanceSamples >= minimumPerformanceSamples
    && predictions.evaluatedDeliveries >= minimumPerformanceSamples
    && contextualVsUniform && contextualVsGlobal
    && contextualVsUniform.relativeLogLossImprovement >= 0.05
    && contextualVsGlobal.relativeLogLossImprovement >= 0.03
    && contextualVsUniform.brierImprovement > 0
    && contextualVsGlobal.brierImprovement > 0) {
    candidates.push({
      id: "contextual-model-outperforms-baselines",
      type: "prediction-performance",
      priority: 3,
      sampleSize: performanceSamples,
      confidence: confidenceForSamples(performanceSamples),
      evidence: {
        contextual: metrics.contextual,
        uniform: metrics.uniform,
        global: metrics.global,
        vsUniform: contextualVsUniform,
        vsGlobal: contextualVsGlobal
      },
      caveat: "Historical prequential performance is not a guarantee about the next delivery."
    });
  }

  const byBatterInnings = new Map();
  for (const row of Array.isArray(predictions.predictions) ? predictions.predictions : []) {
    if (!row?.batterId || ![1, 2].includes(row.innings)
      || !["red", "blue"].includes(row.battingTeam)
      || !row.models?.contextual || !row.models?.uniform
      || !["1", "2", "3", "4", "5", "6", "fist"].includes(row.actualChoice)) continue;

    const scopeKey = JSON.stringify([row.innings, row.battingTeam, row.batterId]);
    if (!byBatterInnings.has(scopeKey)) {
      byBatterInnings.set(scopeKey, {
        innings: row.innings,
        battingTeam: row.battingTeam,
        batterId: row.batterId,
        rows: []
      });
    }
    byBatterInnings.get(scopeKey).rows.push(row);
  }

  for (const { innings, battingTeam, batterId, rows } of byBatterInnings.values()) {
    const choiceCounts = {};
    for (const row of rows) {
      choiceCounts[row.actualChoice] = (choiceCounts[row.actualChoice] || 0) + 1;
    }
    const top = Object.entries(choiceCounts).sort((a, b) =>
      b[1] - a[1] || a[0].localeCompare(b[0])
    )[0];
    const scopeId = `${innings}:${battingTeam}:${encodeURIComponent(batterId)}`;

    if (rows.length >= minimumSamples && top && top[1] / rows.length >= 0.4) {
      candidates.push({
        id: `batter-choice-tendency:${scopeId}`,
        type: "batter-choice-tendency",
        priority: 2,
        batterId,
        innings,
        battingTeam,
        sampleSize: rows.length,
        confidence: confidenceForSamples(rows.length),
        evidence: {
          choice: top[0],
          count: top[1],
          share: rate(top[1], rows.length),
          distribution: choiceCounts
        },
        caveat: "This describes observed choices for this batter in this innings; it does not prove a fixed player tendency."
      });
    }

    const sequential = rows.filter(row => row.previousBatterChoice !== null
      && row.previousBatterChoice !== undefined);
    if (sequential.length >= minimumSamples) {
      const repeats = sequential.filter(row =>
        row.actualChoice === String(row.previousBatterChoice)
      ).length;
      const repeatRate = rate(repeats, sequential.length);
      if (repeatRate >= 0.55 || repeatRate <= 0.2) {
        candidates.push({
          id: `batter-repeat-pattern:${scopeId}`,
          type: "batter-repeat-pattern",
          priority: 2,
          batterId,
          innings,
          battingTeam,
          sampleSize: sequential.length,
          confidence: confidenceForSamples(sequential.length),
          evidence: { repeats, repeatRate, nonRepeats: sequential.length - repeats },
          caveat: "Sequential association is descriptive and may change as the match progresses."
        });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority || b.sampleSize - a.sampleSize);
  return {
    enabled: true,
    teamMode: true,
    evaluatedDeliveries: predictions.evaluatedDeliveries,
    minimumSamples,
    minimumPerformanceSamples,
    candidates
  };
}
