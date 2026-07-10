// netlify/functions/get-fast-mode.mjs
// Returns whether fast mode is currently active and when it expires.

import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("odds-alerts");
  const raw = await store.get("fastModeUntil").catch(() => null);
  const until = raw ? parseInt(raw) : 0;
  const active = Date.now() < until;

  return new Response(JSON.stringify({ active, until }), {
    headers: { "Content-Type": "application/json" },
  });
};
