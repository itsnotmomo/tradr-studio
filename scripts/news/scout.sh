#!/bin/zsh
# The News scout (20 Nov 2026): runs the news-scout skill in headless Claude Code, twice a day from launchd
# (me.tradr.news-scout, 08:00 and 17:00 Rome). A slot missed because the Mac was off, asleep or the run failed runs
# once when the Mac is next on and awake, if the slot is less than 12 h old (catch-up, 21 Nov 2026).
# It only ever makes drafts in Tradr Media → News; nothing is posted or scheduled. See docs/media-playbook.md §15.
#
#   scout.sh run      what launchd calls: at the slots, at login/boot and every 15 min (catch-up). Runs the latest slot
#                     (08:00 / 17:00 Rome) if it is < 12 h old, not done yet and tried < 2 times; otherwise exits quietly
#   scout.sh now      run right away (ignores the 3 h gap, still respects pause)
#   scout.sh pause    stop the automatic runs (launchd keeps firing, each run exits at once)
#   scout.sh resume   start them again
#   scout.sh status   paused or not, last runs, next slots
set -u
REPO=/Users/mohamedharchi/Desktop/tradrig
STATE=$REPO/.news/scout
LOGDIR=$HOME/Library/Logs/tradr-news-scout
PAUSE=$STATE/paused
LOCK=$STATE/lock
LAST=$STATE/last-start
CATCHUP_HOURS=12
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$STATE" "$LOGDIR"
# Long-lived sign-in for unattended runs (`claude setup-token`), kept outside the repo.
[[ -f $HOME/.config/tradr/claude-token ]] && export CLAUDE_CODE_OAUTH_TOKEN="$(<$HOME/.config/tradr/claude-token)"
cd "$REPO" || exit 1

say() { print -r -- "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOGDIR/scout.log"; }
desk() { npx tsx --env-file=.env.local --conditions=react-server scripts/news/desk.ts "$@"; }
MAX_SECONDS=$((150 * 60))

cmd=${1:-run}
case $cmd in
  pause) touch "$PAUSE"; say "paused by hand"; print "News scout paused. Resume: $0 resume"; exit 0 ;;
  resume) rm -f "$PAUSE"; say "resumed by hand"; print "News scout resumed (next: 08:00 or 17:00 Rome)."; exit 0 ;;
  status)
    [[ -f $PAUSE ]] && print "PAUSED since $(stat -f '%Sm' "$PAUSE")" || print "Active: 08:00 and 17:00 Rome"
    launchctl print "gui/$(id -u)/me.tradr.news-scout" >/dev/null 2>&1 && print "launchd agent: loaded" || print "launchd agent: NOT loaded"
    [[ -d $LOCK ]] && print "Running now (pid $(cat "$LOCK/pid" 2>/dev/null))"
    print "Recent:"; tail -n 8 "$LOGDIR/scout.log" 2>/dev/null
    exit 0 ;;
  run|now) ;;
  *) print "usage: $0 run|now|pause|resume|status"; exit 2 ;;
esac

if [[ -f $PAUSE ]]; then say "skipped: paused"; exit 0; fi

# One run at a time. A lock whose process is gone is stale.
if ! mkdir "$LOCK" 2>/dev/null; then
  if kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then [[ $cmd == now ]] && say "skipped: a run is already going"; exit 0; fi
  rm -rf "$LOCK"; mkdir "$LOCK" || exit 1
fi
print $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# The slot this run is for: the latest 08:00 or 17:00 Rome at or before now. A slot older than 12 h is let go;
# a slot already done (or tried twice) is skipped. Quiet skips write nothing, since launchd calls this every 15 min.
slot_epoch() { TZ=Europe/Rome date -j -f '%Y-%m-%d %H:%M:%S' "$1 $2:00" +%s; }
now_s=$(date +%s); today=$(TZ=Europe/Rome date '+%Y-%m-%d'); yday=$(TZ=Europe/Rome date -v-1d '+%Y-%m-%d')
slot_s=0; slot_key=""
for d h in $today 17:00 $today 08:00 $yday 17:00; do
  s=$(slot_epoch $d $h); if (( s <= now_s )); then slot_s=$s; slot_key="$d-${h/:/}"; break; fi
done
if [[ $cmd == run ]]; then
  [[ -z $slot_key ]] && exit 0
  (( now_s - slot_s > CATCHUP_HOURS * 3600 )) && exit 0
  [[ -f $STATE/done-$slot_key ]] && exit 0
  tries=$(cat "$STATE/tries-$slot_key" 2>/dev/null || print 0)
  (( tries >= 2 )) && exit 0
  # Lid closed on battery: macOS sleeps again within seconds (caffeinate can't stop it), so the run would die
  # half-way (21 Nov 08:30). Wait for the next check with the lid open or on power.
  if ioreg -r -k AppleClamshellState 2>/dev/null | grep -q '"AppleClamshellState" = Yes' && ! pmset -g ps | grep -q "AC Power"; then exit 0; fi
  print $(( tries + 1 )) > "$STATE/tries-$slot_key"
  (( now_s - slot_s > 20 * 60 )) && say "catch-up: the ${slot_key##*-} slot was missed ($(( (now_s - slot_s) / 60 )) min ago), running it now"
fi

# Just woke up: give the network a few minutes.
for i in {1..30}; do curl -fsS -o /dev/null -m 5 https://tradr-studio.vercel.app/api/health 2>/dev/null && break
  curl -sS -o /dev/null -m 5 https://www.google.com 2>/dev/null && break; sleep 10; done

date +%s > "$LAST"
before=$(desk last-run 2>/dev/null || print 0)
slot=$(TZ=Europe/Rome date '+%H:%M')
runlog="$LOGDIR/run-$(TZ=Europe/Rome date '+%Y-%m-%d-%H%M').log"
say "start ($cmd, $slot Rome) → $runlog"

# Keep the Mac awake for the run; kill it if it hangs.
caffeinate -i -s -w $$ &
claude -p "Use the news-scout skill. This is a scheduled run at $slot Rome time: nobody is watching, never ask questions, never post or schedule anything." \
  --dangerously-skip-permissions --output-format text > "$runlog" 2>&1 &
cpid=$!
( sleep $MAX_SECONDS; kill -TERM $cpid 2>/dev/null ) &
wpid=$!
wait $cpid; code=$?
kill $wpid 2>/dev/null

after=$(desk last-run 2>/dev/null || print 0)
if (( code == 0 && after > before )); then
  say "done ($(( ($(date +%s) - $(cat "$LAST")) / 60 )) min)"
  [[ -n $slot_key ]] && touch "$STATE/done-$slot_key"
else
  say "FAILED (exit $code, summary $( (( after > before )) && print written || print 'not written'))"
  desk notify "Tradr News" "The $slot news run didn't finish (exit $code). Log: $runlog" "/instagram" >/dev/null 2>&1
fi
# Keep two weeks of run logs.
find "$LOGDIR" -name 'run-*.log' -mtime +14 -delete 2>/dev/null
find "$STATE" \( -name 'done-*' -o -name 'tries-*' \) -mtime +3 -delete 2>/dev/null
exit 0
