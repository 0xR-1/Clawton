const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const NEWTON_CLI = path.join(process.env.HOME, ".newton", "bin", "newton-cli");
const BINANCE_CLI = path.join(process.env.HOME, ".npm-global", "bin", "binance-cli");
const CAST = path.join(process.env.HOME, ".foundry", "bin", "cast");
const POLICY_DIR = path.join(process.env.HOME, "clawton", "policy");
const TRADE_LOG_ADDRESS = "0x86b8ED1803c99768D67a81ed1d1a1F9f8f517269";
const SPEND_TRACKER_ADDRESS = "0x1760001880C71a357eC1Cf0D8C81aD8b30424f42";
const WINDOW_SECONDS = 86400;
const GENESIS_HASH = "0".repeat(64);

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function banner(text, color) {
  const line = "=".repeat(text.length + 4);
  console.log(color + line + RESET);
  console.log(color + BOLD + "  " + text + "  " + RESET);
  console.log(color + line + RESET);
}

function getLivePrice(symbol) {
  const result = spawnSync(BINANCE_CLI, ["spot", "ticker-price", "--symbol", symbol], { encoding: "utf-8" });
  const parsed = JSON.parse(result.stdout);
  return Number(parsed.price);
}

function ethToWeiHex(ethAmount) {
  const wei = BigInt(Math.round(ethAmount * 1e18));
  return "0x" + wei.toString(16);
}

function getCumulativeSpend(rpcUrl) {
  const args = [
    "call", SPEND_TRACKER_ADDRESS,
    "getCumulativeSpend(uint256)(uint256)",
    String(WINDOW_SECONDS),
    "--rpc-url", rpcUrl,
  ];
  const result = spawnSync(CAST, args, { encoding: "utf-8" });
  const output = result.stdout.trim();
  return BigInt(output.split(" ")[0]);
}

function runNewtonCheck(intent, entrypoint) {
  const intentPath = path.join(os.tmpdir(), `clawton-intent-${crypto.randomUUID()}.json`);
  fs.writeFileSync(intentPath, JSON.stringify(intent, null, 2));

  const args = [
    "policy", "simulate",
    "--wasm-file", path.join(POLICY_DIR, "policy-files/policy.wasm"),
    "--rego-file", path.join(POLICY_DIR, "policy-files/policy-local-sim.rego"),
    "--intent-json", intentPath,
    "--entrypoint", entrypoint,
    "--wasm-args", path.join(POLICY_DIR, "wasm_args.json"),
    "--policy-params-data", path.join(POLICY_DIR, "policy_params.json"),
  ];

  const result = spawnSync(NEWTON_CLI, args, { encoding: "utf-8" });
  fs.unlinkSync(intentPath);

  const output = result.stdout + result.stderr + (result.error ? String(result.error) : "");
  const allowed = /Policy evaluation: ALLOWED/.test(output);

  return { allowed, raw: output };
}

function recordOnChain(rpcUrl, verdict, symbol, side, quantity, detail) {
  const args = [
    "send", TRADE_LOG_ADDRESS,
    "logDecision(string,string,string,string,string)",
    verdict, symbol, side, String(quantity), detail,
    "--private-key", process.env.PRIVATE_KEY,
    "--rpc-url", rpcUrl,
  ];
  const result = spawnSync(CAST, args, { encoding: "utf-8" });
  return result.stdout + result.stderr + (result.error ? String(result.error) : "");
}

function recordSpend(rpcUrl, amountWei) {
  const args = [
    "send", SPEND_TRACKER_ADDRESS,
    "recordSpend(uint256)",
    String(amountWei),
    "--private-key", process.env.PRIVATE_KEY,
    "--rpc-url", rpcUrl,
  ];
  const result = spawnSync(CAST, args, { encoding: "utf-8" });
  return result.stdout + result.stderr + (result.error ? String(result.error) : "");
}

function getLastHash(logFile) {
  if (!fs.existsSync(logFile)) {
    return GENESIS_HASH;
  }
  const content = fs.readFileSync(logFile, "utf-8").trim();
  if (!content) {
    return GENESIS_HASH;
  }
  const lines = content.split("\n");
  const lastLine = lines[lines.length - 1];
  try {
    const lastEntry = JSON.parse(lastLine);
    return lastEntry.hash || GENESIS_HASH;
  } catch (e) {
    return GENESIS_HASH;
  }
}

function logDecision(logFile, entry) {
  const prevHash = getLastHash(logFile);
  const payload = JSON.stringify(entry);
  const hash = crypto.createHash("sha256").update(prevHash + payload).digest("hex");
  const record = Object.assign({}, entry, { prevHash, hash });
  fs.appendFileSync(logFile, JSON.stringify(record) + "\n");
}

module.exports = {
  NEWTON_CLI, BINANCE_CLI, CAST, POLICY_DIR,
  TRADE_LOG_ADDRESS, SPEND_TRACKER_ADDRESS, WINDOW_SECONDS, GENESIS_HASH,
  RESET, RED, GREEN, YELLOW, CYAN, BOLD, DIM,
  banner, getLivePrice, ethToWeiHex, getCumulativeSpend,
  runNewtonCheck, recordOnChain, recordSpend, getLastHash, logDecision,
};
