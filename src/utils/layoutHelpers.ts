import type { ScheduleEvent, DayOfWeek, LayoutEvent, TimeOnly, Hour } from '../types';
import { TimeSlotInterval } from '../types';

/**
 * Calculate grid row index from TimeOnly
 * @param time - TimeOnly instance
 * @param startHour - Starting hour for the schedule (0-23)
 * @param timeSlotInterval - Interval enum value
 * @returns Grid row index (1-based for CSS Grid)
 */
export function timeToGridRow(
  time: TimeOnly,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval
): number {
  const hoursFromStart = time.hours - startHour;
  
  // Calculate which slot this time falls into
  const totalMinutes = hoursFromStart * 60 + time.minutes;
  const slotIndex = Math.floor(totalMinutes / timeSlotInterval);
  
  // +2 because: row 1 is header, row 2+ are time slots
  return slotIndex + 2;
}

/**
 * Calculate event position and grid properties
 * @param event - Event to position
 * @param startHour - Starting hour for the schedule
 * @param timeSlotInterval - Interval enum value
 * @param dayColumnIndex - Which column this day is in (1-based)
 * @returns LayoutEvent with grid positioning
 */
export function calculateEventPosition(
  event: ScheduleEvent,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval,
  dayColumnIndex: number
): LayoutEvent {
  const startRow = timeToGridRow(event.startTime, startHour, timeSlotInterval);
  const endRow = timeToGridRow(event.endTime, startHour, timeSlotInterval);
  
  // Ensure minimum height (at least 1 row)
  const finalEndRow = Math.max(endRow, startRow + 1);
  
  return {
    ...event,
    gridRowStart: startRow,
    gridRowEnd: finalEndRow,
    gridColumn: dayColumnIndex
  };
}

/**
 * Filter events to only those on visible days
 * @param events - All events
 * @param visibleDays - Days to show
 * @returns Filtered events array
 */
export function filterVisibleEvents(
  events: ScheduleEvent[],
  visibleDays: DayOfWeek[]
): ScheduleEvent[] {
  return events.filter(event => visibleDays.includes(event.day));
}

