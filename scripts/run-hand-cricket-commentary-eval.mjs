import { readFile, writeFile } from "node:fs/promises";

const MODEL = process.env.OLLAMA_MODEL || "llama3.2:latest";
const RAW_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const BASE_URL = RAW_HOST.endsWith("/") ? RAW_HOST.slice(0, -1) : RAW_HOST;
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "10m";
const NUM_PREDICT = Number.parseInt(process.env.OLLAMA_NUM_PREDICT || "64", 10);
const OUTPUT = process.env.RESULTS_PATH || "./commentary-eval-results.json";
const datasetUrl = new URL("./hand-cricket-commentary-eval.json", import.meta.url);

const SYSTEM_PROMPT = [
  "You are commentating on a multiplayer game of Hand Cricket. Talk naturally, like friends watching and reacting to a game.",
  "Be funny, casual and conversational. Friendly roasting and banter are welcome. Don't force jokes; react to what actually happens.",
  "Never invent scores, statistics, events or intentions. Keep each response short and sound human, not like a formal sports report.",
  "Hand Cricket rules: equal numeric choices dismiss the batter; Fist against a number scores that number; Fist against Fist is a dismissal.",
  "Do not use conventional cricket terms or imagery such as boundaries, shots, dot balls, yorkers, fielders or pitch references.",
  "Follow the assigned speaker's personality. Use only the supplied facts."
].join("\n");

const SPEAKERS = {
  kabir: "You are Kabir: the main voice. Give general match commentary, make jokes, playfully roast silly or predictable choices, and banter with players and other commentators. Talk more than the others, but don't force a joke into every line.",
  meera: "You are Meera: notice useful statistics and trends over time. Give accurate figures and sample sizes when relevant. Speak only when there is a genuinely useful pattern; don't exaggerate small samples.",
  dev: "You are Dev: cheer everyone on, celebrate good attempts and encourage struggling players, especially those who are losing. Be warm and genuine, not preachy or falsely positive.",
  arjun: "You are Arjun: bring energy to important moments, surprising turns and dramatic outcomes. Be lively but don't hype ordinary events."
};

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1, Math.ceil(p/100*sorted.length)-1)];
}
function ms(ns) { return Number.isFinite(ns) ? ns/1e6 : null; }
function round(value, digits=2) {
  return value===null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}
function promptFor(s) {
  return [
    SPEAKERS[s.speaker],
    "What happened:",
    ...s.facts.map(f=>" - "+f),
    "Your task: "+s.assignment,
    "Say one natural commentary line, no more than 25 words."
  ].join("\n");
}
async function askOllama(messages, label) {
  const started=performance.now();
  const response=await fetch(BASE_URL+"/api/chat",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      model:MODEL, keep_alive:KEEP_ALIVE, stream:false, messages,
      options:{temperature:0.8, top_p:0.9, num_predict:NUM_PREDICT}
    })
  });
  const elapsedMs=performance.now()-started;
  if(!response.ok) throw new Error(label+": Ollama HTTP "+response.status+" — "+await response.text());
  return {data:await response.json(),elapsedMs};
}

const dataset=JSON.parse(await readFile(datasetUrl,"utf8"));
const generation=dataset.scenarios.filter(s=>s.mode==="single");
const silence=dataset.scenarios.filter(s=>s.mode==="silence");
if(dataset.scenarios.length!==32 || generation.length!==26 || silence.length!==6) {
  throw new Error("Expected 32 scenarios: 26 generation and 6 silence.");
}
console.log("PlayBlox Hand Cricket Commentary Evaluation v2");
console.log("Model: "+MODEL);
console.log("Ollama: "+BASE_URL);
console.log("Scenarios: 32 total; 26 LLM calls; 6 director-silence checks.");
console.log("Warm-up request...");
const warmup=await askOllama([
  {role:"system",content:SYSTEM_PROMPT},
  {role:"user",content:"Say: Ready."}
],"warm-up");
console.log("Warm-up: "+round(warmup.elapsedMs)+" ms; load "+round(ms(warmup.data.load_duration))+" ms.");

const results=[];
for(let i=0;i<dataset.scenarios.length;i++) {
  const s=dataset.scenarios[i];
  if(s.mode==="silence") {
    results.push({id:s.id,category:s.category,mode:s.mode,output:null,directorDecision:"SILENCE",qualityChecks:s.qualityChecks,timing:null});
    console.log("\n["+(i+1)+"/32] "+s.id+" — DIRECTOR SILENCE (no model call)");
    continue;
  }
  const {data,elapsedMs}=await askOllama([
    {role:"system",content:SYSTEM_PROMPT},
    {role:"user",content:promptFor(s)}
  ],s.id);
  const output=data.message?.content?.trim()||"";
  const loadMs=ms(data.load_duration), promptMs=ms(data.prompt_eval_duration), generationMs=ms(data.eval_duration);
  const generatedTokens=data.eval_count||0;
  const timing={
    endToEndMs:round(elapsedMs), reportedTotalMs:round(ms(data.total_duration)),
    loadMs:round(loadMs), promptMs:round(promptMs), generationMs:round(generationMs),
    promptTokens:data.prompt_eval_count??null, generatedTokens,
    tokensPerSecond:generationMs>0?round(generatedTokens/(generationMs/1000)):null
  };
  results.push({id:s.id,category:s.category,speaker:s.speaker,facts:s.facts,assignment:s.assignment,output,qualityChecks:s.qualityChecks,timing});
  console.log("\n["+(i+1)+"/32] "+s.id+" / "+s.speaker);
  console.log(output||"[EMPTY RESPONSE]");
  console.log("  "+timing.endToEndMs+" ms | prompt "+timing.promptMs+" | generation "+timing.generationMs+" | "+timing.tokensPerSecond+" tok/s | "+timing.promptTokens+" prompt tokens");
}
const timed=results.filter(r=>r.timing);
const summary={
  model:MODEL,ollamaHost:BASE_URL,scenarioCount:32,generationCalls:26,directorSilenceChecks:6,
  warmup:{endToEndMs:round(warmup.elapsedMs),loadMs:round(ms(warmup.data.load_duration))},
  latencyMs:{
    endToEndP50:round(percentile(timed.map(r=>r.timing.endToEndMs),50)),
    endToEndP95:round(percentile(timed.map(r=>r.timing.endToEndMs),95)),
    promptP50:round(percentile(timed.map(r=>r.timing.promptMs),50)),
    generationP50:round(percentile(timed.map(r=>r.timing.generationMs),50)),
    generationP95:round(percentile(timed.map(r=>r.timing.generationMs),95)),
    loadP50:round(percentile(timed.map(r=>r.timing.loadMs),50))
  },
  promptTokensP50:round(percentile(timed.map(r=>r.timing.promptTokens),50)),
  meanTokensPerSecond:round(timed.reduce((sum,r)=>sum+(r.timing.tokensPerSecond||0),0)/timed.length),
  note:"Timing is automatic. Language quality is manually reviewed using the scenario checks and rubric."
};
const report={summary,results};
await writeFile(OUTPUT,JSON.stringify(report,null,2)+"\n","utf8");
console.log("\n=== SUMMARY ===\n"+JSON.stringify(summary,null,2));
console.log("\nSaved results to: "+OUTPUT);
