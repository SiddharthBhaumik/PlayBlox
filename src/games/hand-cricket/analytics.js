export function buildTeamPlayerScorecard(state, team, playerId) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const batting = history.filter(d => d.batterId === playerId && d.battingTeam === team);
  let highestScore = 0, currentScore = 0, activeInnings = null;
  for (const d of history) {
    const inningsKey = `${d.superOverRound || 0}:${d.innings}:${d.battingTeam || ""}`;
    if (d.batterId === playerId && d.battingTeam === team) {
      if (activeInnings !== inningsKey) currentScore = 0;
      currentScore += Number(d.runs) || 0;
      highestScore = Math.max(highestScore, currentScore);
      activeInnings = inningsKey;
      if (d.out) activeInnings = null;
    } else {
      activeInnings = null;
    }
  }
  const bowling = history.filter(d => {
    const bowlingTeam = d.bowlingTeam ?? (d.battingTeam === "red" ? "blue" : d.battingTeam === "blue" ? "red" : null);
    return d.bowlerId === playerId && bowlingTeam === team;
  });
  return {
    runs: batting.reduce((sum, d) => sum + (Number(d.runs) || 0), 0),
    balls: batting.length,
    highestScore,
    wickets: batting.filter(d => d.out).length,
    runsConceded: bowling.reduce((sum, d) => sum + (Number(d.runs) || 0), 0),
    ballsBowled: bowling.length,
    wicketsTaken: bowling.filter(d => d.out).length
  };
}

export function buildHandCricketExport(state, room = {}, roomCode = "", exportedAt = new Date().toISOString()) {
  const history = Array.isArray(state?.history) ? state.history : [];
  const roomPlayers = Array.isArray(room?.players) ? room.players : [];
  const playerIds = [...new Set([
    ...(state?.playerOrder || []),
    ...history.flatMap(d => [d.batterId, d.bowlerId]).filter(Boolean)
  ])];
  const players = playerIds.map(id => {
    const roomPlayer = roomPlayers.find(p => p.id === id);
    const appearance = history.find(d => d.batterId === id || d.bowlerId === id);
    const team = state?.teams?.[id] || null;
    return {
      id,
      nickname: roomPlayer?.nickname || (appearance?.batterId === id ? appearance.batterName : appearance?.bowlerName) || "Player",
      team,
      role: id === state?.wildcardId ? "wildcard" : team || "unassigned",
      isWildcard: id === state?.wildcardId
    };
  });
  const ballsByInnings = new Map();
  const deliveries = history.map((delivery, index) => {
    const superOverRound = delivery.superOverRound || 0;
    const inningsKey = state?.config?.mode === "team"
      ? `team:${superOverRound}:${delivery.innings}:${delivery.battingTeam || "unknown"}`
      : `individual:${delivery.innings}`;
    const inningsBall = (ballsByInnings.get(inningsKey) || 0) + 1;
    ballsByInnings.set(inningsKey, inningsBall);
    const bowlingTeam = delivery.bowlingTeam ?? (
      delivery.battingTeam === "red" ? "blue" :
      delivery.battingTeam === "blue" ? "red" : null
    );
    return {
      ...delivery,
      sequence: index + 1,
      inningsKey,
      inningsBall,
      over: Math.floor((inningsBall - 1) / 6) + 1,
      ballInOver: ((inningsBall - 1) % 6) + 1,
      bowlingTeam
    };
  });
  return {
    schemaVersion: 1,
    exportedAt,
    game: { id: "hand-cricket", name: "Hand Cricket" },
    match: {
      roomCode: roomCode || null,
      roomName: room?.name || null,
      mode: state?.config?.mode || null,
      config: state?.config ? JSON.parse(JSON.stringify(state.config)) : null,
      teams: state?.teams ? JSON.parse(JSON.stringify(state.teams)) : {},
      wildcard: state?.wildcardId ? {
        playerId: state.wildcardId,
        role: state?.config?.oddPlayerMode || null
      } : null,
      toss: {
        callerId: state?.tossCallerId || null,
        call: state?.tossCall || null,
        result: state?.tossResult || null,
        winnerTeam: state?.tossWinnerTeam || null,
        choice: state?.tossChoice || null,
        battingTeam: state?.tossBattingTeam || null
      },
      result: {
        winnerTeam: state?.winnerTeam ?? null,
        teamScores: state?.teamScores ? JSON.parse(JSON.stringify(state.teamScores)) : null,
        regulationScores: state?.regulationScores ? JSON.parse(JSON.stringify(state.regulationScores)) : null,
        superOverRounds: state?.superOverRounds ? JSON.parse(JSON.stringify(state.superOverRounds)) : [],
        completedAt: state?.completedAt || null
      }
    },
    players,
    aggregatePlayerStats: state?.stats ? JSON.parse(JSON.stringify(state.stats)) : {},
    completedOvers: state?.completedOvers ? JSON.parse(JSON.stringify(state.completedOvers)) : [],
    deliveryCount: deliveries.length,
    deliveries
  };
}

