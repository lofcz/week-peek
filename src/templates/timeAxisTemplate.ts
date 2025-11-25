import { TimeSlotInterval, Hour, TimeOnly } from '../types';

export function createTimeLabelHTML(time: TimeOnly): string {
  return `<div class="time-label">${time.toString()}</div>`;
}

export function generateTimeSlots(startHour: Hour, endHour: Hour, timeSlotInterval: TimeSlotInterval): TimeOnly[] {
  const slots: TimeOnly[] = [];

  for (let hour = startHour; hour <= endHour; hour++) {
    if (timeSlotInterval === TimeSlotInterval.SixtyMinutes) {
      slots.push(new TimeOnly(hour as Hour, 0));
    }
    else if (timeSlotInterval === TimeSlotInterval.ThirtyMinutes) {
      slots.push(new TimeOnly(hour as Hour, 0));
      if (hour < endHour) {
        slots.push(new TimeOnly(hour as Hour, 30));
      }
    }
    else if (timeSlotInterval === TimeSlotInterval.FifteenMinutes) {
      slots.push(new TimeOnly(hour as Hour, 0));
      if (hour < endHour) {
        slots.push(new TimeOnly(hour as Hour, 15));
        slots.push(new TimeOnly(hour as Hour, 30));
        slots.push(new TimeOnly(hour as Hour, 45));
      }
    }
  }

  return slots;
}
