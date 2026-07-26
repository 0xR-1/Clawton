#!/usr/bin/env node
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  RESET, RED, GREEN, YELLOW, CYAN, BOLD, DIM,
  banner, getLivePrice, getCumulativeSpend,
  runNewtonCheck, recordOnChain, recordSpend, logDecision,
} = require(path.join(__dirname, "..", "guards", "shared.js"));

const LOG_FILE = path.join(__dirname, "x402-decisions.log.jsonl");

function getLiveEthPrice() {
  return getLivePrice("ETHUSDT");
}

function usdcAtomicToWeiHex(amountAtomic, ethPriceUsd) {
  const usdValue = Number(amountAtomic) / 1e6;
  const ethEquivalent = usdValue / ethPriceUsd;
  const wei = BigInt(Math.round(ethEquivalent * 1e18));
  return "0x" + wei.toString(16);
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
    const onChainTx = recordOnChain(process.env.SEPOLIA_RPC_URL, "DENIED", "x402:" + resourceUrl, "PAY", amountAtomic, `payTo=${payTo}`);
    console.log(DIM + onChainTx + RESET);
    logDecision(LOG_FILE, { timestamp, resourceUrl, verdict: "DENIED", raw: policyOutput, onChainTx });
    console.log(RED + "Payment was NOT made." + RESET);
    process.exit(1);
  }

  console.log(CYAN + "\nChecking cumulative daily spend..." + RESET);
  const cumulativeSpendWei = getCumulativeSpend(process.env.SEPOLIA_RPC_URL);
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
    const onChainTx = recordOnChain(process.env.SEPOLIA_RPC_URL, "DENIED", "x402:" + resourceUrl, "PAY", amountAtomic, `dailyLimitExceeded,projectedTotalWei=${projectedTotalWei.toString()}`);
    console.log(DIM + onChainTx + RESET);
    logDecision(LOG_FILE, { timestamp, resourceUrl, verdict: "DENIED", reason: "daily_limit_exceeded", cumulativeSpendWei: cumulativeSpendWei.toString(), projectedTotalWei: projectedTotalWei.toString(), raw: dailyPolicyOutput, onChainTx });
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
  const onChainTx = recordOnChain(process.env.SEPOLIA_RPC_URL, "ALLOWED", "x402:" + resourceUrl, "PAY", amountAtomic, `payTo=${payTo}`);
  console.log(DIM + onChainTx + RESET);

  console.log(CYAN + "\nRecording cumulative spend..." + RESET);
  const spendTx = recordSpend(process.env.SEPOLIA_RPC_URL, spendWei.toString());
  console.log(DIM + spendTx + RESET);

  logDecision(LOG_FILE, { timestamp, resourceUrl, verdict: "ALLOWED", data, onChainTx, spendTx });
  console.log(YELLOW + "\nDecision logged to " + LOG_FILE + RESET);
}

main().catch((err) => {
  console.error(RED + "Error: " + err.message + RESET);
  console.error(err.stack);
});
