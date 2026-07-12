# Newton Frontend Integration Guide

This guide walks you through building a Next.js application that integrates with a deployed Newton Policy Wallet using the Newton SDK. By the end, you'll have a working frontend that submits transactions through the wallet's policy evaluation flow and displays the results.

**What this guide covers:**
- Setting up a Next.js project with the Newton Protocol SDK
- Configuring environment variables for the Newton network
- Creating helper modules for evaluation requests and transaction execution
- Building a UI that shows the full Newton attestation flow
- Running the app and verifying transactions on Sepolia

**Prerequisites:**
- A deployed `NewtonPolicyWallet` address (from the policy guide — you'll need this for Step 2)
- A Newton Protocol API key
- Alchemy RPC URLs for Sepolia (both HTTP and WebSocket)
- Node.js >= 18
- A wallet private key with Sepolia ETH for gas

---

## Step 1 – Create the Next.js project

```bash
npx create-next-app@latest newton-sdk-app --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd newton-sdk-app
```

### Install dependencies

```bash
npm install @magicnewton/newton-protocol-sdk@0.3.13 viem
```

---

## Step 2 – Configure environment variables

Create `.env.local` in the `newton-sdk-app` directory:

```bash
# Alchemy RPC URLs
NEXT_PUBLIC_SEPOLIA_ALCHEMY_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
NEXT_PUBLIC_SEPOLIA_ALCHEMY_WS_URL=wss://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Newton API key
NEXT_PUBLIC_NEWTON_API_KEY=your_newton_api_key

# Newton Policy Contract address (fixed on Sepolia)
# Note: This is the Newton Policy contract, NOT your wallet address
NEXT_PUBLIC_POLICY_CONTRACT_ADDRESS=0x698C687f86Bc2206AC7C06eA68AC513A2949abA6

# Wallet address from policy guide Step 5.5 deployment output
NEXT_PUBLIC_POLICY_WALLET_ADDRESS=<paste wallet address from policy guide>

# Signer private key for client-side signing (same key used for wallet deployment)
NEXT_PUBLIC_SIGNER_PRIVATE_KEY=<same as PRIVATE_KEY from wallet deployment>
```

**Important clarifications:**
- `NEXT_PUBLIC_POLICY_CONTRACT_ADDRESS` is the Newton Policy contract — a fixed address on Sepolia that manages policy registration
- `NEXT_PUBLIC_POLICY_WALLET_ADDRESS` is YOUR deployed wallet contract from the policy guide
- These are different contracts. The Policy contract manages policy registration; your wallet is a client of it.

---

## Step 3 – Create the configuration file

Create `src/const/config.ts`:

```typescript
import { Hex } from "viem";

// Environment variables
export const SEPOLIA_ALCHEMY_URL = process.env.NEXT_PUBLIC_SEPOLIA_ALCHEMY_URL!;
export const SEPOLIA_ALCHEMY_WS_URL = process.env.NEXT_PUBLIC_SEPOLIA_ALCHEMY_WS_URL!;
export const NEWTON_API_KEY = process.env.NEXT_PUBLIC_NEWTON_API_KEY!;
export const POLICY_WALLET_ADDRESS = process.env.NEXT_PUBLIC_POLICY_WALLET_ADDRESS as Hex;
export const POLICY_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_POLICY_CONTRACT_ADDRESS as Hex;
export const SIGNER_PRIVATE_KEY = process.env.NEXT_PUBLIC_SIGNER_PRIVATE_KEY as Hex;
```

---

## Step 4 – Create the ABI file

Create `src/lib/abi.ts`:

```typescript
export const newtonPolicyWalletAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      { name: "policyTaskManager", type: "address", internalType: "address" },
      { name: "policy", type: "address", internalType: "address" },
      { name: "owner", type: "address", internalType: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "validateAndExecuteDirect",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "value", type: "uint256", internalType: "uint256" },
      { name: "data", type: "bytes", internalType: "bytes" },
      {
        name: "task",
        type: "tuple",
        internalType: "struct INewtonProverTaskManager.Task",
        components: [
          { name: "taskId", type: "bytes32", internalType: "bytes32" },
          { name: "policyClient", type: "address", internalType: "address" },
          { name: "taskCreatedBlock", type: "uint32", internalType: "uint32" },
          { name: "quorumThresholdPercentage", type: "uint32", internalType: "uint32" },
          {
            name: "intent",
            type: "tuple",
            internalType: "struct NewtonMessage.Intent",
            components: [
              { name: "from", type: "address", internalType: "address" },
              { name: "to", type: "address", internalType: "address" },
              { name: "value", type: "uint256", internalType: "uint256" },
              { name: "data", type: "bytes", internalType: "bytes" },
              { name: "chainId", type: "uint256", internalType: "uint256" },
              { name: "functionSignature", type: "bytes", internalType: "bytes" },
            ],
          },
          { name: "intentSignature", type: "bytes", internalType: "bytes" },
          { name: "wasmArgs", type: "bytes", internalType: "bytes" },
          { name: "quorumNumbers", type: "bytes", internalType: "bytes" },
        ],
      },
      {
        name: "taskResponse",
        type: "tuple",
        internalType: "struct INewtonProverTaskManager.TaskResponse",
        components: [
          { name: "taskId", type: "bytes32", internalType: "bytes32" },
          { name: "policyClient", type: "address", internalType: "address" },
          { name: "policyId", type: "bytes32", internalType: "bytes32" },
          { name: "policyAddress", type: "address", internalType: "address" },
          {
            name: "intent",
            type: "tuple",
            internalType: "struct NewtonMessage.Intent",
            components: [
              { name: "from", type: "address", internalType: "address" },
              { name: "to", type: "address", internalType: "address" },
              { name: "value", type: "uint256", internalType: "uint256" },
              { name: "data", type: "bytes", internalType: "bytes" },
              { name: "chainId", type: "uint256", internalType: "uint256" },
              { name: "functionSignature", type: "bytes", internalType: "bytes" },
            ],
          },
          { name: "intentSignature", type: "bytes", internalType: "bytes" },
          { name: "evaluationResult", type: "bytes", internalType: "bytes" },
          {
            name: "policyTaskData",
            type: "tuple",
            internalType: "struct NewtonMessage.PolicyTaskData",
            components: [
              { name: "policyId", type: "bytes32", internalType: "bytes32" },
              { name: "policyAddress", type: "address", internalType: "address" },
              { name: "policy", type: "bytes", internalType: "bytes" },
              {
                name: "policyData",
                type: "tuple[]",
                internalType: "struct NewtonMessage.PolicyData[]",
                components: [
                  { name: "wasmArgs", type: "bytes", internalType: "bytes" },
                  { name: "data", type: "bytes", internalType: "bytes" },
                  { name: "attestation", type: "bytes", internalType: "bytes" },
                  { name: "policyDataAddress", type: "address", internalType: "address" },
                  { name: "expireBlock", type: "uint32", internalType: "uint32" },
                ],
              },
            ],
          },
          {
            name: "policyConfig",
            type: "tuple",
            internalType: "struct INewtonPolicy.PolicyConfig",
            components: [
              { name: "policyParams", type: "bytes", internalType: "bytes" },
              { name: "expireAfter", type: "uint32", internalType: "uint32" },
            ],
          },
        ],
      },
      { name: "signatureData", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setPolicy",
    inputs: [
      {
        name: "policyConfig",
        type: "tuple",
        internalType: "struct INewtonPolicy.PolicyConfig",
        components: [
          { name: "policyParams", type: "bytes", internalType: "bytes" },
          { name: "expireAfter", type: "uint32", internalType: "uint32" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "Executed",
    inputs: [
      { name: "to", type: "address", indexed: true, internalType: "address" },
      { name: "value", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "data", type: "bytes", indexed: false, internalType: "bytes" },
      { name: "taskId", type: "bytes32", indexed: false, internalType: "bytes32" },
    ],
    anonymous: false,
  },
  { type: "error", name: "InvalidAttestation", inputs: [] },
  { type: "error", name: "ExecutionFailed", inputs: [] },
  { type: "receive", stateMutability: "payable" },
] as const;
```

> **Note:** This ABI covers the functions used in this guide. The full compiled ABI will include additional functions inherited from `NewtonPolicyClient` such as `policyClientOwner()` and `policyId()`.

---

## Step 5 – Create the evaluation request helper

Create `src/lib/evaluation-request.ts`:

```typescript
import { Hex } from "viem";
import { sepolia } from "viem/chains";
import { POLICY_WALLET_ADDRESS } from "@/const/config";

function stringToHexBytes(str: string): Hex {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return ("0x" + Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")) as Hex;
}

export type EvaluationRequestParams = {
  signerAddress: Hex;
  targetAddress: Hex;
  value: bigint;
  data: Hex;
  wasmArgs: Record<string, unknown>;
};

export const createEvaluationRequest = ({
  signerAddress,
  targetAddress,
  value,
  data,
  wasmArgs,
}: EvaluationRequestParams) => {
  // Function signature for validateAndExecuteDirect
  const functionSignature = stringToHexBytes(
    "validateAndExecuteDirect(address,uint256,bytes,(bytes32,address,uint32,uint32,(address,address,uint256,bytes,uint256,bytes),bytes,bytes,bytes),(bytes32,address,bytes32,address,(address,address,uint256,bytes,uint256,bytes),bytes,bytes,(bytes32,address,bytes,(bytes,bytes,bytes,address,uint32)[]),(bytes,uint32)),bytes)"
  );

  return {
    policyClient: POLICY_WALLET_ADDRESS,
    intent: {
      from: signerAddress,
      to: targetAddress,
      value: `0x${value.toString(16)}` as Hex,
      data: data,
      chainId: sepolia.id,
      functionSignature: functionSignature,
    },
    wasmArgs: stringToHexBytes(JSON.stringify(wasmArgs)),
    timeout: 60,
  };
};
```

---

## Step 6 – Create the transaction execution helper

Create `src/lib/execute-with-attestation.ts`:

```typescript
import { createPublicClient, encodeFunctionData, Hex, http } from "viem";
import { sepolia } from "viem/chains";
import { SEPOLIA_ALCHEMY_URL, POLICY_WALLET_ADDRESS } from "@/const/config";
import { newtonPolicyWalletAbi } from "./abi";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_ALCHEMY_URL),
});

export type ExecuteDirectParams = {
  to: Hex;
  value: bigint;
  data: Hex;
  task: any;
  taskResponse: any;
  signatureData: Hex;
  signerAddress: Hex;
  walletClient: {
    signTransaction: (tx: {
      to: Hex;
      data: Hex;
      nonce: number;
      gas: bigint;
      gasPrice: bigint;
    }) => Promise<Hex>;
  };
};

export const executeWithAttestationDirect = async ({
  to,
  value,
  data,
  task,
  taskResponse,
  signatureData,
  signerAddress,
  walletClient,
}: ExecuteDirectParams): Promise<Hex> => {
  const functionData = encodeFunctionData({
    abi: newtonPolicyWalletAbi,
    functionName: "validateAndExecuteDirect",
    args: [to, value, data, task, taskResponse, signatureData],
  });

  const [nonce, gas, baseGasPrice] = await Promise.all([
    publicClient.getTransactionCount({ address: signerAddress }),
    publicClient.estimateGas({
      to: POLICY_WALLET_ADDRESS,
      data: functionData,
      account: signerAddress,
    }),
    publicClient.getGasPrice(),
  ]);

  // Bump gas price by 20% to ensure replacement transactions are accepted
  const gasPrice = (baseGasPrice * BigInt(120)) / BigInt(100);

  const signedTx = await walletClient.signTransaction({
    to: POLICY_WALLET_ADDRESS,
    data: functionData,
    nonce,
    gas,
    gasPrice,
  });

  const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx });

  return txHash;
};
```

---

## Step 7 – Create the Newton client hook

Create `src/lib/use-newton-client.ts`:

```typescript
"use client";

import { useMemo } from "react";
import { createWalletClient, webSocket, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { newtonWalletClientActions } from "@magicnewton/newton-protocol-sdk";
import { SEPOLIA_ALCHEMY_WS_URL, NEWTON_API_KEY } from "@/const/config";

export const useNewtonClient = (privateKey: Hex) => {
  const client = useMemo(() => {
    const account = privateKeyToAccount(privateKey);

    // Initialize the wallet client with Newton SDK actions
    // The apiKey is required for SDK initialization
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: webSocket(SEPOLIA_ALCHEMY_WS_URL),
    }).extend(newtonWalletClientActions({ apiKey: NEWTON_API_KEY }));

    return {
      walletClient,
      account,
      signer: account,
    };
  }, [privateKey]);

  return client;
};
```

---

## Step 8 – Create the main page

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Hex } from "viem";
import { createWalletClient, webSocket } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { newtonWalletClientActions } from "@magicnewton/newton-protocol-sdk";
import {
  SEPOLIA_ALCHEMY_WS_URL,
  NEWTON_API_KEY,
  POLICY_WALLET_ADDRESS,
  SIGNER_PRIVATE_KEY,
} from "@/const/config";
import { createEvaluationRequest } from "@/lib/evaluation-request";
import { executeWithAttestationDirect } from "@/lib/execute-with-attestation";

