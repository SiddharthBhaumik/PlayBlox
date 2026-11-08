const sum = values => values.reduce((total, value) => total + value, 0);
const rate = (numerator, denominator) => denominator ? numerator / denominator : null;

function compareMetrics(candidate, baseline) {
  if (!candidate || !baseline || candidate.samples !== baseline.samples
    || candidate.logLoss === null || baseline.logLoss === null) return null;
  return {
    logLossImprovement: baseline.logLoss - candidate.logLoss,
    relativeLogLossImprovement: baseline.logLoss > 0
      ? (baseline.logLoss - candidate.logLoss) / baseline.logLoss : null,
    brierImprovement: baseline.brierScore - candidate.brierScore,
    accuracyDifference: candidate.accuracy - baseline.accuracy
  };
}

function confidenceForSamples(samples) {
  if (samples >= 40) return "higher";
  if (samples >= 20) return "moderate";
  return "limited";
}

/**
 * Converts model outputs into conservative, evidence-labelled insight
 * candidates. It never emits natural-language claims; the commentary layer
 * must preserve the evidence, sample size and caveats.
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
  const candidates = [];
  const metrics = predictions.metrics || {};
  const contextualVsUniform = compareMetrics(metrics.contextual, metrics.uniform);
  const contextualVsGlobal = compareMetrics(metrics.contextual, metrics.global);

  if (predictions.evaluatedDeliveries >= minimumSamples
    && contextualVsUniform && contextualVsGlobal
    && contextualVsUniform.relativeLogLossImprovement >= 0.05
    && contextualVsGlobal.relativeLogLossImprovement >= 0.03
    && contextualVsUniform.brierImprovement > 0
    && contextualVsGlobal.brierImprovement > 0) {
    candidates.push({
      id: "contextual-model-outperforms-baselines",
      type: "prediction-performance",
      priority: 3,
      sampleSize: predictions.evaluatedDeliveries,
      confidence: confidenceForSamples(predictions.evaluatedDeliveries),
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

  const byBatter = new Map();
  for (const row of predictions.predictions || []) {
    if (!row.batterId || !row.models?.contextual || !row.models?.uniform) continue;
    if (!byBatter.has(row.batterId)) byBatter.set(row.batterId, []);
    byBatter.get(row.batterId).push(row);
  }

  for (const [batterId, rows] of byBatter) {
    const choiceCounts = {};
    for (const row of rows) choiceCounts[row.actualChoice] = (choiceCounts[row.actualChoice] || 0) + 1;
    const top = Object.entries(choiceCounts).sort((a,b) => b[1] - a[1])[0];
    if (rows.length >= minimumSamples && top && top[1] / rows.length >= 0.4) {
      candidates.push({
        id: `batter-choice-tendency:${batterId}`,
        type: "batter-choice-tendency",
        priority: 2,
        batterId,
        sampleSize: rows.length,
        confidence: confidenceForSamples(rows.length),
        evidence: {
          choice: top[0],
          count: top[1],
          share: rate(top[1], rows.length),
          distribution: choiceCounts
        },
        caveat: "This describes observed choices in this innings history; it does not prove a fixed player tendency."
      });
    }

    const sequential = rows.filter(row => row.previousBatterChoice !== null);
    if (sequential.length >= minimumSamples) {
      const repeats = sequential.filter(row => row.actualChoice === row.previousBatterChoice).length;
      const repeatRate = rate(repeats, sequential.length);
      if (repeatRate >= 0.55 || repeatRate <= 0.2) {
        candidates.push({
          id: `batter-repeat-pattern:${batterId}`,
          type: "batter-repeat-pattern",
          priority: 2,
          batterId,
          sampleSize: sequential.length,
          confidence: confidenceForSamples(sequential.length),
          evidence: { repeats, repeatRate, nonRepeats: sequential.length - repeats },
          caveat: "Sequential association is descriptive and may change as the match progresses."
        });
      }
    }
  }

  candidates.sort((a,b) => b.priority - a.priority || b.sampleSize - a.sampleSize);
  return {
    enabled: true,
    teamMode: true,
    evaluatedDeliveries: predictions.evaluatedDeliveries,
    minimumSamples,
    candidates
  };
}
