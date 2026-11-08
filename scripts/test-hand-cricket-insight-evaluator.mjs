import assert from "node:assert/strict";
import { evaluateHandCricketInsights } from "../src/games/hand-cricket/insight-evaluator.js";

const disabled = evaluateHandCricketInsights({enabled:false,teamMode:false});
assert.equal(disabled.enabled, false);
assert.deepEqual(disabled.candidates, []);

const predictions = {
  enabled:true,
  teamMode:true,
  evaluatedDeliveries:20,
  metrics:{
    contextual:{samples:20,accuracy:0.65,logLoss:1.2,brierScore:0.55},
    uniform:{samples:20,accuracy:0.2,logLoss:1.79,brierScore:0.85},
    global:{samples:20,accuracy:0.3,logLoss:1.5,brierScore:0.7}
  },
  predictions:Array.from({length:20},(_,i)=>({
    batterId:"a",
    actualChoice:i<12?"5":"2",
    previousBatterChoice:i===0?null:"5",
    models:{contextual:{},uniform:{}}
  }))
};
const evaluated = evaluateHandCricketInsights(predictions);
assert.equal(evaluated.enabled, true);
assert.ok(evaluated.candidates.some(item=>item.type==="prediction-performance"));
assert.ok(evaluated.candidates.some(item=>item.type==="batter-choice-tendency"));
assert.ok(evaluated.candidates.some(item=>item.type==="batter-repeat-pattern"));

const tooFew = evaluateHandCricketInsights({
  ...predictions,
  evaluatedDeliveries:5,
  metrics:Object.fromEntries(Object.entries(predictions.metrics).map(([key,value])=>[key,{...value,samples:5}])),
  predictions:predictions.predictions.slice(0,5)
});
assert.equal(tooFew.candidates.some(item=>item.type==="prediction-performance"),false);
assert.equal(tooFew.candidates.some(item=>item.type==="batter-choice-tendency"),false);

console.log("Hand Cricket Phase 2 insight evaluator tests passed.");
