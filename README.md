# Tennis Odds Alert — Netlify Scheduled Function

Checks tennis odds every 30 minutes and emails you when your condition is
met. Runs entirely on Netlify — no computer needs to stay on.

## 1. Get your API keys

**The Odds API** (odds data, free tier)
- Sign up at https://the-odds-api.com
- Copy your API key

**Gmail app password** (sends the email — free, no new signup)
- Go to https://myaccount.google.com/apppasswords (you'll need 2-Step
  Verification turned on for your Google account first)
- Create an app password for "Mail"
- Copy the 16-character password it gives you — that's what goes in
  `GMAIL_APP_PASSWORD` below, NOT your normal Gmail password

Tip: if you want a text instead of an email, put your carrier's
email-to-SMS gateway address in `ALERT_EMAIL_TO` instead of a real email —
e.g. `1234567890@vtext.com` for Verizon, `1234567890@txt.att.net` for AT&T,
`1234567890@tmomail.net` for T-Mobile.

## 2. Push this folder to GitHub

```bash
cd tennis-odds-netlify
git init
git add .
git commit -m "Tennis odds alert"
```
Create a new repo on GitHub and push it there.

## 3. Connect to Netlify

1. Go to https://app.netlify.com -> "Add new site" -> "Import an existing project"
2. Pick the GitHub repo you just pushed
3. Build settings: leave build command blank, publish directory blank (this
   site is functions-only) — just click Deploy

## 4. Add environment variables

In Netlify: **Site settings -> Environment variables**, add:

| Key | Value |
|---|---|
| `ODDS_API_KEY` | your Odds API key |
| `SPORT_KEY` | e.g. `tennis_atp_wimbledon` |
| `PLAYER_NAME` | exact name as it appears in the API, e.g. `Novak Djokovic` |
| `DIRECTION` | `above` or `below` |
| `THRESHOLD` | e.g. `1.50` |
| `GMAIL_ADDRESS` | the Gmail account sending the alert |
| `GMAIL_APP_PASSWORD` | the 16-character app password (not your real password) |
| `ALERT_EMAIL_TO` | where the alert goes — a normal email, or a carrier gateway (see tip above) for a text |

Then trigger a redeploy (Deploys -> Trigger deploy) so the function picks
up the new env vars.

## 5. Enable Netlify Blobs

Blobs is on by default for sites on Netlify's current runtime — no extra
setup needed. It's what the function uses to remember "already alerted"
so it doesn't text you every 30 minutes once triggered.

## 6. Confirm it's running

Site -> Functions tab -> you should see `tennis-odds-check` listed with
a schedule of `*/30 * * * *`. Click it to see logs after each run.

## Adjusting the schedule

Edit the `schedule` value in `netlify/functions/tennis-odds-check.mjs`:
- `*/30 * * * *` = every 30 min
- `*/15 * * * *` = every 15 min
- `0 * * * *` = every hour

Cron minimum granularity on Netlify is 1 minute, but be mindful of your
Odds API request quota on the free tier.

## Finding the right SPORT_KEY and PLAYER_NAME

Full list of tennis tournament keys:
https://the-odds-api.com/sports-odds-data/tennis-odds.html

Player names must match exactly what the API returns. If unsure, temporarily
set `THRESHOLD` to something absurd (e.g. `99`) and check the function logs —
they print the odds and player names found.
