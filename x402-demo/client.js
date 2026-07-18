import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const account = privateKeyToAccount(PRIVATE_KEY);

const fetchWithPayment = wrapFetchWithPayment(fetch, account);

async function main() {
  const response = await fetchWithPayment("http://localhost:4021/premium-data", {
    method: "GET",
  });

  const data = await response.json();
  console.log("Response:", data);
}

main().catch((err) => {
  console.error("Error:", err.message);
});
