# Lumina-SaaS — handoff / next steps

Read `memory.md` in this same folder first for the full detailed log — this file is just the
"what to actually do next" checklist. Also see the global skill `lumina-saas`
(`C:\Users\Dell\.claude\skills\lumina-saas\SKILL.md`) for a same-session-equivalent digest
loadable from any working directory.

## ✅ CURRENT STATE (2026-09-10)

**Yahoo (Tier 1) is now real and user-confirmed working**, the last of the 6 native-Firebase
providers. Along the way, found and fixed a real production-only bug: the Railway domain
(`lumina-web-production-b8df.up.railway.app`) had never been added to Firebase's Authorized
domains list, so `signInWithPopup` failed with `auth/unauthorized-domain` — this would have
silently broken Google/GitHub/X/Facebook/Microsoft on the *live* site too, not just Yahoo, since
all of those were only ever confirmed on `localhost`. Added the domain; **re-test the other 5
Tier 1 providers on production before assuming they still work.** Full writeup: memory.md
section 16.

**Previous banner (2026-09-09, end of day), still accurate below this point:**

**The app is live and fully verified end-to-end**: https://lumina-web-production-b8df.up.railway.app
(Railway project `Lumina-SaaS`, service `lumina-web`). Confirmed directly, not assumed: `GET /`
→ 200 with today's latest code actually rendering (checked for "Grid Warden"), `GET
/api/billing/entitlement` with no token → 401 (auth gate is real). The local → GitHub → Railway
pipeline is fully automatic — the last deploy (triggered by a docs-only commit) built and went
live in about a minute with zero manual steps.

**`lumina.bhasad.org` will not happen** — `bhasad.org` is not registered under any account the
user has access to, checked six independent ways (the live domain itself, Google Workspace
admin — blocked entirely for browser automation, Squarespace, Google Cloud Domains across all 5
of the user's GCP projects, a guessed alternative domain that turned out taken too, and a
"purchased via Google Workspace" claim that didn't hold up on re-check). Full writeup:
memory.md section 15a. **The production URL is the Railway one above, permanently, unless the
user names a specific available domain and explicitly confirms buying it** — that's the one
thing being deliberately held back from "just proceed," since it's a real purchase.

**Repo is now public**, with real branch protection on `main` (force-push and branch deletion
both blocked, verified via GitHub's API) — done 2026-09-09 after confirming GitHub's Free plan
provides zero protection features for private repos, and after a full git-history secret scan
came back clean (memory.md section 15g).

**A second, live instance of the real-numerologist-naming issue was found and fixed** — not in
this repo, but in a MindStudio-hosted reimplementation of `/api/consult` ("Lumina Cosmic Council
Guidance", built back in August, entirely independently of this project's Claude Code sessions).
Fixed to the same archetype names and republished. It's disconnected from the live app either
way (confirmed zero `mindstudio` references anywhere in this repo) and currently can't even run
(the MindStudio account has no funds) — not something worth spending money on, since the real
`/api/consult` already runs on a working Gemini API key with no dependency on it. Full writeup:
memory.md section 15f.

**Historical context below this banner (2026-09-08/09, from earlier the same day):**

- **All 5 Tier 1 login providers** (Google, GitHub, X/Twitter, Facebook, Microsoft) — real,
  user-confirmed working. `memory.md` section 3.
- **Both Tier 2 providers built so far** (Discord, LinkedIn) — real, user-confirmed working.
  Instagram deferred (blocked on a real-world prerequisite — see below). `memory.md` section 4.
- **Real Razorpay billing architecture** — 3 packages (Premium Monthly ₹299, Premium Yearly
  ₹2,499, Insight Credits ₹49/₹199-for-5), Subscriptions + Orders + signed webhook +
  server-verified entitlements. Built and deployed, but running with **no real Razorpay keys
  yet** — routes report "not configured" gracefully until the user's new account exists.
  `memory.md` sections 5–6, 13c.
- **Firebase ID-token auth** now protects `/api/profiles` and both AI routes (`/api/consult`,
  `/api/akashic`) — closed the critical free-access/spoofable-plan security hole reported
  2026-09-08. `memory.md` sections 5–6.
- **Real Gemini API key** wired in locally and on Railway. `memory.md` section 7e.
- **The Category E real-numerologist-naming issue is fully resolved** — all 5 AI "master" lenses
  (Master Consensus Engine's AI prompt + the offline `AGENTS[]` array + the exportable report
  template + 2 more spots a re-grep caught) renamed from real people to original archetypes
  (Grid Warden, Bridge Analyst, Vedic Seer, Kabbalist, Synthesist). **User's explicit follow-up
  choice: Category E (Consensus + Akashic) is back behind Premium** — both AI routes now call
  `spendAiCredit()` server-side before running Gemini, so the fair-use cap is real cost control,
  not just a UI hide. `memory.md` section 13a–13b.
- Discord/LinkedIn OAuth redirect URIs for the Railway domain are registered and confirmed
  (alongside `localhost:3000` for local dev). `memory.md` section 7d.

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
   Genuinely nothing to build until that exists — don't restart this without checking again. Full
   plan for exactly what to build once it does is below.
3. ~~Yahoo (Tier 1)~~ — **done 2026-09-10, user-confirmed working.** See CURRENT STATE banner and
   memory.md section 16.
4. **Re-test Google/GitHub/X/Facebook/Microsoft on the live production URL** — not previously
   verified past the Firebase Authorized-domains gate (see banner above). Low effort, just needs
   someone to click through each one on https://lumina-web-production-b8df.up.railway.app.

Full pricing/positioning rationale: the **"Lumina Premium Blueprint"** artifact
(https://claude.ai/code/artifact/d53e2240-2e54-46b6-a4cd-e689a0140434).

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

## Working conventions (see memory.md section 10 for the full list)

- Credential reads: always via `read_page`/`find` (accessibility tree), never screenshot OCR.
- `signInWithPopup`/OAuth popups, MFA, hCaptcha: all need the human — expected, not a failure.
- Before reusing any pre-existing app/project for a new purpose, check with the user first.
- Verify before declaring anything done: a green build/deploy status is not proof — curl the
  live site, build real signed test payloads.
- Stale local dev servers: `EADDRINUSE` on `npm run dev` usually means a previous session's
  `node.exe` is still holding port 3000 — check `netstat -ano | grep :3000`, confirm the PID via
  `Get-Process -Id <pid> | Select Path,StartTime` before killing it.

## If starting a brand-new session on this project

1. `cd C:\Projects\Lumina-SaaS` — `git status` should be clean (repo-local `.env` is gitignored
   and won't show).
2. Read this file's CURRENT STATE section above for the exact next action (Razorpay account →
   Instagram, in that order — Yahoo is done).
3. `npm run dev` to bring the dev server back up on `http://localhost:3000`.
