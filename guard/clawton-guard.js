#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const NEWTON_CLI = path.join(process.env.HOME, ".newton", "bin", "newton-cli");
const BINANCE_CLI = path.join(process.env.HOME, ".npm-global", "bin", "binance-cli");
const CAST = "cast";

const TRADE_LOG_ADDRESS = "0x86b8ED1803c99768D67a81ed1d1a1F9f8f517269";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const POLICY_DIR = path.join(process.env.HOME, "clawton", "policy-workspace");
const LOG_FILE = path.join(__dirname, "decisions.log.jsonl");

const SYMBOL_TO_TOKEN = {
  BTCUSDT: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

function banner(text, color) {
  const line = "=".repeat(text.length + 4);
  console.log(color + line + RESET);
  console.log(color + BOLD + "  " + text + "  " + RESET);
  console.log(color + line + RESET);
}

function ethToWeiHex(ethAmount) {
  const wei = BigInt(Math.round(Number(ethAmount) * 1e18));
  return "0x" + wei.toString(16);
}

function runNewtonCheck(intent) {
  const intentPath = path.join(__dirname, ".tmp-intent.json");
  fs.writeFileSync(intentPath, JSON.stringify(intent, null, 2));

  const args = [
    "policy", "simulate",
    "--wasm-file", path.join(POLICY_DIR, "policy-files/policy.wasm"),
    "--rego-file", path.join(POLICY_DIR, "policy-files/policy-local-sim.rego"),
    "--intent-json", intentPath,
    "--entrypoint", "clawton_policy.allow",
    "--wasm-args", path.join(POLICY_DIR, "wasm_args.json"),
    "--policy-params-data", path.join(POLICY_DIR, "policy_params.json"),
  ];

  const result = spawnSync(NEWTON_CLI, args, { encoding: "utf-8" });
  fs.unlinkSync(intentPath);

  const output = result.stdout + result.stderr + (result.error ? String(result.error) : "");
  const allowed = /Policy evaluation: ALLOWED/.test(output);

  return { allowed, raw: output };
}

function logDecision(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}

function executeBinanceOrder(order) {
  const args = [
    "spot", "new-order",
    "--symbol", order.symbol,
    "--side", order.side,
    "--type", order.type || "MARKET",
    "--quantity", String(order.quantity),
  ];
  const result = spawnSync(BINANCE_CLI, args, { encoding: "utf-8" });
  return result.stdout + result.stderr + (result.error ? String(result.error) : "");
}

function recordOnChain(verdict, symbol, side, quantity, detail) {
  const args = [
    "send", TRADE_LOG_ADDRESS,
    "logDecision(string,string,string,string,string)",
    verdict, symbol, side, String(quantity), detail,
    "--private-key", process.env.PRIVATE_KEY,
    "--rpc-url", process.env.RPC_URL,
  ];
  const result = spawnSync(CAST, args, { encoding: "utf-8" });
  return result.stdout + result.stderr + (result.error ? String(result.error) : "");
}

function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error(RED + "usage: clawton-guard '<request-json>'" + RESET);
    process.exit(1);
  }

  const request = JSON.parse(raw);
  const { symbol, side, quantity, spendEth } = request;

  const tokenAddress = SYMBOL_TO_TOKEN[symbol];
  if (!tokenAddress) {
    console.error(RED + `Unknown or non-whitelisted symbol: ${symbol}` + RESET);
    process.exit(1);
  }

  const intent = {
    from: "0x1234567890123456789012345678901234567890",
    to: tokenAddress,
    value: ethToWeiHex(spendEth),
    chain_id: 11155111,
    function: { name: side === "SELL" ? "sell" : "buy" },
    decoded_function_arguments: [],
  };

  console.log(CYAN + BOLD + "\nClawton Guard — evaluating intent" + RESET);
  console.log(DIM + JSON.stringify({ symbol, side, quantity, spendEth }, null, 2) + RESET);

  const { allowed, raw: policyOutput } = runNewtonCheck(intent);
  const timestamp = new Date().toISOString();

  if (!allowed) {
    banner("DENIED — policy check failed", RED);
    console.log(DIM + policyOutput + RESET);

    console.log(CYAN + "\nRecording denial on Sepolia..." + RESET);
    const onChainTx = recordOnChain("DENIED", symbol, side, quantity, `spendEth=${spendEth}`);
    console.log(DIM + onChainTx + RESET);

    logDecision({ timestamp, request, verdict: "DENIED", raw: policyOutput, onChainTx });
    console.log(RED + "Order was NOT sent to Binance." + RESET);
    process.exit(1);
  }

  banner("ALLOWED — executing on Binance", GREEN);

  const execRaw = executeBinanceOrder({ symbol, side, quantity });
  console.log(execRaw);

  let onChainTx = null;
  try {
    const fill = JSON.parse(execRaw);
    const fillPrice = fill.fills && fill.fills[0] ? fill.fills[0].price : "0";

    console.log(CYAN + "\nRecording execution on Sepolia..." + RESET);
    onChainTx = recordOnChain("ALLOWED", symbol, side, quantity, `orderId=${fill.orderId},price=${fillPrice}`);
    console.log(DIM + onChainTx + RESET);
  } catch (e) {
    console.log(YELLOW + "Could not parse Binance result for on-chain logging." + RESET);
  }

  logDecision({ timestamp, request, verdict: "ALLOWED", execResult: execRaw, onChainTx });
  console.log(YELLOW + "\nDecision logged to " + LOG_FILE + RESET);
}

main();
