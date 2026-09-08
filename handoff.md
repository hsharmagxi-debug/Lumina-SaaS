# Lumina-SaaS — handoff / next steps

Read `memory.md` in this same folder first for the full detailed log — this file is just the
"what to actually do next" checklist. Also see the global skill `lumina-saas`
(`C:\Users\Dell\.claude\skills\lumina-saas\SKILL.md`) for a same-session-equivalent digest
loadable from any working directory.

## ✅ CURRENT STATE (2026-09-08, end of session) — read this first, the sections below are historical

**The app is live**: https://lumina-web-production-b8df.up.railway.app (Railway project
`Lumina-SaaS`, service `lumina-web`). Real Razorpay billing (3 packages: Premium Monthly ₹299,
Premium Yearly ₹2,499, Insight Credits ₹49/₹199-for-5), Firebase ID-token auth on `/api/profiles`
and the AI routes, and a real Gemini API key are all wired in and deployed. Full story —
including 3 real bugs found and fixed by actually curling the live site (bun.lock, hardcoded
PORT, missing trust-proxy) — is in memory.md section 12.

**Still open, in priority order:**
1. **Real Razorpay keys.** The only available account's live key is approved for thekpihub.com
   only (different business model) — user is creating a separate Razorpay account for Lumina.
   Once you have `Key ID`/`Key Secret`/webhook secret: set them as `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (Railway variables + local `.env`), and
   register the webhook URL `https://lumina-web-production-b8df.up.railway.app/api/billing/webhook`
   in the Razorpay dashboard (Settings → Webhooks) with events: `subscription.activated`,
   `subscription.charged`, `subscription.cancelled`, `subscription.completed`,
   `subscription.expired`, `payment.captured`.
2. **Discord/LinkedIn OAuth redirect URIs for the new domain** — needs
   `https://lumina-web-production-b8df.up.railway.app/auth/discord/callback` and
   `.../auth/linkedin/callback` added as *additional* authorized redirect URIs (keep
   `localhost:3000` too) in each provider's dev console. Check whether this session already did
   it (search this file's own later updates, or just check the dashboards directly) before
   redoing it.
3. **The Category E (Master Consensus Engine) real-numerologist-naming issue is still
   unresolved** — held back from the paid packages (free/unlisted, per an earlier decision), but
   that's a mitigation, not a fix. See memory.md section 11 for the full writeup. Recommended:
   rename the 5 AI "lenses" (Dr. J C Chaudhry, Sanjay B. Jumaani, etc.) to original archetypes
   describing the method, not the person — a same-day text change in `server.ts`'s
   `/api/consult` prompt.
4. Instagram (Tier 2 OAuth) — still unwired, unrelated to the billing work.

Full pricing/positioning rationale: the **"Lumina Premium Blueprint"** artifact
(https://claude.ai/code/artifact/d53e2240-2e54-46b6-a4cd-e689a0140434).

## Current state (2026-09-08) — historical, from earlier in this session, before the above

**Tier 1 (Firebase-native providers) — fully done, all 5 user-confirmed working**: Google,
GitHub, X/Twitter, Facebook, Microsoft.

**Tier 2 (custom backend + Firebase Admin SDK) — Discord AND LinkedIn done and user-confirmed
working.** Only Instagram remains unwired — see below.

The Tier 2 architecture (new this session) is generic: `oauth-providers.ts`'s `PROVIDERS` table
+ `createOAuthRouter()` in `server.ts` + `startOAuthPopup()` in `index.html`. Adding a new
provider is: one more `PROVIDERS` entry (authorize URL, scope, token exchange, profile fetch)
and one more `else if (providerName === '...')` branch calling `startOAuthPopup(...)`. No
architecture changes needed.

## Immediate next step: decide whether to commit

As of this session's end, the Tier 2 code changes (`oauth-providers.ts`, `server.ts`,
`index.html`, `package.json`/`package-lock.json` for the new `firebase-admin` dependency) exist
only in the local working tree — not yet committed. `git status --short` to confirm, then commit
if you want this checkpointed (matches how Tier 1's changes were eventually committed as
`baaa64e`).

**Two files intentionally are NOT tracked and must stay that way**: `.env` (repo root — holds
`LUMINA_DISCORD_CLIENT_ID/SECRET`, `LUMINA_FIREBASE_ADMIN_SDK_PATH`, `OAUTH_STATE_SECRET`) and
`C:\Projects\Credentials\lumina-firebase-adminsdk.json` (the Firebase Admin service-account key,
lives outside the repo entirely). Both confirmed gitignored / out-of-repo already.

## LinkedIn — done (2026-09-08, same day as Discord, continued session)

Picked back up after the user logged into developer.linkedin.com themselves. Full detail in
memory.md's "LinkedIn — done, user-confirmed working" section — short version: created a
LinkedIn Company Page ("Bhasad Group of Companies", required — personal profiles can't own a
dev app), app `Lumina-Numerology-Dev` (ID `264524009`), added the "Sign In with LinkedIn using
OpenID Connect" product, redirect `http://localhost:3000/auth/linkedin/callback`. Credentials
in both `.env` files. **User-confirmed working live.** No further action needed here.

## If continuing with Instagram

Deferred because "Instagram API with Facebook Login" (the modern, non-retired product) only
authorizes Instagram **Business or Creator** accounts linked to a Facebook Page the signing-in
user admins — not personal/private Instagram accounts. Before starting any code work here,
confirm with the user that they now have that set up (or are willing to convert their account
and link a Page — a real, user-side action, not something I can do). If yes, the flow is more
involved than LinkedIn/Discord:
1. Facebook Login OAuth dialog (same `https://www.facebook.com/.../dialog/oauth` family used
   conceptually by Tier 1's Facebook provider, but this is a separate app-level product config —
   likely a `config_id`-based "Facebook Login for Business" setup in the Meta app dashboard,
   not raw scopes).
2. Token exchange at `https://graph.facebook.com/.../oauth/access_token`.
3. Profile fetch is two hops: `GET /me/accounts` (list Pages the user admins) → each Page's
   `instagram_business_account` field → `GET /{ig-user-id}?fields=id,username,profile_picture_url`
   using the Page access token, not the user token.
4. **Instagram's Graph API never exposes email** — `profile.email` will always be null for this
   provider; `submitInlineAuth`'s email argument will need a synthesized placeholder or `null`,
   worth flagging to the user rather than quietly fabricating an address.
5. This would be a new `instagram` entry in `oauth-providers.ts`'s `PROVIDERS` table — the
   `fetchProfile` function is the main deviation from the LinkedIn/Discord pattern (two API
   calls instead of one, plus needing the Page access token rather than the user token for the
   second call).

## Housekeeping still open from the Tier 1 session (unchanged, still true)

- The `[object Object]` cosmetic bug in the remaining fake login mocks (Yahoo, and Instagram
  until it's wired) — search `index.html` for `inline-mock-email`.
- Yahoo (Tier 1, Firebase-native) was never reached across either session. Same pattern as
  Microsoft/Facebook: create a Yahoo Developer app, enable the Yahoo provider in Firebase
  Console with its Client ID/Secret, add a `providerName === 'yahoo'` branch using
  `signInWithPopup(new firebase.auth.OAuthProvider('yahoo.com'))` — this one does NOT go through
  the Tier 2 popup/backend flow since Yahoo *is* natively supported by Firebase Auth.
