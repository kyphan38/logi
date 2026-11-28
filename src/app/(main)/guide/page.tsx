// logi - In-app guide. Plain English, one block per feature.
// Keep it in sync when a feature changes.

import Link from 'next/link';

import TopBar from '@/components/TopBar';

type Block = { title: string; lines: string[] };

const BLOCKS: Block[] = [
  {
    title: 'The day',
    lines: [
      'A logi day runs from 04:00 to 04:00. Work until 1 am still counts for the day before.',
      'A session belongs to the day it started.',
      'A week has 89 tracked hours. Sleep is not one of them.',
    ],
  },
  {
    title: 'Start and stop',
    lines: [
      'Now has four buttons: Learn, Work, Fitness, Leisure. One tap starts a session. No confirm.',
      'The thin strip under each button shows today against its target.',
      'Tap Stop on the running card to finish it. A toast gives you 5 seconds to undo.',
      'Hold a button to pick when it started: a few minutes ago, an exact time, or "After" to plan it for later.',
      'Start links: opening /now?start=learn starts Learn at once, with the same 5-second Undo. Use work, fitness or leisure the same way. Add &label=gym to name it. Settings lists the 4 links to copy, for iPhone Shortcuts or the Home Screen.',
    ],
  },
  {
    title: 'Voice',
    lines: [
      'Hold the mic, speak, then let go. logi reads what you said and shows it before saving.',
      'Past blocks: "Gym from 6 to 7:30".',
      'Until now: "I studied from 8 until now" saves a finished block that ends now.',
      'Still going: "I have been reading since 7" starts a running session.',
      'Only a length: "I studied for 2 hours" ends now. "Ran 30 minutes, finished 10 minutes ago" works too.',
      'Other days: "Last Saturday I read from 9 to 11". Up to 7 days back.',
      'Past midnight: "Worked from 10 PM to 1 AM" is one block.',
      'Later: "Start studying in 10 minutes" or "Gym at 6" plans it.',
      'Switch: "Stop work and start the gym". Break: "Taking a break". Resume: "Back to work".',
      'Fix: "No, that was learning" or "The gym yesterday ended at 8". An older record asks first.',
      'Delete: "Delete the last one" or "Remove yesterday\'s gym". It always asks first, and Undo brings it back.',
      'If a new block overlaps a saved one, the card says so before you save.',
      'Several at once: "Worked 8 to 12, gym 6 to 7, then studied until now". You get a "Log these?" list. Untick what you do not want, then Save. One Undo removes them all.',
      'An item with no time is shown faint. Add it by hand with + on History.',
      'Bedtime: "Yesterday I slept at 11:30" or "I went to bed at 1 last night".',
      'Wake-up time is not tracked.',
    ],
  },
  {
    title: 'Bedtime',
    lines: [
      'The moon on Now shows last night. Tap it to set or change the time for the last two nights.',
      'For an older night, open History, pick the day, and tap the moon there.',
      'After you log tonight\'s bedtime, a Today screen opens: hours per category against the target, routine done, and tomorrow\'s events.',
      'From 20:00, the word today next to the moon opens it again.',
      'Bedtime reminder: in Settings, set your wake time and hours of sleep. logi works out the bedtime. 30 minutes before, a push arrives and a faint line shows on Now. No reminder once bedtime is logged. Turn it off in Settings.',
    ],
  },
  {
    title: 'Routine',
    lines: [
      'Today\'s routine sits under the buttons on Now. Tap the row to open it.',
      'Tap an item to tick it. Tap again to untick.',
      'An item with a category has Start. When its planned time is up, logi asks "Done?". Yes stops it and ticks it. Not yet adds more time.',
      'Edit the weekly routine on Plan, under Targets.',
    ],
  },
  {
    title: 'History',
    lines: [
      'Pick a day at the top. The timeline shows each block. Long gaps show as untracked.',
      'Tap a block to change or delete it.',
      'Tap + to add a block you forgot.',
      'With a day plan, a few lines above the timeline compare it: plan 5h learn · did 3h, the biggest gap, and each planned block with hours done.',
    ],
  },
  {
    title: 'Analytics',
    lines: [
      'Pick a range. The table shows done, target and what is left.',
      'The heatmap uses clock time, not the 04:00 day.',
      'Trends show one category across weeks.',
      'AI notes sit below the charts. They point out what to notice in the range.',
      'Export downloads your data. Pick "All time" for a full backup.',
      'Year: totals and hours per week for each category, usual bedtime, best and worst month, and a 12-month chart. Pick an earlier year above.',
    ],
  },
  {
    title: 'Targets',
    lines: [
      'Set the hours for each category this week. The total is always 89 hours, so adding to one takes from another.',
      'Pick a preset or Custom.',
      'The small lock next to a category keeps its hours fixed.',
      'Review opens the weekly review: three screens you swipe sideways.',
      'On Now, a review banner shows from Sunday 19:00 until the end of Tuesday.',
    ],
  },
  {
    title: 'Day plan',
    lines: [
      'Plan › Day: your usual day as time blocks (start, end, category).',
      'One plan for Mon-Fri, one for Saturday, one for Sunday.',
      'History compares each day with its plan.',
    ],
  },
  {
    title: 'Reminders',
    lines: [
      'Add events with a date. The time is optional.',
      'Upcoming events show first. A banner on Now has a button to start right away.',
    ],
  },
  {
    title: 'mora',
    lines: [
      'Play in mora starts a session in logi. Pause or Stop in either app ends it.',
    ],
  },
  {
    title: 'Settings',
    lines: [
      'Reminders on the lock screen: checks at 06:15 and 20:45, and a Sunday wrap-up. On iPhone, add logi to the Home Screen first.',
      'Bedtime reminder: wake time and hours of sleep. On or off.',
      'Start links: the 4 links that start a category at once. Copy copies one.',
      'Saved AI notes can be deleted for good. Your records stay.',
      'Restore brings back records from an export file.',
      'Theme: system, light or dark.',
    ],
  },
  {
    title: 'Shortcuts',
    lines: [
      'For a keyboard.',
      'Esc: close the open panel.',
      'Enter or Space on a routine item: tick or untick it. Tab moves between items.',
      'Enter or Space on the running card: edit the session.',
      'Analytics tabs, ← and →: previous or next tab. Home and End: first or last tab.',
    ],
  },
];

export default function GuidePage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <TopBar>
        <h1 className="text-2xl font-semibold tracking-tight">Guide</h1>
      </TopBar>

      {BLOCKS.map((b) => (
        <section key={b.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-ink">{b.title}</h2>
          <ul className="flex flex-col gap-1.5">
            {b.lines.map((line) => (
              <li key={line} className="text-[15px] leading-relaxed text-ink-soft">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Link href="/settings" className="text-[13px] text-ink-soft hover:text-ink active:text-ink">
        Back to Settings
      </Link>
    </div>
  );
}
