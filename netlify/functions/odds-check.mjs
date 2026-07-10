// netlify/functions/odds-check.mjs
//
// Runs on a schedule. Reads a WATCHLIST (multiple sport/player/threshold
// combos) from Netlify Blobs, checks each one, and emails you when a
// condition is met. The watchlist is managed via the web form (public/index.html)
// -> no redeploys needed to add/remove things you're tracking.
//
// Odds for the same sport are fetched only once per run even if you're
// watching multiple players/matches within that sport, to save API quota.

import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";

// Runs every minute - but internally throttles actual API calls (see shouldCheckNow)
// so it doesn't burn your Odds API quota. Toggle "fast mode" from the web page
// to temporarily check every minute; otherwise it checks every NORMAL_INTERVAL_MINUTES.
export const config = {
  schedule: "*/1 * * * *",
};

const FAST_INTERVAL_MINUTES = 1;
const NORMAL_INTERVAL_MINUTES = parseFloat(process.env.NORMAL_INTERVAL_MINUTES || "10");

async function shouldCheckNow(store, sportKey) {
  const fastModeUntilRaw = await store.get("fastModeUntil").catch(() => null);
  const fastModeUntil = fastModeUntilRaw ? parseInt(fastModeUntilRaw) : 0;
  const now = Date.now();
  const inFastMode = now < fastModeUntil;
  const effectiveIntervalMs = (inFastMode ? FAST_INTERVAL_MINUTES : NORMAL_INTERVAL_MINUTES) * 60 * 1000;

  const lastCheckKey = `lastcheck:${sportKey}`;
  const lastCheckRaw = await store.get(lastCheckKey).catch(() => null);
  const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw) : 0;

  if (now - lastCheck >= effectiveIntervalMs) {
    await store.set(lastCheckKey, String(now));
    return { due: true, inFastMode };
  }
  return { due: false, inFastMode };
}

async function getOddsForSport(sportKey, cache) {
  if (cache.has(sportKey)) return cache.get(sportKey);
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Odds API error for ${sportKey}: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  cache.set(sportKey, data);
  return data;
}

function findPlayerOdds(matches, playerName, bookmaker) {
  for (const match of matches) {
    const teams = [match.home_team, match.away_team];
    if (!teams.includes(playerName)) continue;

    const book = (match.bookmakers || []).find((b) => b.key === bookmaker);
    if (!book) continue;

    for (const market of book.markets || []) {
      if (market.key !== "h2h") continue;
      for (const outcome of market.outcomes) {
        if (outcome.name === playerName) return outcome.price;
      }
    }
  }
  return null;
}

function conditionMet(price, direction, threshold) {
  return direction === "above" ? price > threshold : price < threshold;
}

async function sendEmail(subject, message) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_ADDRESS,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_ADDRESS,
    to: process.env.ALERT_EMAIL_TO,
    subject,
    text: message,
  });
}

export default async (req) => {
  const store = getStore("odds-alerts");

  let watchlist = [];
  try {
    const raw = await store.get("watchlist");
    if (raw) watchlist = JSON.parse(raw);
  } catch (e) {
    console.log("No watchlist found yet - add items via the web form.");
  }

  if (watchlist.length === 0) {
    console.log("Watchlist is empty.");
    return new Response("watchlist empty");
  }

  // Group items by sport so we only decide once per sport whether it's due
  const bySport = new Map();
  for (const item of watchlist) {
    if (!bySport.has(item.sportKey)) bySport.set(item.sportKey, []);
    bySport.get(item.sportKey).push(item);
  }

  const sportCache = new Map();
  const results = [];

  for (const [sportKey, items] of bySport.entries()) {
    const { due, inFastMode } = await shouldCheckNow(store, sportKey);
    if (!due) {
      results.push(`${sportKey}: skipped (not due yet, fastMode=${inFastMode})`);
      continue;
    }

    let matches;
    try {
      matches = await getOddsForSport(sportKey, sportCache);
    } catch (err) {
      console.error(`[${sportKey}] fetch error: ${err.message}`);
      results.push(`${sportKey}: fetch error - ${err.message}`);
      continue;
    }

    for (const item of items) {
      const { id, playerName, direction, threshold, bookmaker, stepSize } = item;

      try {
        const price = findPlayerOdds(matches, playerName, bookmaker || "bovada");

        if (price === null) {
          console.log(`[${id}] No odds found for ${playerName} (${sportKey}).`);
          results.push(`${id}: no odds found`);
          continue;
        }

        console.log(`[${id}] ${playerName} odds: ${price}`);

        const stateKey = `laststate:${id}`;
        let lastAlertedPrice = null;
        try {
          const raw = await store.get(stateKey);
          lastAlertedPrice = raw ? parseFloat(raw) : null;
        } catch (e) {
          // no prior state, that's fine
        }

        const met = conditionMet(price, direction, threshold);
        if (!met) {
          results.push(`${id}: ${price} (condition not met)`);
          continue;
        }

        if (lastAlertedPrice === null) {
          await sendEmail(
            `Odds alert: ${playerName}`,
            `${playerName} (${sportKey}) odds just crossed your threshold: now ${price} (${direction} ${threshold})`
          );
          await store.set(stateKey, String(price));
          results.push(`${id}: initial alert sent at ${price}`);
          continue;
        }

        const step = stepSize || 50;
        const movedEnough =
          direction === "above" ? price >= lastAlertedPrice + step : price <= lastAlertedPrice - step;

        if (movedEnough) {
          await sendEmail(
            `Odds update: ${playerName}`,
            `${playerName} (${sportKey}) odds moved further: now ${price} (was ${lastAlertedPrice})`
          );
          await store.set(stateKey, String(price));
          results.push(`${id}: follow-up alert sent at ${price}`);
        } else {
          results.push(`${id}: ${price} (no significant move since ${lastAlertedPrice})`);
        }
      } catch (err) {
        console.error(`[${id}] error: ${err.message}`);
        results.push(`${id}: error - ${err.message}`);
      }
    }
  }

  console.log(results.join(" | "));
  return new Response(results.join("\n"));
};
