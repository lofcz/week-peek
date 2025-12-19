/**
 * Hit Tester - Efficient hit detection for canvas interactions
 */

import type { 
  ScheduleLayout, 
  EventLayout, 
  DayLayout, 
  TimeSlotLayout,
  Point, 
  Rect, 
  HitTestResult 
} from './types';
import { pointInRect } from './LayoutEngine';

/**
 * HitTester provides efficient hit detection for canvas schedule
 * Uses spatial indexing for O(log n) lookups
 */
export class HitTester {
  private layout: ScheduleLayout | null = null;
  private eventIndex: SpatialIndex<EventLayout> | null = null;

  /**
   * Update the hit tester with new layout
   */
  updateLayout(layout: ScheduleLayout): void {
    this.layout = layout;
    
    // Build spatial index for events
    this.eventIndex = new SpatialIndex(layout.gridBounds);
    for (const eventLayout of layout.events) {
      this.eventIndex.insert(eventLayout, eventLayout.bounds);
    }
  }

  /**
   * Perform hit test at a point
   */
  hitTest(point: Point): HitTestResult {
    if (!this.layout) {
      return { type: 'none', point };
    }

    // Check navigation buttons first (when zoomed)
    if (this.layout.zoomedDay !== null) {
      const navButtonHit = this.hitTestNavigationButtons(point);
      if (navButtonHit) {
        return navButtonHit;
      }
    }

    // Check events (most common interaction)
    const eventHit = this.hitTestEvents(point);
    if (eventHit) {
      return {
        type: 'event',
        event: eventHit.event,
        eventLayout: eventHit,
        point,
      };
    }

    // Check day headers
    const dayHit = this.hitTestDayHeaders(point);
    if (dayHit) {
      return {
        type: 'day-header',
        day: dayHit.day,
        point,
      };
    }

    // Check time slots
    const timeSlotHit = this.hitTestTimeSlots(point);
    if (timeSlotHit) {
      return {
        type: 'time-slot',
        timeSlot: timeSlotHit,
        point,
      };
    }

    // Check if in grid area
    if (pointInRect(point, this.layout.gridBounds)) {
      return { type: 'grid', point };
    }

    return { type: 'none', point };
  }

  /**
   * Hit test events using spatial index
   */
  private hitTestEvents(point: Point): EventLayout | null {
    if (!this.eventIndex) return null;

    // Query spatial index for events at point
    const candidates = this.eventIndex.query(point);
    
    // Find topmost event (last in render order, or smallest area)
    let topmost: EventLayout | null = null;
    let smallestArea = Infinity;

    for (const candidate of candidates) {
      if (pointInRect(point, candidate.bounds)) {
        const area = candidate.bounds.width * candidate.bounds.height;
        if (area < smallestArea) {
          smallestArea = area;
          topmost = candidate;
        }
      }
    }

    return topmost;
  }

  /**
   * Hit test day headers
   */
  private hitTestDayHeaders(point: Point): DayLayout | null {
    if (!this.layout) return null;

    for (const day of this.layout.days) {
      if (pointInRect(point, day.headerBounds)) {
        return day;
      }
    }

    return null;
  }

  /**
   * Hit test time slot labels
   */
  private hitTestTimeSlots(point: Point): TimeSlotLayout | null {
    if (!this.layout) return null;

    for (const slot of this.layout.timeSlots) {
      if (pointInRect(point, slot.labelBounds)) {
        return slot;
      }
    }

    return null;
  }

  /**
   * Hit test navigation buttons (prev/next)
   */
  private hitTestNavigationButtons(point: Point): HitTestResult | null {
    if (!this.layout || this.layout.zoomedDay === null) return null;

    // Find the zoomed day layout
    const zoomedDayLayout = this.layout.days.find(d => d.day === this.layout!.zoomedDay);
    if (!zoomedDayLayout) return null;

    // Check prev button (only if not disabled)
    if (zoomedDayLayout.prevButtonBounds && pointInRect(point, zoomedDayLayout.prevButtonBounds)) {
      if (!zoomedDayLayout.prevButtonDisabled) {
        return {
          type: 'prev-day-button',
          day: zoomedDayLayout.day,
          point,
        };
      }
      // Return 'none' if disabled so it doesn't trigger hover
      return { type: 'none', point };
    }

    // Check next button (only if not disabled)
    if (zoomedDayLayout.nextButtonBounds && pointInRect(point, zoomedDayLayout.nextButtonBounds)) {
      if (!zoomedDayLayout.nextButtonDisabled) {
        return {
          type: 'next-day-button',
          day: zoomedDayLayout.day,
          point,
        };
      }
      // Return 'none' if disabled so it doesn't trigger hover
      return { type: 'none', point };
    }

    return null;
  }

  /**
   * Get all events at a point (for overlapping events)
   */
  getEventsAtPoint(point: Point): EventLayout[] {
    if (!this.eventIndex) return [];

    const candidates = this.eventIndex.query(point);
    return candidates.filter(c => pointInRect(point, c.bounds));
  }

  /**
   * Get events in a rectangular region
   */
  getEventsInRect(rect: Rect): EventLayout[] {
    if (!this.eventIndex) return [];
    return this.eventIndex.queryRect(rect);
  }

  /**
   * Find the day at a point (in grid area)
   */
  getDayAtPoint(point: Point): DayLayout | null {
    if (!this.layout) return null;

    for (const day of this.layout.days) {
      if (pointInRect(point, day.contentBounds)) {
        return day;
      }
    }

    return null;
  }

