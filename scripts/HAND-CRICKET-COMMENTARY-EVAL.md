# Hand Cricket commentary quality evaluation

This is a local evaluation harness for the optional Ollama commentary layer. It does not change game rules, scoring, the Worker, or the frontend.

## What is evaluated

The fixture set contains 32 constructed scenarios:

- 26 language-generation scenarios covering repeated choices, sudden switches, batter-vs-bowler patterns, game events, statistical nuance, and single-/two-speaker commentary.
- 6 director-silence scenarios covering insufficient evidence, no clear pattern, stale evidence, weak model evidence, duplicate topics, and unsupported claims.

The six silence fixtures are intentionally **not sent to Ollama**. The harness records them as expected director decisions. They are not tests of the production commentary director's candidate-generation logic.

## Run locally

Requirements: Node.js 18+ and Ollama running with the selected model already pulled.

From the repository root:

```bash
ollama ps
npm run eval:hand-cricket-commentary
```

Defaults:
- Ollama endpoint: `http://localhost:11434`
- Model: `qwen3:4b-instruct-2507-q4_K_M`
- Keep-alive: `10m`
- Maximum generated tokens: `80`
- Results file: `/tmp/playblox-hand-cricket-commentary-eval-results.json`

Optional overrides:

```bash
OLLAMA_HOST=http://localhost:11434 \
OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M \
OLLAMA_KEEP_ALIVE=10m \
OLLAMA_NUM_PREDICT=80 \
RESULTS_PATH="$PWD/commentary-eval-results.json" \
npm run eval:hand-cricket-commentary
```

The script performs one warm-up request, then makes one request for each of the 26 generation fixtures. It runs sequentially to avoid competing requests on a 4 GB GPU. The result file contains the generated text, scenario facts, per-scenario quality checks, and latency fields.

## Manual quality review

The harness deliberately does not assign an automatic quality score. Read each output against its fixture facts and checks. For each generation scenario, score these dimensions from 0 to 2:

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Evidence fidelity | Invents or contradicts facts | Mostly accurate, minor imprecision | Every claim is supported and accurate |
| Relevance | Generic or unrelated | Partly tied to the situation | Directly addresses the actual insight/event |
| Natural delivery | Stilted, robotic or awkward | Understandable but uneven | Sounds like natural live commentary |
| Speaker identity | Wrong or indistinct voice | Some personality signal | Clearly fits the assigned speaker |
| Restraint | Overclaims, exaggerates or forces a joke | Slightly overdone | Preserves uncertainty; no filler or forced metaphor |

Maximum: 10 points per generation scenario. Also mark any critical failure:
- invented match fact, choice, statistic, sample size or player intention;
- incorrect Hand Cricket outcome;
- conventional cricket terminology or imagery;
- unsupported certainty/prediction;
- wrong number of speakers or speaker labels;
- generic filler or unrelated metaphor that makes the line feel artificial.

A critical factual or rules error should be treated as a failure even if the line is otherwise fluent.

For each silence fixture, verify that the director chooses silence and does not call the LLM. The harness currently records these expected decisions without invoking the model; connecting these fixtures to the real director is a separate integration test.

## Latency interpretation

The summary reports P50/P95 end-to-end time, prompt time, generation time, model-load time, and average generated tokens per second. The first generation call should usually be warm because the script performs a warm-up and requests a 10-minute keep-alive. If model-load time is high repeatedly, check `ollama ps` and ensure no other process is evicting the model.

Do not decide to replace the 4B model based on a cold-start request. Judge warm latency and commentary quality together.

## Important scope

- All match facts are synthetic evaluation fixtures.
- The script calls the local Ollama endpoint only.
- It does not send commentary to PlayBlox rooms or expose Ollama to the network.
- It does not modify live gameplay, match state, scoring, or other games.
- Generated outputs are written to a local results file and should be reviewed before prompt changes are accepted.
