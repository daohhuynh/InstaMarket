import { HttpCLOBGateway, NoopCLOBGateway } from "../adapters/CLOBGateway.js";
import { HttpMarketStateProvider } from "../adapters/MarketStateProvider.js";
import { BedrockNovaLiteModel } from "../bedrock/BedrockNovaLiteModel.js";
import { HeuristicLocalModel } from "../bedrock/HeuristicLocalModel.js";
import type { PersonaSimulationConfig } from "../contracts/person2Contracts.js";
import type { MarketState } from "../contracts/sharedSchemas.js";
import { validateMarketState } from "../contracts/sharedSchemas.js";
import { PersonaTradeSimulator } from "../persona/PersonaTradeSimulator.js";
import {
  FileTwitterCommentsSource,
  HttpTwitterCommentsSource,
  StaticTwitterCommentsSource,
  type TwitterCommentsSource,
} from "../persona/TwitterCommentsSource.js";
import { SwarmOrchestrator } from "../swarm/SwarmOrchestrator.js";
import { readJsonFile, writeJsonFile } from "../util/jsonFile.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    printHelp();
    return;
  }

  const postUrl = requiredArg(args, "--post-url");
  const marketStateFile = optionalArg(args, "--market-state-file");
  const marketId = optionalArg(args, "--market-id");
  const submitToClob = args.includes("--submit");
  const outputDir = optionalArg(args, "--output-dir") ?? "output";

  const marketState = await resolveMarketState({ marketStateFile, marketId });
  const commentsSource = await resolveCommentsSource(args);

  const region = process.env.AWS_REGION;
  const modelId = process.env.BEDROCK_MODEL_ID;
  const useLocalModel = args.includes("--local-model") || !region;
  const languageModel = useLocalModel
    ? new HeuristicLocalModel()
    : new BedrockNovaLiteModel({ region, model_id: modelId });

  const clobEndpoint = optionalArg(args, "--clob-endpoint") ?? process.env.CLOB_ENDPOINT;
  const clobGateway = submitToClob
    ? new HttpCLOBGateway(requireString(clobEndpoint, "Missing --clob-endpoint or CLOB_ENDPOINT when using --submit."))
    : new NoopCLOBGateway();

  const orchestrator = new SwarmOrchestrator(languageModel);
  const simulator = new PersonaTradeSimulator(
    {
      comments_source: commentsSource,
      swarm_orchestrator: orchestrator,
      clob_gateway: clobGateway,
    },
    loadSimulationConfig(),
  );

  const result = await simulator.simulate({
    post_url: postUrl,
    market_state: marketState,
    submit_to_clob: submitToClob,
  });

  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const simulationPath = `${outputDir}/person2_simulation_${stamp}.json`;
  const tradesPath = `${outputDir}/person2_trade_execution_${stamp}.json`;
  const thesisPath = `${outputDir}/person2_ai_swarm_thesis_${stamp}.json`;

  await writeJsonFile(simulationPath, result);
  await writeJsonFile(
    tradesPath,
    result.records
      .filter((record) => Boolean(record.trade_execution))
      .map((record) => record.trade_execution),
  );
  await writeJsonFile(thesisPath, result.records.map((record) => record.thesis));

  process.stdout.write(
    [
      `Simulation complete.`,
      `Market: ${result.market_id}`,
      `Comments processed: ${result.processed_comments}`,
      `Trades generated: ${result.generated_trades}`,
      `Saved: ${simulationPath}`,
      `Saved: ${tradesPath}`,
      `Saved: ${thesisPath}`,
      useLocalModel ? `Model mode: local heuristic (--local-model or missing AWS_REGION).` : `Model mode: AWS Bedrock Nova Lite.`,
    ].join("\n") + "\n",
  );
}

function printHelp(): void {
  process.stdout.write(`
Person 2 Swarm Simulation Runner

Required:
  --post-url <url>

Market input (choose one):
  --market-state-file <path>
  --market-id <id>            (requires MARKET_STATE_ENDPOINT env var)

Comments input (choose one):
  --comments-file <path>
  --comments-endpoint <url>   (or TWITTER_COMMENTS_ENDPOINT env var)

Optional:
  --submit                    Submit trades to CLOB endpoint
  --clob-endpoint <url>       (or CLOB_ENDPOINT env var)
  --output-dir <dir>          Default: output
  --local-model               Use deterministic local fallback instead of Bedrock
  --help
`);
}

async function resolveMarketState(input: {
  marketStateFile?: string;
  marketId?: string;
}): Promise<MarketState> {
  if (input.marketStateFile) {
    const market = await readJsonFile<unknown>(input.marketStateFile);
    validateMarketState(market);
    return market;
  }

  const marketId = requireString(input.marketId, "Missing --market-id or --market-state-file.");
  const endpoint = process.env.MARKET_STATE_ENDPOINT;
  const provider = new HttpMarketStateProvider(requireString(endpoint, "Missing MARKET_STATE_ENDPOINT for --market-id flow."));
  return provider.getMarketState(marketId);
}

async function resolveCommentsSource(args: string[]): Promise<TwitterCommentsSource> {
  const commentsFile = optionalArg(args, "--comments-file");
  const commentsEndpoint = optionalArg(args, "--comments-endpoint") ?? process.env.TWITTER_COMMENTS_ENDPOINT;

  if (commentsFile) {
    return new FileTwitterCommentsSource(commentsFile);
  }
  if (commentsEndpoint) {
    return new HttpTwitterCommentsSource(commentsEndpoint);
  }

  return new StaticTwitterCommentsSource([
    {
      id: "fallback_1",
      user_twitter_id: "sample_trader_1",
      text: "I think launch momentum is real and odds are still underpricing YES.",
      like_count: 42,
      created_at: new Date().toISOString(),
    },
    {
      id: "fallback_2",
      user_twitter_id: "sample_trader_2",
      text: "Too much timeline risk here, NO looks safer.",
      like_count: 18,
      created_at: new Date().toISOString(),
    },
  ]);
}

function loadSimulationConfig(): Partial<PersonaSimulationConfig> {
  return {
    comment_limit: parseEnvInt("SIM_COMMENT_LIMIT", 30),
    min_order_usdc: parseEnvInt("SIM_MIN_ORDER_USDC", 1),
    bankroll_min_usdc: parseEnvInt("SIM_BANKROLL_MIN_USDC", 100),
    bankroll_max_usdc: parseEnvInt("SIM_BANKROLL_MAX_USDC", 1000),
    max_concurrency: parseEnvInt("SIM_MAX_CONCURRENCY", 4),
  };
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalArg(args: string[], key: string): string | undefined {
  const index = args.indexOf(key);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function requiredArg(args: string[], key: string): string {
  const value = optionalArg(args, key);
  return requireString(value, `Missing required argument ${key}.`);
}

function requireString(value: string | undefined, message: string): string {
  if (!value) {
    throw new Error(message);
  }
  return value;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Simulation failed: ${message}\n`);
  process.exitCode = 1;
});
