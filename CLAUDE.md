# Design System Rules — for Figma MCP integration

## Architecture note (read first): the real UI is NOT in `src/`

`package.json`'s `name` is still the generic **`react-example`** default — a strong signal this
was scaffolded by **Google AI Studio** (confirmed by the `assets/.aistudio` marker file) and never
renamed. The Vite/React scaffold under `src/` is effectively **empty/vestigial**:
`src/App.tsx` is an 8-line file that renders `<div></div>` and nothing else; `src/index.css` is
a single line, `@import "tailwindcss";`, with no theme customization at all.

**The entire actual application — markup, ~3,600 lines of inline `<style>` CSS, and behavior —
lives in the single monolithic `index.html` at repo root.** Before touching styling, always edit
`index.html` directly; changes to `src/App.tsx`/`src/index.css` will not affect what's rendered
today. This is architecturally very different from every other repo in this account (all of which
use component-per-file React with Tailwind utility classes).

## 1. Token Definitions

- **Single source, inline in `index.html`'s `<style>` block, in one `:root { ... }` line**
  (`index.html:12`):
  ```css
  --bg:#050505       --bg2:#0C0C0E      --bg3:#111111
  --s1:rgba(12,12,14,.97)   --s2:rgba(20,20,22,.88)   --s3:rgba(30,30,32,.6)
  --card:#0C0C0E
  --gold:#C5A059     --gl:#E5C185       --gd:rgba(197,160,89,.06)   --gb:rgba(197,160,89,.3)
  --teal:#2EC4B6     --purple:#B86EF0   --red:#E05C5C   --green:#4CAF80   --blue:#4A9EBF
  --txt:#e5e5e5      --txh:#e5e5e5      --txd:#a1a1aa   --txm:#71717a
  --bdr:rgba(255,255,255,.05)   --bdb:rgba(197,160,89,.3)
  ```
  Naming shorthand to know: `s1`/`s2`/`s3` = surface elevation steps, `gd`/`gb` = gold-dim-fill /
  gold-border variants (mirrors the "glow/rim" pattern seen in the account's other gold-branded
  properties), `txt`/`txh`/`txd`/`txm` = text/text-heading/text-dim/text-muted, `bdr`/`bdb` =
  border / border-brand.
