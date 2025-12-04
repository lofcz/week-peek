import { WeeklySchedule } from '../../src/WeeklySchedule';
import { DayOfWeek, TimeOnly, ScheduleOrientation } from '../../src/types';
import { showTooltip, hideTooltip } from './tooltip';

// Sample events with deliberate conflicts to showcase +n more badges
const events = [
  // Monday cluster
  { id: '1', day: DayOfWeek.Monday, title: 'Team Standup', startTime: new TimeOnly(10, 0), endTime: new TimeOnly(11, 0), description: 'Daily team sync', color: '#3b82f6' },
  { id: '1a', day: DayOfWeek.Monday, title: 'Client Call', startTime: new TimeOnly(10, 30), endTime: new TimeOnly(11, 30), description: 'Overlaps with standup', color: '#ef4444' },
  { id: '2', day: DayOfWeek.Monday, title: 'Sprint Planning', startTime: new TimeOnly(14, 0), endTime: new TimeOnly(16, 0), description: 'Plan next sprint', color: '#8b5cf6' },
  { id: '2a', day: DayOfWeek.Monday, title: 'Code Review', startTime: new TimeOnly(15, 0), endTime: new TimeOnly(17, 0), description: 'Overlaps with sprint planning', color: '#06b6d4' },

  // Tuesday cluster with transitive overlap
  { id: '3', day: DayOfWeek.Tuesday, title: '1-on-1', startTime: new TimeOnly(11, 0), endTime: new TimeOnly(12, 0), description: 'Team member check-in', color: '#10b981' },
  { id: '3a', day: DayOfWeek.Tuesday, title: 'Quick Sync', startTime: new TimeOnly(10, 45), endTime: new TimeOnly(11, 30), description: 'Overlaps with 1-on-1', color: '#f97316' },
  { id: '3b', day: DayOfWeek.Tuesday, title: 'Lunch Meeting', startTime: new TimeOnly(11, 30), endTime: new TimeOnly(12, 30), description: 'Overlaps with 1-on-1', color: '#84cc16' },

  // Wednesday cluster
  { id: '4', day: DayOfWeek.Wednesday, title: 'Design Review', startTime: new TimeOnly(13, 0), endTime: new TimeOnly(14, 0), description: 'Review new designs', color: '#f59e0b' },
  { id: '4a', day: DayOfWeek.Wednesday, title: 'Design Workshop', startTime: new TimeOnly(12, 30), endTime: new TimeOnly(13, 30), description: 'Overlaps with review', color: '#a855f7' },
  { id: '4b', day: DayOfWeek.Wednesday, title: 'Follow-up', startTime: new TimeOnly(13, 45), endTime: new TimeOnly(14, 30), description: 'Overlaps with review', color: '#14b8a6' },

  // Thursday large overlap group to trigger +n more
  { id: '55', day: DayOfWeek.Thursday, title: 'Team Meeting', startTime: new TimeOnly(10, 0), endTime: new TimeOnly(11, 0), description: 'Weekly team meeting', color: '#6366f1' },
  { id: '5', day: DayOfWeek.Thursday, title: 'Team Meeting', startTime: new TimeOnly(15, 0), endTime: new TimeOnly(16, 0), description: 'Weekly team meeting', color: '#6366f1' },
  { id: '5a', day: DayOfWeek.Thursday, title: 'Quick Update', startTime: new TimeOnly(15, 15), endTime: new TimeOnly(16, 45), description: 'Fully within team meeting', color: '#ec4899' },
  { id: '5b', day: DayOfWeek.Thursday, title: 'Project Sync', startTime: new TimeOnly(15, 30), endTime: new TimeOnly(16, 30), description: 'Overlaps with team meeting', color: '#22c55e' },
  { id: '5c', day: DayOfWeek.Thursday, title: 'Project Clink', startTime: new TimeOnly(15, 30), endTime: new TimeOnly(16, 30), description: 'Overlaps with team meeting also', color: '#22c88f' },
  { id: '5d', day: DayOfWeek.Thursday, title: 'Team Meeting 2', startTime: new TimeOnly(15, 0), endTime: new TimeOnly(16, 0), description: 'Weekly team meeting', color: '#6366f1' },
  { id: '5e', day: DayOfWeek.Thursday, title: 'Stakeholder Update', startTime: new TimeOnly(15, 10), endTime: new TimeOnly(16, 10), description: 'Another overlap to force +n', color: '#e11d48' },
  { id: '5f', day: DayOfWeek.Thursday, title: 'QA Sync', startTime: new TimeOnly(15, 20), endTime: new TimeOnly(16, 20), description: 'Another overlap', color: '#0ea5e9' },

  // Friday
  { id: '6', day: DayOfWeek.Friday, title: 'Retro', startTime: new TimeOnly(16, 15), endTime: new TimeOnly(18, 15), description: 'Sprint retrospective', color: '#ec4899' },
];

const container = document.getElementById('schedule-container')!;

// Orientation persistence
const storedOrientation = localStorage.getItem('demo.orientation');
let orientation: ScheduleOrientation = storedOrientation === 'horizontal'
  ? ScheduleOrientation.Horizontal
  : ScheduleOrientation.Vertical;

const scheduleResult = WeeklySchedule.create(container, {
  visibleDays: [
    DayOfWeek.Monday,
    DayOfWeek.Tuesday,
    DayOfWeek.Wednesday,
    DayOfWeek.Thursday,
    DayOfWeek.Friday
  ],
  startHour: 8,
  endHour: 18,
  orientation
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

// Hover tooltip via custom events
container.addEventListener('schedule-event-hover', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  const ev = detail.event as typeof events[number];
  const el = detail.element as HTMLElement;
  const time = `${ev.startTime.toString()} - ${ev.endTime.toString()}`;
  const html = `<strong>${ev.title}</strong>${time}<br/>${ev.description ?? ''}`;
  showTooltip(el, html);
});

container.addEventListener('schedule-event-hover-end', () => hideTooltip());

// Click handler demo
container.addEventListener('schedule-event-click', (e: Event) => {
  const detail = (e as CustomEvent).detail;
  const ev = detail.event as typeof events[number];
  console.log('Event clicked:', ev);
  const time = `${ev.startTime.toString()} - ${ev.endTime.toString()}`;
  alert(`Event: ${ev.title}\nTime: ${time}\nDay: ${DayOfWeek[ev.day]}\n${ev.description ?? ''}`);
});
