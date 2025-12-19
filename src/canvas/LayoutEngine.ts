/**
 * Layout Engine for Canvas Schedule
 * Computes pixel positions for all schedule elements in a single pass
 */

import type { 
  ScheduleEvent, 
  ScheduleConfig, 
  DayOfWeek, 
  LaneInfo,
  Hour
} from '../types';
import { ScheduleOrientation, TimeSlotInterval } from '../types';
import { 
  groupEventsByDay, 
  assignLanes, 
  timeToSlotIndex, 
  timeToSlotOffset 
} from '../utils/layoutHelpers';
import type { 
  ScheduleLayout, 
  EventLayout, 
  DayLayout, 
  TimeSlotLayout,
  Rect,
  Point,
  CanvasTheme
} from './types';

/**
 * Default theme colors
 */
export const DEFAULT_THEME: CanvasTheme = {
  backgroundColor: '#ffffff',
  alternateRowColor: '#f9fafb',
  headerBackgroundColor: '#f3f4f6',
  gridLineColor: '#e5e7eb',
  gridLineMajorColor: '#d1d5db',
  headerTextColor: '#111827',
  timeTextColor: '#6b7280',
  eventTextColor: '#ffffff',
  eventDefaultColor: '#3b82f6',
  eventHoverBorderColor: '#1d4ed8',
  overflowIndicatorColor: '#9ca3af',
  hoverHighlightColor: 'rgba(59, 130, 246, 0.1)',
  selectionColor: 'rgba(59, 130, 246, 0.2)',
};

/**
 * Layout dimensions configuration
 */
export interface LayoutDimensions {
  /** Width of time axis column (vertical) or day axis (horizontal) */
  crossAxisSize: number;
  /** Height of day header (vertical) or time header (horizontal) */
  headerSize: number;
  /** Size of each time slot in pixels */
  slotSize: number;
  /** Minimum slot size */
  minSlotSize: number;
  /** Minimum width for each day column (triggers horizontal scroll if viewport is too narrow) */
  minDayColumnWidth: number;
  /** Padding inside events */
  eventPadding: number;
  /** Gap between overlapping events */
  eventGap: number;
  /** Border radius for events */
  eventBorderRadius: number;
}

const DEFAULT_DIMENSIONS: LayoutDimensions = {
  crossAxisSize: 80,
  headerSize: 40,
  slotSize: 60,
  minSlotSize: 80,
  minDayColumnWidth: 150,
  eventPadding: 8,
  eventGap: 2,
  eventBorderRadius: 4,
};

/**
 * LayoutEngine computes pixel positions for all schedule elements
 */
export class LayoutEngine {
  private config: ScheduleConfig;
  private dimensions: LayoutDimensions;
  private theme: CanvasTheme;

