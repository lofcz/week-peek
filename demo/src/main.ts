import { WeeklySchedule, DayOfWeek, TimeOnly, ScheduleOrientation } from '../../src/index';
// Import CSS for navigation elements
import '../../src/schedule-navigation.css';
import { showTooltip, hideTooltip } from './tooltip';

// Preload an image for testing the 'image' icon type
const testImage = new Image();
testImage.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0iI2ZmZmZmZiIvPjxwYXRoIGQ9Ik0xMiA2djZtMC0zbDMgMy02IDYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+';

// Sample events with deliberate conflicts to showcase +n more badges
const events = [
  // Monday cluster
  { 
    id: '1', 
    day: DayOfWeek.Monday, 
    title: 'Team Standup', 
    startTime: new TimeOnly(10, 0), 
    endTime: new TimeOnly(11, 0), 
    description: 'Daily team sync', 
    style: 'background-color: #3b82f6;',
    icon: { type: 'font', content: 'groups', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '1a', 
    day: DayOfWeek.Monday, 
    title: 'Client Call', 
    startTime: new TimeOnly(10, 30), 
    endTime: new TimeOnly(11, 30), 
    description: 'Overlaps with standup', 
    style: 'background-color: #ef4444;',
    icon: { type: 'font', content: 'phone', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '2', 
    day: DayOfWeek.Monday, 
    title: 'Sprint Planning', 
    startTime: new TimeOnly(14, 0), 
    endTime: new TimeOnly(16, 0), 
    description: 'Plan next sprint', 
    style: 'background-color: #8b5cf6;',
    icon: { type: 'font', content: 'event_note', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '2a', 
    day: DayOfWeek.Monday, 
    title: 'Code Review', 
    startTime: new TimeOnly(15, 0), 
    endTime: new TimeOnly(17, 0), 
    description: 'Overlaps with sprint planning', 
    style: 'background-color: #06b6d4;',
    icon: { type: 'font', content: 'code', fontFamily: 'material-symbols-outlined' } as const
  },

  // Tuesday cluster with transitive overlap
  { 
    id: '3', 
    day: DayOfWeek.Tuesday, 
    title: '1-on-1', 
    startTime: new TimeOnly(11, 0), 
    endTime: new TimeOnly(12, 0), 
    description: 'Team member check-in', 
    style: 'background-color: #10b981;',
    icon: { type: 'font', content: 'person', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '3a', 
    day: DayOfWeek.Tuesday, 
    title: 'Quick Sync', 
    startTime: new TimeOnly(10, 45), 
    endTime: new TimeOnly(11, 30), 
    description: 'Overlaps with 1-on-1', 
    style: 'background-color: #f97316;',
    // Testing URL icon - using a simple SVG data URL
    icon: { type: 'url', url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgMkM2LjQ4IDIgMiA2LjQ4IDIgMTJzNC40OCAxMCAxMCAxMCAxMC00LjQ4IDEwLTEwUzE3LjUyIDIgMTIgMnptLTIgMTVsLTUtNSAxLjQxLTEuNDFMMTAgMTQuMTdsNy41OS03LjU5TDE5IDhsLTkgOXoiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4=' } as const
  },
  { 
    id: '3b', 
    day: DayOfWeek.Tuesday, 
    title: 'Lunch Meeting', 
    startTime: new TimeOnly(11, 30), 
    endTime: new TimeOnly(12, 30), 
    description: 'Overlaps with 1-on-1', 
    style: 'background-color: #84cc16;',
    // Testing URL icon with SVG file
    icon: { type: 'url', url: '/week-peek/chef-man-cap-svgrepo-com.svg' } as const
  },

  // Wednesday cluster
  { 
    id: '4', 
    day: DayOfWeek.Wednesday, 
    title: 'Design Review', 
    startTime: new TimeOnly(13, 0), 
    endTime: new TimeOnly(14, 0), 
    description: 'Review new designs', 
    style: 'background-color: #f59e0b;',
    icon: { type: 'font', content: 'palette', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '4a', 
    day: DayOfWeek.Wednesday, 
    title: 'Design Workshop', 
    startTime: new TimeOnly(12, 30), 
    endTime: new TimeOnly(13, 30), 
    description: 'Overlaps with review', 
    style: 'background-color: #a855f7;',
    icon: { type: 'font', content: 'brush', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '4b', 
    day: DayOfWeek.Wednesday, 
    title: 'Follow-up', 
    startTime: new TimeOnly(13, 45), 
    endTime: new TimeOnly(14, 30), 
    description: 'Overlaps with review', 
    style: 'background-color: #14b8a6;',
    icon: { type: 'font', content: 'reply', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '4c', 
    day: DayOfWeek.Wednesday, 
    title: 'Follow-up 2', 
    startTime: new TimeOnly(13, 45), 
    endTime: new TimeOnly(14, 30), 
    description: 'Overlaps with review, but not design workshop', 
    style: 'background-color: #14b8a6;',
    // Testing preloaded image icon type
    icon: { type: 'image', image: testImage } as const
  },
  // Thursday large overlap group to trigger +n more
  { 
    id: '55', 
    day: DayOfWeek.Thursday, 
    title: 'Team Meeting', 
    startTime: new TimeOnly(10, 0), 
    endTime: new TimeOnly(11, 0), 
    description: 'Weekly team meeting', 
    style: 'background-color: #6366f1;',
    icon: { type: 'font', content: 'groups', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '5', 
    day: DayOfWeek.Thursday, 
    title: 'Team Meeting', 
    startTime: new TimeOnly(15, 0), 
    endTime: new TimeOnly(16, 0), 
    description: 'Weekly team meeting', 
    style: 'background-color: #6366f1;',
    icon: { type: 'font', content: 'groups', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '5a', 
    day: DayOfWeek.Thursday, 
    title: 'Quick Update', 
    startTime: new TimeOnly(15, 15), 
    endTime: new TimeOnly(16, 45), 
    description: 'Fully within team meeting', 
    style: 'background-color: #ec4899;',
    icon: { type: 'font', content: 'update', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '5b', 
    day: DayOfWeek.Thursday, 
    title: 'Project Sync', 
    startTime: new TimeOnly(15, 30), 
    endTime: new TimeOnly(16, 30), 
    description: 'Overlaps with team meeting', 
    style: 'background-color: #22c55e;',
    icon: { type: 'font', content: 'sync', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '5c', 
    day: DayOfWeek.Thursday, 
    title: 'Project Clink', 
    startTime: new TimeOnly(15, 30), 
    endTime: new TimeOnly(16, 30), 
    description: 'Overlaps with team meeting also', 
    style: 'background-color: #22c88f;',
    icon: { type: 'font', content: 'link', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '5d', 
    day: DayOfWeek.Thursday, 
    title: 'Team Meeting 2', 
    startTime: new TimeOnly(15, 0), 
    endTime: new TimeOnly(16, 0), 
    description: 'Weekly team meeting', 
    style: 'background-color: #6366f1;',
    icon: { type: 'font', content: 'groups', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '5e', 
    day: DayOfWeek.Thursday, 
    title: 'Stakeholder Update', 
    startTime: new TimeOnly(15, 10), 
    endTime: new TimeOnly(16, 10), 
    description: 'Another overlap to force +n', 
    style: 'background-color: #e11d48;',
    icon: { type: 'font', content: 'account_circle', fontFamily: 'material-symbols-outlined' } as const
  },
  { 
    id: '5f', 
    day: DayOfWeek.Thursday, 
    title: 'QA Sync', 
    startTime: new TimeOnly(15, 20), 
    endTime: new TimeOnly(16, 20), 
    description: 'Another overlap', 
    style: 'background-color: #0ea5e9;',
    icon: { type: 'font', content: 'bug_report', fontFamily: 'material-symbols-outlined' } as const
  },

  // Friday
  { 
    id: '6', 
    day: DayOfWeek.Friday, 
    title: 'Retro', 
    startTime: new TimeOnly(16, 15), 
    endTime: new TimeOnly(18, 15), 
    description: 'Sprint retrospective', 
    style: 'background-color: #ec4899;',
    icon: { type: 'font', content: 'forum', fontFamily: 'material-symbols-outlined' } as const
  },
];

const container = document.getElementById('schedule-container')!;

// Orientation persistence
const storedOrientation = localStorage.getItem('demo.orientation');
let orientation: ScheduleOrientation = storedOrientation === 'horizontal'
  ? ScheduleOrientation.Horizontal
  : ScheduleOrientation.Vertical;

// Inject Google Material Symbols stylesheet for icons
const materialLink = document.createElement('link');
materialLink.rel = 'stylesheet';
materialLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';
document.head.appendChild(materialLink);

const scheduleResult = WeeklySchedule.create(container, {
  eventGap: '4px',
  visibleDays: [
    DayOfWeek.Monday,
    DayOfWeek.Tuesday,
    DayOfWeek.Wednesday,
    DayOfWeek.Thursday,
    DayOfWeek.Friday
  ],
  startHour: 8,
  endHour: 18,
  orientation,
  overflowIndicatorFormat: (overflowEvents) => {
    if (overflowEvents <= 4) {
      return `+${overflowEvents} další`;
    }

    return `+${overflowEvents} dalších`;
  },
  showNowIndicator: true,
  icons: {
    className: 'material-symbols-outlined',
    prevDay: 'chevron_left',
    nextDay: 'chevron_right',
    resetZoom: 'close_fullscreen',
  },
}, events);

if (!scheduleResult.success) {
  container.innerHTML = `<p style="padding:1rem;color:#ff6b6b;">Failed to init: ${scheduleResult.error.message}</p>`;
  throw scheduleResult.error;
}
const schedule = scheduleResult.data;

// Orientation toggle buttons
const btnVertical = document.getElementById('btn-vertical')!;
const btnHorizontal = document.getElementById('btn-horizontal')!;
const btnReset = document.getElementById('btn-reset')!;

function updateOrientation(next: ScheduleOrientation) {
  if (next === orientation) return;
  orientation = next;
  localStorage.setItem('demo.orientation', orientation === ScheduleOrientation.Horizontal ? 'horizontal' : 'vertical');
  schedule.updateConfig({ orientation });
  btnVertical.setAttribute('aria-pressed', String(orientation === ScheduleOrientation.Vertical));
  btnHorizontal.setAttribute('aria-pressed', String(orientation === ScheduleOrientation.Horizontal));
}

btnVertical.addEventListener('click', () => updateOrientation(ScheduleOrientation.Vertical));
btnHorizontal.addEventListener('click', () => updateOrientation(ScheduleOrientation.Horizontal));
btnReset.addEventListener('click', () => schedule.resetZoom());

// Hover tooltip via custom events (canvas version uses mouse position)
container.addEventListener('schedule-event-hover', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  const ev = detail.event as typeof events[number];
  const time = `${ev.startTime.toString()} - ${ev.endTime.toString()}`;
  const html = `<strong>${ev.title}</strong>${time}<br/>${ev.description ?? ''}`;
  showTooltip(null, html); // null = use mouse position
});

container.addEventListener('schedule-event-hover-end', () => hideTooltip());

// Track currently highlighted event
let highlightedEventId: string | null = null;

// Click handler demo - highlight clicked event
container.addEventListener('schedule-event-click', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  const ev = detail.event as typeof events[number];
  console.log('Event clicked:', ev);
  
  // If clicking the same event that's already highlighted, stop highlighting
  if (highlightedEventId === ev.id) {
    schedule.stopHighlighting();
    highlightedEventId = null;
  } else {
    // Highlight the clicked event
    highlightedEventId = ev.id;
    schedule.highlightEvents((event) => event.id === ev.id);
  }
});
