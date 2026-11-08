import assert from "node:assert/strict";
import {
  createHandCricketCommentaryMemory,
  selectHandCricketCommentary
} from "../src/games/hand-cricket/commentary-director.js";

const candidates = [
  {id:"trend-a",type:"batter-choice-tendency",priority:2,sampleSize:18,confidence:"moderate",evidence:{choice:"5",share:0.6},caveat:"Observed sample only."},
  {id:"performance",type:"prediction-performance",priority:3,sampleSize:24,confidence:"moderate",evidence:{logLoss:1.2},caveat:"Past performance only."}
];
const initial = createHandCricketCommentaryMemory();
const selected = selectHandCricketCommentary(candidates,initial,{deliveryIndex:10});
assert.equal(selected.selected,true);
assert.equal(selected.candidate.id,"performance");
assert.equal(selected.speaker.id,"mira");
assert.equal(selected.promptPacket.language,"English");
assert.ok(selected.promptPacket.instructions.some(line=>line.includes("do not invent")));
assert.equal(selected.memory.commentaryCount,1);

const cooldown = selectHandCricketCommentary(candidates,selected.memory,{deliveryIndex:12});
assert.equal(cooldown.selected,false);
assert.equal(cooldown.reason,"delivery-cooldown");

const next = selectHandCricketCommentary(candidates,selected.memory,{deliveryIndex:14});
assert.equal(next.selected,true);
assert.notEqual(next.candidate.id,"performance", "A candidate must not be repeated.");
assert.notEqual(next.speaker.id,selected.speaker.id, "Avoid consecutive commentator repetition.");

const capped = selectHandCricketCommentary(candidates,selected.memory,{deliveryIndex:20,maximumCommentaries:1});
assert.equal(capped.selected,false);
assert.equal(capped.reason,"match-commentary-cap");

const noEvidence = selectHandCricketCommentary([],initial,{deliveryIndex:20});
assert.equal(noEvidence.selected,false);
assert.equal(noEvidence.reason,"no-new-evidence");

console.log("Hand Cricket Phase 2 commentary director tests passed.");
