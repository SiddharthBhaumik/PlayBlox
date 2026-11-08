import assert from "node:assert/strict";
import { evaluateHandCricketInsights } from "../src/games/hand-cricket/insight-evaluator.js";

const disabled = evaluateHandCricketInsights({enabled:false,teamMode:false});
assert.equal(disabled.enabled, false);
assert.deepEqual(disabled.candidates, []);

const predictions = {
  enabled:true,
  teamMode:true,
  evaluatedDeliveries:40,
  metrics:{
    contextual:{samples:40,accuracy:0.65,logLoss:1.2,brierScore:0.55},
    uniform:{samples:40,accuracy:0.2,logLoss:1.79,brierScore:0.85},
    global:{samples:40,accuracy:0.3,logLoss:1.5,brierScore:0.7}
  },
  predictions:Array.from({length:20},(_,i)=>({
    innings:1,
    battingTeam:"red",
    batterId:"a",
    actualChoice:i<12?"5":"2",
    previousBatterChoice:i===0?null:"5",
    models:{contextual:{},uniform:{}}
  }))
};
const evaluated = evaluateHandCricketInsights(predictions,{minimumPerformanceSamples:30});
assert.equal(evaluated.enabled, true);
assert.ok(evaluated.candidates.some(item=>item.type==="prediction-performance"));
assert.ok(evaluated.candidates.some(item=>item.type==="batter-choice-tendency"));
assert.ok(evaluated.candidates.some(item=>item.type==="batter-repeat-pattern"));

// Same player ID in another innings/team is a separate evidence population.
// Neither 10-row group is allowed to satisfy a 12-sample threshold by merging.
const splitContext = evaluateHandCricketInsights({
  ...predictions,
  evaluatedDeliveries:40,
  predictions:[
    ...predictions.predictions.slice(0,10),
    ...predictions.predictions.slice(0,10).map(row=>({...row,innings:2,battingTeam:"blue"}))
  ]
});
assert.equal(splitContext.candidates.some(item=>item.type==="batter-choice-tendency"),false);
assert.equal(splitContext.candidates.some(item=>item.type==="batter-repeat-pattern"),false);

// Performance comparisons must not be emitted with mismatched sample counts
// or non-finite metric values.
const invalidMetrics = evaluateHandCricketInsights({
  ...predictions,
  metrics:{
    ...predictions.metrics,
    global:{...predictions.metrics.global,samples:39}
  }
});
assert.equal(invalidMetrics.candidates.some(item=>item.type==="prediction-performance"),false);

const tooFew = evaluateHandCricketInsights({
  ...predictions,
  evaluatedDeliveries:5,
  metrics:Object.fromEntries(Object.entries(predictions.metrics).map(([key,value])=>[key,{...value,samples:5}])),
  predictions:predictions.predictions.slice(0,5)
});
assert.equal(tooFew.candidates.some(item=>item.type==="prediction-performance"),false);
assert.equal(tooFew.candidates.some(item=>item.type==="batter-choice-tendency"),false);

console.log("Hand Cricket Phase 2 insight evaluator tests passed.");
