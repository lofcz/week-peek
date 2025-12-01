import type {
  ScheduleConfig,
  ScheduleEvent,
  AxisConfiguration,
  LaneInfo,
  DayOfWeek
} from './types';
import type { Result } from './types/internal';
import { WORK_WEEK_DAYS, TimeSlotInterval, ScheduleOrientation, TimeOnly, IconConfig } from './types';

import { validateConfig, validateEvent } from './utils/validators';
import { calculateEventPosition, groupEventsByDay, assignLanes } from './utils/layoutHelpers';
import { createTimeLabelHTML, generateTimeSlots } from './templates/timeAxisTemplate';
import { createDayHeaderHTML } from './templates/dayColumnTemplate';
import { createEventHTML, createEventHTMLHorizontal } from './templates/eventTemplate';
import './styles/main.scss';

/**
 * Weekly Schedule Component
 * Displays a generic weekly schedule with events positioned by day and time
 */
export class WeeklySchedule {
  private container: HTMLElement;
  private config: ScheduleConfig;
  private events: ScheduleEvent[];
  private allEvents: ScheduleEvent[];
   private originalVisibleDays: DayOfWeek[];
   private zoomedDay: DayOfWeek | null = null;
  private pendingScrollTargetId: string | null = null;



  /**
   * Factory method to create a WeeklySchedule instance with validation
   * @param container - DOM element where schedule will be rendered
   * @param config - Configuration options
   * @param events - Array of events to display (default: empty array)
   * @returns Result containing either the WeeklySchedule instance or an error
   */
  static create(
    container: HTMLElement,
    config: ScheduleConfig,
    events: ScheduleEvent[] = []
  ): Result<WeeklySchedule, Error> {
    if (!container || !(container instanceof HTMLElement)) {
      return {
        success: false,
        error: new Error('Container must be a valid HTMLElement')
      };
    }

    const configValidation = validateConfig(config);
    if (!configValidation.success) {
      const errorMessages = configValidation.error.map(e => e.message).join(', ');
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errorMessages}`)
      };
    }

    const eventErrors: string[] = [];
    events.forEach((event, index) => {
      const result = validateEvent(event);
      if (!result.success) {
        result.error.forEach(err => {
          eventErrors.push(`events[${index}].${err.field}: ${err.message}`);
        });
      }
    });

    if (eventErrors.length > 0) {
      return {
        success: false,
        error: new Error(`Invalid events: ${eventErrors.join(', ')}`)
      };
    }

    const instance = new WeeklySchedule(container, config, events);
    return {
      success: true,
      data: instance
    };
  }

  /**
   * Private constructor - use WeeklySchedule.create() instead
   * @param container - DOM element where schedule will be rendered
   * @param config - Configuration options (already validated)
   * @param events - Array of events (already validated)
   */
  private constructor(container: HTMLElement, config: ScheduleConfig, events: ScheduleEvent[] = []) {
    this.container = container;
    this.events = [...events];
    this.allEvents = [...events];
    this.config = {
      visibleDays: config.visibleDays || [...WORK_WEEK_DAYS],
      startHour: config.startHour ?? 9,
      endHour: config.endHour ?? 17,
      timeSlotInterval: config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes,
      showDayHeaders: config.showDayHeaders ?? true,
      className: config.className || '',
      dayNameTranslations: config.dayNameTranslations,
      theme: config.theme || undefined,
      orientation: config.orientation ?? ScheduleOrientation.Vertical,
      width: config.width,
      height: config.height,
      icons: config.icons
    } as ScheduleConfig;

    this.originalVisibleDays = [...(this.config.visibleDays || WORK_WEEK_DAYS)];

    this.attachEventListeners();
    this.render();

  }

  /**
   * Render the schedule component
   */
  render(): void {
    // Filter events by visible days and time range
    const startTime = new TimeOnly(this.config.startHour!, 0);
    
    const visibleEvents = this.events.filter(event => {
      // Filter by visible days
      if (!this.config.visibleDays!.includes(event.day)) {
        return false;
      }
      
      // Filter by time range - event must start within the visible time range
      // Events that start before startHour are filtered out
      // Events must start at or after startTime
      return !event.startTime.isBefore(startTime);
    });
    
    const axisConfiguration = this.getAxisConfiguration();
    const headerAxis = this.createAxis(ScheduleOrientation.Horizontal, axisConfiguration.headerAxisData);
    const crossAxis = this.createAxis(ScheduleOrientation.Vertical, axisConfiguration.crossAxisData);

    // Build style string with CSS variables and optional width/height
    let styleString = `--num-columns: ${axisConfiguration.numColumns}; --num-rows: ${axisConfiguration.numRows}; --header-height: ${axisConfiguration.headerHeight}; --cross-axis-width: ${axisConfiguration.crossAxisWidth};`;
    if (this.config.width) {
      styleString += ` width: ${this.config.width};`;
    }
    if (this.config.height) {
      styleString += ` height: ${this.config.height};`;
    }

    const orientationClass = this.config.orientation === ScheduleOrientation.Horizontal ? 'horizontal' : 'vertical';
    const zoomClass = this.zoomedDay !== null ? 'zoomed' : '';

    // New unified 2x1 layout: top row combines intersection + header axis; body scroll contains time axis + events.
    if (this.zoomedDay !== null && this.config.orientation === ScheduleOrientation.Vertical) {
      styleString += ' --slot-row-height: 64px;';
    }
    let html: string;
    if (this.config.orientation === ScheduleOrientation.Horizontal) {
      // Horizontal: use a left column for day headers; time axis + events are in scroll to the right
      html = `
        <div 
          class="weekly-schedule ${orientationClass} ${zoomClass} ${this.config.className!}"
          style="${styleString}"
        >
          <div class="schedule-left">
            <div class="schedule-intersection">${this.renderIntersection()}</div>
            ${crossAxis}
          </div>
          <div class="schedule-scroll">
            ${headerAxis}
            ${this.createEventsGrid(visibleEvents)}
          </div>
        </div>
      `;
    } else {
      // Vertical: day headers remain in top section; time axis + events scroll vertically
      html = `
        <div 
          class="weekly-schedule ${orientationClass} ${zoomClass} ${this.config.className!}"
          style="${styleString}"
        >
          <div class="schedule-top">
            <div class="schedule-intersection">${this.renderIntersection()}</div>
            ${headerAxis}
          </div>
          <div class="schedule-main">
            <div class="schedule-scroll">
              ${crossAxis}
              ${this.createEventsGrid(visibleEvents)}
            </div>
          </div>
        </div>
      `;
    }


    this.container.innerHTML = html;

    // If zoomed to a single day, scroll to earliest event for that day
    if (this.zoomedDay !== null) {
      // Prefer pending specific target if set (e.g., from overflow click)
      if (this.pendingScrollTargetId) {
        const targetEl = this.container.querySelector<HTMLElement>(`.events-grid .event[data-event-id="${this.pendingScrollTargetId}"]`);
        if (targetEl) {
          setTimeout(() => this.scrollToElementInScroll(targetEl), 0);
        }
        this.pendingScrollTargetId = null;
      } else {
        const day = this.zoomedDay;
        const dayEvents = this.events
          .filter(ev => ev.day === day)
          .sort((a, b) => a.startTime.toMinutes() - b.startTime.toMinutes());
        if (dayEvents.length > 0) {
          const firstId = String(dayEvents[0].id);
          const firstEl = this.container.querySelector<HTMLElement>(`.events-grid .event[data-event-id="${firstId}"]`);
          if (firstEl) {
            setTimeout(() => this.scrollToElementInScroll(firstEl), 0);
          }
        }
      }
    }
  }

    private renderIntersection(): string {
      if (this.zoomedDay === null) {
        const iconClass = this.config.icons?.className ? this.config.icons.className : '';
        const ctaIcon = this.config.icons?.cta ?? '🔍';
        return `<div class="zoom-hint" aria-live="polite"><span class="zoom-hint-icon ${iconClass}" aria-hidden="true">${ctaIcon}</span></div>`;
      }
      return `<button class="zoom-reset-btn" aria-label="Back to week">Back to week</button>`;
    }




  private getAxisConfiguration(): AxisConfiguration {

    const isHorizontal = this.config.orientation === ScheduleOrientation.Horizontal;
    const timeSlots = generateTimeSlots(this.config.startHour!, this.config.endHour!, this.config.timeSlotInterval!);
    
    const daysForHeader = this.originalVisibleDays || this.config.visibleDays!;
    const daysHtml = daysForHeader.map(day => createDayHeaderHTML(day, this.config.dayNameTranslations, this.zoomedDay, this.config.icons as IconConfig)).join('');
    const timeSlotsHtml = timeSlots.map(time => createTimeLabelHTML(time)).join('');
  
    if (isHorizontal) {
      return {
        headerHeight: '40px',
        crossAxisWidth: '100px',
        numColumns: timeSlots.length,
        numRows: this.config.visibleDays!.length,
        headerAxisData: timeSlotsHtml,
        crossAxisData: daysHtml
      };
    } else {
      return {
        headerHeight: '40px',
        crossAxisWidth: '60px',
        numColumns: this.config.visibleDays!.length,
        numRows: timeSlots.length,
        headerAxisData: daysHtml,
        crossAxisData: timeSlotsHtml
      };
    }
  }

  private createAxis(axisDirection: ScheduleOrientation, axisContent: string): string {
    const axisClass = axisDirection === ScheduleOrientation.Horizontal 
      ? 'axis-horizontal' 
      : 'axis-vertical';
    
    return `<div class="${axisClass}">${axisContent}</div>`;
  }

  /**
   * Create events grid HTML
   * @private
   */
   private createEventsGrid(events: ScheduleEvent[]): string {
     // Constants for overflow handling (normal mode only)
     const OVERLAP_HIDE_THRESHOLD = 3; // if group size > 3
     const OVERLAP_VISIBLE_COUNT = 2; // show first 2

     const eventsByDay = groupEventsByDay(events);
     const laneMaps = new Map<DayOfWeek, Map<string, LaneInfo>>();

     // If zoomed, render all events without compression
     if (this.zoomedDay !== null) {
       for (const [day, dayEvents] of eventsByDay.entries()) {
         laneMaps.set(day, assignLanes(dayEvents));
       }
       const positionedZoomEvents = events
         .map(event => {
           const laneInfo = laneMaps.get(event.day)?.get(event.id);
           return this.createPositionedEvent(event, laneInfo);
         })
         .join('');
       return `<div class="events-grid">${positionedZoomEvents}</div>`;
     }

     // Normal mode: compress conflict groups per day
     const compressedEvents: ScheduleEvent[] = [];
     for (const [day, dayEvents] of eventsByDay.entries()) {
       // Sort by start for stable selection
       const sorted = [...dayEvents].sort((a, b) => a.startTime.toMinutes() - b.startTime.toMinutes());

       // Build conflict groups (transitive overlap)
       const conflictGroups: ScheduleEvent[][] = [];
       for (const ev of sorted) {
         let placed = false;
         for (const group of conflictGroups) {
           if (group.some(g => g.day === ev.day && !(g.endTime.toMinutes() <= ev.startTime.toMinutes() || g.startTime.toMinutes() >= ev.endTime.toMinutes()))) {
             group.push(ev);
             placed = true;
             break;
           }
         }
         if (!placed) conflictGroups.push([ev]);
       }

       for (const group of conflictGroups) {
         const groupSize = group.length;
         if (groupSize > OVERLAP_HIDE_THRESHOLD) {
           const visible = group.slice(0, OVERLAP_VISIBLE_COUNT);
           const hiddenCount = groupSize - OVERLAP_VISIBLE_COUNT;
           const earliest = group.reduce((min, e) => (e.startTime.toMinutes() < min.startTime.toMinutes() ? e : min), group[0]);
           const latest = group.reduce((max, e) => (e.endTime.toMinutes() > max.endTime.toMinutes() ? e : max), group[0]);
           const overflowEvent: ScheduleEvent = {
             id: `overflow-${day}-${earliest.id}`,
             day,
             startTime: earliest.startTime,
             endTime: latest.endTime,
             title: `+${hiddenCount} more`,
             description: undefined,
             className: 'event-overflow-indicator'
           };
           compressedEvents.push(...visible, overflowEvent);
         } else {
           compressedEvents.push(...group);
         }
       }

       const compressedDayEvents = compressedEvents.filter(e => e.day === day);
       laneMaps.set(day, assignLanes(compressedDayEvents));
     }

     const positionedEvents = compressedEvents
       .map(event => {
         const laneInfo = laneMaps.get(event.day)?.get(event.id);
         return this.createPositionedEvent(event, laneInfo);
       })
       .join('');

     return `<div class="events-grid">${positionedEvents}</div>`;
   }

  /**
   * Create positioned event HTML with grid styling (relative to events grid)
   * Uses absolute positioning for fractional time offsets
   * @param event - Event to position
   * @param laneInfo - Optional lane assignment for overlapping events
   * @private
   */
  private createPositionedEvent(event: ScheduleEvent, laneInfo?: LaneInfo): string {
    const layout = calculateEventPosition(
      event,
      this.config.startHour!,
      this.config.timeSlotInterval!,
      this.config.visibleDays!,
      this.config.orientation!,
      laneInfo
    );

    // Use different rendering method based on orientation
    const eventHTML = this.config.orientation === ScheduleOrientation.Horizontal
      ? createEventHTMLHorizontal(event, laneInfo)
      : createEventHTML(event, laneInfo);
    
    // Base grid positioning (integer cell positions)
    const gridStyle = `grid-row: ${layout.gridRowStart} / ${layout.gridRowEnd}; grid-column: ${layout.gridColumnStart} / ${layout.gridColumnEnd};`;
    
    // Add absolute positioning for fractional offsets
    // Positioning values are calculated in calculateEventPosition based on orientation
    // Both time-based positioning and lane-based positioning are always applied
    let positioningStyle = 'position: absolute;';
    if (layout.leftPercent !== undefined) {
      positioningStyle += ` left: ${layout.leftPercent}%;`;
    }
    if (layout.widthPercent !== undefined) {
      positioningStyle += ` width: ${layout.widthPercent}%;`;
    }
    if (layout.topPercent !== undefined) {
      positioningStyle += ` top: ${layout.topPercent}%;`;
    }
    if (layout.heightPercent !== undefined) {
      positioningStyle += ` height: ${layout.heightPercent}%;`;
    }
    
    const fullStyle = `${gridStyle} ${positioningStyle}`;
    
    if (eventHTML.includes('style="')) {
      return eventHTML.replace(
        'style="',
        `style="${fullStyle} `
      );
    } else {
      return eventHTML.replace(
        'class="event',
        `class="event" style="${fullStyle}`
      );
    }
  }

  private attachEventListeners(): void {
     this.container.addEventListener('click', (e: Event) => {
       const target = e.target as HTMLElement;
 
       // Intersection reset button
       const resetBtn = target.closest('.zoom-reset-btn');
       if (resetBtn) {
         this.resetZoom();
         return;
       }

       // (Removed time window scroll controls)


      // Day header click to toggle zoom
      const dayHeader = target.closest('.day-header');
      if (dayHeader) {
        const dayAttr = (dayHeader as HTMLElement).getAttribute('data-day');
        if (dayAttr) {
          const day = Number(dayAttr) as DayOfWeek;
          if (this.zoomedDay === day) {
            this.resetZoom();
          } else {
            this.zoomToDay(day);
          }
        }
        return;
      }

       // Event click dispatch or overflow zoom
       const eventEl = target.closest('.event');
       if (!eventEl) {
         return;
       }

      // Overflow indicator: zoom to that day and scroll to the cluster's first event
      if (eventEl.classList.contains('event-overflow-indicator')) {
        const id = eventEl.getAttribute('data-event-id') || '';
        const parts = id.split('-');
        const dayNum = Number(parts[1]);
        const earliestId = parts.slice(2).join('-');
        if (!isNaN(dayNum)) {
          // Set pending scroll to the earliest event in the cluster after zoom
          this.pendingScrollTargetId = earliestId || null;
          this.zoomToDay(dayNum as DayOfWeek);
        }
        return;
      }

       const eventId = eventEl.getAttribute('data-event-id');
       const scheduleEvent = this.events.find(ev => ev.id === eventId);
       if (!scheduleEvent) {
         return;
       }

       const customEvent = new CustomEvent('schedule-event-click', {
         detail: { event: scheduleEvent },
         bubbles: true,
         cancelable: true
       });
       this.container.dispatchEvent(customEvent);
    });
  }

  /**
   * Scroll the schedule scroll container to make the element visible.
   */
  private scrollToElementInScroll(el: HTMLElement): void {
    if (!el) return;
    const root = this.container.querySelector('.weekly-schedule');
    const scroll = root?.querySelector<HTMLElement>('.schedule-scroll');
    if (!scroll) return;

    const elRect = el.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const offsetTop = elRect.top - scrollRect.top + scroll.scrollTop;
    const offsetLeft = elRect.left - scrollRect.left + scroll.scrollLeft;

    if (this.config.orientation === ScheduleOrientation.Vertical) {
      scroll.scrollTop = Math.max(0, Math.floor(offsetTop));
    } else {
      scroll.scrollLeft = Math.max(0, Math.floor(offsetLeft));
    }
  }


  /**
   * Get current events array (copy)
   */
  getEvents(): ScheduleEvent[] {
    return [...this.events];
  }

  /**
   * Filter events at runtime using a predicate function.
   * The predicate receives each event and should return true to keep it, false to remove it.
   * Triggers a re-render on success.
   */
  filterEvents(predicate: (event: ScheduleEvent) => boolean): Result<void, Error> {
    try {
      if (typeof predicate !== 'function') {
        return {
          success: false,
          error: new Error('Predicate must be a function')
        };
      }
      this.events = this.allEvents.filter(ev => {
        try {
          return !!predicate(ev);
        } catch (e) {
          // If predicate throws, treat as "do not include"
          return false;
        }
      });
      this.render();
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  /**
   * Clear any active event filtering and restore original events.
   */
  clearFilter(): Result<void, Error> {
    try {
      this.events = [...this.allEvents];
      this.render();
      return { success: true, data: undefined };
    } catch (err) {
      return { success: false, error: err as Error };
    }
  }

  /**
   * Get current configuration (copy)
   */
  getConfig(): ScheduleConfig {
    return { ...this.config };
  }

  /**
   * Update events and re-render
   * @param events - New events array
   * @returns Result indicating success or failure
   */
  updateEvents(events: ScheduleEvent[]): Result<void, Error> {
    const errors: string[] = [];
    
    events.forEach((event, index) => {
      const result = validateEvent(event);
      if (!result.success) {
        result.error.forEach(err => {
          errors.push(`events[${index}].${err.field}: ${err.message}`);
        });
      }
    });
    
    if (errors.length > 0) {
      return {
        success: false,
        error: new Error(`Invalid events: ${errors.join(', ')}`)
      };
    }
    
    this.events = [...events];
    this.allEvents = [...events];
    this.render();
    
    return {
      success: true,
      data: undefined
    };
  }

    zoomToDay(day: DayOfWeek): void {
      if (!this.originalVisibleDays) {
        this.originalVisibleDays = [...(this.config.visibleDays || WORK_WEEK_DAYS)];
      }
      this.zoomedDay = day;
      // Keep full original time range; just restrict visible days
      this.updateConfig({ visibleDays: [day] });
    }



    resetZoom(): void {
      if (this.zoomedDay === null) return;
      this.zoomedDay = null;
      this.updateConfig({ visibleDays: this.originalVisibleDays });
    }



  /**
   * Update configuration and re-render
   * @param newConfig - Partial configuration to merge
   * @returns Result indicating success or failure
   */
    updateConfig(newConfig: Partial<ScheduleConfig>): Result<void, Error> {

 
     const mergedConfig: ScheduleConfig = {
       ...this.config,
       ...newConfig
     };


    const validation = validateConfig(mergedConfig);
    if (!validation.success) {
      const errorMessages = validation.error.map(e => e.message).join(', ');
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errorMessages}`)
      };
    }

    this.config = {
      visibleDays: mergedConfig.visibleDays || this.config.visibleDays!,
      startHour: mergedConfig.startHour ?? this.config.startHour!,
      endHour: mergedConfig.endHour ?? this.config.endHour!,
      timeSlotInterval: mergedConfig.timeSlotInterval ?? this.config.timeSlotInterval!,
      showDayHeaders: mergedConfig.showDayHeaders ?? this.config.showDayHeaders!,
      className: mergedConfig.className || this.config.className!,
      dayNameTranslations: mergedConfig.dayNameTranslations,
      theme: mergedConfig.theme || undefined,
      orientation: mergedConfig.orientation ?? this.config.orientation!,
      width: mergedConfig.width ?? this.config.width,
      height: mergedConfig.height ?? this.config.height
    } as ScheduleConfig;

    this.render();
    
    return {
      success: true,
      data: undefined
    };
  }

  /**
   * Clean up component and remove event listeners
   */
  destroy(): void {
    this.container.innerHTML = '';
    this.events = [];
  }
}

