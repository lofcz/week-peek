import type { ScheduleEvent, DayOfWeek, LayoutEvent, TimeOnly, Hour } from '../types';
import { TimeSlotInterval, ScheduleOrientation } from '../types';

/**
 * Calculate time slot index from TimeOnly (0-based, relative to start hour)
 * @param time - TimeOnly instance
 * @param startHour - Starting hour for the schedule (0-23)
 * @param timeSlotInterval - Interval enum value
 * @returns Slot index (0-based)
 */
export function timeToSlotIndex(
  time: TimeOnly,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval
): number {
  const hoursFromStart = time.hours - startHour;
  const totalMinutes = hoursFromStart * 60 + time.minutes;
  return Math.floor(totalMinutes / timeSlotInterval);
}

/**
 * Calculate grid row index from DayOfWeek (for horizontal orientation)
 * @param day - Day of week enum value
 * @param visibleDays - Array of visible days to determine row index
 * @returns Grid row index (1-based for CSS Grid, relative to events grid)
 */
export function dayToGridRow(
  day: DayOfWeek,
  visibleDays: DayOfWeek[]
): number {
  const dayIndex = visibleDays.indexOf(day);
  return dayIndex + 1; // +1 for 1-based indexing
}

/**
 * Calculate event position and grid properties (relative to events grid)
 * Returns row and column positions already mapped based on orientation.
 * @param event - Event to position
 * @param startHour - Starting hour for the schedule
 * @param timeSlotInterval - Interval enum value
 * @param visibleDays - Array of visible days to determine day index
 * @param orientation - Schedule orientation (determines axis mapping)
 * @returns LayoutEvent with grid positioning (rows and columns already mapped correctly)
 */
export function calculateEventPosition(
  event: ScheduleEvent,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval,
  visibleDays: DayOfWeek[],
  orientation: ScheduleOrientation
): LayoutEvent {
  const startTimeSlot = timeToSlotIndex(event.startTime, startHour, timeSlotInterval);
  const endTimeSlot = timeToSlotIndex(event.endTime, startHour, timeSlotInterval);
  const finalEndTimeSlot = Math.max(endTimeSlot, startTimeSlot + 1);
  
  const dayIndex = visibleDays.indexOf(event.day);
  
  if (orientation === ScheduleOrientation.Horizontal) {
    return {
      ...event,
      gridRowStart: dayIndex + 1,
      gridRowEnd: dayIndex + 2, // Days span 1 row
      gridColumnStart: startTimeSlot + 1,
      gridColumnEnd: finalEndTimeSlot + 1
    };
  } else {
    return {
      ...event,
      gridRowStart: startTimeSlot + 1,
      gridRowEnd: finalEndTimeSlot + 1,
      gridColumnStart: dayIndex + 1,
      gridColumnEnd: dayIndex + 2 // Days span 1 column
    };
  }
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