  /**
   * Find the time slot at a point (in grid area)
   */
  getTimeAtPoint(point: Point): { minutes: number; slot: TimeSlotLayout } | null {
    if (!this.layout) return null;

    const slots = this.layout.timeSlots;
    if (slots.length === 0) return null;

    // Binary search for time slot
    // This works for both orientations
    let low = 0;
    let high = slots.length - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const slot = slots[mid];
      
      // Determine if point is in this slot's range
      const isVertical = this.layout.orientation === 'vertical';
      const slotStart = isVertical ? slot.lineStart.y : slot.lineStart.x;
      const slotSize = isVertical 
        ? this.layout.gridBounds.height / slots.length
        : this.layout.gridBounds.width / slots.length;
      const slotEnd = slotStart + slotSize;
      const pos = isVertical ? point.y : point.x;
      
      if (pos < slotStart) {
        high = mid - 1;
      } else if (pos > slotEnd) {
        low = mid + 1;
      } else {
        // Found the slot, calculate exact minutes
        const progress = (pos - slotStart) / slotSize;
        const slotDuration = slots.length > 1 
          ? slots[1].timeMinutes - slots[0].timeMinutes 
          : 60;
        const minutes = slot.timeMinutes + Math.floor(progress * slotDuration);
        return { minutes, slot };
      }
    }

    return null;
  }
}

/**
 * Simple spatial index for fast hit detection
 * Uses a grid-based approach for simplicity and good performance
 */
class SpatialIndex<T> {
  private cellSize: number;
  private cells: Map<string, T[]>;
  private bounds: Rect;
  private items: Array<{ item: T; bounds: Rect }>;

  constructor(bounds: Rect, cellSize: number = 50) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.cells = new Map();
    this.items = [];
  }

  /**
   * Insert item into index
   */
  insert(item: T, itemBounds: Rect): void {
    this.items.push({ item, bounds: itemBounds });

    // Calculate which cells this item overlaps
    const minCellX = Math.floor((itemBounds.x - this.bounds.x) / this.cellSize);
    const maxCellX = Math.floor((itemBounds.x + itemBounds.width - this.bounds.x) / this.cellSize);
    const minCellY = Math.floor((itemBounds.y - this.bounds.y) / this.cellSize);
    const maxCellY = Math.floor((itemBounds.y + itemBounds.height - this.bounds.y) / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const key = `${cellX},${cellY}`;
        if (!this.cells.has(key)) {
          this.cells.set(key, []);
        }
        this.cells.get(key)!.push(item);
      }
    }
  }

  /**
   * Query items at a point
   */
  query(point: Point): T[] {
    const cellX = Math.floor((point.x - this.bounds.x) / this.cellSize);
    const cellY = Math.floor((point.y - this.bounds.y) / this.cellSize);
    const key = `${cellX},${cellY}`;
    
    return this.cells.get(key) || [];
  }

  /**
   * Query items in a rectangle
   */
  queryRect(rect: Rect): T[] {
    const result = new Set<T>();
    
    const minCellX = Math.floor((rect.x - this.bounds.x) / this.cellSize);
    const maxCellX = Math.floor((rect.x + rect.width - this.bounds.x) / this.cellSize);
    const minCellY = Math.floor((rect.y - this.bounds.y) / this.cellSize);
    const maxCellY = Math.floor((rect.y + rect.height - this.bounds.y) / this.cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
        const key = `${cellX},${cellY}`;
        const cellItems = this.cells.get(key);
        if (cellItems) {
          for (const item of cellItems) {
            result.add(item);
          }
        }
      }
    }

    return Array.from(result);
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.cells.clear();
    this.items = [];
  }

  /**
   * Get all items
   */
  getAll(): T[] {
    return this.items.map(i => i.item);
  }
}

/**
 * Utility: Check if a point is near an edge of a rectangle
 * Useful for resize handles
 */
export function isNearEdge(
  point: Point,
  rect: Rect,
  threshold: number = 5
): { edge: 'top' | 'right' | 'bottom' | 'left' | null; corner: 'tl' | 'tr' | 'bl' | 'br' | null } {
  const nearTop = Math.abs(point.y - rect.y) < threshold;
  const nearBottom = Math.abs(point.y - (rect.y + rect.height)) < threshold;
  const nearLeft = Math.abs(point.x - rect.x) < threshold;
  const nearRight = Math.abs(point.x - (rect.x + rect.width)) < threshold;

  // Check corners first
  if (nearTop && nearLeft) return { edge: null, corner: 'tl' };
  if (nearTop && nearRight) return { edge: null, corner: 'tr' };
  if (nearBottom && nearLeft) return { edge: null, corner: 'bl' };
  if (nearBottom && nearRight) return { edge: null, corner: 'br' };

  // Check edges
  if (nearTop) return { edge: 'top', corner: null };
  if (nearBottom) return { edge: 'bottom', corner: null };
  if (nearLeft) return { edge: 'left', corner: null };
  if (nearRight) return { edge: 'right', corner: null };

  return { edge: null, corner: null };
}

/**
 * Get cursor style for an edge/corner
 */
export function getCursorForEdge(
  edge: 'top' | 'right' | 'bottom' | 'left' | null,
  corner: 'tl' | 'tr' | 'bl' | 'br' | null
): string {
  if (corner) {
    switch (corner) {
      case 'tl':
      case 'br':
        return 'nwse-resize';
      case 'tr':
      case 'bl':
        return 'nesw-resize';
    }
  }
  if (edge) {
    switch (edge) {
      case 'top':
      case 'bottom':
        return 'ns-resize';
      case 'left':
      case 'right':
        return 'ew-resize';
    }
  }
  return 'default';
}