- **Palette is deliberately near-black + antique gold + jewel accents** (teal, purple, red, green,
  blue) — a mystical/numerology aesthetic distinct from every other property in this account
  (which lean navy-gold-teal "fintech/SaaS"). `--gold:#C5A059` is a warmer, more muted gold than
  the `#E9A123`/`#E9A123`-family used across the KPI Hub properties — **do not treat these as the
  same brand gold**; this is a separate product identity ("Lumina — Master Consensus
  Numerology," per `index.html:6` `<title>`).
- **Typography — 6 font families loaded via one Google Fonts request** (`index.html:9`): `Cinzel
  Decorative` (400/700/900, used for the logo — `.logo{font-family:'Cinzel Decorative',serif}`),
  `Cinzel` (400–700, numerals/headings — `.mnum`, `.nval`), `Cormorant Garamond` (italic variants
  available, likely body/quote text), `Marcellus` (section labels — `.ct`), `Raleway` (300–700,
  the base `body` font), `JetBrains Mono` (400/500, used for badges/nav labels/mono metadata —
  `.badge`, `nav button`, `.nlbl`). This 6-face system with 3 distinct display faces (Cinzel
  Decorative, Cinzel, Marcellus) is a deliberately ornate, "mystical premium" type system — do not
  simplify to fewer faces without checking with the owner first, it's core to this product's
  identity.
- No token transformation pipeline — this is hand-authored CSS with a single `:root` block; a
  Figma sync would write hex/rgba values directly into that block.

## 2. Component Library

- **No component library at all.** Everything is plain HTML + CSS classes inside one file
  (`index.html`), not React components — despite React being in `package.json`'s dependencies.
  Repeated UI patterns (`.card`, `.badge`, `.norb`, `.mcell`) are CSS classes applied to raw
  `<div>`s, not reusable React components.
- No Storybook, no design-system documentation beyond reading the CSS directly.
- Root-level `.cjs`/`.js` files (`fix_login.cjs`, `fix_ui.cjs`, `fix_ui2.cjs`, `fix_scroll.cjs`,
  `fix_hmr.cjs`, `fix_provider.cjs`, `fix_provider2.cjs`, `fix_google_provider.cjs`,
  `fix_force_select.cjs`, `fix_selector.cjs`, `fix_prompt.cjs`, `fix_logout.cjs`,
  `fix_login_error.cjs`, `fix_login_html.cjs`, `fix_server.cjs`) are one-off patch/debug scripts,
  not part of the design system — but their sheer number signals this codebase has accumulated
  significant ad hoc patching rather than structured refactors; expect the same in `index.html`
  itself (long single-file CSS/markup, not modularized).

## 3. Frameworks & Libraries

- **Runtime**: Vite + React + TypeScript scaffold present but effectively unused for UI (see
  architecture note above) — `react`, `react-dom`, `@vitejs/plugin-react` are dependencies but the
  real app doesn't route through React's render tree today.
- **Styling**: Tailwind CSS v4 via `@tailwindcss/vite` is a dependency and `src/index.css` imports
  it, but **`index.html`'s actual visual system uses zero Tailwind classes** — it's 100% hand-
  written CSS in a `<style>` block. Don't assume Tailwind utilities are in effect anywhere in the
  real UI.
- **AI**: `@google/genai` (Gemini SDK) — this is an AI-powered numerology app; expect LLM calls
  somewhere in the app logic.
- **Backend/auth**: `firebase` (client SDK) + Firebase Compat SDKs loaded via `<script>` tags
  directly in `index.html:8` (`firebase-app-compat.js`, `firebase-auth-compat.js`, v10.12.2) —
  auth is Firebase-based, loaded old-style via global scripts rather than the modern modular SDK
  import, despite `firebase` also being an npm dependency (there may be duplication/inconsistency
  between the two loading methods — worth checking before adding new Firebase calls).
  `firebase-applet-config.json` at repo root holds Firebase project config.
- **Animation**: `motion` (the renamed Framer Motion package) is a dependency, though the visible
  animation in `index.html` is done via raw CSS `@keyframes` (9 found, e.g. `fadeIn`,
  `fadeOutStardust`) and vanilla-JS-driven cursor/particle effects, not through the `motion`
  library — check actual usage before assuming `motion` drives the UI's animation.
- **Server**: `express` + `server.ts` — a small Node server, likely serving the static
  `index.html` and/or proxying API calls (check `server.ts` directly for routes before assuming
  its role).
- **Package manager**: Bun (`bun.lock`).
- A `.env.example` file exists (not `.env` itself) — safe to read for required variable names, but
  confirm no real secrets have been added to it before treating it as a template only.

## 4. Asset Management

- `assets/` contains only `.aistudio` (an AI-Studio project marker, not a real asset) at the time
  of this audit — no image/icon asset directory of note was found; icons are handled via
  `lucide-react` (see §5) rather than static image files.
- No CDN/image-optimization config found — fonts are loaded from Google Fonts CDN directly
  (`index.html:9`), not self-hosted.

## 5. Icon System

- `lucide-react` is the icon dependency — but given the real UI lives in static `index.html`
  rather than rendered React components, check whether icons in the live UI are actually Lucide
  SVGs rendered via React, inline SVG/Unicode glyphs hand-placed in `index.html`, or a mix, before
  assuming a consistent icon pipeline. (`.logo-star` in `index.html` appears to be a styled `<div>`
  with a symbol/emoji rather than an SVG icon component, based on the CSS alone — verify directly
  against the markup for the specific element in question.)

## 6. Styling Approach

- **Plain inline CSS in one `<style>` block inside `index.html`** — no CSS Modules, no
  CSS-in-JS, no Tailwind utilities in practice (despite the dependency), no separate stylesheet
  file for the real app. This is the single largest architectural difference from every other
  repo in this account.
- Recognizable, reusable local patterns worth matching for new UI:
  - `.card` — the base panel: `background:var(--card)`, `border:1px solid var(--bdr)`,
    `border-radius:14px`, drop shadow, plus a `::before` 1px top gradient-line highlight
    (`index.html`, `.card` + `.card::before`) — the closest thing to a "glass panel" convention
    here.
  - `.badge` family — small pill labels with color variants (`.badge.new` teal, `.badge.master`
    purple, `.badge.karmic` red) each following the same `background: rgba(color,.1); border:
    1px solid rgba(color,.3); color: var(--color)` recipe — reuse this exact 10%-fill/30%-border
    recipe for any new status badge.
  - `.nval`/`.mnum` — large glowing numeral display, `text-shadow: 0 0 24px rgba(color,.4-.5)` —
    the "glow around key numbers" signature look for this numerology product.
  - Custom animated cursor (`#magic-cursor`, `#magic-cursor-dot`) + "stardust" particle trail
    (`.stardust-particle`, `fadeOutStardust` keyframe) — a bespoke, non-trivial interaction layer;
    don't recreate this from scratch elsewhere without reusing the existing implementation.
- Background uses **three overlapping radial gradients** (`body` rule, `index.html:14`) in purple/
  teal/gold at low opacity over the near-black `--bg` — the ambient-glow base treatment for this
  product; reuse this three-gradient recipe for other full-bleed backgrounds in this app rather
  than inventing a new ambient treatment.
- Responsive: `main{padding:18px 16px;max-width:800px;margin:0 auto}` and `auto-fill`/`minmax()`
  CSS grid for card grids (`.ngrid`) — mobile-first-friendly sizing baked directly into the base
  rules rather than relying on breakpoint classes (there is no Tailwind, so no `md:`/`lg:` prefixes
  are available or used).

## 7. Project Structure

```
index.html          The ENTIRE real application: markup + ~3,600 lines of inline CSS
                     (design tokens live here, in one :root block)
src/                 Vite/React/TypeScript scaffold — currently near-empty, not driving the UI
server.ts            Express server (role — static hosting vs. API proxy — not yet confirmed)
firebase-applet-config.json   Firebase project config
fix_*.cjs, fix_*.js  ~14 one-off patch/debug scripts at repo root, not part of the design system
test_*.html, gis-oauth-test.html   Standalone auth-flow test pages, separate from the main app
```
- **Recommendation for any Figma integration work here**: sync design tokens into `index.html`'s
  `:root` block directly. Do not assume a component-driven workflow (no Figma-component-to-React-
  component mapping is meaningful yet, since there's no real component tree) — treat this as a
  single-page, hand-styled document until/unless the `src/` React scaffold is actually built out.
