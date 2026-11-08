const PANEL = [
  { id:"arjun", role:"lead", style:"energetic, lively, concise play-by-play" },
  { id:"dev", role:"analyst", style:"calm, tactical, explains the pattern" },
  { id:"mira", role:"statistics", style:"precise, evidence-led, states sample sizes" },
  { id:"kabir", role:"wit", style:"witty and mischievous; roasts choices and commentators, never personal traits" }
];

const DEFAULTS = Object.freeze({
  minimumDeliveryGap: 3,
  candidateCooldown: 8,
  maximumCommentaries: 14,
  maximumPerSpeaker: 5
});

function nonNegativeInteger(value, fallback, minimum = 0) {
  return Number.isInteger(value) && value >= minimum ? value : fallback;
}

function cloneMemory(memory = {}) {
  const speakerCounts = {};
  if (memory.speakerCounts && typeof memory.speakerCounts === "object"
    && !Array.isArray(memory.speakerCounts)) {
    for (const person of PANEL) {
      speakerCounts[person.id] = nonNegativeInteger(memory.speakerCounts[person.id], 0);
    }
  }
  return {
    spokenCandidateIds: Array.isArray(memory.spokenCandidateIds)
      ? memory.spokenCandidateIds.filter(value => typeof value === "string").slice(-200)
      : [],
    lastCommentaryAt: Number.isInteger(memory.lastCommentaryAt) && memory.lastCommentaryAt >= 0
      ? memory.lastCommentaryAt : -Infinity,
    lastSpeakerId: PANEL.some(person => person.id === memory.lastSpeakerId)
      ? memory.lastSpeakerId : null,
    speakerCounts,
    commentaryCount: nonNegativeInteger(memory.commentaryCount, 0),
    recentTopics: Array.isArray(memory.recentTopics)
      ? memory.recentTopics.filter(value => typeof value === "string").slice(-32)
      : []
  };
}

function normalizeSettings(options) {
  return {
    minimumDeliveryGap: nonNegativeInteger(options.minimumDeliveryGap, DEFAULTS.minimumDeliveryGap),
    candidateCooldown: nonNegativeInteger(options.candidateCooldown, DEFAULTS.candidateCooldown),
    maximumCommentaries: nonNegativeInteger(options.maximumCommentaries, DEFAULTS.maximumCommentaries),
    maximumPerSpeaker: nonNegativeInteger(options.maximumPerSpeaker, DEFAULTS.maximumPerSpeaker)
  };
}

function speakerFor(candidate, memory, counts, maxPerSpeaker) {
  const preferred = candidate.type === "prediction-performance" ? "mira"
    : candidate.type === "batter-repeat-pattern" ? "dev"
    : candidate.type === "batter-choice-tendency" ? "kabir" : "arjun";
  const available = PANEL.filter(person => (counts[person.id] || 0) < maxPerSpeaker);
  if (!available.length) return null;
  const preferredPerson = available.find(person => person.id === preferred);
  if (preferredPerson && preferredPerson.id !== memory.lastSpeakerId) return preferredPerson;
  return available.find(person => person.id !== memory.lastSpeakerId) || available[0];
}

/**
 * Deterministic gate between evaluated evidence and an optional local LLM.
 * Selection returns a proposed next memory. Persist it only after the
 * commentary has been generated and accepted by the server; otherwise a
 * failed generation would permanently consume a topic and speaker turn.
 */
export function selectHandCricketCommentary(candidates, memoryInput = {}, options = {}) {
  const memory = cloneMemory(memoryInput);
  const settings = normalizeSettings(options);
  const deliveryIndex = Number.isInteger(options.deliveryIndex) && options.deliveryIndex >= 0
    ? options.deliveryIndex : 0;

  if (memory.commentaryCount >= settings.maximumCommentaries) {
    return { selected:false, reason:"match-commentary-cap", memory };
  }
  if (deliveryIndex - memory.lastCommentaryAt < settings.minimumDeliveryGap) {
    return { selected:false, reason:"delivery-cooldown", memory };
  }

  const recent = new Set(memory.recentTopics.slice(-settings.candidateCooldown));
  const eligible = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => candidate && typeof candidate.id === "string"
      && candidate.id.length > 0 && candidate.id.length <= 180
      && typeof candidate.type === "string" && candidate.type.length <= 80
      && !memory.spokenCandidateIds.includes(candidate.id)
      && !recent.has(candidate.type)
      && Number.isFinite(candidate.priority)
      && Number.isInteger(candidate.sampleSize)
      && candidate.sampleSize >= 4)
    .sort((a,b) => b.priority - a.priority || b.sampleSize - a.sampleSize);

  for (const candidate of eligible) {
    const speaker = speakerFor(candidate, memory, memory.speakerCounts, settings.maximumPerSpeaker);
    if (!speaker) break;
    const nextMemory = cloneMemory(memory);
    nextMemory.spokenCandidateIds.push(candidate.id);
    nextMemory.spokenCandidateIds = nextMemory.spokenCandidateIds.slice(-200);
    nextMemory.lastCommentaryAt = deliveryIndex;
    nextMemory.lastSpeakerId = speaker.id;
    nextMemory.speakerCounts[speaker.id] = (nextMemory.speakerCounts[speaker.id] || 0) + 1;
    nextMemory.commentaryCount++;
    nextMemory.recentTopics.push(candidate.type);
    nextMemory.recentTopics = nextMemory.recentTopics.slice(-Math.max(1, settings.candidateCooldown));

    return {
      selected:true,
      reason:"evidence-candidate-selected",
      speaker,
      candidate,
      memory:nextMemory,
      promptPacket:{
        language:"English",
        dialect:"natural Indian English",
        speaker:{ id:speaker.id, role:speaker.role, style:speaker.style },
        evidence:candidate.evidence,
        sampleSize:candidate.sampleSize,
        confidence:candidate.confidence || "limited",
        caveat:candidate.caveat || "Treat this as a descriptive observation, not a guarantee.",
        instructions:[
          "Use only the supplied evidence; do not invent scores, choices, events or player intentions.",
          "Preserve uncertainty and mention the sample size when it matters.",
          "Keep the line concise and natural for a live party game.",
          "Do not use conventional cricket terms such as boundary, dot ball, yorker or shot technique.",
          "Do not praise a high number automatically; judge choices relative to the supplied evidence.",
          "Do not repeat an earlier point or force a joke."
        ]
      }
    };
  }

  return {
    selected:false,
    reason:eligible.length ? "no-available-speaker" : "no-new-evidence",
    memory
  };
}

export function createHandCricketCommentaryMemory() {
  return cloneMemory();
}
