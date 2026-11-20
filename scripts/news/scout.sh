#!/bin/zsh
# The News scout (20 Nov 2026): runs the news-scout skill in headless Claude Code, twice a day from launchd
# (me.tradr.news-scout, 08:00 and 17:00 Rome; a slot missed while the Mac slept runs when it wakes).
# It only ever makes drafts in Tradr Media → News; nothing is posted or scheduled. See docs/media-playbook.md §15.
#
#   scout.sh run      what launchd calls (skips when paused, already running, or a run started < 3 h ago)
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
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$STATE" "$LOGDIR"
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
  if kill -0 "$(cat "$LOCK/pid" 2>/dev/null)" 2>/dev/null; then say "skipped: a run is already going"; exit 0; fi
  rm -rf "$LOCK"; mkdir "$LOCK" || exit 1
fi
print $$ > "$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT

# Waking from sleep can fire both missed slots back to back; one run covers them.
if [[ $cmd == run && -f $LAST ]] && (( $(date +%s) - $(cat "$LAST") < 3 * 3600 )); then
  say "skipped: last run started less than 3 h ago"; exit 0
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
else
  say "FAILED (exit $code, summary $( (( after > before )) && print written || print 'not written'))"
  desk notify "Tradr News" "The $slot news run didn't finish (exit $code). Log: $runlog" "/news" >/dev/null 2>&1
fi
# Keep two weeks of run logs.
find "$LOGDIR" -name 'run-*.log' -mtime +14 -delete 2>/dev/null
exit 0
