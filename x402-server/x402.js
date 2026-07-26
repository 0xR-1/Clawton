#!/usr/bin/env node
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NEWTON_CLI = path.join(process.env.HOME, ".newton", "bin", "newton-cli");
const CAST = path.join(process.env.HOME, ".foundry", "bin", "cast");
const BINANCE_CLI = path.join(process.env.HOME, ".npm-global", "bin", "binance-cli");
const TRADE_LOG_ADDRESS = "0x86b8ED1803c99768D67a81ed1d1a1F9f8f517269";
const SPEND_TRACKER_ADDRESS = "0x1760001880C71a357eC1Cf0D8C81aD8b30424f42";
const WINDOW_SECONDS = 86400;
const POLICY_DIR = path.join(process.env.HOME, "clawton", "policy");
const LOG_FILE = path.join(__dirname, "x402-decisions.log.jsonl");
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

function getLiveEthPrice() {
  const result = spawnSync(BINANCE_CLI, ["spot", "ticker-price", "--symbol", "ETHUSDT"], { encoding: "utf-8" });
  const parsed = JSON.parse(result.stdout);
  return Number(parsed.price);
}

function usdcAtomicToWeiHex(amountAtomic, ethPriceUsd) {
  const usdValue = Number(amountAtomic) / 1e6;
  const ethEquivalent = usdValue / ethPriceUsd;
  const wei = BigInt(Math.round(ethEquivalent * 1e18));
  return "0x" + wei.toString(16);
}

function getCumulativeSpend() {
  const args = [
    "call", SPEND_TRACKER_ADDRESS,
    "getCumulativeSpend(uint256)(uint256)",
    String(WINDOW_SECONDS),
    "--rpc-url", process.env.SEPOLIA_RPC_URL,
  ];
  const result = spawnSync(CAST, args, { encoding: "utf-8" });
  const output = result.stdout.trim();
  return BigInt(output.split(" ")[0]);
}

