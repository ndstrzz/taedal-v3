// server/checkout.cjs
const express = require("express");
const router = express.Router();

// Simple health check
router.get("/health", (req, res) => res.json({ ok: true, checkout: true }));

// Example endpoints (stubbed until you wire providers)
router.post("/create-stripe-session", async (req, res) => {
  res.status(501).json({ error: "Stripe not configured" });
});

router.post("/create-crypto-intent", async (req, res) => {
  res.status(501).json({ error: "Crypto checkout not configured" });
});

// Webhook handler – mounted by index.cjs using express.raw() BEFORE express.json()
async function webhook(req, res) {
  // TODO: verify signature & handle event
  res.status(200).send("ok");
}

module.exports = { router, webhook };
