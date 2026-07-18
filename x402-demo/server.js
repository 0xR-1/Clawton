import express from "express";
import { paymentMiddleware } from "x402-express";

const app = express();

const PAY_TO_ADDRESS = "0x9617F5ED8C0143EeDeA06299Aaa008bB78E74E74";

app.use(
  paymentMiddleware(
    PAY_TO_ADDRESS,
    {
      "GET /premium-data": {
        price: "$0.01",
        network: "base-sepolia",
      },
    }
  )
);

app.get("/premium-data", (req, res) => {
  res.json({
    message: "This is premium data, unlocked via x402 payment.",
    timestamp: new Date().toISOString(),
  });
});

app.listen(4021, () => {
  console.log("Resource server listening on http://localhost:4021");
});
