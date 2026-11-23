## The fixed standard
**THE FIXED STANDARD (Mohamed, 16 Nov 2026) — every News carousel, no exceptions:**
1. **Hook:** the viral slide 1 (tight real face or real-data chart, Anton headline, our T mark). A big price must match the headline (a crash-to-$X headline shows the low, not the current price).
2. **Middle slides (2–4), all `story` cards:** one full-bleed image (real photo, big logo/sign, or a big chart from real data), a big bold title, then 2–4 short lines of description with the key words in Tradr green. One idea per slide. No data tables, no small source text.
3. **Progress bar on every middle slide**, from slide 2 to the last middle slide, never on the hook or the end slide. Segments = the number of middle slides in that post; the current one is green. render.ts draws it automatically on every card.
4. **End slide exactly as it is now** (`endHtml`, uploaded with `desk ends` from `.news/2026-11-16/end.json`): original dark green circuit/glow/grid-floor background; "Join the first social / media platform / for *traders.*"; the sub-line with **verified track record** and **monetize** in bold white; glowing green-outlined "↗ Join at Tradr.me"; white "Download the App" with the Apple mark; App Store QR in a green-edged card with "Scan to get the app" and a curved arrow; big tilted iPhone with the live lander feed on the right; no logo row, no fine print. Do not change it without Mohamed.
5. **Safe area (Mohamed, 17 Nov 2026).** Every slide stays exactly 1080x1350. Instagram's profile grid shows a 4:5 post as a 3:4 centre crop (about 34 px lost on each side) and puts the view counter over the bottom strip, so on the hook every word sits at least **96 px from the sides** and **180 px above the bottom edge**, the T mark sits inside the crop, and the headline is fitted to 3 lines (4 for a long one, never above 184 px) (`SAFE_X` / `SAFE_BOTTOM` in templates.ts). Story slides keep their text 84 px from the sides. The end slide (text from about 75 px in, phone bleeding off the right on purpose) never shows on the grid and stays as it is. Check a new hook in a 3:4 crop with a counter in the bottom-left before publishing.
6. **Could / might hooks (Mohamed, 17 Nov 2026).** Hooks stay clickbaity. "Could" or "might" for something possible but not confirmed is fine ("ANTHROPIC COULD BREAK ELON MUSK'S IPO RECORD") as long as there is a real, sourced path to it and the inside slides show the real facts: the current record or state, the exact numbers, and what would have to happen. Never state the unconfirmed thing as done, and the caption says what is not confirmed.
7. **Slides go viral, the caption carries the receipts (Mohamed, 20 Nov 2026).** Slides are written to go viral: short, punchy, confident. No hedging, no "according to", no "estimated", no "reportedly", no "hasn't confirmed", no source names on any slide. All sources, estimates and caveats go in the caption only (and in `sources` / `confirmed` / `reported`). Every claim on a slide must still be true: never invent or change a number to make it look better, and when a number is an estimate the slide may state it plainly only because the caption says whose estimate it is. Numbers that are compared use the same format and the same number of decimals ("$1.84B vs $1.81B", never "$1.84B vs $1.805 billion"); round to that format honestly (to the nearest, never below the real number for the one being beaten).

_Written 13 Nov 2026 from @polymarket's live Instagram posts and Tradr's own brand; round 2 (same day) from Mohamed's six new references and notes. Updated by each run when new references are added._


