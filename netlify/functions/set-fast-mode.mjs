// netlify/functions/set-fast-mode.mjs
// Body: { "enable": true, "minutes": 120 } to turn on fast mode for N minutes
// Body: { "enable": false } to turn it off immediately

import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const store = getStore("odds-alerts");

    if (body.enable) {
      const minutes = body.minutes || 120;
      const until = Date.now() + minutes * 60 * 1000;
      await store.set("fastModeUntil", String(until));
      return new Response(JSON.stringify({ ok: true, fastModeUntil: until }), {
        headers: { "Content-Type": "application/json" },
      });
    } else {
      await store.set("fastModeUntil", "0");
      return new Response(JSON.stringify({ ok: true, disabled: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(`error: ${err.message}`, { status: 500 });
  }
};
