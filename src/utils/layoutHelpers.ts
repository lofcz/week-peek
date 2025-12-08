import type { ScheduleEvent, DayOfWeek, LayoutEvent, TimeOnly, Hour, LaneInfo } from '../types';
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
 * Calculate the fractional offset within a time slot (0.0 to 1.0)
 * @param time - TimeOnly instance
 * @param startHour - Starting hour for the schedule
 * @param timeSlotInterval - Interval enum value
 * @returns Fractional offset within the slot (0.0 = start of slot, 1.0 = end of slot)
 */
export function timeToSlotOffset(
  time: TimeOnly,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval
): number {
  const hoursFromStart = time.hours - startHour;
  const totalMinutes = hoursFromStart * 60 + time.minutes;
  const slotIndex = Math.floor(totalMinutes / timeSlotInterval);
  const minutesIntoSlot = totalMinutes - (slotIndex * timeSlotInterval);
  return minutesIntoSlot / timeSlotInterval;
}

/**
 * Calculate event position and grid properties (relative to events grid)
 * Returns integer grid positions and CSS positioning values for fractional offsets.
 * @param event - Event to position
 * @param startHour - Starting hour for the schedule
 * @param timeSlotInterval - Interval enum value
 * @param visibleDays - Array of visible days to determine day index
 * @param orientation - Schedule orientation (determines axis mapping)
 * @param laneInfo - Optional lane assignment for overlapping events
 * @returns LayoutEvent with grid positioning and CSS positioning values
 */
export function calculateEventPosition(
  event: ScheduleEvent,
  startHour: Hour,
  timeSlotInterval: TimeSlotInterval,
  visibleDays: DayOfWeek[],
  orientation: ScheduleOrientation,
  laneInfo?: LaneInfo,
  gap?: string | number
): LayoutEvent {
  const dayIndex = visibleDays.indexOf(event.day);
  const daySpan: SpanRange = { 
    start: dayIndex + 1,
    end: dayIndex + 2
  };

  const startSlot = timeToSlotIndex(event.startTime, startHour, timeSlotInterval);

  // Always span exactly one slot for the time axis
  // Sizing and positioning will be handled by absolute positioning relative to this single slot
  const timeSpan: SpanRange = {
    start: startSlot + 1,
    end: startSlot + 2 
  };

  const lengthAxis: AxisSizing = calculateEventLengthAxis(event, startHour, timeSlotInterval);
  const widthAxis: AxisSizing = calculateEventWidthAxis(laneInfo, gap);

  if (orientation === ScheduleOrientation.Horizontal) {
    return {
      ...event,
      gridRowStart: daySpan.start,
      gridRowEnd: daySpan.end,
      gridColumnStart: timeSpan.start,
      gridColumnEnd: timeSpan.end,
      leftPercent: lengthAxis.start,
      widthPercent: lengthAxis.size,
      topPercent: widthAxis.start,
      heightPercent: widthAxis.size,
      laneInfo,
      gap: widthAxis.gap
    };
  }

  return {
    ...event,
    gridRowStart: timeSpan.start,
    gridRowEnd: timeSpan.end,
    gridColumnStart: daySpan.start,
    gridColumnEnd: daySpan.end,
    leftPercent: widthAxis.start,
    widthPercent: widthAxis.size,
    topPercent: lengthAxis.start,
    heightPercent: lengthAxis.size,
    laneInfo,
    gap: widthAxis.gap
  };
}

interface SpanRange {
  start: number;
  end: number;
}

interface AxisSizing {
  start: number;
  size: number;
  gap?: string | number;
}

function calculateEventWidthAxis(laneInfo: LaneInfo | undefined, gap?: string | number): AxisSizing {
  if (laneInfo && laneInfo.totalLanes > 1) {
    const result: AxisSizing = {
      start: (laneInfo.laneIndex / laneInfo.totalLanes) * 100,
      size: 100 / laneInfo.totalLanes
    };
    
    if (gap !== undefined) {
      result.gap = gap;
    }
    
    return result;
  }

  return {
    start: 0,
    size: 100
  };
}

function calculateEventLengthAxis(event: ScheduleEvent, startHour: Hour, timeSlotInterval: TimeSlotInterval): AxisSizing {
  const startSlot = timeToSlotIndex(event.startTime, startHour, timeSlotInterval);
  const endSlot = timeToSlotIndex(event.endTime, startHour, timeSlotInterval);
  
  const startOffset = timeToSlotOffset(event.startTime, startHour, timeSlotInterval);
  const endOffset = timeToSlotOffset(event.endTime, startHour, timeSlotInterval);

  const spanSlots = endSlot - startSlot;
  const startPercent = startOffset * 100;

  const actualDurationInSlots = spanSlots > 0
    ? ((1 - startOffset) + (spanSlots - 1) + endOffset)
    : (endOffset - startOffset);

  // Width/Height is always relative to a single slot (100% = 1 slot)
  const lengthPercent = actualDurationInSlots * 100;
  
  return {
    start: startPercent,
    size: lengthPercent
  };
}

