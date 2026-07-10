# Tennis / Multi-Sport Odds Watchlist — Netlify

Tracks multiple matches across multiple sports at once (tennis, soccer,
cricket, whatever The Odds API covers), and emails you when a condition is
met. **Adding/removing things you watch never requires a redeploy** — you
manage the watchlist through a simple web page.

## One-time setup

### 1. API keys (only set these once)

**The Odds API** — https://the-odds-api.com — copy your key.

**Gmail app password** — https://myaccount.google.com/apppasswords (needs
2-Step Verification on first). Copy the 16-character password.

### 2. Push to GitHub, connect to Netlify

Same as before:
```bash
git add .
git commit -m "Multi-sport watchlist"
git push
```
Then in Netlify: **Site configuration → Environment variables**, set just these
(no per-match variables anymore):

| Key | Value |
|---|---|
| `ODDS_API_KEY` | your Odds API key |
| `GMAIL_ADDRESS` | your Gmail address |
| `GMAIL_APP_PASSWORD` | the 16-char app password |
| `ALERT_EMAIL_TO` | where alerts should go |

Redeploy once (**Deploys -> Trigger deploy**) to apply these.

## Managing what you're watching (no redeploy needed)

Go to your site's URL (e.g. `https://your-site-name.netlify.app`) - you'll
see a page listing everything currently watched, and a form to add more.

Fields when adding an item:
- **Sport key** - e.g. `tennis_atp_wimbledon`, `soccer_epl`. Full list:
  https://the-odds-api.com/sports-odds-data/sports-apis.html
- **Player/team name** - exact spelling as the API returns it. Check by
  visiting the raw endpoint in your browser:
  `https://api.the-odds-api.com/v4/sports/SPORT_KEY/odds?apiKey=YOUR_KEY&regions=us&markets=h2h&oddsFormat=american`
- **Direction / Threshold** - same as before: `above` fires when price
  rises past threshold, `below` fires when it drops past it.
- **Bookmaker** - defaults to `bovada`.
- **Step size** - after the first alert, you'll get another alert every
  time the price moves this many points further in your favor (default 50).

Changes save instantly to Netlify Blobs and are picked up on the next
scheduled run - no code, no env vars, no redeploy.

## How it checks efficiently

If you're watching multiple players/matches within the *same* sport (e.g.
two different tennis matches), the function only calls the Odds API once
for that sport per run, not once per item - saving your API quota.

## Schedule

Set in `netlify/functions/odds-check.mjs`:
```javascript
export const config = {
  schedule: "*/2 * * * *",  // every 2 minutes
};
```
Be mindful of your Odds API plan's request limit - total daily API calls
depend on how many *distinct sports* you're watching (not how many
players), since same-sport items share one call per run.

## Checking logs

Netlify -> Functions tab -> odds-check -> view recent invocation logs.
Each run logs a line per watched item (price found, alert sent, or error).
