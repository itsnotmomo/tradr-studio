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

## Slides 2–4, explain and prove
- White background, no logo, no source line. One or two sentences at the top in Inter 500 (~50 px), key words in bold. Say who said what, where and when: "President Trump posted on Truth Social on Thursday morning: …", "Fed Governor Christopher Waller said in London on Monday: …".
- The carousel tells the story slide by slide (Polymarket's $446M post: claim → TV proof → breakdown → reaction).
- Proof under the text, as wide as the slide:
  - **The original post as people saw it**: a real screenshot of the Truth Social / X post. Truth Social works through Claude in Chrome (the public API from the page, then a zoomed capture). If blocked, a real screenshot from news coverage or people sharing it. A quote card only when no real screenshot exists anywhere.
  - Headline screenshots (CNBC, CoinDesk), official releases and filings, official pages (federalreserve.gov speech text).
  - **Real video clips of the moment**, ≤ 59 s, sound on. TV/news clips with the channel's logo are fine (Fox News, ABC NEWS bug). Never stock footage.
  - Numbers get real visuals: a price chart card (`chart`, real data, optional mark at the moment of the news) when something moves; bold red/green market tiles (`tiles`, `stat` with `tone`) for figures. Never a plain text box.
- **Never say the same thing twice.** If the text says it, the image under it must add something new (the report's own paragraph, the chart, the post), not the same headline again.

## Memes, collab, times (13 Nov 2026)
- Memes on inside slides only, never slide 1: caption above, meme below (playbook §11).
- One post a day is the @range.fx collab: `desk collab <draftId> <day>`; News shows a Collab pill.
- Every screenshot timestamp in US Eastern time.

## Last slide
- Fixed, chosen in Studio: "Don’t just watch the market, watch the traders." / "Join the first social media platform for traders." / tradr.me pill, on Tradr green like the tradr.me lander, with an iPhone 18 Pro showing the Tradr feed. The feed uses made-up traders and made-up trades only (never real users or their results). Never changed per post.

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
- What's hot right now and will be shared: politics, markets, finance, crypto, tech, world. Priority to stories that move prices.
- No tragedies as the hook, no gossip, nothing whose only source is one unverified account.
