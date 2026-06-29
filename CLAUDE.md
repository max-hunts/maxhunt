# maxhunt.design — Portfolio Site

Personal portfolio for **Max Hunt** — design & product engineer turned full-time software developer. Lives at `maxhunt.design`, hosted free on **GitHub Pages** (repo: `git@github.com:max-hunts/maxhunt.git`, branch `master`). Display/brand name is **Max** (set in `src/consts.ts` `SITE.name`); the résumé file is still `public/Maxim_Hunt_Resume.pdf` (the formal document keeps the full name).

## Stack

- **Astro 7** (static output / SSG) — fully-rendered HTML per route for SEO, served as static files. No server runtime, so no cold boots and zero hosting cost on GitHub Pages. (Upgraded 5→7; needs Node ≥22.12.)
- **React 19** islands for interactivity (`@astrojs/react` v6).
- **Tailwind CSS 4** via `@tailwindcss/vite` (theme tokens in `src/styles/global.css`).
- **Astro View Transitions** (`<ClientRouter />` in `Base.astro`) for smooth cross-page fades; `Reveal.astro` re-inits its observer on `astro:page-load`.
- **@astrojs/sitemap** for `sitemap-index.xml`; `public/robots.txt` points to it.
- **Image optimization**: project images live in `src/assets/images/` and are optimized to WebP by `astro:assets`. `.astro` pages use `<Image>`; React islands get pre-generated optimized URLs (src + srcset) via `src/lib/images.ts` (`optimize()` / `resolveImage()`), which maps the `/images/foo.jpg` strings in content frontmatter to the imported assets.
- Page transitions: a **swipe-over** view transition (custom `::view-transition` keyframes in `global.css`).
- Fonts: Inter + JetBrains Mono (Google Fonts, loaded in `Base.astro`).
- Site config + social links centralised in `src/consts.ts` (used by SEO meta, JSON-LD, and CTAs).

### Why SSG, not SSR
GitHub Pages serves static files only — true per-request SSR is impossible there. For a portfolio all content is known at build time, so SSG produces the same crawler-friendly HTML with better performance. SEO goal = real content in the static HTML (verified: project titles + prose are in the built `dist/*.html`, no JS required).

### SEO
Per-page `<title>`/description/canonical + Open Graph + Twitter cards in `Base.astro`; site-wide JSON-LD `Person` (with `sameAs` → LinkedIn + GitHub); `robots.txt` + sitemap. Defaults pulled from `src/consts.ts`.
- **OG/Twitter image per case study** is built from the hero via `getImage()` in `work/[...slug].astro` (→ a real hashed `/_astro/*.jpeg`). Do NOT point OG at the raw `/images/*` frontmatter strings — those aren't public URLs (files live in `src/assets/`), so they 404 as social cards. Index/other pages fall back to `SITE.ogImage` (`/og.jpg`).

