import { WeeklySchedule } from './WeeklySchedule';
import type { ScheduleEvent } from './types';
import { DayOfWeek, TimeOnly, Hour, Minute } from './types';
import './style.css';

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
  createEvent('1', DayOfWeek.Monday, 10, 0, 11, 0, 'Team Standup', '#3b82f6', 'Daily team sync'),
  createEvent('2', DayOfWeek.Monday, 14, 0, 16, 0, 'Sprint Planning', '#8b5cf6', 'Plan next sprint'),
  createEvent('3', DayOfWeek.Tuesday, 11, 0, 12, 0, '1-on-1', '#10b981', 'Team member check-in'),
  createEvent('4', DayOfWeek.Wednesday, 13, 0, 14, 0, 'Design Review', '#f59e0b', 'Review new designs'),
  createEvent('5', DayOfWeek.Friday, 15, 0, 16, 0, 'Retro', '#ec4899', 'Sprint retrospective')
];

// Initialize schedule component
const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
    <h1 style="margin-bottom: 20px; color: #111827;">Weekly Schedule Component</h1>
    <p style="margin-bottom: 20px; color: #6b7280;">Demo of the weekly schedule component with sample events.</p>
    <div id="schedule-container"></div>
  </div>
`;

const scheduleContainer = document.getElementById('schedule-container')!;

// Create schedule instance using factory method
const result = WeeklySchedule.create(
  scheduleContainer,
  {
    visibleDays: [
      DayOfWeek.Monday,
      DayOfWeek.Tuesday,
      DayOfWeek.Wednesday,
      DayOfWeek.Thursday,
      DayOfWeek.Friday
    ],
    startHour: 9,
    endHour: 17,
    onEventClick: (event) => {
      console.log('Event clicked:', event);
      alert(`Clicked: ${event.title}\nTime: ${event.startTime.toString()} - ${event.endTime.toString()}`);
    }
  },
  events
);

if (!result.success) {
  console.error('Failed to create schedule:', result.error);
  alert(`Error creating schedule: ${result.error.message}`);
} else {
  const schedule = result.data;
  
  // Expose schedule instance for debugging
  (window as any).schedule = schedule;
}
