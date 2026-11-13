# News desk — the "make news posts" run

Studio → **News** (`/news`) shows drafts for @tradr__app (Instagram) and @tradr_app (X). This round everything is made
locally on Mohamed's Mac by Claude Code and posted by hand. No cloud runs, no X API, no Meta API.

Trigger: in any Claude Code session on the Mac (including Remote Control from the phone), say **make news posts**
(or `/make-news-posts`). The skill at `~/.claude/skills/make-news-posts/SKILL.md` runs the steps below.

## Pieces

| Piece | What |
|---|---|
| `scripts/news/desk.ts` | CLI: `inbox`, `publish <spec>`, `skip <id> <reason>`, `refs <dir>`, `guide <md>`, `ends <json>`, `summary <text>` |
| `scripts/news/render.ts` | spec → 1080 × 1350 slides (headless Chrome), video slides via yt-dlp + ffmpeg |
| `scripts/news/templates.ts` | slide HTML: `hook` (photo / cutout / chart), `card` (text + image / video / quote / stat), `end` |
| `scripts/news/cutout.swift` | Apple Vision subject lift (on-device, the photo's own pixels, nothing generated) |
| `scripts/news/shot.ts` | screenshot of an article / release / X post (X via its public embed) for proof slides |
| `docs/news-style-guide.md` | copy of the guide stored in Studio (`news-desk` kv) |
| `.news/` (gitignored) | run folders `.news/<date>/<slug>/` with `spec.json`, `assets/`, `out/`; `.news/venv` has mlx-whisper |

Run everything from `~/Desktop/tradrig`:
```sh
D="npx tsx --env-file=.env.local --conditions=react-server scripts/news/desk.ts"
$D inbox
npx tsx scripts/news/render.ts .news/<date>/<slug>/spec.json     # preview only
$D publish .news/<date>/<slug>/spec.json                          # render + upload + draft
```

## Data (Studio Redis, shared by dev and prod)
- `news` hash: drafts (`NewsDraft` in `src/lib/news.ts`), status draft → approved → posted (or changes / rejected).
  The spec is stored on the draft (`spec`) so a change request can be redone from anywhere.
- `newsq` hash: suggestions from the "Suggest a story" box.
- `kv` → `news-desk`: references, style guide, end-slide options + choice, last run summary.
- Slides are in Blob under `news/<draftId>/v<version>-<n>.jpg|mp4`. The end slide is NOT in a draft's slides; Studio
  appends the chosen one, so changing the choice applies everywhere.
- Included in the nightly backup and `/api/backup`.

## Spec format
See `Spec` in `scripts/news/render.ts`. 2–4 story slides (slide 1 = hook), caption, X text (≤ 280, no links),
sources, photos (credit + licence), confirmed[], reported[]. `publish` refuses an incomplete spec.