## Voice
- Report tone, like a wire service. Short declarative sentences. No hype words ("insane", "huge", "🚨" spam), no opinions, no advice.
- Say who said it, in the caption: "Nvidia said", "according to the Financial Times", "Reuters reported". Slides carry no attribution (fixed standard 7).
- Confirmed vs reported is always clear in the caption. Confirmed = on the record (official statement, filing, the person's own post, video of them saying it). Everything else is "reportedly", "according to [outlet]", "could", "unconfirmed".
- Never invent facts, numbers or quotes. Quotes are copied word for word from a source we link. Numbers carry their source.
- English only.

## Slide 1, the hook (round 2, 13 Nov 2026: Polymarket level)
- **Slide 1 is a tight face** (render.ts finds the face with Apple Vision and frames it: face ~half the slide width, eyes in the top third). Never a wide or medium shot.
- **The person fills the frame.** Big, close, sharp, high-res: head and shoulders from the top of the slide down to the headline, using every bit of the space (Polymarket's Trump "KIDDING": face in the top half, suit filling the width). Full-bleed photo, `zoom`/`focusX`/`focusY` to crop in. No small figure in a big background.
- Layouts: **full portrait** (default), or **person + round inset** (white ring, ~300–360 px) of a second person or a logo/object, placed in empty space beside the face, never over it (Musk + GOP elephant; Trump + Dana White). Cutout only as a fallback.
- **Headline:** Anton, all caps, white, centred, inside the safe area (96 px from each side, 180 px above the bottom), as big as fits (up to 184 px, 3 lines, 4 for a long one). 2–8 words. Reads like a news report and makes people swipe; "could"/"might" is fine for a sourced possibility when the slides show the facts: names, verbs, numbers ("NVIDIA CEO PROBED OVER ALLEGED AFFAIR WITH CHINESE SPY", "MUSK SPENT $446M ON MIDTERMS"). One phrase may be green (red for a price drop).
- **Tag only when it says something:** BREAKING (red, under ~6 h and it changes something), TRENDING, REPORT, OFFICIAL, OFFICIAL REPORT, EXCLUSIVE. Never a topic tag (no CRYPTO, TECH, POLITICS). No tag is fine.
- **Quote headlines:** when the headline is the person's own words, use the quote tag (green pill with a black quote mark, `"tag": "quote"`) and put “ ” around the words. Their words only, verbatim.
- Dark fade over the bottom ~60% so the headline reads; the face stays clear of it.
- **Branding: slide 1 only**, our green T mark, small, top-left. No "TRADR NEWS" text anywhere. No credits or sources on any slide.
- Price stories with no person: chart hook from real exchange data (big price, change chip). No data/source line under it (16 Nov 2026).

## Slides 2–4, the story (16 Nov 2026: newspaper story slides, the default)
- Spec: `"type": "card", "text": "", "story": {title, body, image | chart}` (see `Story` in scripts/news/templates.ts).
- One big full-bleed visual on top (real photo, big logo/sign with `fit: "width"`, or a big red/green chart from real data with a white pill on the key moment), fading into near-black.
- Big bold title (Inter 850, 2–5 words), thin rule, 2–4 short lines of story. Key words and numbers in Tradr green with `*…*`.
- Progress bar at the bottom of every middle slide (added by render.ts; one segment per middle slide in the post), never on the hook or the end slide.
- One idea per slide. No data-table screenshots, no walls of numbers, no small source text. No logo.
- Default arc: what happened → who got hurt → why. 3 story slides unless the story needs more.
- `rows` (panels) and `media` (video ≤ 59 s, a real post screenshot) cards remain for proof that only a screenshot or clip can give.

## Memes, collab, times (13 Nov 2026)
- Memes on inside slides only, never slide 1: caption above, meme below (playbook §11).
- One post a day is the @range.fx collab: `desk collab <draftId> <day>`; News shows a Collab pill.
- Every screenshot timestamp in US Eastern time.

## Last slide
- Fixed, uploaded with `desk ends` (16 Nov 2026, after the Liquid ad): dark green cinematic background, no logo row, "Join the first social media platform for traders." top left with the sub-line under it, a green-outlined glowing "Join at Tradr.me" (↗) and a white "Download the App" pill button, a QR code to the App Store in a green-edged card with "Scan to get the app" and a curved arrow, on the original dark green circuit/glow/grid-floor background (v2) (tested with `npx tsx scripts/news/qrcheck.mts <end.jpg>`), the tilted iPhone with the live lander feed on the right. No fine print. Never changed per post.

**Decisions come from `docs/media-playbook.md`** (the Polymarket study). This guide is the production rules; the playbook is the editorial judgement.

## Photos
- Real photos of the real people only. Never AI-generated or AI-altered people.
- From anywhere on the internet: pick the best, clearest, most expressive photo of the moment (emotion beats a stiff official portrait). News-article lead images (og:image) often give the full-resolution original (CNBC's image API returns 5000+ px without size params).
- No stock-agency watermarks, and never remove one.
- Credits and sources go in the draft's `photos` and `sources` (Studio only), never on a slide.

## Caption (Instagram) (from the playbook, 13 Nov 2026)
- 2–5 short paragraphs. Paragraph 1: the news in one sentence with its attribution ("…, Reuters reported Thursday").
- Then context and numbers, confirmed vs reported, attribution inline in the sentences. No "Sources:" list (sources live in Studio).
- Last line: the market move from real data, with venue and time ("BTC traded at $69,081 on Binance at 21:00 UTC Friday, down 9.0% over seven days."). Never a forecast or a target.
- No hashtags, no emojis, no CTA, no questions to the audience.

## X post
- One post, ≤ 280 characters, no links, no hashtags, no emojis.
- Reads like a news wire: "Nvidia CEO Jensen Huang has resigned, effective immediately, the company said. CFO Colette Kress is interim CEO. Shares fell as much as 14% on Thursday before closing down 4.3%."
- Uses the same slides as Instagram.

## Story choice
- **When Mohamed names the story, that is the story.** Find the strongest angle inside it; never swap it for another one.
- What's hot right now and will be shared: politics, markets, finance, crypto, tech, world. Priority to stories that move prices.
- No tragedies as the hook, no gossip, nothing whose only source is one unverified account.
