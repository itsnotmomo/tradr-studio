_Written 13 Nov 2026 from @polymarket's live Instagram posts and Tradr's own brand; round 2 (same day) from Mohamed's six new references and notes. Updated by each run when new references are added._


## Voice
- Report tone, like a wire service. Short declarative sentences. No hype words ("insane", "huge", "🚨" spam), no opinions, no advice.
- Say who said it. Attribute every claim: "Nvidia said", "according to the Financial Times", "Reuters reported".
- Confirmed vs reported is always clear. Confirmed = on the record (official statement, filing, the person's own post, video of them saying it). Everything else is "reportedly", "according to [outlet]", "could", "unconfirmed".
- Never invent facts, numbers or quotes. Quotes are copied word for word from a source we link. Numbers carry their source.
- English only.

## Slide 1, the hook (round 2, 13 Nov 2026: Polymarket level)
- **Slide 1 is a tight face** (render.ts finds the face with Apple Vision and frames it: face ~half the slide width, eyes in the top third). Never a wide or medium shot.
- **The person fills the frame.** Big, close, sharp, high-res: head and shoulders from the top of the slide down to the headline, using every bit of the space (Polymarket's Trump "KIDDING": face in the top half, suit filling the width). Full-bleed photo, `zoom`/`focusX`/`focusY` to crop in. No small figure in a big background.
- Layouts: **full portrait** (default), or **person + round inset** (white ring, ~300–360 px) of a second person or a logo/object, placed in empty space beside the face, never over it (Musk + GOP elephant; Trump + Dana White). Cutout only as a fallback.
- **Headline:** Anton, all caps, white, centred, edge to edge, as big as fits (up to 230 px, 1–3 lines). 2–8 words. Reads like a news report and makes people swipe: names, verbs, numbers ("NVIDIA CEO PROBED OVER ALLEGED AFFAIR WITH CHINESE SPY", "MUSK SPENT $446M ON MIDTERMS"). One phrase may be green (red for a price drop).
- **Tag only when it says something:** BREAKING (red, under ~6 h and it changes something), TRENDING, REPORT, OFFICIAL, OFFICIAL REPORT, EXCLUSIVE. Never a topic tag (no CRYPTO, TECH, POLITICS). No tag is fine.
- **Quote headlines:** when the headline is the person's own words, use the quote tag (green pill with a black quote mark, `"tag": "quote"`) and put “ ” around the words. Their words only, verbatim.
- Dark fade over the bottom ~60% so the headline reads; the face stays clear of it.
- **Branding: slide 1 only**, our green T mark, small, top-left. No "TRADR NEWS" text anywhere. No credits or sources on any slide.
- Price stories with no person: chart hook from real exchange data (big price, change chip, data note).

## Slides 2–4, explain and prove (14 Nov 2026: Polymarket explainer layout, the default)
- Off-white background (#FAFAF7), no logo, no source line. Spec: `rows` (see `Panel` in scripts/news/templates.ts).
- At the top, one short news-style sentence written like a caption (Inter ~50 px, left-aligned, key phrase in bold). One idea per slide; understood in seconds.
- Below it, the proof as rows of rounded panels (24 px corners), side by side or stacked: the real price chart (`chart`, real data, optional mark at the moment), real screenshots (`image`: headline, data page, the person's post; US Eastern time), red/green/dark number tiles (`tile`), bars for a daily series (`bars`).
- Real video clips still use the single `media` card (≤ 59 s).
- **Never say the same thing twice.** The panels add what the sentence doesn't.
- 2–3 explainer slides by default.

## Memes, collab, times (13 Nov 2026)
- Memes on inside slides only, never slide 1: caption above, meme below (playbook §11).
- One post a day is the @range.fx collab: `desk collab <draftId> <day>`; News shows a Collab pill.
- Every screenshot timestamp in US Eastern time.

## Last slide
- Fixed, uploaded with `desk ends` (14 Nov 2026 redesign, Polymarket's last slide as the reference): dark cinematic background (drawn circuit traces, green glow, light lines), Tradr logo + name at the top, "Don't just watch the market. Watch the traders.", the sub-line, a white tradr.me button, a tilted 3D iPhone showing the real tradr.me lander feed (capture of the live page), and the site's disclosure as fine print. Never changed per post.

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
