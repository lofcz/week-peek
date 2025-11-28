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
  laneInfo?: LaneInfo
): LayoutEvent {
  // Calculate which slots the event spans (integer positions)
  const startSlot = timeToSlotIndex(event.startTime, startHour, timeSlotInterval);
  const endSlot = timeToSlotIndex(event.endTime, startHour, timeSlotInterval);
  
  // Calculate fractional offsets within the start and end slots
  const startOffset = timeToSlotOffset(event.startTime, startHour, timeSlotInterval);
  const endOffset = timeToSlotOffset(event.endTime, startHour, timeSlotInterval);
  
  const dayIndex = visibleDays.indexOf(event.day);
  
  if (orientation === ScheduleOrientation.Horizontal) {
    const spanSlots = endSlot - startSlot;
    const leftPercent = startOffset * 100;
    
    // Calculate actual duration in slots (fractional)
    const actualDurationInSlots = spanSlots > 0 
      ? ((1 - startOffset) + (spanSlots - 1) + endOffset)
      : (endOffset - startOffset);
    
    // Width percentage should be relative to the column span, not the entire grid
    // If event spans 2 columns and has 1.5 slots duration, it should be 75% of those 2 columns
    const widthPercent = spanSlots > 0 
      ? (actualDurationInSlots / spanSlots) * 100
      : actualDurationInSlots * 100;
    
    let topPercent = 0;
    let heightPercent = 100;
    if (laneInfo && laneInfo.totalLanes > 1) {
      heightPercent = 100 / laneInfo.totalLanes;
      topPercent = (laneInfo.laneIndex / laneInfo.totalLanes) * 100;
    }
    
    return {
      ...event,
      gridRowStart: dayIndex + 1,
      gridRowEnd: dayIndex + 2, // Days span 1 row
      gridColumnStart: startSlot + 1,
      gridColumnEnd: endSlot + 1,
      leftPercent,
      widthPercent,
      topPercent,
      heightPercent,
      laneInfo
    };
  } else {
    const spanSlots = endSlot - startSlot;
    const topPercent = startOffset * 100;
    
    const actualHeightInSlots = spanSlots > 0 
      ? ((1 - startOffset) + (spanSlots - 1) + endOffset) 
      : endOffset - startOffset;
    const heightPercent = spanSlots > 0 
      ? (actualHeightInSlots / spanSlots) * 100 
      : actualHeightInSlots * 100;
    
    if (event.id === '5a') {
      console.log(actualHeightInSlots, spanSlots, heightPercent, endSlot, startSlot, startOffset, endOffset);
    }

    let leftPercent = 0;
    let widthPercent = 100;
    if (laneInfo && laneInfo.totalLanes > 1) {
      widthPercent = 100 / laneInfo.totalLanes;
      leftPercent = (laneInfo.laneIndex / laneInfo.totalLanes) * 100;
    }
    
    return {
      ...event,
      gridRowStart: startSlot + 1,
      gridRowEnd: endSlot + 1,
      gridColumnStart: dayIndex + 1,
      gridColumnEnd: dayIndex + 2, // Days span 1 column
      topPercent,
      heightPercent,
      leftPercent,
      widthPercent,
      laneInfo
    };
  }
}

/**
 * Check if two events have overlapping time ranges
 * @param event1 - First event
 * @param event2 - Second event
 * @returns True if events overlap in time
 */
export function eventsOverlap(event1: ScheduleEvent, event2: ScheduleEvent): boolean {
  // Events must be on the same day to overlap
  if (event1.day !== event2.day) {
    return false;
  }
  
  // Check if time ranges overlap
  // Overlap occurs when: event1 starts before event2 ends AND event1 ends after event2 starts
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
  
  // Sort events by start time
  const sorted = [...events].sort((a, b) => {
    const startA = a.startTime.toMinutes();
    const startB = b.startTime.toMinutes();
    if (startA !== startB) {
      return startA - startB;
    }
    // If same start time, sort by end time (longer events first)
    return b.endTime.toMinutes() - a.endTime.toMinutes();
  });
  
  // Lanes: array of arrays, each inner array contains events in that lane
  const lanes: ScheduleEvent[][] = [];
  const laneMap = new Map<string, LaneInfo>();
  
  // First pass: assign events to lanes
  for (const event of sorted) {
    // Find first lane where event doesn't overlap with existing events
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
    
    // If no lane available, create new lane
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
      // Check if this event overlaps with any event in the group
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
      // Find all events that overlap with this event (transitively)
      let changed = true;
      while (changed) {
        changed = false;
        for (const otherEvent of sorted) {
          if (newGroup.has(otherEvent.id)) continue;
          
          // Check if this event overlaps with any event in the group
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
  
  // Update totalLanes for each conflict group
  for (const group of conflictGroups) {
    // Find the maximum number of lanes used by events in this group
    const lanesUsed = new Set<number>();
    for (const eventId of group) {
      const info = laneMap.get(eventId);
      if (info) {
        lanesUsed.add(info.laneIndex);
      }
    }
    const maxLanes = lanesUsed.size;
    
    // Update all events in this conflict group with the correct totalLanes
    for (const eventId of group) {
      const info = laneMap.get(eventId);
      if (info) {
        laneMap.set(eventId, { ...info, totalLanes: maxLanes });
      }
    }
  }
  
  return laneMap;
}

