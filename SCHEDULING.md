# Weekly Instagram scheduling (Claude in Chrome)

Trigger: **"schedule next week"**. That means Monday to Sunday of the following week.
Claude schedules every Ready post and reel in Instagram's own web scheduler at instagram.com, in Chrome, where all three accounts are logged in.
Meta's API can't add music, so the owner adds the songs on the phone afterwards. Never add music, location or the AI label.

## Accounts (never mix these up)

| Language | Account |
|---|---|
| English | **@tradr__app** (two underscores) |
| Italian | **@tradrsocial** |
| Spanish | **@tradr.social** (with a dot) |

Before **every single item**, check that the account name shown in the Create dialog matches the language. If it doesn't, stop and switch.

## 1. Build the plan

First re-check every reel's media against 1080 × 1920. Videos attached before the rule existed were never refused:

```bash
npx tsx --env-file=.env.local --conditions=react-server scripts/validate-reels.ts
```

The plan below also skips any reel whose saved size isn't 1080 × 1920, and marks reels with no cover as `[no cover]`.

```bash
npx tsx --env-file=.env.local --conditions=react-server scripts/schedule-plan.ts --next-week
# or: --from 2026-10-09 --to 2026-10-11
```

The plan script does the following:

- Lists every version per account in run order, English → Italian → Spanish. Each version is Morning, then Reel, then Afternoon, day by day.
- Skips anything that isn't **Ready**, has no name, has no slides or video, has no caption, is over the caption or hashtag limits, or is less than 30 minutes away. Every skip is listed with its reason, and all of them go in the report.
- Resolves each slot's real time with Tradr Studio's resolver. It cross-checks that time two ways: an independent brute-force conversion, and the owner's Rome table (October 2026). **If it prints "TIME CHECK FAILED" (exit code 2), stop and tell the owner before scheduling anything.**
- Prints the **date and time to type** in the scheduler's time zone, with Rome time next to it.
- Downloads every file to `.schedule/<from>_<to>/<lang>/<date>_<n>-<slot>/`. Slides are `01.jpg`, `02.jpg` and so on, with the Tradr slide last (`NN-tradr.jpg`). Reels get `video.mp4`, plus `cover.jpg` if one exists. Each folder also gets the exact `caption.txt`. A `plan.json` covers the whole run.

**Time zone: check it, don't assume.** Instagram's web scheduler uses the browser's time zone. In the Instagram tab, run `Intl.DateTimeFormat().resolvedOptions().timeZone`, and confirm that the scheduler's default time is "now + about 20 min" in that zone. Pass it with `--tz` (the default is `Asia/Makassar`). On 2026-10-09 this Mac was on **Asia/Makassar (Bali)**, not Rome. Spanish Afternoon slots then land on the **next calendar day** in Bali time (14:00 Buenos Aires = 01:00 Bali).

**Video size.** The Chrome upload tool accepts at most 10 MB per call. For a bigger video, make a `video-upload.mp4` copy with a two-pass x264 encode at the same resolution and the original audio, targeting about 9.4 MB. Instagram recompresses every reel well below that bitrate anyway. Upload the copy.

## 2. Schedule each item

1. Click **Create**, then **Post** (the menu toggles, so click again if it doesn't open). For a reel, reload instagram.com first: video uploads sometimes hang on the first try.
2. Find the dialog's file input and upload the item's files in order. Don't click "Select from computer", because that opens a native picker.
3. **Crop**: open the crop menu (bottom left) and choose **Original**. The default is 1:1, which would crop the slides.
4. **Next**, then **Next** (Edit; for a reel, leave Trim alone and keep the cover unless `cover.jpg` exists, in which case use Cover photo → Select from computer). Find the Next button by element, not by position, because the dialog changes width while it animates. A misclick outside it opens a "Discard post?" prompt; choose **Cancel**.
5. On the last step the header button says **Share**. **Turn on "Schedule content" first**, before anything else, and check that the header now says **Schedule**.
6. Click the caption box and type `caption.txt` exactly. Click the account name to close any hashtag suggestion list (**never press Escape**). Read the caption back and compare it to the file.
7. Collaborator, only if the plan says so (EN Afternoon posts: **range.fx**): Add collaborators → type `range.fx` → tick the exact **range.fx** (purple R logo, *not* r_ange_fx or range.fx_x) → Done.
8. **Date**: open the picker and click the day. **Time**: click the hour segment and type two digits, then re-read the field positions (the layout moves) and do the same for minutes. Typing all four digits at once doesn't work.
9. **Check everything before clicking Schedule**:
   - the dialog title (Create new post / New reel)
   - the account name
   - the Schedule switch is on, and the AI label switch is off
   - the only header button is **Schedule**, not Share
   - the date and time match the plan
   - there's no "Choose a time at least 20 minutes from now" error
   - the collaborator is present only when planned

   If anything is off, fix it. If you're unsure, stop.
10. Click **Schedule** and wait for "Your post/reel has been scheduled". Reels take 30–60 s. Click **Done**.
11. Add a line to `.schedule/<range>/run.log`, then pause a random **45–120 s** before the next item.

Between accounts: **wait 10 minutes**, then switch:

1. Move to the left sidebar so the menu shows.
2. Click **More** (bottom left).
3. Click **Switch accounts**.
4. Pick the account. Then **confirm the name on the profile page** before doing anything.

**Never log into an account yourself.** If an account isn't in the switcher, stop and ask the owner to log it in.

**Generic page errors are not a stop.** For "Something went wrong" or "Page couldn't load": do **one** hard reload (Cmd+Shift+R), wait, confirm the active account, and continue.

**Stop immediately** and tell the owner if:
- the same error comes back right after that reload
- anything is account-related: action blocked, "try again later", captcha, a login or verification challenge, or an account missing from the switcher

Don't retry quickly.

## 3. End of run, in one pass

1. For each account, open **Scheduled content** (Profile → ⋯ / Dashboard → Scheduled content, or the "View scheduled content" link). Check that every item is there with the right date and time.
2. Write each confirmed item as `<postId> <lang>` into `.schedule/<range>/confirmed.txt`. List only items you actually saw.
3. Mark them and send the summary:

```bash
npx tsx --env-file=.env.local --conditions=react-server scripts/schedule-finish.ts \
  --plan .schedule/<range>/plan.json --confirmed .schedule/<range>/confirmed.txt --label "Mon–Sun"
```

This sets each confirmed version to **Scheduled in Instagram** and leaves everything else alone. It sends one ntfy message: "Scheduled <label>: X EN · X IT · X ES. X posts need audio."

## 4. Report

For each account, list what was scheduled with Rome times, what was skipped and why, and anything Instagram complained about.
