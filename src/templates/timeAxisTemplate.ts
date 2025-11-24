import { TimeSlotInterval, Hour, Minute, TimeOnly } from '../types';

/**
 * Create HTML for time axis labels
 * @param startHour - Starting hour (0-23)
 * @param endHour - Ending hour (0-23)
 * @param timeSlotInterval - Interval enum value
 * @returns HTML string for time axis
 */
export function createTimeLabelsHTML(
  startHour: Hour,
  endHour: Hour,
  timeSlotInterval: TimeSlotInterval
): string {
  let html = '<div class="time-label time-label--header"></div>';
  
  const slots: string[] = [];
  
  // Helper to create time and format to string
  // Values are guaranteed valid in this context (hour 0-23, minutes 0/15/30/45)
  const createTimeString = (hour: number, minute: number): string => {
    return new TimeOnly(hour as Hour, minute as Minute).toString();
  };
  
  // Generate time slots
  for (let hour = startHour; hour <= endHour; hour++) {
    if (timeSlotInterval === TimeSlotInterval.SixtyMinutes) {
      slots.push(createTimeString(hour, 0));
    } 
    else if (timeSlotInterval === TimeSlotInterval.ThirtyMinutes) {
      slots.push(createTimeString(hour, 0));
      if (hour < endHour) {
        slots.push(createTimeString(hour, 30));
      }
    } 
    else if (timeSlotInterval === TimeSlotInterval.FifteenMinutes) {
      slots.push(createTimeString(hour, 0));
      if (hour < endHour) {
        slots.push(createTimeString(hour, 15));
        slots.push(createTimeString(hour, 30));
        slots.push(createTimeString(hour, 45));
      }
    }
  }
  
  // Create label for each slot
  slots.forEach(time => {
    html += `<div class="time-label">${time}</div>`;
  });
  
  return html;
}