function runNewtonCheck(intent, entrypoint) {
  const intentPath = path.join(__dirname, ".tmp-x402-intent.json");
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

function recordOnChain(verdict, resource, amount, detail) {
  const args = [
    "send", TRADE_LOG_ADDRESS,
    "logDecision(string,string,string,string,string)",
    verdict, "x402:" + resource, "PAY", String(amount), detail,
    "--private-key", process.env.PRIVATE_KEY,
    "--rpc-url", process.env.SEPOLIA_RPC_URL,
  ];
  const result = spawnSync(CAST, args, { encoding: "utf-8" });
  return result.stdout + result.stderr + (result.error ? String(result.error) : "");
}

function recordSpend(amountWei) {
  const args = [
    "send", SPEND_TRACKER_ADDRESS,
    "recordSpend(uint256)",
    String(amountWei),
    "--private-key", process.env.PRIVATE_KEY,
    "--rpc-url", process.env.SEPOLIA_RPC_URL,
  ];
  const result = spawnSync(CAST, args, { encoding: "utf-8" });
  return result.stdout + result.stderr + (result.error ? String(result.error) : "");
}

function getLastHash() {
  if (!fs.existsSync(LOG_FILE)) {
    return GENESIS_HASH;
  }
  const content = fs.readFileSync(LOG_FILE, "utf-8").trim();
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

function logDecision(entry) {
  const prevHash = getLastHash();
  const payload = JSON.stringify(entry);
  const hash = crypto.createHash("sha256").update(prevHash + payload).digest("hex");
  const record = Object.assign({}, entry, { prevHash, hash });
  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n");
}

async function main() {
  const resourceUrl = process.argv[2];
  if (!resourceUrl) {
    console.error(RED + "usage: node x402.js <resource-url>" + RESET);
    process.exit(1);
  }

  console.log(CYAN + BOLD + "\nClawton Guard (x402) — probing resource" + RESET);
  console.log(DIM + resourceUrl + RESET);

  const probeResponse = await fetch(resourceUrl);
  if (probeResponse.status !== 402) {
    console.log(YELLOW + "Resource did not return 402 — nothing to pay for." + RESET);
    process.exit(0);
  }

  const paymentInfo = await probeResponse.json();
  const requirement = paymentInfo.accepts[0];
  const amountAtomic = requirement.maxAmountRequired;
  const payTo = requirement.payTo;

  console.log(DIM + JSON.stringify(requirement, null, 2) + RESET);
  const usdValue = (Number(amountAtomic) / 1e6).toFixed(2);
  console.log(CYAN + BOLD + `Payment amount: $${usdValue} USDC` + RESET);

  const ethPriceUsd = getLiveEthPrice();
  const spendWeiHex = usdcAtomicToWeiHex(amountAtomic, ethPriceUsd);
  const spendWei = BigInt(spendWeiHex);

  const intent = {
    from: "0x1234567890123456789012345678901234567890",
    to: payTo,
    value: spendWeiHex,
    chain_id: 11155111,
    function: { name: "pay" },
    decoded_function_arguments: [],
  };

  const { allowed, raw: policyOutput } = runNewtonCheck(intent, "clawton_policy.allow");
  const timestamp = new Date().toISOString();

  if (!allowed) {
    banner("DENIED — policy check failed", RED);
    console.log(DIM + policyOutput + RESET);
    console.log(CYAN + "\nRecording denial on Sepolia..." + RESET);
    const onChainTx = recordOnChain("DENIED", resourceUrl, amountAtomic, `payTo=${payTo}`);
    console.log(DIM + onChainTx + RESET);
    logDecision({ timestamp, resourceUrl, verdict: "DENIED", raw: policyOutput, onChainTx });
    console.log(RED + "Payment was NOT made." + RESET);
    process.exit(1);
  }

  console.log(CYAN + "\nChecking cumulative daily spend..." + RESET);
  const cumulativeSpendWei = getCumulativeSpend();
  const projectedTotalWei = cumulativeSpendWei + spendWei;
  console.log(DIM + JSON.stringify({
    cumulativeSpendWei: cumulativeSpendWei.toString(),
    thisTxWei: spendWei.toString(),
    projectedTotalWei: projectedTotalWei.toString(),
  }, null, 2) + RESET);

  const dailyIntent = {
    from: "0x1234567890123456789012345678901234567890",
    to: payTo,
    value: "0x" + projectedTotalWei.toString(16),
    chain_id: 11155111,
    function: { name: "pay" },
    decoded_function_arguments: [],
  };

  const { allowed: withinDailyLimit, raw: dailyPolicyOutput } = runNewtonCheck(dailyIntent, "clawton_policy.within_daily_limit");

  if (!withinDailyLimit) {
    banner("DENIED — daily spend limit exceeded", RED);
    console.log(DIM + dailyPolicyOutput + RESET);
    console.log(CYAN + "\nRecording denial on Sepolia..." + RESET);
    const onChainTx = recordOnChain("DENIED", resourceUrl, amountAtomic, `dailyLimitExceeded,projectedTotalWei=${projectedTotalWei.toString()}`);
    console.log(DIM + onChainTx + RESET);
    logDecision({ timestamp, resourceUrl, verdict: "DENIED", reason: "daily_limit_exceeded", cumulativeSpendWei: cumulativeSpendWei.toString(), projectedTotalWei: projectedTotalWei.toString(), raw: dailyPolicyOutput, onChainTx });
    console.log(RED + "Payment was NOT made." + RESET);
    process.exit(1);
  }

  banner("ALLOWED — proceeding with x402 payment", GREEN);

  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    transport: http(),
    chain: baseSepolia,
  });
  const fetchWithPayment = wrapFetchWithPayment(fetch, walletClient);

  const response = await fetchWithPayment(resourceUrl, { method: "GET" });
  const data = await response.json();
  console.log(DIM + JSON.stringify(data, null, 2) + RESET);

  console.log(CYAN + "\nRecording execution on Sepolia..." + RESET);
  const onChainTx = recordOnChain("ALLOWED", resourceUrl, amountAtomic, `payTo=${payTo}`);
  console.log(DIM + onChainTx + RESET);

  console.log(CYAN + "\nRecording cumulative spend..." + RESET);
  const spendTx = recordSpend(spendWei.toString());
  console.log(DIM + spendTx + RESET);

  logDecision({ timestamp, resourceUrl, verdict: "ALLOWED", data, onChainTx, spendTx });
  console.log(YELLOW + "\nDecision logged to " + LOG_FILE + RESET);
}

main().catch((err) => {
  console.error(RED + "Error: " + err.message + RESET);
  console.error(err.stack);
});
