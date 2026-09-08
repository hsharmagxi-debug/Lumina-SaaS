# Lumina-SaaS — handoff / next steps

Read `memory.md` in this same folder first for the full detailed log — this file is just the
"what to actually do next" checklist. Also see the global skill `lumina-saas`
(`C:\Users\Dell\.claude\skills\lumina-saas\SKILL.md`) for a same-session-equivalent digest
loadable from any working directory.

## ✅ CURRENT STATE (2026-09-09) — read this first, the sections below are historical

**The app is live**: https://lumina-web-production-b8df.up.railway.app (Railway project
`Lumina-SaaS`, service `lumina-web`). Real Razorpay billing architecture (3 packages: Premium
Monthly ₹299, Premium Yearly ₹2,499, Insight Credits ₹49/₹199-for-5), Firebase ID-token auth on
`/api/profiles` and the AI routes, and a real Gemini API key are all wired in and deployed. Full
deployment story — including 3 real bugs found and fixed by actually curling the live site
(bun.lock, hardcoded PORT, missing trust-proxy) — is in memory.md section 12.

**Discord and LinkedIn OAuth redirect URIs for the new domain — DONE, verified** (section 12).

**The Category E real-numerologist-naming issue — DONE, verified (2026-09-09).** All 5 AI
lenses (Master Consensus Engine + the offline `AGENTS[]` array + the exportable report template
+ 2 more spots a careful re-grep caught) renamed from real people to original archetypes (Grid
Warden, Bridge Analyst, Vedic Seer, Kabbalist, Synthesist) — see memory.md's newest section for
the full list of everywhere this was fixed. **User's explicit follow-up choice: Category E is
back behind Premium** (matching the original 3-package plan) now that it's safe to sell — both
`/api/consult` and `/api/akashic` now call `spendAiCredit()` server-side before running Gemini,
so the fair-use cap is real cost control, not just a UI hide. Verified live.

**Still open, in priority order — both status-checked directly on 2026-09-09, not assumed:**
1. **Real Razorpay keys.** Checked the dashboard directly: still the same single account
   (thekpihub.com approved, same live key, MID `SiChGAauKLx91P`) — **no second/new account
   exists yet.** User needs to sign up completely fresh (razorpay.com → Sign Up, not logged into
   the existing account) with new business details for Lumina — Razorpay's own UI already
   confirmed adding Lumina to the existing account isn't valid (different business model than
   thekpihub.com). User said they'd do this next. Once real `Key ID`/`Key Secret`/webhook
   secret exist: set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
   (Railway variables + local `.env`), and register the webhook URL
   `https://lumina-web-production-b8df.up.railway.app/api/billing/webhook` in the Razorpay
   dashboard (Settings → Webhooks) with events: `subscription.activated`,
   `subscription.charged`, `subscription.cancelled`, `subscription.completed`,
   `subscription.expired`, `payment.captured`.
2. **Instagram (Tier 2 OAuth)** — asked directly, user confirmed they do NOT currently have a
   Business/Creator Instagram account linked to a Facebook Page (the hard API prerequisite).
   Genuinely nothing to build until that exists — don't restart this without checking again.

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