const rate = (runs, balls) => balls ? runs * 100 / balls : null;
const economy = (runs, balls) => balls ? runs * 6 / balls : null;
const choiceKey = value => value === "fist" ? "fist" : String(value);
function distribution(deliveries, field) {
  const counts = Object.fromEntries(["1","2","3","4","5","6","fist"].map(k => [k, 0]));
  for (const d of deliveries) {
    const key = choiceKey(d[field]);
    if (Object.hasOwn(counts, key)) counts[key]++;
  }
  const total = Object.values(counts).reduce((a,b) => a+b, 0);
  return Object.entries(counts).map(([choice,count]) => ({choice,count,percent:total ? count*100/total : 0}));
}
export function buildHandCricketAnalytics(state) {
  const teamMode = state.config.mode === "team";
  const deliveries = (state.history || []).filter(d => !d.superOver).map((d, index) => ({
    ...d, index, inningsKey: teamMode
      ? `team:${d.innings}:${d.battingTeam || "unknown"}`
      : `player:${d.batterId}:${d.innings}`
  }));
  const inningsMap = new Map();
  const player = new Map();
  const matchups = new Map();
  const fallOfWickets = {red: [], blue: []};
  const teamProgress = {red: [], blue: []};
  const teamScore = {red: 0, blue: 0};
  const teamBalls = {red: 0, blue: 0};
  const overall = {runs: 0, balls: 0, wickets: 0, dismissedRuns: 0, dismissedBatters: 0};
  const ensure = id => {
    if (!player.has(id)) player.set(id, {
      id, battingRuns:0, battingBalls:0, dismissals:0, bowlingRuns:0,
      bowlingBalls:0, wickets:0, innings:[], victims:[],
      battingChoices:[], bowlingChoices:[]
    });
    return player.get(id);
  };
  for (const d of deliveries) {
    const batter = ensure(d.batterId), bowler = ensure(d.bowlerId);
    batter.battingRuns += d.runs; batter.battingBalls++;
    bowler.bowlingRuns += d.runs; bowler.bowlingBalls++;
    batter.battingChoices.push(d); bowler.bowlingChoices.push(d);
    overall.runs += d.runs; overall.balls++;
    if (d.out) {
      batter.dismissals++; bowler.wickets++; overall.wickets++;
      overall.dismissedBatters++;
    }
    let inn = inningsMap.get(d.inningsKey);
    if (!inn) {
      inn = {key:d.inningsKey, innings:d.innings, team:d.battingTeam || null,
        playerId:teamMode?null:d.batterId, deliveries:[], runs:0, wickets:0,
        balls:0, points:[], batters:new Map()};
      inningsMap.set(d.inningsKey, inn);
    }
    inn.deliveries.push(d); inn.runs += d.runs; inn.balls++;
    if (!inn.batters.has(d.batterId)) inn.batters.set(d.batterId,{runs:0,balls:0,dismissed:false});
    const battingLine=inn.batters.get(d.batterId);
    battingLine.runs += d.runs; battingLine.balls++;
    if (d.out) overall.dismissedRuns += battingLine.runs;
    if (teamMode) {
      const team=d.battingTeam;
      if (team && teamScore[team] !== undefined) {
        teamScore[team] += d.runs; teamBalls[team]++;
        if (d.out) {
          teamScore[team] = teamScore[team];
          fallOfWickets[team].push({wicket:fallOfWickets[team].length+1,batterId:d.batterId,
            batterName:d.batterName, batterRuns:battingLine.runs, teamRuns:teamScore[team],
            balls:teamBalls[team], innings:d.innings});
        }
        teamProgress[team].push({ball:teamBalls[team],runs:teamScore[team],wickets:fallOfWickets[team].length,out:Boolean(d.out),innings:d.innings});
      }
    }
    if (d.out) {
      inn.wickets++; battingLine.dismissed=true;
      batter.innings.push({key:inn.key,innings:d.innings,team:inn.team,runs:battingLine.runs,
        balls:battingLine.balls,dismissed:true,dismissalTeamRuns:teamMode?teamScore[d.battingTeam]:null,
        dismissalBall:inn.balls});
      bowler.victims.push({batterId:d.batterId,batterName:d.batterName,batterRuns:battingLine.runs,
        teamRuns:teamMode?teamScore[d.battingTeam]:null,innings:d.innings,reason:d.reason,ball:inn.balls});
    }
    inn.points.push({ball:inn.balls,runs:inn.runs,wickets:inn.wickets,out:Boolean(d.out)});
    const key=`${d.batterId}::${d.bowlerId}`;
    if (!matchups.has(key)) matchups.set(key,{key,batterId:d.batterId,bowlerId:d.bowlerId,runs:0,balls:0,dismissals:0,batChoices:[],bowlChoices:[],dismissalChoices:[]});
    const m=matchups.get(key);m.runs+=d.runs;m.balls++;m.batChoices.push(d.batChoice);m.bowlChoices.push(d.bowlChoice);
    if (d.out) {m.dismissals++;m.dismissalChoices.push(choiceKey(d.batChoice));}
  }
  // Retain not-out innings too, and merge batting records by innings/player.
  for (const inn of inningsMap.values()) {
    for (const [id,line] of inn.batters) {
      const p=ensure(id);
      if (!p.innings.some(x=>x.key===inn.key)) p.innings.push({key:inn.key,innings:inn.innings,team:inn.team,
        runs:line.runs,balls:line.balls,dismissed:line.dismissed,dismissalTeamRuns:null,dismissalBall:null});
    }
    inn.series=inn.points;
    inn.batters=Object.fromEntries(inn.batters);
  }
  for (const p of player.values()) {
    p.battingRate=rate(p.battingRuns,p.battingBalls);
    p.bowlingRate=economy(p.bowlingRuns,p.bowlingBalls);
    p.battingDistribution=distribution(p.battingChoices,"batChoice");
    p.bowlingDistribution=distribution(p.bowlingChoices,"bowlChoice");
    p.overallDistribution=distribution([
      ...p.battingChoices.map(d=>({...d,__choice:d.batChoice})),
      ...p.bowlingChoices.map(d=>({...d,__choice:d.bowlChoice}))
    ],"__choice");
    p.innings.sort((a,b)=>a.key.localeCompare(b.key));
  }
  const allPlayerRows=[...player.values()];
  const battingRows=allPlayerRows.filter(p=>p.battingBalls);
  const bowlingRows=allPlayerRows.filter(p=>p.bowlingBalls);
  const average = xs => xs.length ? xs.reduce((n,x)=>n+x,0)/xs.length : null;
  const avgSR=average(battingRows.map(p=>p.battingRate));
  const avgEconomy=average(bowlingRows.map(p=>p.bowlingRate));
  return {
    teamMode, deliveries, players:Object.fromEntries(player), playerRows:allPlayerRows,
    innings:[...inningsMap.values()], matchups:[...matchups.values()],
    fallOfWickets, teamProgress, overall:{
      runs:overall.runs,balls:overall.balls,wickets:overall.wickets,
      aggregateStrikeRate:rate(overall.runs,overall.balls),
      averagePlayerStrikeRate:avgSR,aggregateEconomy:economy(overall.runs,overall.balls),
      averagePlayerEconomy:avgEconomy,
      ballsPerWicket:overall.wickets?overall.balls/overall.wickets:null,
      runsPerDismissedBatter:overall.dismissedBatters?overall.dismissedRuns/overall.dismissedBatters:null,
      choiceDistribution:distribution([...deliveries.map(d=>({...d,__choice:d.batChoice})),...deliveries.map(d=>({...d,__choice:d.bowlChoice}))],"__choice"),
      battingChoiceDistribution:distribution(deliveries,"batChoice"),
      bowlingChoiceDistribution:distribution(deliveries,"bowlChoice")
    }
  };
}
