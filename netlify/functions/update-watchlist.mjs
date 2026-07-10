// netlify/functions/update-watchlist.mjs
// Overwrites the entire watchlist with whatever JSON array is POSTed.
// The web form always sends the full updated list (existing items + new/removed).

import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    if (!Array.isArray(body)) {
      return new Response("Body must be a JSON array", { status: 400 });
    }

    // Basic validation on each item
    for (const item of body) {
      if (!item.id || !item.sportKey || !item.playerName || !item.direction || item.threshold === undefined) {
        return new Response(
          `Each item needs id, sportKey, playerName, direction, threshold. Bad item: ${JSON.stringify(item)}`,
          { status: 400 }
        );
      }
    }

    const store = getStore("odds-alerts");
    await store.set("watchlist", JSON.stringify(body));

    return new Response(JSON.stringify({ ok: true, count: body.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(`error: ${err.message}`, { status: 500 });
  }
};
