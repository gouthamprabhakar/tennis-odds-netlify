// netlify/functions/tennis-odds-check.mjs
//
// Runs automatically on a schedule (set below) via Netlify Scheduled Functions.
// Checks tennis odds from The Odds API, and emails you via Gmail when your
// condition is met. Uses Netlify Blobs to track the last price it alerted on,
// so it can send a running trail of updates as odds move in your favor,
// rather than a single one-time alert.

import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";

// ---------------- CONFIG ----------------
// Everything below reads from environment variables you set in the
// Netlify dashboard (Site settings -> Environment variables). Nothing
// here is hardcoded, so it's safe to commit this file to a repo.

const SPORT_KEY = process.env.SPORT_KEY || "tennis_atp_wimbledon";
const PLAYER_NAME = process.env.PLAYER_NAME || "Novak Djokovic";
const DIRECTION = process.env.DIRECTION || "above"; // "above" or "below"
const THRESHOLD = parseFloat(process.env.THRESHOLD || "1.50");
const BOOKMAKER = process.env.BOOKMAKER || "bovada"; // matches the "key" field, e.g. bovada, fanduel, draftkings, betmgm
const STEP_SIZE = parseFloat(process.env.STEP_SIZE || "50"); // alert again every time price moves this much further in your favor

// Runs every N minutes. Cron syntax: min hour day month weekday
export const config = {
  schedule: "*/30 * * * *",
};

async function getOdds() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Odds API error: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

function findPlayerOdds(matches) {
  for (const match of matches) {
    const teams = [match.home_team, match.away_team];
    if (!teams.includes(PLAYER_NAME)) continue;

    const book = (match.bookmakers || []).find((b) => b.key === BOOKMAKER);
    if (!book) continue; // this bookmaker isn't offering odds on this match

    for (const market of book.markets || []) {
      if (market.key !== "h2h") continue;
      for (const outcome of market.outcomes) {
        if (outcome.name === PLAYER_NAME) {
          return outcome.price;
        }
      }
    }
  }
  return null;
}

function conditionMet(price) {
  return DIRECTION === "above" ? price > THRESHOLD : price < THRESHOLD;
}

async function sendEmail(subject, message) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_ADDRESS,
      pass: process.env.GMAIL_APP_PASSWORD, // an "app password", not your normal Gmail password
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
  const store = getStore("tennis-alerts");
  const stateKey = `laststate:${SPORT_KEY}:${PLAYER_NAME}:${DIRECTION}`;

  try {
    const matches = await getOdds();
    const price = findPlayerOdds(matches);

    if (price === null) {
      console.log(`No ${BOOKMAKER} odds found for ${PLAYER_NAME} right now (match may not be listed, or ${BOOKMAKER} isn't covering it).`);
      return new Response("no odds found");
    }

    console.log(`${PLAYER_NAME} odds: ${price}`);

    // lastAlertedPrice is null until the very first alert fires.
    let lastAlertedPrice = await store.get(stateKey).catch(() => null);
    lastAlertedPrice = lastAlertedPrice ? parseFloat(lastAlertedPrice) : null;

    const hasCrossedInitialThreshold = conditionMet(price);
    if (!hasCrossedInitialThreshold) {
      return new Response(`checked, price=${price}, not past initial threshold yet`);
    }

    // First time crossing the threshold at all -> always alert.
    if (lastAlertedPrice === null) {
      const message = `${PLAYER_NAME} odds just crossed your threshold: now ${price} (${DIRECTION} ${THRESHOLD})`;
      await sendEmail(`Tennis odds alert: ${PLAYER_NAME}`, message);
      await store.set(stateKey, String(price));
      console.log("Initial alert sent.");
      return new Response("initial alert sent");
    }

    // After that, alert again only once price has moved another STEP_SIZE further
    // in the direction you care about, so you get a running trail of updates.
    const movedEnough =
      DIRECTION === "above"
        ? price >= lastAlertedPrice + STEP_SIZE
        : price <= lastAlertedPrice - STEP_SIZE;

    if (movedEnough) {
      const message = `${PLAYER_NAME} odds moved further: now ${price} (was ${lastAlertedPrice})`;
      await sendEmail(`Tennis odds update: ${PLAYER_NAME}`, message);
      await store.set(stateKey, String(price));
      console.log("Follow-up alert sent.");
      return new Response("follow-up alert sent");
    }

    return new Response(`checked, price=${price}, no significant move yet`);
  } catch (err) {
    console.error(err);
    return new Response(`error: ${err.message}`, { status: 500 });
  }
};
