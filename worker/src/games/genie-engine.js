/**
 * Genie's Guess — probabilistic guessing engine.
 *
 * The engine is a pure function of the turn's event log, so every decision can
 * be recomputed exactly (which also makes "undo" trivial and safe):
 *
 *   decide(events, seed) -> { type: "question", questionId, confidence }
 *                         | { type: "guess", characterId, confidence }
 *                         | { type: "give-up", confidence }
 *
 * Each character starts with equal weight. Every answer multiplies a
 * character's weight by how well it matches their trait (tolerant of a few
 * mistaken answers). An extra "someone I don't know" candidate lets the genie
 * admit defeat when the player's character is not in the database. The next
 * question is the one with the lowest expected remaining entropy.
 */
import { GENIE_CHARACTERS, GENIE_QUESTIONS } from "./genie-data.js";

export const ANSWER_VALUES = Object.freeze({
  yes: 1,
  probably: 0.75,
  unknown: null,
  "probably-not": 0.25,
  no: 0,
});

export const MAX_QUESTIONS = 25;
export const MAX_GUESSES = 3;
const MIN_QUESTIONS_BEFORE_GUESS = 4;
const GUESS_CONFIDENCE = 0.8;
const UNKNOWN_PRIOR = 0.1;          // share of initial belief for "not in my database"
const UNKNOWN_LIKELIHOOD = 0.4;     // per answered question
const GIVE_UP_UNKNOWN = 0.9;
const GIVE_UP_AFTER = 12;
const NEAR_BEST_ENTROPY = 0.03;     // questions this close to the best are interchangeable

const characterById = new Map(GENIE_CHARACTERS.map(character => [character.id, character]));
const questionById = new Map(GENIE_QUESTIONS.map(question => [question.id, question]));

export function getCharacter(id) { return characterById.get(id) || null; }
export function getQuestion(id) { return questionById.get(id) || null; }

function traitValue(character, questionId) {
  return character.traits[questionId] ?? 0;
}

/** Likelihood that a character with trait `trait` produces answer value `answer`. */
function likelihood(answer, trait) {
  if (answer === null) return 1;
  return Math.max(0.05, 1 - 0.9 * Math.abs(answer - trait));
}

function entropy(weights, total) {
  if (total <= 0) return 0;
  let h = 0;
  for (const weight of weights) {
    if (weight <= 0) continue;
    const p = weight / total;
    h -= p * Math.log(p);
  }
  return h;
}

/** Small deterministic hash so the same seed always yields the same tie-break. */
function hashIndex(seed, salt, length) {
  let h = 2166136261 ^ (seed >>> 0);
  const text = String(salt);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % length;
}

/** Posterior weights for every character plus the "unknown" candidate. */
export function computeBeliefs(events) {
  const rejected = new Set();
  const answers = [];
  for (const event of events || []) {
    if (event.type === "answer") answers.push(event);
    else if (event.type === "guess" && event.correct === false) rejected.add(event.characterId);
  }
  const weights = GENIE_CHARACTERS.map(character => {
    if (rejected.has(character.id)) return 0;
    let weight = 1;
    for (const { questionId, value } of answers) weight *= likelihood(value, traitValue(character, questionId));
    return weight;
  });
  const answered = answers.filter(answer => answer.value !== null).length;
  const unknownWeight = GENIE_CHARACTERS.length * UNKNOWN_PRIOR / (1 - UNKNOWN_PRIOR) * UNKNOWN_LIKELIHOOD ** answered;
  return { weights, unknownWeight, answers, rejected };
}

function bestQuestion(weights, unknownWeight, askedIds, seed, askedCount) {
  const total = weights.reduce((sum, weight) => sum + weight, unknownWeight);
  const scored = [];
  for (const question of GENIE_QUESTIONS) {
    if (askedIds.has(question.id)) continue;
    // Expected entropy over the two decisive answers (yes / no).
    const yesWeights = [], noWeights = [];
    let yesTotal = 0, noTotal = 0;
    GENIE_CHARACTERS.forEach((character, index) => {
      const weight = weights[index];
      if (weight <= 0) return;
      const trait = traitValue(character, question.id);
      const ly = likelihood(1, trait), ln = likelihood(0, trait);
      const pYes = ly / (ly + ln);
      yesWeights.push(weight * ly); yesTotal += weight * pYes;
      noWeights.push(weight * ln); noTotal += weight * (1 - pYes);
    });
    yesWeights.push(unknownWeight); noWeights.push(unknownWeight);
    yesTotal += unknownWeight / 2; noTotal += unknownWeight / 2;
    const yesSum = yesWeights.reduce((a, b) => a + b, 0), noSum = noWeights.reduce((a, b) => a + b, 0);
    const expected = (yesTotal / total) * entropy(yesWeights, yesSum) + (noTotal / total) * entropy(noWeights, noSum);
    scored.push({ id: question.id, expected });
  }
  if (!scored.length) return null;
  const current = entropy([...weights, unknownWeight], total);
  const best = Math.min(...scored.map(entry => entry.expected));
  if (current - best < 0.005) return null; // nothing left worth asking
  const near = scored.filter(entry => entry.expected <= best + NEAR_BEST_ENTROPY);
  return near[hashIndex(seed, askedCount, near.length)].id;
}

export function decide(events = [], seed = 0) {
  const { weights, unknownWeight, answers, rejected } = computeBeliefs(events);
  const total = weights.reduce((sum, weight) => sum + weight, unknownWeight);
  let topIndex = -1;
  weights.forEach((weight, index) => { if (weight > 0 && (topIndex < 0 || weight > weights[topIndex])) topIndex = index; });
  const confidence = topIndex >= 0 ? weights[topIndex] / total : 0;
  const unknownShare = unknownWeight / total;
  const guessesUsed = rejected.size;
  const asked = answers.length;
  const guess = () => ({ type: "guess", characterId: GENIE_CHARACTERS[topIndex].id, confidence });
  const giveUp = () => ({ type: "give-up", confidence });

  if (guessesUsed >= MAX_GUESSES || topIndex < 0) return giveUp();
  if (asked >= MIN_QUESTIONS_BEFORE_GUESS && confidence >= GUESS_CONFIDENCE) return guess();
  if (asked >= GIVE_UP_AFTER && unknownShare >= GIVE_UP_UNKNOWN) return giveUp();
  if (asked >= MAX_QUESTIONS) return guess();
  const askedIds = new Set(answers.map(answer => answer.questionId));
  const questionId = bestQuestion(weights, unknownWeight, askedIds, seed, asked);
  if (!questionId) return guess();
  return { type: "question", questionId, confidence };
}
