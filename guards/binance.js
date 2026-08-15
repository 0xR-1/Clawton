#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const {
  BINANCE_CLI, RESET, RED, GREEN, YELLOW, CYAN, BOLD, DIM,
  banner, getLivePrice, ethToWeiHex, getCumulativeSpend,
  runNewtonCheck, recordOnChain, recordSpend, logDecision, PriceAnomalyError,
} = require("./shared");
const { spawnSync } = require("child_process");

const LOG_FILE = path.join(__dirname, "decisions.log.jsonl");

const SYMBOL_TO_TOKEN = {
  BTCUSDT: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

function computeEthEquivalent(symbol, quantity) {
  const assetPriceUsdt = getLivePrice(symbol);
  const ethPriceUsdt = getLivePrice("ETHUSDT");
  const usdValue = Number(quantity) * assetPriceUsdt;
  return usdValue / ethPriceUsdt;
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

function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error(RED + "usage: node binance.js '<request-json>'" + RESET);
    process.exit(1);
  }

  const request = JSON.parse(raw);
  const { symbol, side, quantity } = request;

  const tokenAddress = SYMBOL_TO_TOKEN[symbol];
  if (!tokenAddress) {
    console.error(RED + `Unknown or non-whitelisted symbol: ${symbol}` + RESET);
    process.exit(1);
  }

  const timestamp = new Date().toISOString();
  let spendEth;

  try {
    spendEth = computeEthEquivalent(symbol, quantity);
  } catch (e) {
    if (e instanceof PriceAnomalyError) {
      banner("DENIED — price anomaly detected", RED);
      console.log(DIM + e.message + RESET);

      console.log(CYAN + "\nRecording denial on Sepolia..." + RESET);
      const onChainTx = recordOnChain(process.env.RPC_URL, "DENIED", symbol, side, quantity, `price_anomaly,symbol=${e.symbol},previous=${e.previousPrice},new=${e.newPrice}`);
      console.log(DIM + onChainTx + RESET);

      logDecision(LOG_FILE, { timestamp, request, verdict: "DENIED", reason: "price_anomaly_detected", priceAnomaly: { symbol: e.symbol, previousPrice: e.previousPrice, newPrice: e.newPrice, deviation: e.deviation }, onChainTx });
      console.log(RED + "Order was NOT sent to Binance." + RESET);
      process.exit(1);
    }
    throw e;
  }

  const spendWei = BigInt(ethToWeiHex(spendEth));

  const intent = {
    from: "0x1234567890123456789012345678901234567890",
    to: tokenAddress,
    value: ethToWeiHex(spendEth),
    chain_id: 11155111,
    function: { name: side === "SELL" ? "sell" : "buy" },
    decoded_function_arguments: [],
  };

  console.log(CYAN + BOLD + "\nClawton Guard — evaluating intent" + RESET);
  console.log(DIM + JSON.stringify({ symbol, side, quantity, computedSpendEth: spendEth }, null, 2) + RESET);

  const { allowed, raw: policyOutput } = runNewtonCheck(intent, "clawton_policy.allow");

  if (!allowed) {
    banner("DENIED — policy check failed", RED);
    console.log(DIM + policyOutput + RESET);

    console.log(CYAN + "\nRecording denial on Sepolia..." + RESET);
    const onChainTx = recordOnChain(process.env.RPC_URL, "DENIED", symbol, side, quantity, `spendEth=${spendEth.toFixed(8)}`);
    console.log(DIM + onChainTx + RESET);

    logDecision(LOG_FILE, { timestamp, request, computedSpendEth: spendEth, verdict: "DENIED", raw: policyOutput, onChainTx });
    console.log(RED + "Order was NOT sent to Binance." + RESET);
    process.exit(1);
  }

  console.log(CYAN + "\nChecking cumulative daily spend..." + RESET);
  const cumulativeSpendWei = getCumulativeSpend(process.env.RPC_URL);
  const projectedTotalWei = cumulativeSpendWei + spendWei;
  console.log(DIM + JSON.stringify({
    cumulativeSpendWei: cumulativeSpendWei.toString(),
    thisTxWei: spendWei.toString(),
    projectedTotalWei: projectedTotalWei.toString(),
  }, null, 2) + RESET);

  const dailyIntent = {
    from: "0x1234567890123456789012345678901234567890",
    to: tokenAddress,
    value: "0x" + projectedTotalWei.toString(16),
    chain_id: 11155111,
    function: { name: side === "SELL" ? "sell" : "buy" },
    decoded_function_arguments: [],
  };

  const { allowed: withinDailyLimit, raw: dailyPolicyOutput } = runNewtonCheck(dailyIntent, "clawton_policy.within_daily_limit");

  if (!withinDailyLimit) {
    banner("DENIED — daily spend limit exceeded", RED);
    console.log(DIM + dailyPolicyOutput + RESET);

    console.log(CYAN + "\nRecording denial on Sepolia..." + RESET);
    const onChainTx = recordOnChain(process.env.RPC_URL, "DENIED", symbol, side, quantity, `dailyLimitExceeded,projectedTotalWei=${projectedTotalWei.toString()}`);
    console.log(DIM + onChainTx + RESET);

    logDecision(LOG_FILE, { timestamp, request, computedSpendEth: spendEth, verdict: "DENIED", reason: "daily_limit_exceeded", cumulativeSpendWei: cumulativeSpendWei.toString(), projectedTotalWei: projectedTotalWei.toString(), raw: dailyPolicyOutput, onChainTx });
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
    onChainTx = recordOnChain(process.env.RPC_URL, "ALLOWED", symbol, side, quantity, `orderId=${fill.orderId},price=${fillPrice}`);
    console.log(DIM + onChainTx + RESET);
  } catch (e) {
    console.log(YELLOW + "Could not parse Binance result for on-chain logging." + RESET);
  }

  console.log(CYAN + "\nRecording cumulative spend..." + RESET);
  const spendTx = recordSpend(process.env.RPC_URL, spendWei.toString());
  console.log(DIM + spendTx + RESET);

  logDecision(LOG_FILE, { timestamp, request, computedSpendEth: spendEth, verdict: "ALLOWED", execResult: execRaw, onChainTx, spendTx });
  console.log(YELLOW + "\nDecision logged to " + LOG_FILE + RESET);
}

main();
