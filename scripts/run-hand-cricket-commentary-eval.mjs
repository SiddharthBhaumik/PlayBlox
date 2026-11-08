import { readFile, writeFile } from "node:fs/promises";

const MODEL = process.env.OLLAMA_MODEL || "qwen3:4b-instruct-2507-q4_K_M";
const RAW_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const BASE_URL = RAW_HOST.endsWith("/") ? RAW_HOST.slice(0, -1) : RAW_HOST;
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "10m";
const NUM_PREDICT = Number.parseInt(process.env.OLLAMA_NUM_PREDICT || "80", 10);
const OUTPUT = process.env.RESULTS_PATH || "/tmp/playblox-hand-cricket-commentary-eval-results.json";
const datasetUrl = new URL("./hand-cricket-commentary-eval.json", import.meta.url);

const SYSTEM_PROMPT = [
  "You are one of the live commentators for PlayBlox Hand Cricket, a simultaneous-choice party game.",
  "Speak natural, fluent Indian English suitable for a live game. Do not imitate an accent or use caricatured slang.",
  "Hand Cricket rules: both players secretly choose 1-6 or Fist. Equal choices dismiss the batter. Fist against a number scores that number. Fist against Fist is a dismissal.",
  "Use only the supplied facts. Never invent a score, choice, event, statistic, sample, player intention, tactical plan or prediction.",
  "Describe observed tendencies as tendencies, never certainties. A small sample must sound small. One changed choice does not establish a new pattern.",
  "Do not use conventional cricket vocabulary or imagery: no boundaries, fours/sixes as shots, dot balls, yorkers, wickets as a conventional cricket analogy, batting technique, bowling technique, fielders or pitch references. Use only the game's actual rules and terms.",
  "Do not use random metaphors, similes, crowded-street analogies or unrelated imagery.",
  "Avoid filler openings such as 'Oh!', 'Wow!', 'What a moment!' and generic phrases such as 'bold move', 'game changer' or 'interesting contest' unless the facts genuinely justify them.",
  "Do not automatically praise 5 or 6. A choice's significance depends on the supplied evidence.",
  "Do not force a joke. Kabir's wit should be subtle and about choices or commentary, never personal traits.",
  "Arjun: energetic lead commentator, vivid but restrained. Dev: calm tactical analyst, careful about uncertainty. Mira: precise statistics expert, accurate with counts and sample sizes. Kabir: dry, playful wit, never mean.",
  "Single-speaker task: output only one or two natural spoken sentences, at most 24 words total.",
  "Two-speaker task: output exactly the requested speaker labels, one line per speaker, at most 16 words per line. Do not add narration or a third speaker.",
  "No markdown, no quotation marks around the commentary, no explanations of your process."
].join("\n");

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}
function ms(ns) { return Number.isFinite(ns) ? ns / 1e6 : null; }
function round(value, digits = 2) {
  return value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}
function promptFor(scenario) {
  const speakerText = scenario.speakers.length === 1
    ? scenario.speakers[0]
    : scenario.speakers.join(" and ");
  return [
    "EVALUATION FIXTURE — these facts are the complete source of truth.",
    ...scenario.facts.map(fact => "- " + fact),
    "",
    "Speaker(s): " + speakerText,
    "Task: " + scenario.assignment,
    scenario.mode === "exchange"
      ? "Return exactly two labelled lines, in the requested speaker order."
      : "Return only the commentary line."
  ].join("\n");
}
async function askOllama(messages, label) {
  const started = performance.now();
  const response = await fetch(BASE_URL + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      keep_alive: KEEP_ALIVE,
      stream: false,
      messages,
      options: { temperature: 0.65, top_p: 0.85, num_predict: NUM_PREDICT }
    })
  });
  const elapsedMs = performance.now() - started;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(label + ": Ollama HTTP " + response.status + " — " + body);
  }
  const data = await response.json();
  return { data, elapsedMs };
}

const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
if (!Array.isArray(dataset.scenarios) || dataset.scenarios.length !== 32) {
  throw new Error("Expected exactly 32 evaluation scenarios.");
}
const silence = dataset.scenarios.filter(s=>s.mode==="silence");
const generation = dataset.scenarios.filter(s=>s.mode==="single" || s.mode==="exchange");
if (generation.length !== 26 || silence.length !== 6) {
  throw new Error("Expected 26 generation scenarios and 6 silence-gate scenarios.");
}