type Status = "idle" | "evaluating" | "executing" | "success" | "error";

export default function Home() {
  const [targetAddress, setTargetAddress] = useState<string>("0x31386C6a234AbF509579bDBA4854e9925fac1Ffa");
  const [value, setValue] = useState<string>("0");
  const [data, setData] = useState<string>("0x");
  const [wasmArgs, setWasmArgs] = useState<string>("{}");
  const [status, setStatus] = useState<Status>("idle");
  const [taskId, setTaskId] = useState<string>("");
  const [evaluationResult, setEvaluationResult] = useState<boolean | null>(null);
  const [txHash, setTxHash] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("evaluating");
    setError("");
    setTaskId("");
    setEvaluationResult(null);
    setTxHash("");

    try {
      // Create the wallet client with Newton SDK
      // Initialize with apiKey for SDK authentication
      const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: webSocket(SEPOLIA_ALCHEMY_WS_URL),
      }).extend(newtonWalletClientActions({ apiKey: NEWTON_API_KEY }));

      // Create the evaluation request
      const evalRequest = createEvaluationRequest({
        signerAddress: account.address,
        targetAddress: targetAddress as Hex,
        value: BigInt(value),
        data: data as Hex,
        wasmArgs: JSON.parse(wasmArgs),
      });

      // Evaluate intent directly (no on-chain task submission wait)
      const evalResponse = await walletClient.evaluateIntentDirect(evalRequest);
      const { evaluationResult: allowed, task, taskResponse: evalTaskResponse, blsSignature } = evalResponse.result;
      setTaskId(task.taskId);
      setEvaluationResult(allowed);

      if (!allowed) {
        setStatus("error");
        setError("Policy evaluation failed - transaction blocked");
        return;
      }

      // Execute the transaction with the direct attestation
      setStatus("executing");
      const hash = await executeWithAttestationDirect({
        to: targetAddress as Hex,
        value: BigInt(value),
        data: data as Hex,
        task,
        taskResponse: evalTaskResponse,
        signatureData: blsSignature,
        signerAddress: account.address,
        walletClient,
      });

      setTxHash(hash);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Newton Policy Wallet Demo</h1>
      <p className="text-gray-600 mb-8">
        Execute transactions through your Newton Policy Wallet with attestation verification.
      </p>

      <div className="mb-6 p-4 bg-gray-100 rounded-lg">
        <p className="text-sm">
          <strong>Policy Wallet:</strong>{" "}
          <code className="bg-gray-200 px-2 py-1 rounded">{POLICY_WALLET_ADDRESS}</code>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Target Address</label>
          <input
            type="text"
            value={targetAddress}
            onChange={(e) => setTargetAddress(e.target.value)}
            placeholder="0x..."
            className="w-full p-2 border rounded"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Value (wei)</label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Data (hex)</label>
          <input
            type="text"
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="0x"
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">WASM Args (JSON)</label>
          <textarea
            value={wasmArgs}
            onChange={(e) => setWasmArgs(e.target.value)}
            placeholder="{}"
            className="w-full p-2 border rounded font-mono text-sm"
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">
            Arguments passed to your policy WASM component
          </p>
        </div>

        <button
          type="submit"
          disabled={status === "evaluating" || status === "executing"}
          className="w-full py-3 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:bg-gray-400"
        >
          {status === "evaluating"
            ? "Evaluating Policy..."
            : status === "executing"
            ? "Executing Transaction..."
            : "Submit Transaction"}
        </button>
      </form>

      {/* Status Display */}
      {status !== "idle" && (
        <div className="mt-8 space-y-4">
          {taskId && (
            <div className="p-4 bg-gray-100 rounded">
              <p className="text-sm font-medium">Task ID:</p>
              <code className="text-xs break-all">{taskId}</code>
            </div>
          )}

          {evaluationResult !== null && (
            <div
              className={`p-4 rounded ${
                evaluationResult ? "bg-green-100" : "bg-red-100"
              }`}
            >
              <p className="font-medium">
                Evaluation Result:{" "}
                <span className={evaluationResult ? "text-green-700" : "text-red-700"}>
                  {evaluationResult ? "Allowed" : "Blocked"}
                </span>
              </p>
            </div>
          )}

          {txHash && (
            <div className="p-4 bg-green-100 rounded">
              <p className="font-medium text-green-700">Transaction Successful!</p>
              <p className="text-sm mt-2">
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  View on Etherscan: {txHash}
                </a>
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-100 rounded">
              <p className="font-medium text-red-700">Error</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
```

---

## Step 9 – Update the layout

Ensure `src/app/layout.tsx` exists with this content:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Newton Policy Wallet Demo",
  description: "Execute transactions with Newton Policy attestations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

---

## Step 10 – Run and verify

### Start the development server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### UI walkthrough

The page displays your deployed `NEXT_PUBLIC_POLICY_WALLET_ADDRESS` at the top. Fill in the form fields:

1. **Target Address** — the contract or EOA you want the wallet to send a transaction to
2. **Value (wei)** — amount of ETH to send with the transaction (use `0` for a simple call)
3. **Data (hex)** — encoded calldata for a contract call (use `0x` for a plain ETH transfer)
4. **WASM Args (JSON)** — arguments passed to your WASM oracle (use `{}` if your oracle ignores inputs)

Click **Submit Transaction** to start the flow.

### Observe the attestation flow

1. **Evaluating Policy** — the Newton SDK sends your intent to the Newton network for evaluation
2. **Task ID appears** — the Newton network has received and is processing your evaluation request
3. **Evaluation Result: Allowed / Blocked** — your Rego policy has been evaluated
4. If **Allowed**: the app proceeds to sign and submit the transaction with the BLS attestation
5. **Transaction Hash** — a link to view the transaction on Sepolia Etherscan appears on success

### Verify on Sepolia Etherscan

1. Click the Etherscan link in the success message
2. Confirm the transaction was sent to your Newton Policy Wallet address
3. Check the `Executed` event in the transaction logs
4. Verify the `taskId` in the event matches the Task ID shown in the UI

### Test policy rejection

1. Modify the WASM Args to provide values that your policy should reject (e.g., if your Rego checks `data.data.success`, modify your oracle to return `{"success": false}` by temporarily changing the WASM, or use a policy that rejects based on intent parameters)
2. Submit the transaction
3. Verify the evaluation returns **Blocked**
4. Confirm no transaction is submitted to the chain

---

## Appendix: Common Pitfalls

### WebSocket connection fails

Ensure `NEXT_PUBLIC_SEPOLIA_ALCHEMY_WS_URL` uses the `wss://` protocol, not `https://`. The Newton SDK uses a WebSocket connection for the wallet client transport. Example: `wss://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY`.

### "Invalid attestation" error on execution (`0xbd8ba84d`)

This error means the attestation verification failed on-chain. Common causes:

- **Wrong task manager address** (most common): The wallet was initialized with a different task manager than the one the Newton SDK gateway signs against. The wallet MUST use `0xecb741F4875770f9A5F060cb30F6c9eb5966eD13` on Sepolia. BLS signatures are bound to this specific address — any other address will always fail.
- The intent parameters (to, value, data, chainId) don't match exactly between the evaluation request and the execution call
- The `policyId` in the task response doesn't match the wallet's configured policy
- The `task` or `taskResponse` structs were not passed correctly from the `evaluateIntentDirect` result

### "ExecutionFailed" error on execution (`0xacfdb444`)

This means the attestation **passed** but the inner transaction call reverted. Common causes:

- **Wallet contract has no ETH**: If `value > 0`, the wallet contract itself needs ETH (not just the signer EOA). Fund the wallet contract address directly.
- The target contract reverted — check the target's logic separately
- The calldata is malformed for the target function

To debug, decode the revert reason:

```bash
cast call <WALLET_ADDRESS> "0x<calldata>" --from <SIGNER> --rpc-url <RPC_URL>
```

Match the error selector: `cast sig "ExecutionFailed()"` → `0xacfdb444`, `cast sig "InvalidAttestation()"` → `0xbd8ba84d`.

### Gas estimation fails

The `estimateGas` call simulates the transaction on-chain. If it reverts, viem's error message is often unhelpful. To debug:

1. Extract the calldata from the error
2. Run `cast call <wallet> "0x<calldata>" --from <signer> --rpc-url <rpc>` to get the revert selector
3. Match: `0xacfdb444` = `ExecutionFailed()`, `0xbd8ba84d` = `InvalidAttestation()`

Common causes:
- Signer doesn't have sufficient Sepolia ETH for gas
- Wallet contract has no ETH but `value > 0` is being sent (fund the wallet contract, not just the signer)
- Wrong task manager address (see "Invalid attestation" above)
- The attestation has expired

### Environment variables not loading

For Next.js:
- Client-side variables must be prefixed with `NEXT_PUBLIC_`
- Restart the dev server after modifying `.env.local` — changes are not hot-reloaded
- Verify there are no typos in variable names (the `!` in `process.env.VAR!` will not help if the variable is undefined at runtime)

### Policy evaluation times out

- Check that your WASM builds correctly (`newton-cli policy-data simulate` should return without error)
- Verify `wasmArgs` in the UI match the format your WASM oracle expects
- Increase the `timeout` value in `createEvaluationRequest` (currently 60 seconds) if needed
- Ensure any external APIs your WASM oracle calls are reachable