/**
 * Check if two events have overlapping time ranges
 * @param event1 - First event
 * @param event2 - Second event
 * @returns True if events overlap in time
 */
export function eventsOverlap(event1: ScheduleEvent, event2: ScheduleEvent): boolean {
  if (event1.day !== event2.day) {
    return false;
  }
  
  const start1 = event1.startTime.toMinutes();
  const end1 = event1.endTime.toMinutes();
  const start2 = event2.startTime.toMinutes();
  const end2 = event2.endTime.toMinutes();
  
  return start1 < end2 && end1 > start2;
}

/**
 * Group events by day of week
 * @param events - All events
 * @returns Map from DayOfWeek to array of events on that day
 */
export function groupEventsByDay(events: ScheduleEvent[]): Map<DayOfWeek, ScheduleEvent[]> {
  const groups = new Map<DayOfWeek, ScheduleEvent[]>();
  
  for (const event of events) {
    if (!groups.has(event.day)) {
      groups.set(event.day, []);
    }
    groups.get(event.day)!.push(event);
  }
  
  return groups;
}

/**
 * Assign lanes to overlapping events using a greedy algorithm
 * Events are sorted by start time, then assigned to the first available lane
 * @param events - Events on the same day (must all have same day)
 * @returns Map from event ID to lane assignment info
 */
export function assignLanes(events: ScheduleEvent[]): Map<string, LaneInfo> {
  if (events.length === 0) {
    return new Map();
  }
  
  const sorted = [...events].sort((a, b) => {
    const aIsOverflow = a.className?.includes('event-overflow-indicator') ?? false;
    const bIsOverflow = b.className?.includes('event-overflow-indicator') ?? false;
    
    if (aIsOverflow && !bIsOverflow) {
      return 1; // a (overflow) comes after b
    }
    if (!aIsOverflow && bIsOverflow) {
      return -1; // a comes before b (overflow)
    }
    
    const startA = a.startTime.toMinutes();
    const startB = b.startTime.toMinutes();
    if (startA !== startB) {
      return startA - startB;
    }

    return b.endTime.toMinutes() - a.endTime.toMinutes();
  });
  
  const lanes: ScheduleEvent[][] = [];
  const laneMap = new Map<string, LaneInfo>();
  
  for (const event of sorted) {
    let assigned = false;
    for (let i = 0; i < lanes.length; i++) {
      const laneEvents = lanes[i];
      const hasOverlap = laneEvents.some(e => eventsOverlap(e, event));
      if (!hasOverlap) {
        laneEvents.push(event);
        laneMap.set(event.id, { laneIndex: i, totalLanes: 0 }); // totalLanes will be updated in second pass
        assigned = true;
        break;
      }
    }
    
    if (!assigned) {
      lanes.push([event]);
      laneMap.set(event.id, { laneIndex: lanes.length - 1, totalLanes: 0 }); // totalLanes will be updated in second pass
    }
  }
  
  // Second pass: find conflict groups and update totalLanes
  // A conflict group is a set of events that all overlap with each other (transitively)
  const conflictGroups: Set<string>[] = [];
  
  for (const event of sorted) {
    // Find which conflict group this event belongs to
    let groupFound = false;
    for (const group of conflictGroups) {
      for (const eventId of group) {
        const otherEvent = sorted.find(e => e.id === eventId);
        if (otherEvent && eventsOverlap(event, otherEvent)) {
          group.add(event.id);
          groupFound = true;
          break;
        }
      }
      if (groupFound) break;
    }
    
    // If not in any group, create new group
    if (!groupFound) {
      const newGroup = new Set<string>([event.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const otherEvent of sorted) {
          if (newGroup.has(otherEvent.id)) continue;
          
          for (const eventId of newGroup) {
            const groupEvent = sorted.find(e => e.id === eventId);
            if (groupEvent && eventsOverlap(groupEvent, otherEvent)) {
              newGroup.add(otherEvent.id);
              changed = true;
              break;
            }
          }
        }
      }
      conflictGroups.push(newGroup);
    }
  }
  
  for (const group of conflictGroups) {
    const lanesUsed = new Set<number>();
    for (const eventId of group) {
      const info = laneMap.get(eventId);
      if (info) {
        lanesUsed.add(info.laneIndex);
      }
    }
    const maxLanes = lanesUsed.size;
    
    for (const eventId of group) {
      const info = laneMap.get(eventId);
      if (info) {
        laneMap.set(eventId, { ...info, totalLanes: maxLanes });
      }
    }
  }
  
  return laneMap;
}

