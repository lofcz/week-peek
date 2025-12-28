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
 * Multiplier for scaling slot width/height in zoomed mode
 * Increase this value to make zoomed columns/rows wider/taller
 */
export const ZOOMED_SLOT_SIZE_MULTIPLIER = 2.75; // 2.75

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
   * @param canvasWidth - Width of the canvas in pixels
   * @param canvasHeight - Height of the canvas in pixels
   * @param events - Events to lay out
   * @param devicePixelRatio - Device pixel ratio for HiDPI displays
   * @param zoomedDay - Currently zoomed day, or null if not zoomed
   * @param originalVisibleDays - Original visible days before zooming
   * @param usesSeparateTimeHeader - If true, time header is in DOM (not on canvas), so grid starts at y=0
   */
  computeLayout(
    canvasWidth: number,
    canvasHeight: number,
    events: ScheduleEvent[],
    devicePixelRatio: number = 1,
    zoomedDay: DayOfWeek | null = null,
    originalVisibleDays: DayOfWeek[] = [],
    usesSeparateTimeHeader: boolean = false
  ): ScheduleLayout {
    const orientation = this.config.orientation ?? ScheduleOrientation.Vertical;
    const visibleDays = zoomedDay !== null 
      ? [zoomedDay] 
      : (this.config.visibleDays ?? []);
    
    const timeSlotCount = this.getTimeSlotCount();
    
    // Calculate grid bounds (excluding headers)
    const intersectionBounds = this.computeIntersectionBounds();
    const dayHeaderBounds = this.computeDayHeaderBounds(canvasWidth, canvasHeight, orientation);
    const timeAxisBounds = this.computeTimeAxisBounds(canvasWidth, canvasHeight, orientation, usesSeparateTimeHeader);
    const gridBounds = this.computeGridBounds(canvasWidth, canvasHeight, orientation, usesSeparateTimeHeader);

    // Calculate day layouts
    const days = this.computeDayLayouts(visibleDays, gridBounds, dayHeaderBounds, orientation, zoomedDay, originalVisibleDays.length > 0 ? originalVisibleDays : (this.config.visibleDays ?? []));
    
    // Calculate time slot layouts
    const timeSlots = this.computeTimeSlotLayouts(timeSlotCount, gridBounds, timeAxisBounds, orientation, zoomedDay);
    
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
      isMobile: false,
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
    // Intersection cell is now in DOM, return zero bounds
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  /**
   * Compute day header bounds
   */
  private computeDayHeaderBounds(
    _canvasWidth: number,
    _canvasHeight: number,
    _orientation: ScheduleOrientation
  ): Rect {
    // Day headers are now in DOM, return zero bounds
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  /**
   * Compute time axis bounds
   * @param usesSeparateTimeHeader - If true, time header is in DOM, not on canvas
   */
  private computeTimeAxisBounds(
    canvasWidth: number,
    canvasHeight: number,
    orientation: ScheduleOrientation,
    usesSeparateTimeHeader: boolean = false
  ): Rect {
    if (orientation === ScheduleOrientation.Vertical) {
      // Time axis is on left, full height (no header)
      return {
        x: 0,
        y: 0,
        width: this.dimensions.crossAxisSize,
        height: canvasHeight,
      };
    } else {
      // Time axis is at top, full width (no left column for days)
      // When using separate DOM time header, return zero-height bounds
      if (usesSeparateTimeHeader) {
        return {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: 0,
        };
      }
      return {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: this.dimensions.headerSize,
      };
    }
  }

  /**
   * Compute main grid bounds (where events are rendered)
   * @param usesSeparateTimeHeader - If true, time header is in DOM, so grid starts at y=0
   */
  private computeGridBounds(
    canvasWidth: number,
    canvasHeight: number,
    orientation: ScheduleOrientation,
    usesSeparateTimeHeader: boolean = false
  ): Rect {
    if (orientation === ScheduleOrientation.Vertical) {
      // Grid uses full canvas height (time axis stays on left)
      return {
        x: this.dimensions.crossAxisSize,
        y: 0,
        width: canvasWidth - this.dimensions.crossAxisSize,
        height: canvasHeight,
      };
    } else {
      // Grid uses full canvas width (no left column for days)
      // When using separate DOM time header, grid starts at top (y=0)
      if (usesSeparateTimeHeader) {
        return {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight,
        };
      }
      return {
        x: 0,
        y: this.dimensions.headerSize,
        width: canvasWidth,
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
    orientation: ScheduleOrientation,
    zoomedDay: DayOfWeek | null,
    originalVisibleDays: DayOfWeek[]
  ): DayLayout[] {
    const dayCount = visibleDays.length;
    if (dayCount === 0) return [];

    const BUTTON_HEIGHT = 40;

    return visibleDays.map((day, index) => {
      const baseLayout = orientation === ScheduleOrientation.Vertical
        ? {
            // Days as columns
            dayWidth: gridBounds.width / dayCount,
            headerBounds: {
              x: headerBounds.x + index * (gridBounds.width / dayCount),
              y: headerBounds.y,
              width: gridBounds.width / dayCount,
              height: headerBounds.height,
            },
            contentBounds: {
              x: gridBounds.x + index * (gridBounds.width / dayCount),
              y: gridBounds.y,
              width: gridBounds.width / dayCount,
              height: gridBounds.height,
            },
          }
        : {
            // Days as rows
            dayHeight: gridBounds.height / dayCount,
            headerBounds: {
              x: headerBounds.x,
              y: headerBounds.y + index * (gridBounds.height / dayCount),
              width: headerBounds.width,
              height: gridBounds.height / dayCount,
            },
            contentBounds: {
              x: gridBounds.x,
              y: gridBounds.y + index * (gridBounds.height / dayCount),
              width: gridBounds.width,
              height: gridBounds.height / dayCount,
            },
          };

      const result: DayLayout = {
        day,
        index,
        headerBounds: baseLayout.headerBounds,
        contentBounds: baseLayout.contentBounds,
      };

      // Calculate navigation button bounds when zoomed
      // Divide the header space into: [prev button] [day label] [next button]
      // Buttons are always visible, but disabled when there's no day to navigate to
      if (zoomedDay !== null && day === zoomedDay) {
        const currentIndex = originalVisibleDays.indexOf(day);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < originalVisibleDays.length - 1;

        const headerX = baseLayout.headerBounds.x;
        const headerY = baseLayout.headerBounds.y;
        const headerWidth = baseLayout.headerBounds.width;
        const headerHeight = baseLayout.headerBounds.height;
        const buttonWidth = headerWidth;

        // Always reserve space for both buttons (80px total)
        const totalButtonsHeight = BUTTON_HEIGHT * 2;
        const labelHeight = headerHeight - totalButtonsHeight;
        
        let currentY = headerY;

        // Always create prev button bounds
        result.prevButtonBounds = {
          x: headerX,
          y: currentY,
          width: buttonWidth,
          height: BUTTON_HEIGHT,
        };
        result.prevButtonDisabled = !hasPrev;
        currentY += BUTTON_HEIGHT;

        // Adjust day label bounds to fit between buttons
        result.headerBounds = {
          x: headerX,
          y: currentY,
          width: headerWidth,
          height: labelHeight,
        };
        currentY += labelHeight;

        // Always create next button bounds
        result.nextButtonBounds = {
          x: headerX,
          y: currentY,
          width: buttonWidth,
          height: BUTTON_HEIGHT,
        };
        result.nextButtonDisabled = !hasNext;
      }

      return result;
    });
  }

  /**
   * Compute layout for each time slot
   */
  private computeTimeSlotLayouts(
    slotCount: number,
    gridBounds: Rect,
    axisBounds: Rect,
    orientation: ScheduleOrientation,
    zoomedDay: DayOfWeek | null = null
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
        const baseSlotWidth = gridBounds.width / slotCount;
        const minSlotWidth = zoomedDay !== null ? this.dimensions.minSlotSize * ZOOMED_SLOT_SIZE_MULTIPLIER : this.dimensions.minSlotSize;
        const slotWidth = Math.max(baseSlotWidth, minSlotWidth);
        // Calculate x position: all slots have the same width, so we can multiply
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
      // Use actual time slot positions and widths (which may vary when zoomed)
      const startSlotLayout = timeSlots[startSlot];
      const endSlotLayout = timeSlots[Math.min(endSlot, timeSlots.length - 1)];
      
      if (!startSlotLayout || !endSlotLayout) {
        // Fallback to uniform calculation if slots are missing
        const slotWidth = content.width / slotCount;
        const left = content.x + (startSlot + startOffset) * slotWidth;
        const spanSlots = endSlot - startSlot + endOffset - startOffset;
        const width = spanSlots * slotWidth;
        
        const lanePixelHeight = content.height * laneWidth;
        let top = content.y + content.height * laneStart;
        let height = lanePixelHeight - (totalLanes > 1 ? this.dimensions.eventGap : 0);
        
        // Add gap at the top of the first event in the lane (topmost event)
        if (laneIndex === 0 && totalLanes > 1) {
          top += this.dimensions.eventGap;
          height -= this.dimensions.eventGap;
        }

        return { x: left, y: top, width, height };
      }
      
      // Calculate position based on actual slot bounds
      // Start position: beginning of start slot + offset within that slot
      const startSlotWidth = startSlotLayout.labelBounds.width;
      const left = startSlotLayout.labelBounds.x + (startOffset * startSlotWidth);
      
      // Calculate width by summing actual slot widths
      let width = 0;
      for (let i = startSlot; i <= Math.min(endSlot, timeSlots.length - 1); i++) {
        const slot = timeSlots[i];
        if (i === startSlot) {
          // First slot: use remaining width after offset
          width += slot.labelBounds.width * (1 - startOffset);
        } else if (i === endSlot) {
          // Last slot: use width up to end offset
          width += slot.labelBounds.width * endOffset;
        } else {
          // Middle slots: use full width
          width += slot.labelBounds.width;
        }
      }
      
      const lanePixelHeight = content.height * laneWidth;
      let top = content.y + content.height * laneStart;
      let height = lanePixelHeight - (totalLanes > 1 ? this.dimensions.eventGap : 0);
      
      // Add gap at the top of the first event in the lane (topmost event)
      if (laneIndex === 0 && totalLanes > 1) {
        top += this.dimensions.eventGap;
        height -= this.dimensions.eventGap;
      }

      return { x: left, y: top, width, height };
    }
  }

  /**
   * Extract background color from event
   * Returns the color property if set, otherwise null (falls back to default theme color)
   */
  private extractBackgroundColor(event: ScheduleEvent): string | null {
    return event.color ? event.color.trim() : null;
  }

  /**
   * Compute mobile layout - days stacked vertically with events as list items
   */
  computeMobileLayout(
    canvasWidth: number,
    events: ScheduleEvent[],
    devicePixelRatio: number = 1
  ): ScheduleLayout {
    const visibleDays = this.config.visibleDays ?? [];
    const eventsByDay = groupEventsByDay(events);
    
    // Mobile layout constants
    const DAY_HEADER_HEIGHT = 40;
    const EVENT_ROW_HEIGHT = 56; // Increased from 44 for more vertical padding
    const DAY_PADDING = 8;
    const HORIZONTAL_PADDING = 12;
    const HEADER_TO_EVENT_PADDING = 12; // Padding between day divider and first event
    
    // Calculate total height needed
    let totalHeight = 0;
    const dayHeights: Map<DayOfWeek, number> = new Map();
    
    for (const day of visibleDays) {
      const dayEvents = eventsByDay.get(day) ?? [];
      const eventsHeight = dayEvents.length > 0 
        ? dayEvents.length * EVENT_ROW_HEIGHT 
        : EVENT_ROW_HEIGHT; // Minimum height for "no events" message
      const dayHeight = DAY_HEADER_HEIGHT + HEADER_TO_EVENT_PADDING + eventsHeight + DAY_PADDING;
      dayHeights.set(day, dayHeight);
      totalHeight += dayHeight;
    }
    
    // Build day layouts
    const days: DayLayout[] = [];
    let currentY = 0;
    
    for (let i = 0; i < visibleDays.length; i++) {
      const day = visibleDays[i];
      const dayHeight = dayHeights.get(day) ?? DAY_HEADER_HEIGHT + HEADER_TO_EVENT_PADDING + DAY_PADDING;
      
      days.push({
        day,
        index: i,
        headerBounds: {
          x: 0,
          y: currentY,
          width: canvasWidth,
          height: DAY_HEADER_HEIGHT,
        },
        contentBounds: {
          x: 0,
          y: currentY + DAY_HEADER_HEIGHT + HEADER_TO_EVENT_PADDING,
          width: canvasWidth,
          height: dayHeight - DAY_HEADER_HEIGHT - HEADER_TO_EVENT_PADDING,
        },
      });
      
      currentY += dayHeight;
    }
    
    // Build event layouts - simple list rows sorted by start time
    const eventLayouts: EventLayout[] = [];
    
    for (const dayLayout of days) {
      const dayEvents = eventsByDay.get(dayLayout.day) ?? [];
      
      // Sort events by start time
      const sortedEvents = [...dayEvents].sort((a, b) => 
        a.startTime.toMinutes() - b.startTime.toMinutes()
      );
      
      for (let i = 0; i < sortedEvents.length; i++) {
        const event = sortedEvents[i];
        const backgroundColor = this.extractBackgroundColor(event) ?? this.theme.eventDefaultColor;
        
        eventLayouts.push({
          event,
          bounds: {
            x: HORIZONTAL_PADDING,
            y: dayLayout.contentBounds.y + i * EVENT_ROW_HEIGHT,
            width: canvasWidth - HORIZONTAL_PADDING * 2,
            height: EVENT_ROW_HEIGHT - 4, // 4px gap between rows
          },
          isOverflow: false,
          backgroundColor,
          textColor: this.theme.eventTextColor,
          opacity: 1,
          scale: 1,
        });
      }
    }
    
    // Return mobile layout
    return {
      canvasWidth,
      canvasHeight: totalHeight,
      gridBounds: {
        x: 0,
        y: 0,
        width: canvasWidth,
        height: totalHeight,
      },
      dayHeaderBounds: { x: 0, y: 0, width: 0, height: 0 },
      timeAxisBounds: { x: 0, y: 0, width: 0, height: 0 },
      intersectionBounds: { x: 0, y: 0, width: 0, height: 0 },
      days,
      timeSlots: [], // No time slots in mobile view
      events: eventLayouts,
      orientation: ScheduleOrientation.Vertical, // Always vertical in mobile
      devicePixelRatio,
      zoomedDay: null, // No zooming in mobile
      isMobile: true,
    };
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
