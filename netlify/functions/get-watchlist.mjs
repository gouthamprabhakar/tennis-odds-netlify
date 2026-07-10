// netlify/functions/get-watchlist.mjs
// Returns the current watchlist as JSON, for the web form to display.

import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("odds-alerts");
  let watchlist = [];
  try {
    const raw = await store.get("watchlist");
    if (raw) watchlist = JSON.parse(raw);
  } catch (e) {
    // no watchlist yet
  }

  return new Response(JSON.stringify(watchlist), {
    headers: { "Content-Type": "application/json" },
  });
};
