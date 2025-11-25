import type { ScheduleEvent, DayOfWeek, LayoutEvent, TimeOnly, Hour } from '../types';
import { TimeSlotInterval, ScheduleOrientation } from '../types';

/**
 * Calculate grid row index from TimeOnly (relative to events grid)
 * @param time - TimeOnly instance
 * @param startHour - Starting hour for the schedule (0-23)
 * @param timeSlotInterval - Interval enum value
 * @returns Grid row index (1-based for CSS Grid, relative to events grid)
 */
export function timeToGridRow(
  time: TimeOnly,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval
): number {
  const hoursFromStart = time.hours - startHour;
  
  const totalMinutes = hoursFromStart * 60 + time.minutes;
  const slotIndex = Math.floor(totalMinutes / timeSlotInterval);
  
  // +1 because: row 1 is first time slot (relative to events grid)
  return slotIndex + 1;
}

/**
 * Calculate grid column index from TimeOnly (for horizontal orientation)
 * @param time - TimeOnly instance
 * @param startHour - Starting hour for the schedule (0-23)
 * @param timeSlotInterval - Interval enum value
 * @returns Grid column index (1-based for CSS Grid, relative to events grid)
 */
export function timeToGridColumn(
  time: TimeOnly,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval
): number {
  const hoursFromStart = time.hours - startHour;
  
  const totalMinutes = hoursFromStart * 60 + time.minutes;
  const slotIndex = Math.floor(totalMinutes / timeSlotInterval);
  
  // +1 because: column 1 is first time slot (relative to events grid)
  return slotIndex + 1;
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
 * @param event - Event to position
 * @param startHour - Starting hour for the schedule
 * @param timeSlotInterval - Interval enum value
 * @param visibleDays - Array of visible days to determine day index
 * @param orientation - Schedule orientation (determines axis mapping)
 * @returns LayoutEvent with grid positioning
 */
export function calculateEventPosition(
  event: ScheduleEvent,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval,
  visibleDays: DayOfWeek[],
  orientation: ScheduleOrientation
): LayoutEvent {
  if (orientation === ScheduleOrientation.Horizontal) {
    // Horizontal: days as rows, time as columns
    const startCol = timeToGridColumn(event.startTime, startHour, timeSlotInterval);
    const gridRow = dayToGridRow(event.day, visibleDays);
    
    return {
      ...event,
      gridRowStart: gridRow,
      gridRowEnd: gridRow + 1, // Days span 1 row in horizontal orientation
      gridColumn: startCol
    };
  } else {
    // Vertical: days as columns, time as rows (current/default)
    const startRow = timeToGridRow(event.startTime, startHour, timeSlotInterval);
    const endRow = timeToGridRow(event.endTime, startHour, timeSlotInterval);
    const finalEndRow = Math.max(endRow, startRow + 1);
    
    const dayIndex = visibleDays.indexOf(event.day);
    const gridColumn = dayIndex + 1;
    
    return {
      ...event,
      gridRowStart: startRow,
      gridRowEnd: finalEndRow,
      gridColumn: gridColumn
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