### Analytics (PostHog)
`src/components/Analytics.astro` injects PostHog, gated on `ANALYTICS.key` in `src/consts.ts` (empty key → renders nothing, so it's a safe no-op). The key is a **public, write-only** ingestion key (fine to commit). Region is **EU** (`https://eu.i.posthog.com`); switch `ANALYTICS.host` for US.
- **SPA pageviews**: init uses `capture_pageview: false`; we fire `$pageview` manually on `astro:page-load` (fires on initial load AND after every `<ClientRouter />` navigation). Without this, view-transition navigations wouldn't register as pageviews.
- **Interactions** come free from PostHog **autocapture** (clicks/inputs) — no per-element wiring. Geo (country/region/city) + `$ip` are enriched server-side on ingest; known bots are filtered by PostHog.
- Gotcha: **headless Chrome (the preview tool) is bot-flagged** by PostHog and may be hidden from default views — verify real events from an actual browser. The snippet loading `eu-assets.i.posthog.com/static/array.js` + a `POST …/i/v0/e/ → 200` confirms ingestion works.
- No consent banner (deliberate choice for a personal portfolio); flip `persistence` to `'memory'` for cookieless if compliance is ever needed.

### Motion & performance gotchas (important — hard-won)
- **Animate GPU properties only** (`transform`, `opacity`) for anything that runs during scroll or continuously. Animating `left` / `background-position` / `aspect-ratio` caused layout/paint jank.
- **Resize animations use the `padding-bottom` % hack, NOT `aspect-ratio`** — Safari does not *transition* `aspect-ratio`, so the frame would snap. Used in `ProjectIndex.tsx` preview and `Gallery.tsx`.
- The blueprint grid is a **static fixed full-screen layer** `.gridfx` (an empty div in `Base.astro`, `z-index:-1`, `transition:persist`): a faint dark-grey fill (`rgba(255,255,255,0.06)`) shown only through a uniform 32px 1px CSS `mask` of grid lines. **No animation, no colour** — deliberately plain (we went through coral/teal animated and scroll-coupled versions; the user landed on "just dark grey like the very beginning").
  - **Occlusion rule**: the solid background lives on `html` (`--color-bg`); `body` has NO background. `.gridfx` sits at `z-index:-1`; a solid `body` background would paint over it (this bug once showed the grid only at the very top).
  - History (don't reintroduce): animating the masked layer's colour/`background-position` repaints the whole layer every frame → laggy; a scroll-coupled glow felt "insane"; roaming glow blobs left black gaps. If motion is ever wanted again, crossfade **full-bleed** layers by **opacity only** (compositor-cheap).
- Page transitions: a cheap **opacity fade** via Astro `<ClientRouter />` (`::view-transition-*(root)` keyframes). A `translateX` swipe repainted the whole page → dropped frames. `prefetch` is enabled in `astro.config.mjs` so navigations feel instant.
- `FrameSequence.tsx` maps **whole-page scroll progress** to the frame index → frame 1 at top, last frame at bottom (spans 100% of scroll).
- `Shiba.tsx`: `client:only="react"` (SSR would render null → hydration mismatch); moves via `transform: translate3d` (GPU); gated ONLY to hover-capable devices — intentionally NOT gated on reduced-motion (it's an opt-in easter egg, matching the old page). Positioned **`absolute inset-x-0 bottom-0 z-[-1]`** — pinned to the page bottom (adds no height) and **behind the footer**, so it walks along behind it. Renders **dim/desaturated** (`opacity .4` + brightness/saturate filter) until hovered → full colour; while hovering (hearts flowing) the **cursor becomes `/shiba/bone.png`**.
- **`prefers-reduced-motion: reduce` disables transitions/view-transitions** (global rule in `global.css`). The browser-preview tool *forces* reduced-motion, so motion can't be visually verified there — test in a real browser with Reduce Motion OFF, or Chrome DevTools → Rendering → "Emulate prefers-reduced-motion: no-preference".
- The logo (`public/logo.png`) was recoloured amber→coral **at the PNG level** via `sharp` (kept alpha, rewrote RGB), not a CSS filter.
- **Dev HMR has been flaky** (stale modules / global.css reload failures). When something looks wrong in dev but the production `build` is clean, restart the dev server (`pkill -f "astro dev"`, clear `node_modules/.vite` + `.astro`) before debugging further.

### Image interactions (islands)
Both the landing side-preview (`ProjectIndex.tsx`) and the case-study `Gallery.tsx` use an **aspect-ratio-animated frame**: aspect ratios are computed at build (from `ImageMetadata`) and passed in, so the frame resizes to fit the *whole* image (no crop) instantly with a CSS transition. The frame reserves space via `aspect-ratio`, which fixes the scroll-jump-to-top bug on image swap (the box never collapses to 0 height).

The landing preview renders **all hero layers once and crossfades via opacity** (no remount/redecode per hover) — this, plus serving small optimized WebPs, is what removed the dropped-frame jank when sweeping the cursor across projects. Hover swaps are **debounced ~90ms** (`previewHover` in `ProjectIndex.tsx`) so dragging across the list doesn't fire a swap per row; resize is `~260ms`, crossfade `~220ms`.

`FrameSequence.tsx` preloads its frames, then drives the displayed frame from React **state** (not by mutating `img.src`) — mutating the DOM node directly breaks because re-renders during preload reset it.

## Design language

Dark default, **coral accent** (`#FF6B3D`), "technical/engineering meets bold/playful": blueprint grid background, monospace metadata/labels, spec-sheet project cards, with animated entrances, hover reveals, and a side-preview pane. Motion is selective by default (respects `prefers-reduced-motion`). Theme tokens live in `@theme` in `src/styles/global.css` (`--color-accent`, `--color-bg`, etc. → Tailwind utilities like `text-accent`, `border-line`).

## Structure

```
src/
  content.config.ts          # 'projects' collection schema (glob loader, zod)
  content/projects/*.md       # one file per project (frontmatter + body prose)
  layouts/Base.astro          # HTML shell, SEO/OG/Twitter meta, fonts, canonical
  components/
    ProjectIndex.tsx          # island: landing filter + list + side-preview (opacity-crossfade layers)
    Gallery.tsx               # island: case-study gallery (thumb swap + lightbox, optimized imgs)
    FrameSequence.tsx         # island: scroll-driven + drag-scrub image sequence (guibe render)
    Shiba.tsx                 # island: cursor-following Shiba easter-egg (→ LinkedIn)
    Reveal.astro              # scroll-reveal wrapper (IntersectionObserver, re-inits on nav)
  consts.ts                   # site config: name, domain, email, linkedin, github, SEO defaults
  lib/images.ts               # resolve /images/* frontmatter paths → optimized WebP for islands
  assets/images/              # all project imagery (optimized at build by astro:assets)
  pages/
    index.astro               # landing (static hero + ProjectIndex island)
    work/[...slug].astro       # case-study template; special sticky FrameSequence layout when `sequence` set
  styles/global.css           # Tailwind import + @theme tokens + base styles + grid/glow + transitions
public/
  guibe-sq/                   # 200-frame render sequence for the guibe page (0001..0200.jpg)
  shiba/                      # Shiba sprite frames (dog-*.png, heart, bone)
  logo.png  og.jpg            # on-page logo + social card image (static, unprocessed)
  CNAME                        # maxhunt.design (REQUIRED — keep, or custom domain breaks)
  Maxim_Hunt_Resume.pdf, favicons
.github/workflows/deploy.yml  # build + deploy to GitHub Pages on push to master
.claude/launch.json           # dev-server config for the preview tooling
```

### Content model (`src/content/projects/*.md`)
Frontmatter fields: `title, tagline, category (software|product|engineering), type (mono code: WEB/HW/MECH/SIM/IND), year, role?, discipline?, tools?, collaborators[], skills[], status?, hero (public path), heroLight?, gallery[{src,caption?}], featured, isNew, draft, order`. The markdown body is the case-study prose. **Adding a project = adding one `.md` file** + dropping images in `src/assets/images/`.

- **`heroLight: true`** marks a hero that's a product shot on a **white/light background**. The case-study hero then renders **`object-contain`** (whole image, no crop — e.g. fixes the cut-off "GIZMO" wordmark) inside a **`.hero-fade`** wrapper, and the index side-preview gets the same radial **mask** — both fade the white edges into the dark page so it reads as a soft spotlight, not a hard white box (the chosen treatment over a light "pedestal" card). Set on `gizmo, sportable, wirelexx, fea, clean, power`; dark heroes (hosthunt, innovaby, guibe) leave it off.

- `skills[]` renders as **animated pills on the case-study page only** (`.skills .skill` in `work/[...slug].astro`): staggered pop-in + hover lift/tilt/fill. NOT shown on the index. Each pill gets a **stable colour from a 7-colour palette** (hashed from the skill name → `--c` inline var; `skillColor()` in the page frontmatter), so the row is multicoloured. Entries are a string or `{ name, kind: 'biz' }` (the `kind` carries semantic meaning but no longer drives colour; normalized by `src/lib/skills.ts`). Founder projects (hosthunt, innovaby) carry real non-tech skills — market research, GTM strategy, marketing, etc.

Current projects: `hosthunt` + `innovaby` (NEW — real content written from the source repos), plus migrated legacy: `power, gizmo, clean, sportable, fea, wirelexx`. `order` controls index sorting.

- **hostHunt** (`HostHunt`, slug `/work/hosthunt`): reverse-marketplace for stays — guests post requests, hosts bid. Content distilled from the private `max-hunts/HH` repo (React/Vite/Firebase/Stripe app). Hero/gallery from the real app banner + screenshots of the hosted landing.
- **Innovaby** (slug `/work/innovaby`): smart-crib **venture** (the company); its product/technology is **SleepSafe** (Pi CM4 crib, AWS coordinator, Telegram + Google Meet parent loop, nanny station). From the private `max-hunts/Innovaby-MVP` repo. Hero/gallery is a **hand-built schematic** (`src/assets/images/innovaby-system.png`, rendered from `scratchpad/innovaby-diagram.html` via headless Chrome). (An AI-generated dark "SleepSafe" hero asset is to be supplied by Max — if added, it's a dark image so leave `heroLight` off.)

### Hosted HostHunt demo (`public/hosthunt-app/`)
A self-contained static rebuild of HostHunt's UI (no backend) served at `/hosthunt-app/`, linked from the hosthunt case study via the `.landing-cta` button. Front-end-only concept (a "Concept demo" ribbon makes that explicit). Pages, all sharing `app.css`:
- `index.html` — marketing landing (own inline CSS; real `banner.jpg`).
- `dashboard/` — host dashboard (profile, stat tiles, upcoming + prospective guests).
- `properties/` + `properties/add/` — listings grid and the add-property form.
- `account/` — guest "my account" (profile, confirmed + pending trips).
- `request/` — the reverse-bid "post a request" form.
- Pages are **recreations** (not the real Vite app): the real app's dashboards are auth-gated + backend-driven, so they're rebuilt with sample data in the landing's design system (coral accent, their card structures). Listing images in `img/` come from the HH repo. Nav links wire the pages together; chip toggles use tiny inline JS.
- **Logo** = an SVG wordmark (`.brand` in `app.css`, duplicated inline on the landing): lowercase `hosthunt`, "host" in ink + "hunt" in coral, and the **o** in h-o-st is a coral disc holding a white house — the mark is built into the word (no separate icon + gap). Same disc-house is the favicon (`favicon.svg`). Sample personas are fictional (host **Eleanor Reed**, guest **Amelia Clarke**); **don't reintroduce "Maxim"** as a persona here.

## Commands
- `npm run dev` — dev server (port 4321; also via the preview tool's `astro-dev` launch config).
- `npm run build` — static build to `dist/`.
- `npm run preview` — serve the built `dist/`.

## Deployment
GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys `dist/` on push to `master`. **One-time setup required:** in repo Settings → Pages, set **Source = "GitHub Actions"** (it was previously serving the `/docs` folder). The `public/CNAME` keeps the custom domain.

## Legacy (`_legacy/`)
The previous site is archived for reference (not served, not built):
- `index.html` — old Webflow export (jQuery + Bootstrap 4 + GSAP/ScrollMagic + Jssor). Source of truth for migrated project copy.
- `comingsoon_react_src/` + `docs/` — the prior Vite "coming soon" page (cursor-following Shiba) and its build output.
- `guibe-sq/` (200-frame scroll sequence), `encoded_MAX.mp4`, old PDFs, `css/`, `js/`.
- Note: legacy HTML image refs are broken in the archive because `Images/` moved to `public/images/`; git history has the working version.

## Conventions / gotchas
- Keep `public/CNAME` = `maxhunt.design`.
- Content frontmatter still references images as `/images/foo.jpg` strings, but those files now live in `src/assets/images/` — `src/lib/images.ts` maps the string back to the imported asset. If you add a project image, drop it in `src/assets/images/` (NOT `public/images`, which no longer exists).
- The guibe scroll/drag frame-sequence is implemented (`FrameSequence.tsx` + `sequence` frontmatter on `guibe.md`, frames in `public/guibe-sq/`). Reuse it on any project by adding a `sequence` block.
- `Shiba.tsx` is gated to pointer (`hover: hover`) devices with motion allowed — it won't render on touch or under `prefers-reduced-motion` (so it's invisible in the preview tool, which emulates reduced-motion).
- `SITE.linkedin` in `src/consts.ts` is confirmed: `https://www.linkedin.com/in/maxim-hunt-deseng/` (feeds the hero CTA, the Shiba click target, and JSON-LD `sameAs`).
- On-page logo is `public/images/LOGO-2.png` (the legacy amber `(X)` mark, also the favicon source).
- Mixed-case/`!` filenames exist in legacy assets — quote paths.
