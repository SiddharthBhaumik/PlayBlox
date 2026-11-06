export function buildHandCricketAnalytics(state) {
  const teamMode = state.config.mode === "team";
  const config = state.config;
  const deliveries = (state.history || []).map((d) => ({ ...d }));
  const playerTotals = {};
  const stageMap = new Map();
  const seriesMap = new Map();
  const overMap = new Map();
  const sequenceByKey = new Map();
  const batterSequence = new Map();
  const bowlerSequence = new Map();

  const stageFor = (position, limit, unlimited, prefix = "Stage") => {
    if (unlimited) {
      const block = Math.floor((position - 1) / 12);
      const firstOver = block * 2 + 1;
      return { key: String(block), label: `Overs ${firstOver}–${firstOver + 1}` };
    }
    const total = Math.max(1, limit || 1);
    const firstCut = Math.ceil(total / 3);
    const secondCut = Math.ceil((total * 2) / 3);
    if (position <= firstCut) return { key: "early", label: "Early" };
    if (position <= secondCut) return { key: "middle", label: "Middle" };
    return { key: "final", label: "Final" };
  };
  const addStage = (playerId, kind, stage, d) => {
    const key = playerId + "|" + kind + "|" + stage.key;
    if (!stageMap.has(key)) stageMap.set(key, { playerId, kind, stage: stage.label, runs: 0, balls: 0, wickets: 0, conceded: 0 });
    const row = stageMap.get(key);
    if (kind === "batting") {
      row.runs += d.runs;
      row.balls += 1;
      if (d.out) row.wickets += 1;
    } else {
      row.conceded += d.runs;
      row.balls += 1;
      if (d.out) row.wickets += 1;
    }
  };
  const ensurePlayer = (id) => {
    if (!playerTotals[id]) playerTotals[id] = { runs: 0, balls: 0, dismissals: 0, runsConceded: 0, ballsBowled: 0, wicketsTaken: 0 };
    return playerTotals[id];
  };

  deliveries.forEach((d) => {
    const inningKey = teamMode
      ? [d.superOver ? "super-" + (d.superOverRound || 1) : "regular", d.innings, d.battingTeam || "unknown"].join("|")
      : "player|" + d.batterId;
    const sequence = (sequenceByKey.get(inningKey) || 0) + 1;
    sequenceByKey.set(inningKey, sequence);
    const batterPosition = (batterSequence.get(d.batterId) || 0) + 1;
    batterSequence.set(d.batterId, batterPosition);
    const bowlerPosition = (bowlerSequence.get(d.bowlerId) || 0) + 1;
    bowlerSequence.set(d.bowlerId, bowlerPosition);
    const stageLimit = teamMode ? config.limit * 6 : config.limit;
    const battingStage = stageFor(teamMode ? sequence : batterPosition, stageLimit, config.unlimited);
    const bowlingStage = teamMode ? battingStage : stageFor(bowlerPosition, 12, true);
    d.sequence = sequence;
    d.battingStage = battingStage.label;
    d.bowlingStage = bowlingStage.label;

    const batter = ensurePlayer(d.batterId);
    const bowler = ensurePlayer(d.bowlerId);
    batter.runs += d.runs; batter.balls += 1; if (d.out) batter.dismissals += 1;
    bowler.runsConceded += d.runs; bowler.ballsBowled += 1; if (d.out) bowler.wicketsTaken += 1;
    addStage(d.batterId, "batting", battingStage, d);
    addStage(d.bowlerId, "bowling", bowlingStage, d);

    if (!seriesMap.has(inningKey)) seriesMap.set(inningKey, { key: inningKey, team: d.battingTeam, innings: d.innings, superOver: Boolean(d.superOver), playerId: teamMode ? null : d.batterId, points: [], runs: 0, wickets: 0 });
    const series = seriesMap.get(inningKey);
    series.runs += d.runs;
    if (d.out) series.wickets += 1;
    series.points.push({ ball: sequence, runs: series.runs, wickets: series.wickets, out: d.out });

    const overKey = inningKey + "|over|" + Math.floor((sequence - 1) / 6);
    if (!overMap.has(overKey)) overMap.set(overKey, { key: overKey, team: d.battingTeam, playerId: teamMode ? null : d.batterId, over: Math.floor((sequence - 1) / 6) + 1, runs: 0, wickets: 0, balls: 0 });
    const over = overMap.get(overKey);
    over.runs += d.runs; over.balls += 1; if (d.out) over.wickets += 1;
  });

  return {
    deliveries,
    playerTotals,
    stages: [...stageMap.values()],
    innings: [...seriesMap.values()],
    overs: [...overMap.values()]
  };
}
