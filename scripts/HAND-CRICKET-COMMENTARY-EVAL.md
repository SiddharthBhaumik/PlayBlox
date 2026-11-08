# Hand Cricket commentary evaluation v2

This local harness compares commentary models using the same compact prompts and 32 synthetic scenarios. It does not change gameplay, scoring, the Worker or the frontend.

## Prompt design

The runner sends a short shared system prompt on every independent request, then one selected speaker instruction and one approved observation/task. It does not send all four speaker descriptions on every call.

Speaker roles:
- **Kabir:** Main voice; general commentary, playful roasting and banter.
- **Meera:** Useful statistics and trends over time; accurate and sample-aware.
- **Dev:** Encourages everyone, especially players who are losing.
- **Arjun:** Energetic reactions to important moments.

## Test set

- 26 generation scenarios: 8 Kabir, 6 Meera, 6 Dev and 6 Arjun.
- 6 director-silence scenarios: insufficient evidence, no clear pattern, stale evidence, weak model evidence, duplicate topic and unsupported claim.
- The silence scenarios are not sent to Ollama. They are expected director decisions, not tests of the production director implementation.

## Run in Windows PowerShell

Requirements: Node.js 18+ and Ollama running in WSL with Windows access through `http://localhost:11434`.

First check the models:

```powershell
ollama list
curl.exe http://localhost:11434/api/tags
```

Run Llama 3.2 3B (default):

```powershell
$env:OLLAMA_MODEL = "llama3.2:latest"
$env:RESULTS_PATH = "$PWD\commentary-llama3b-results.json"
npm run eval:hand-cricket-commentary
```

Then run the same scenarios with Qwen 4B:

```powershell
$env:OLLAMA_MODEL = "qwen3:4b-instruct-2507-q4_K_M"
$env:RESULTS_PATH = "$PWD\commentary-qwen4b-results.json"
npm run eval:hand-cricket-commentary
```

Each run performs one warm-up and 26 sequential generation requests. Keep the model warm for the run. Do not run both models simultaneously on a 4 GB GPU. Results are local JSON files; do not commit them.

Optional settings: `OLLAMA_HOST`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_PREDICT`, and `RESULTS_PATH`. Defaults are localhost:11434, 10m, 64 generated tokens and `./commentary-eval-results.json`.

## Manual quality review

Score each generation from 0 to 2 on each dimension:

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Evidence fidelity | Invents or changes facts | Minor imprecision | Fully supported and accurate |
| Naturalness | Robotic or awkward | Understandable, uneven | Sounds like a person speaking |
| Role fit | Wrong personality | Partly fits | Clearly fits the assigned speaker |
| Humour / warmth | Forced, mean or absent when called for | Somewhat effective | Natural, appropriate and specific |
| Concision | Rambling or repetitive | Slightly long | Short and conversational |

For Meera, also check exact figures, denominators, time windows and appropriate uncertainty. For Dev, check that encouragement is genuine and does not pretend a losing player is winning. For Kabir, check that roasts are grounded and friendly, including commentator banter. For Arjun, check that energy matches the importance of the event.

Mark critical failures separately:
- invented or incorrect score, choice, event, statistic or intention;
- incorrect Hand Cricket outcome;
- conventional cricket terminology;
- wrong speaker/personality;
- personal or humiliating insult;
- forced joke or unrelated metaphor;
- missed important supplied statistic.

A factual or game-rule error is a failure regardless of the humour score.

## Comparing Llama 3.2 3B and Qwen3 4B

Compare:
1. Warm P50 and P95 end-to-end latency.
2. Prompt token P50 and generation speed.
3. Average manual quality score and critical failure count.
4. Kabir's humour/banter, Meera's statistical accuracy, Dev's encouragement and Arjun's event reactions separately.

Use the same dataset, prompt template, temperature and token limit for both. Run sequentially, not concurrently. Do not choose a model based on one unusually fast response; judge the full run.

## Scope

- Synthetic fixtures only.
- Calls local Ollama; no network exposure of Ollama.
- Does not send commentary to live rooms.
- Does not modify gameplay or scoring.
- Quality is manually reviewed; the runner does not claim to automatically judge humour or naturalness.
