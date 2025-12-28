import { WeeklySchedule } from './WeeklySchedule';
import type { ScheduleEvent } from './types';
import { DayOfWeek, TimeOnly, Hour, Minute, ScheduleOrientation } from './types';
import './style.css';
import './schedule-navigation.css';

// Helper function to create events with TimeOnly instances
function createEvent(
  id: string,
  day: DayOfWeek,
  startHour: Hour,
  startMinute: Minute,
  endHour: Hour,
  endMinute: Minute,
  title: string,
  color: string,
  description: string
): ScheduleEvent {
  return {
    id,
    day,
    startTime: new TimeOnly(startHour, startMinute),
    endTime: new TimeOnly(endHour, endMinute),
    title,
    color,
    description
  };
}

// Sample events for demo
const events: ScheduleEvent[] = [
  // Monday - overlapping events
  createEvent('1', DayOfWeek.Monday, 10, 0, 11, 0, 'Team Standup', '#3b82f6', 'Daily team sync'),
  createEvent('1a', DayOfWeek.Monday, 10, 30, 11, 30, 'Client Call', '#ef4444', 'Overlaps with standup'),
  createEvent('2', DayOfWeek.Monday, 14, 0, 16, 0, 'Sprint Planning', '#8b5cf6', 'Plan next sprint'),
  createEvent('2a', DayOfWeek.Monday, 15, 0, 17, 0, 'Code Review', '#06b6d4', 'Overlaps with sprint planning'),

  // Tuesday - overlapping events
  createEvent('3', DayOfWeek.Tuesday, 11, 0, 12, 0, '1-on-1', '#10b981', 'Team member check-in'),
  createEvent('3a', DayOfWeek.Tuesday, 10, 45, 11, 30, 'Quick Sync', '#f97316', 'Overlaps with 1-on-1'),
  createEvent('3b', DayOfWeek.Tuesday, 11, 30, 12, 30, 'Lunch Meeting', '#84cc16', 'Overlaps with 1-on-1'),

  // Wednesday - overlapping events
  createEvent('4', DayOfWeek.Wednesday, 13, 0, 14, 0, 'Design Review', '#f59e0b', 'Review new designs'),
  createEvent('4a', DayOfWeek.Wednesday, 12, 30, 13, 30, 'Design Workshop', '#a855f7', 'Overlaps with review'),
  createEvent('4b', DayOfWeek.Wednesday, 13, 45, 14, 30, 'Follow-up', '#14b8a6', 'Overlaps with review'),
  createEvent('4c', DayOfWeek.Wednesday, 13, 45, 14, 30, 'Follow-up 2', '#14b8a6', 'Overlaps with review, but not design workshop'),

  // Thursday - one event in the morning then a big cluster in the afternoon
  createEvent('55', DayOfWeek.Thursday, 10, 0, 11, 0, 'Team Meeting', '#6366f1', 'Weekly team meeting'),

  createEvent('5', DayOfWeek.Thursday, 15, 0, 16, 0, 'Team Meeting', '#6366f1', 'Weekly team meeting'),
  createEvent('5a', DayOfWeek.Thursday, 15, 15, 16, 45, 'Quick Update', '#ec4899', 'Fully within team meeting'),
  createEvent('5b', DayOfWeek.Thursday, 15, 30, 16, 30, 'Project Sync', '#22c55e', 'Overlaps with team meeting'),
  createEvent('5c', DayOfWeek.Thursday, 15, 30, 16, 30, 'Project Clink', '#22c88f', 'Overlaps with team meeting also'),
  createEvent('5d', DayOfWeek.Thursday, 15, 0, 16, 0, 'Team Meeting 2', '#6366f1', 'Weekly team meeting'),
  createEvent('5e', DayOfWeek.Thursday, 15, 10, 16, 10, 'Stakeholder Update', '#e11d48', 'Another overlap to force +n'),
  createEvent('5f', DayOfWeek.Thursday, 15, 20, 16, 20, 'QA Sync', '#0ea5e9', 'Another overlap'),

  // Friday
  createEvent('6', DayOfWeek.Friday, 16, 15, 18, 15, 'Retro', '#ec4899', 'Sprint retrospective')
];

// Initialize schedule component
const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div class="demo-wrapper">
    <h1 class="demo-title">Weekly Schedule Component</h1>
    <p class="demo-description">Demo of the weekly schedule component with sample events.</p>
    <div id="schedule-container" class="demo-schedule-container"></div>
  </div>
`;

const scheduleContainer = document.getElementById('schedule-container')!;

// Create schedule instance using factory method
// Inject Google Material Symbols stylesheet for icons
const materialLink = document.createElement('link');
materialLink.rel = 'stylesheet';
materialLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';
document.head.appendChild(materialLink);


const result = WeeklySchedule.create(
  scheduleContainer,
  {
    orientation: ScheduleOrientation.Horizontal,
    visibleDays: [
      DayOfWeek.Monday,
      DayOfWeek.Tuesday,
      DayOfWeek.Wednesday,
      DayOfWeek.Thursday,
      DayOfWeek.Friday
    ],
    startHour: 9,
    endHour: 17,
    icons: {
      className: 'material-symbols-outlined',
      zoom: 'zoom_in',
      unzoom: 'close_fullscreen',
      cta: 'zoom_in'
    },

  },
  events
);

// Listen for custom event clicks
scheduleContainer.addEventListener('schedule-event-click', ((e: Event) => {
  const customEvent = e as CustomEvent<{ event: ScheduleEvent }>;
  const event = customEvent.detail.event;
  console.log('Event clicked:', event);
  alert(`Clicked: ${event.title}\nTime: ${event.startTime.toString()} - ${event.endTime.toString()}`);
}) as EventListener);

if (!result.success) {
  console.error('Failed to create schedule:', result.error);
  alert(`Error creating schedule: ${result.error.message}`);
} else {
  const schedule = result.data;

  // Expose schedule instance for debugging
  (window as any).schedule = schedule;
}