console.log("PlayBlox Hand Cricket Commentary Quality Evaluation");
console.log("Model: " + MODEL);
console.log("Ollama: " + BASE_URL);
console.log("Scenarios: " + dataset.scenarios.length + " total; " + generation.length + " LLM calls; " + silence.length + " director-silence checks.");
console.log("\nWarm-up request...");
const warmup = await askOllama([
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: "Say: Ready for the commentary evaluation." }
], "warm-up");
console.log("Warm-up complete in " + round(warmup.elapsedMs) + " ms. Model load: " + round(ms(warmup.data.load_duration)) + " ms.");

const results = [];
for (let i = 0; i < dataset.scenarios.length; i++) {
  const scenario = dataset.scenarios[i];
  if (scenario.mode === "silence") {
    results.push({
      id: scenario.id,
      category: scenario.category,
      mode: "silence",
      output: null,
      directorDecision: "SILENCE",
      qualityChecks: scenario.qualityChecks,
      timing: null
    });
    console.log("\n[" + (i + 1) + "/" + dataset.scenarios.length + "] " + scenario.id + " — DIRECTOR SILENCE (no model call)");
    continue;
  }

  const userPrompt = promptFor(scenario);
  const { data, elapsedMs } = await askOllama([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ], scenario.id);
  const output = data.message?.content?.trim() || "";
  const loadMs = ms(data.load_duration);
  const promptMs = ms(data.prompt_eval_duration);
  const generationMs = ms(data.eval_duration);
  const generatedTokens = data.eval_count || 0;
  const tokensPerSecond = generationMs > 0 ? generatedTokens / (generationMs / 1000) : null;
  const timing = {
    endToEndMs: round(elapsedMs),
    reportedTotalMs: round(ms(data.total_duration)),
    loadMs: round(loadMs),
    promptMs: round(promptMs),
    generationMs: round(generationMs),
    promptTokens: data.prompt_eval_count ?? null,
    generatedTokens,
    tokensPerSecond: round(tokensPerSecond)
  };
  results.push({
    id: scenario.id,
    category: scenario.category,
    mode: scenario.mode,
    speakers: scenario.speakers,
    facts: scenario.facts,
    assignment: scenario.assignment,
    output,
    qualityChecks: scenario.qualityChecks,
    timing
  });
  console.log("\n[" + (i + 1) + "/" + dataset.scenarios.length + "] " + scenario.id + " (" + scenario.category + ")");
  console.log(output || "[EMPTY RESPONSE]");
  console.log("  " + timing.endToEndMs + " ms | load " + timing.loadMs + " | generation " + timing.generationMs + " | " + timing.tokensPerSecond + " tok/s");
}

const timed = results.filter(r=>r.timing);
const endToEnd = timed.map(r=>r.timing.endToEndMs);
const generationTimes = timed.map(r=>r.timing.generationMs);
const loads = timed.map(r=>r.timing.loadMs);
const rates = timed.map(r=>r.timing.tokensPerSecond).filter(Number.isFinite);
const summary = {
  model: MODEL,
  ollamaHost: BASE_URL,
  scenarioCount: dataset.scenarios.length,
  generationCalls: generation.length,
  directorSilenceChecks: silence.length,
  warmup: {
    endToEndMs: round(warmup.elapsedMs),
    loadMs: round(ms(warmup.data.load_duration)),
    generationMs: round(ms(warmup.data.eval_duration))
  },
  latencyMs: {
    endToEndP50: round(percentile(endToEnd, 50)),
    endToEndP95: round(percentile(endToEnd, 95)),
    generationP50: round(percentile(generationTimes, 50)),
    generationP95: round(percentile(generationTimes, 95)),
    loadP50: round(percentile(loads, 50)),
    loadP95: round(percentile(loads, 95))
  },
  meanTokensPerSecond: round(rates.length ? rates.reduce((a,b)=>a+b,0) / rates.length : null),
  note: "Timing is measured automatically. Quality checks are intentionally human-reviewed; the script does not pretend to score naturalness or factual fidelity automatically."
};
const report = { summary, results };
await writeFile(OUTPUT, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
console.log("\nFull outputs and manual quality checks saved to: " + OUTPUT);