  constructor(
    config: ScheduleConfig,
    dimensions: Partial<LayoutDimensions> = {},
    theme: Partial<CanvasTheme> = {}
  ) {
    this.config = config;
    this.dimensions = { ...DEFAULT_DIMENSIONS, ...dimensions };
    this.theme = { ...DEFAULT_THEME, ...theme };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ScheduleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update dimensions
   */
  updateDimensions(dimensions: Partial<LayoutDimensions>): void {
    this.dimensions = { ...this.dimensions, ...dimensions };
  }

  /**
   * Compute complete layout for the schedule
   */
  computeLayout(
    canvasWidth: number,
    canvasHeight: number,
    events: ScheduleEvent[],
    devicePixelRatio: number = 1,
    zoomedDay: DayOfWeek | null = null
  ): ScheduleLayout {
    const orientation = this.config.orientation ?? ScheduleOrientation.Vertical;
    const visibleDays = zoomedDay !== null 
      ? [zoomedDay] 
      : (this.config.visibleDays ?? []);
    
    const timeSlotCount = this.getTimeSlotCount();
    
    // Calculate grid bounds (excluding headers)
    const intersectionBounds = this.computeIntersectionBounds();
    const dayHeaderBounds = this.computeDayHeaderBounds(canvasWidth, canvasHeight, orientation);
    const timeAxisBounds = this.computeTimeAxisBounds(canvasWidth, canvasHeight, orientation);
    const gridBounds = this.computeGridBounds(canvasWidth, canvasHeight, orientation);

    // Calculate day layouts
    const days = this.computeDayLayouts(visibleDays, gridBounds, dayHeaderBounds, orientation);
    
    // Calculate time slot layouts
    const timeSlots = this.computeTimeSlotLayouts(timeSlotCount, gridBounds, timeAxisBounds, orientation);
    
    // Calculate event layouts
    const eventLayouts = this.computeEventLayouts(
      events,
      visibleDays,
      days,
      timeSlots,
      orientation,
      zoomedDay
    );

    return {
      canvasWidth,
      canvasHeight,
      gridBounds,
      dayHeaderBounds,
      timeAxisBounds,
      intersectionBounds,
      days,
      timeSlots,
      events: eventLayouts,
      orientation,
      devicePixelRatio,
      zoomedDay,
    };
  }

  /**
   * Get the number of time slots based on config
   */
  private getTimeSlotCount(): number {
    const startHour = this.config.startHour ?? 9;
    const endHour = this.config.endHour ?? 17;
    const interval = this.config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes;
    return Math.ceil((endHour - startHour) * 60 / interval);
  }

  /**
   * Compute intersection bounds (top-left corner)
   */
  private computeIntersectionBounds(): Rect {
    return {
      x: 0,
      y: 0,
      width: this.dimensions.crossAxisSize,
      height: this.dimensions.headerSize,
    };
  }

  /**
   * Compute day header bounds
   */
  private computeDayHeaderBounds(
    canvasWidth: number,
    canvasHeight: number,
    orientation: ScheduleOrientation
  ): Rect {
    if (orientation === ScheduleOrientation.Vertical) {
      // Days as columns - header is at top
      return {
        x: this.dimensions.crossAxisSize,
        y: 0,
        width: canvasWidth - this.dimensions.crossAxisSize,
        height: this.dimensions.headerSize,
      };
    } else {
      // Days as rows - header is on left
      return {
        x: 0,
        y: this.dimensions.headerSize,
        width: this.dimensions.crossAxisSize,
        height: canvasHeight - this.dimensions.headerSize,
      };
    }
  }

  /**
   * Compute time axis bounds
   */
  private computeTimeAxisBounds(
    canvasWidth: number,
    canvasHeight: number,
    orientation: ScheduleOrientation
  ): Rect {
    if (orientation === ScheduleOrientation.Vertical) {
      // Time axis is on left
      return {
        x: 0,
        y: this.dimensions.headerSize,
        width: this.dimensions.crossAxisSize,
        height: canvasHeight - this.dimensions.headerSize,
      };
    } else {
      // Time axis is at top
      return {
        x: this.dimensions.crossAxisSize,
        y: 0,
        width: canvasWidth - this.dimensions.crossAxisSize,
        height: this.dimensions.headerSize,
      };
    }
  }

  /**
   * Compute main grid bounds (where events are rendered)
   */
  private computeGridBounds(
    canvasWidth: number,
    canvasHeight: number,
    orientation: ScheduleOrientation
  ): Rect {
    if (orientation === ScheduleOrientation.Vertical) {
      return {
        x: this.dimensions.crossAxisSize,
        y: this.dimensions.headerSize,
        width: canvasWidth - this.dimensions.crossAxisSize,
        height: canvasHeight - this.dimensions.headerSize,
      };
    } else {
      return {
        x: this.dimensions.crossAxisSize,
        y: this.dimensions.headerSize,
        width: canvasWidth - this.dimensions.crossAxisSize,
        height: canvasHeight - this.dimensions.headerSize,
      };
    }
  }

  /**
   * Compute layout for each visible day
   */
  private computeDayLayouts(
    visibleDays: DayOfWeek[],
    gridBounds: Rect,
    headerBounds: Rect,
    orientation: ScheduleOrientation
  ): DayLayout[] {
    const dayCount = visibleDays.length;
    if (dayCount === 0) return [];

    return visibleDays.map((day, index) => {
      if (orientation === ScheduleOrientation.Vertical) {
        // Days as columns
        const dayWidth = gridBounds.width / dayCount;
        return {
          day,
          index,
          headerBounds: {
            x: headerBounds.x + index * dayWidth,
            y: headerBounds.y,
            width: dayWidth,
            height: headerBounds.height,
          },
          contentBounds: {
            x: gridBounds.x + index * dayWidth,
            y: gridBounds.y,
            width: dayWidth,
            height: gridBounds.height,
          },
        };
      } else {
        // Days as rows
        const dayHeight = gridBounds.height / dayCount;
        return {
          day,
          index,
          headerBounds: {
            x: headerBounds.x,
            y: headerBounds.y + index * dayHeight,
            width: headerBounds.width,
            height: dayHeight,
          },
          contentBounds: {
            x: gridBounds.x,
            y: gridBounds.y + index * dayHeight,
            width: gridBounds.width,
            height: dayHeight,
          },
        };
      }
    });
  }

  /**
   * Compute layout for each time slot
   */
  private computeTimeSlotLayouts(
    slotCount: number,
    gridBounds: Rect,
    axisBounds: Rect,
    orientation: ScheduleOrientation
  ): TimeSlotLayout[] {
    const startHour = this.config.startHour ?? 9;
    const interval = this.config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes;
    const slots: TimeSlotLayout[] = [];

    for (let i = 0; i < slotCount; i++) {
      const minutes = startHour * 60 + i * interval;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const label = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

      if (orientation === ScheduleOrientation.Vertical) {
        // Time slots as rows
        const slotHeight = gridBounds.height / slotCount;
        const y = gridBounds.y + i * slotHeight;
        
        slots.push({
          timeMinutes: minutes,
          label,
          labelBounds: {
            x: axisBounds.x,
            y: y,
            width: axisBounds.width,
            height: slotHeight,
          },
          lineStart: { x: gridBounds.x, y },
          lineEnd: { x: gridBounds.x + gridBounds.width, y },
        });
      } else {
        // Time slots as columns
        const slotWidth = gridBounds.width / slotCount;
        const x = gridBounds.x + i * slotWidth;
        
        slots.push({
          timeMinutes: minutes,
          label,
          labelBounds: {
            x: x,
            y: axisBounds.y,
            width: slotWidth,
            height: axisBounds.height,
          },
          lineStart: { x, y: gridBounds.y },
          lineEnd: { x, y: gridBounds.y + gridBounds.height },
        });
      }
    }

    return slots;
  }

  /**
   * Compute layout for all events
   */
  private computeEventLayouts(
    events: ScheduleEvent[],
    visibleDays: DayOfWeek[],
    days: DayLayout[],
    timeSlots: TimeSlotLayout[],
    orientation: ScheduleOrientation,
    _zoomedDay: DayOfWeek | null
  ): EventLayout[] {
    const eventsByDay = groupEventsByDay(events);
    const layouts: EventLayout[] = [];

    // Process visible events and compute lane assignments
    const laneMaps = new Map<DayOfWeek, Map<string, LaneInfo>>();
    
    for (const [day, dayEvents] of eventsByDay.entries()) {
      if (!visibleDays.includes(day)) continue;
      laneMaps.set(day, assignLanes(dayEvents));
    }

    // Compute layout for each event
    for (const event of events) {
      if (!visibleDays.includes(event.day)) continue;

      const dayLayout = days.find(d => d.day === event.day);
      if (!dayLayout) continue;

      const laneInfo = laneMaps.get(event.day)?.get(event.id);
      const bounds = this.computeEventBounds(
        event,
        dayLayout,
        timeSlots,
        orientation,
        laneInfo
      );

      // Parse background color from event style or use default
      const backgroundColor = this.extractBackgroundColor(event) ?? this.theme.eventDefaultColor;
      const isOverflow = event.className?.includes('event-overflow-indicator') ?? false;

      layouts.push({
        event,
        bounds,
        laneInfo,
        isOverflow,
        backgroundColor: isOverflow ? this.theme.overflowIndicatorColor : backgroundColor,
        textColor: this.theme.eventTextColor,
        opacity: 1,
        scale: 1,
      });
    }

    return layouts;
  }

  /**
   * Compute bounds for a single event
   */
  private computeEventBounds(
    event: ScheduleEvent,
    dayLayout: DayLayout,
    timeSlots: TimeSlotLayout[],
    orientation: ScheduleOrientation,
    laneInfo?: LaneInfo
  ): Rect {
    const startHour = this.config.startHour ?? 9 as Hour;
    const interval = this.config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes;
    
    // Calculate position along time axis
    const startSlot = timeToSlotIndex(event.startTime, startHour, interval);
    const startOffset = timeToSlotOffset(event.startTime, startHour, interval);
    const endSlot = timeToSlotIndex(event.endTime, startHour, interval);
    const endOffset = timeToSlotOffset(event.endTime, startHour, interval);

    // Calculate lane position
    const laneIndex = laneInfo?.laneIndex ?? 0;
    const totalLanes = laneInfo?.totalLanes ?? 1;
    const laneWidth = 1 / totalLanes;
    const laneStart = laneIndex * laneWidth;

    const content = dayLayout.contentBounds;
    const slotCount = timeSlots.length;

    if (orientation === ScheduleOrientation.Vertical) {
      // Days as columns, time as rows
      const slotHeight = content.height / slotCount;
      const top = content.y + (startSlot + startOffset) * slotHeight;
      const spanSlots = endSlot - startSlot + endOffset - startOffset;
      const height = spanSlots * slotHeight;
      
      const lanePixelWidth = content.width * laneWidth;
      const left = content.x + content.width * laneStart;
      const width = lanePixelWidth - (totalLanes > 1 ? this.dimensions.eventGap : 0);

      return { x: left, y: top, width, height };
    } else {
      // Days as rows, time as columns
      const slotWidth = content.width / slotCount;
      const left = content.x + (startSlot + startOffset) * slotWidth;
      const spanSlots = endSlot - startSlot + endOffset - startOffset;
      const width = spanSlots * slotWidth;
      
      const lanePixelHeight = content.height * laneWidth;
      const top = content.y + content.height * laneStart;
      const height = lanePixelHeight - (totalLanes > 1 ? this.dimensions.eventGap : 0);

      return { x: left, y: top, width, height };
    }
  }

  /**
   * Extract background color from event style string
   */
  private extractBackgroundColor(event: ScheduleEvent): string | null {
    if (!event.style) return null;
    
    // Match background-color or background property
    const bgColorMatch = event.style.match(/background-color:\s*([^;]+)/i);
    if (bgColorMatch) return bgColorMatch[1].trim();
    
    const bgMatch = event.style.match(/background:\s*([^;]+)/i);
    if (bgMatch) return bgMatch[1].trim();
    
    return null;
  }

  /**
   * Get theme
   */
  getTheme(): CanvasTheme {
    return this.theme;
  }

  /**
   * Get dimensions
   */
  getDimensions(): LayoutDimensions {
    return this.dimensions;
  }
}

/**
 * Utility: Check if a point is inside a rectangle
 */
export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Utility: Expand a rectangle by padding
 */
export function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/**
 * Utility: Check if two rectangles intersect
 */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * Utility: Compute union of two rectangles
 */
export function unionRects(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}
