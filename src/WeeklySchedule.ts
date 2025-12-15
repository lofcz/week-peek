import type {
  ScheduleConfig,
  ScheduleEvent,
  AxisConfiguration,
  LaneInfo,
  DayOfWeek,
  RenderContext
} from './types';
import type { Result } from './types/internal';
import { WORK_WEEK_DAYS, TimeSlotInterval, ScheduleOrientation, TimeOnly, IconConfig, getDayName, TranslationKey } from './types';

import { validateConfig, validateEvent } from './utils/validators';
import { calculateEventPosition, groupEventsByDay, assignLanes } from './utils/layoutHelpers';
import { createTimeLabelHTML, generateTimeSlots } from './templates/timeAxisTemplate';
import { createDayHeaderHTML, createZoomedDayHeaderHTML } from './templates/dayColumnTemplate';
import { createEventHTML, createOverflowIndicatorHTML } from './templates/eventTemplate';
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
  private resizeObserver: ResizeObserver;
  private hoveredElement: HTMLElement | null = null;
  private hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  private attachHoverListenersTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentFilter: ((event: ScheduleEvent) => boolean) | null = null;

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

      className: config.className || '',
      dayNameTranslations: config.dayNameTranslations,

      orientation: config.orientation ?? ScheduleOrientation.Vertical,
      icons: config.icons,
      renderEvent: config.renderEvent,
      eventGap: config.eventGap,
      overflowIndicatorFormat: config.overflowIndicatorFormat,
      translations: config.translations,
    } as ScheduleConfig;

    this.originalVisibleDays = [...(this.config.visibleDays || WORK_WEEK_DAYS)];

    this.attachEventListeners();

    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(this.container);

    // Initial render
    this.render();
  }

  /**
   * Render the schedule component
   */
  render(): void {
    const updateDOM = () => {
      const isMobile = this.container.offsetWidth < 768; // Breakpoint for mobile view
      const orientationClass = this.config.orientation === ScheduleOrientation.Horizontal ? 'horizontal' : 'vertical';
      const zoomClass = this.zoomedDay !== null ? 'zoomed' : '';
      const mobileClass = isMobile ? 'mobile' : '';

      const axisConfiguration = this.getAxisConfiguration();
      let styleString = `
        --num-columns: ${axisConfiguration.numColumns}; 
        --num-rows: ${axisConfiguration.numRows}; 
        --header-height: ${axisConfiguration.headerHeight}; 
        --cross-axis-width: ${axisConfiguration.crossAxisWidth};
      `;
      if (this.zoomedDay !== null && this.config.orientation === ScheduleOrientation.Vertical) {
        styleString += ' --slot-row-height: 64px;';
      }

      const html = `
        <div class="weekly-schedule ${orientationClass} ${zoomClass} ${mobileClass} ${this.config.className!}" style="${styleString}">
          ${isMobile ? this.renderMobileView() : this.renderClassicView()}
        </div>
      `;

      this.cleanupHoverListeners();
      this.container.innerHTML = html;
      this.attachHoverListenersTimeout = setTimeout(() => {
        this.attachHoverListeners();
        this.attachHoverListenersTimeout = null;
      }, 0);

      if (!isMobile && this.zoomedDay !== null) {
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
    };

    if ('startViewTransition' in document) {
      document.startViewTransition(() => {
        updateDOM();
      });
    } else {
      updateDOM();
    }
  }

  private renderClassicView(): string {
    const startTime = new TimeOnly(this.config.startHour!, 0);
    const visibleEvents = this.events.filter(event => {
      if (!this.config.visibleDays!.includes(event.day)) {
        return false;
      }

      return !event.startTime.isBefore(startTime);
    });

    const axisConfiguration = this.getAxisConfiguration();
    const headerAxis = this.createAxis(ScheduleOrientation.Horizontal, axisConfiguration.headerAxisData);
    const crossAxis = this.createAxis(ScheduleOrientation.Vertical, axisConfiguration.crossAxisData);

    // The classic view is wrapped in a div that receives the styles
    let viewHtml = '';
    if (this.config.orientation === ScheduleOrientation.Horizontal) {
      // Horizontal: use a left column for day headers; time axis + events are in scroll to the right
      viewHtml = `
        <div class="schedule-left">
          <div class="schedule-intersection">${this.renderIntersection()}</div>
          ${crossAxis}
        </div>
        <div class="schedule-scroll">
          ${headerAxis}
          ${this.createEventsGrid(visibleEvents)}
        </div>
      `;
    } else {
      // Vertical: day headers remain in top section; time axis + events scroll vertically
      viewHtml = `
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
      `;
    }
    return viewHtml;
  }

  private renderMobileView(): string {
    const eventsByDay = groupEventsByDay(this.events);
    let dayBlocksHtml = '';

    const daysToShow = this.originalVisibleDays || this.config.visibleDays || WORK_WEEK_DAYS;
    for (const day of daysToShow) {
      const dayEvents = (eventsByDay.get(day) || []).sort((a, b) => a.startTime.toMinutes() - b.startTime.toMinutes());

      dayBlocksHtml += `
        <div class="mobile-day-block">
          <div class="mobile-day-header">${getDayName(day, this.config.dayNameTranslations)}</div>
          <div class="mobile-event-list">
            ${dayEvents.map(event => {
              const eventClass = event.className ? ` ${event.className}` : '';
              const eventStyle = event.style ? ` style="${event.style}"` : '';
              return `
              <div class="mobile-event${eventClass}" data-event-id="${event.id}"${eventStyle}>
                <div class="mobile-event-time">${event.startTime.toString()}</div>
                <div class="mobile-event-details">
                  <div class="mobile-event-title">${event.title}</div>
                  <div class="mobile-event-duration">${event.startTime.toString()} - ${event.endTime.toString()}</div>
                </div>
              </div>
            `;
            }).join('') || `<div class="mobile-no-events">${this.config.translations?.[TranslationKey.mobileNoEvents] ?? 'No events for this day.'}</div>`}
          </div>
        </div>
      `;
    }

    return dayBlocksHtml;
  }

  private renderIntersection(): string {
    return "";
    // if (this.zoomedDay === null) {
    //   return "";
    // }
    // const iconClass = this.config.icons?.className ? ` ${this.config.icons.className}` : '';
    // const unzoomIcon = this.config.icons?.unzoom ?? '↺';
    // return `<button type="button" class="zoom-reset-btn" data-action="unzoom" aria-label="Back to week" role="button" tabindex="0"><span class="zoom-reset-icon${iconClass}" aria-hidden="true">${unzoomIcon}</span></button>`;
  }

  private getAxisConfiguration(): AxisConfiguration {

    const isHorizontal = this.config.orientation === ScheduleOrientation.Horizontal;
    const timeSlots = generateTimeSlots(this.config.startHour!, this.config.endHour!, this.config.timeSlotInterval!);

    if (this.zoomedDay !== null && !this.originalVisibleDays) {
      this.originalVisibleDays = [...(this.config.visibleDays || WORK_WEEK_DAYS)];
    }
    
    const daysForHeader = this.originalVisibleDays || this.config.visibleDays!;
    
    let daysHtml: string;
    if (this.zoomedDay !== null) {
      daysHtml = createZoomedDayHeaderHTML(
        this.zoomedDay,
        daysForHeader,
        this.config.dayNameTranslations,
        this.config.orientation,
        this.config.icons as IconConfig
      );
    } else {
      daysHtml = daysForHeader.map(day => createDayHeaderHTML(day, this.config.dayNameTranslations, this.zoomedDay, this.config.icons as IconConfig)).join('');
    }
    
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
   * Create events grid container with positioned events
   * @private
   */
  private createEventsGrid(events: ScheduleEvent[]): string {
    const eventsByDay = groupEventsByDay(events);
    const laneMaps = new Map<DayOfWeek, Map<string, LaneInfo>>();
    let eventsHtml = '';

    // If zoomed, render all events without compression
    if (this.zoomedDay !== null) {
      for (const [day, dayEvents] of eventsByDay.entries()) {
        laneMaps.set(day, assignLanes(dayEvents));
      }
      events.forEach(event => {
        const laneInfo = laneMaps.get(event.day)?.get(event.id);
        eventsHtml += this.createPositionedEvent(event, laneInfo);
      });
      return `<div class="events-grid">${eventsHtml}</div>`;
    }

    // Normal mode: compress based on lane assignment with priority-based lane swapping
    const compressedEvents: ScheduleEvent[] = [];
    for (const [day, dayEvents] of eventsByDay.entries()) {
      const dayLaneMap = assignLanes(dayEvents);
      
      // Determine visibility threshold based on total lanes
      const maxLaneIndex = Math.max(0, ...Array.from(dayLaneMap.values()).map(info => info.laneIndex));

      // If we have 3 or fewer lanes (indices 0, 1, 2), show all of them.
      // If we have more (index 3+), show only 2 (indices 0, 1) + overflow.
      const visibleThreshold = maxLaneIndex <= 2 ? 3 : 2;

      // Group events by lane index
      const eventsByLane = new Map<number, ScheduleEvent[]>();
      dayEvents.forEach(ev => {
        const info = dayLaneMap.get(ev.id);
        if (info) {
          if (!eventsByLane.has(info.laneIndex)) {
            eventsByLane.set(info.laneIndex, []);
          }
          eventsByLane.get(info.laneIndex)!.push(ev);
        }
      });

      // Calculate max priority for each lane
      const lanePriorities = new Map<number, number>();
      for (const [laneIndex, laneEvents] of eventsByLane.entries()) {
        const maxPriority = Math.max(...laneEvents.map(ev => ev.lanePriority ?? 0));
        lanePriorities.set(laneIndex, maxPriority);
      }

      // Determine which lanes are visible vs hidden based on threshold
      const visibleLaneIndices = new Set<number>();
      const hiddenLaneIndices = new Set<number>();
      for (const laneIndex of eventsByLane.keys()) {
        if (laneIndex < visibleThreshold) {
          visibleLaneIndices.add(laneIndex);
        } else {
          hiddenLaneIndices.add(laneIndex);
        }
      }

      // Check if any hidden lane should swap with a visible lane based on priority
      // Find the hidden lane with highest priority
      let highestHiddenPriority = -Infinity;
      let highestHiddenLane = -1;
      for (const laneIndex of hiddenLaneIndices) {
        const priority = lanePriorities.get(laneIndex) ?? 0;
        if (priority > highestHiddenPriority) {
          highestHiddenPriority = priority;
          highestHiddenLane = laneIndex;
        }
      }

      // Find the visible lane with lowest priority (or last visible lane if equal)
      if (highestHiddenLane >= 0 && highestHiddenPriority > 0) {
        let lowestVisiblePriority = Infinity;
        let lowestVisibleLane = -1;
        for (const laneIndex of visibleLaneIndices) {
          const priority = lanePriorities.get(laneIndex) ?? 0;
          // Use <= to prefer higher lane indices (last visible lane) when priorities are equal
          if (priority < lowestVisiblePriority || (priority <= lowestVisiblePriority && laneIndex > lowestVisibleLane)) {
            lowestVisiblePriority = priority;
            lowestVisibleLane = laneIndex;
          }
        }

        // Swap if hidden lane has higher priority than lowest visible lane
        if (lowestVisibleLane >= 0 && highestHiddenPriority > lowestVisiblePriority) {
          visibleLaneIndices.delete(lowestVisibleLane);
          visibleLaneIndices.add(highestHiddenLane);
          hiddenLaneIndices.delete(highestHiddenLane);
          hiddenLaneIndices.add(lowestVisibleLane);
        }
      }

      // Split events into visible and hidden based on final lane visibility
      const visibleDayEvents: ScheduleEvent[] = [];
      const hiddenDayEvents: ScheduleEvent[] = [];
      
      dayEvents.forEach(ev => {
        const info = dayLaneMap.get(ev.id);
        if (info && visibleLaneIndices.has(info.laneIndex)) {
          visibleDayEvents.push(ev);
        } else {
          hiddenDayEvents.push(ev);
        }
      });

      // 3. Cluster hidden events and create overflow indicators
      if (hiddenDayEvents.length > 0) {
          // Sort hidden by start time for clustering
          hiddenDayEvents.sort((a, b) => a.startTime.toMinutes() - b.startTime.toMinutes());
          
          let currentCluster: ScheduleEvent[] = [hiddenDayEvents[0]];
          let currentClusterEnd = hiddenDayEvents[0].endTime.toMinutes();
          
          const addOverflowForCluster = (cluster: ScheduleEvent[]) => {
             const earliest = cluster.reduce((min, e) => (e.startTime.toMinutes() < min.startTime.toMinutes() ? e : min), cluster[0]);
             const latest = cluster.reduce((max, e) => (e.endTime.toMinutes() > max.endTime.toMinutes() ? e : max), cluster[0]);
             const hiddenCount = cluster.length;
             const title = this.config.overflowIndicatorFormat ? this.config.overflowIndicatorFormat(hiddenCount) : `+${hiddenCount} more`;

             const overflowEvent: ScheduleEvent = {
                id: `overflow-${day}-${earliest.id}`,
                day,
                startTime: earliest.startTime,
                endTime: latest.endTime,
                title,
                description: undefined,
                className: 'event-overflow-indicator'
             };
             compressedEvents.push(overflowEvent);
          };

          for (let i = 1; i < hiddenDayEvents.length; i++) {
              const ev = hiddenDayEvents[i];
              const start = ev.startTime.toMinutes();
              const end = ev.endTime.toMinutes();
              
              if (start < currentClusterEnd) {
                  currentCluster.push(ev);
                  currentClusterEnd = Math.max(currentClusterEnd, end);
              } else {
                  addOverflowForCluster(currentCluster);
                  currentCluster = [ev];
                  currentClusterEnd = end;
              }
          }
          addOverflowForCluster(currentCluster);
      }
      
      compressedEvents.push(...visibleDayEvents);
      
      // Re-assign lanes for the compressed set of events
      const compressedDayEvents = compressedEvents.filter(e => e.day === day);
      laneMaps.set(day, assignLanes(compressedDayEvents));
    }

    compressedEvents.forEach(event => {
      const laneInfo = laneMaps.get(event.day)?.get(event.id);
      eventsHtml += this.createPositionedEvent(event, laneInfo);
    });

    return `<div class="events-grid">${eventsHtml}</div>`;
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
      laneInfo,
      this.config.eventGap
    );

    const isOverflowIndicator = event.className?.includes('event-overflow-indicator');
    const renderContext: RenderContext = { 
      laneInfo, 
      orientation: this.config.orientation!, 
      isZoomed: this.zoomedDay !== null 
    };
    const eventHTML = isOverflowIndicator 
    ? createOverflowIndicatorHTML(event, laneInfo) 
    : createEventHTML(event, renderContext, this.config.renderEvent);

    // Base grid positioning (integer cell positions)
    const gridStyle = `grid-row: ${layout.gridRowStart} / ${layout.gridRowEnd}; grid-column: ${layout.gridColumnStart} / ${layout.gridColumnEnd};`;

    const safeId = event.id.replace(/[^a-zA-Z0-9-_]/g, '_');
    const transitionStyle = `view-transition-name: event-${safeId};`;

    // Add absolute positioning for fractional offsets
    // Positioning values are calculated in calculateEventPosition based on orientation
    // Both time-based positioning and lane-based positioning are always applied
    let positioningStyle = 'position: absolute;';
    
    // Determine if gap should be applied (only for events in lanes with gap configured)
    // Don't apply gap to the last event in a lane (no gap after the last element)
    const isLastInLane = laneInfo && laneInfo.laneIndex === laneInfo.totalLanes - 1;
    const shouldApplyGap = layout.gap !== undefined && laneInfo && laneInfo.totalLanes > 1 && !isLastInLane;
    const gapValue = shouldApplyGap ? (typeof layout.gap === 'number' ? `${layout.gap}px` : layout.gap) : undefined;
    
    if (layout.leftPercent !== undefined) {
      positioningStyle += ` left: ${layout.leftPercent}%;`;
    }
    if (layout.widthPercent !== undefined) {
      // Gap applies to width in vertical orientation (lane dimension)
      // In horizontal orientation, width is time dimension, so no gap
      if (shouldApplyGap && this.config.orientation === ScheduleOrientation.Vertical) {
        positioningStyle += ` width: calc(${layout.widthPercent}% - ${gapValue});`;
      } else {
        positioningStyle += ` width: ${layout.widthPercent}%;`;
      }
    }
    if (layout.topPercent !== undefined) {
      positioningStyle += ` top: ${layout.topPercent}%;`;
    }
    if (layout.heightPercent !== undefined) {
      // Gap applies to height in horizontal orientation (lane dimension)
      // In vertical orientation, height is time dimension, so no gap
      if (shouldApplyGap && this.config.orientation === ScheduleOrientation.Horizontal) {
        positioningStyle += ` height: calc(${layout.heightPercent}% - ${gapValue});`;
      } else {
        positioningStyle += ` height: ${layout.heightPercent}%;`;
      }
    }

    const fullStyle = `${gridStyle} ${positioningStyle} ${transitionStyle}`;

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

      const unzoomBtn = target.closest('[data-action="unzoom"]');
      if (unzoomBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.resetZoom();
        return;
      }

      const prevDayBtn = target.closest('[data-action="prev-day"]');
      if (prevDayBtn && !prevDayBtn.hasAttribute('disabled')) {
        e.preventDefault();
        e.stopPropagation();
        const dayAttr = prevDayBtn.getAttribute('data-day');
        if (dayAttr) {
          const day = Number(dayAttr) as DayOfWeek;
          this.zoomToDay(day);
        }
        return;
      }

      const nextDayBtn = target.closest('[data-action="next-day"]');
      if (nextDayBtn && !nextDayBtn.hasAttribute('disabled')) {
        e.preventDefault();
        e.stopPropagation();
        const dayAttr = nextDayBtn.getAttribute('data-day');
        if (dayAttr) {
          const day = Number(dayAttr) as DayOfWeek;
          this.zoomToDay(day);
        }
        return;
      }

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
      if (eventEl) {
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
        // Do not return here, allow other handlers to process
      }

      const mobileEventEl = target.closest('.mobile-event');
      if (mobileEventEl) {
        const eventId = mobileEventEl.getAttribute('data-event-id');
        const scheduleEvent = this.allEvents.find(ev => ev.id === eventId);
        if (!scheduleEvent) return;
        const customEvent = new CustomEvent('schedule-event-click', {
          detail: { event: scheduleEvent },
          bubbles: true,
          cancelable: true
        });
        this.container.dispatchEvent(customEvent);
        return;
      }
    });
  }

  /**
   * Clean up hover state before re-rendering
   */
  private cleanupHoverListeners(): void {
    if (this.hoverTimeout !== null) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // Cancel any pending attachHoverListeners timeout to prevent duplicate listeners
    if (this.attachHoverListenersTimeout !== null) {
      clearTimeout(this.attachHoverListenersTimeout);
      this.attachHoverListenersTimeout = null;
    }

    // Reset hover state (element is already removed from DOM via innerHTML, so listeners are automatically cleaned up)
    this.hoveredElement = null;
  }

  /**
   * Attach hover listeners to event elements
   */
  private attachHoverListeners(): void {
    const scheduleRoot = this.container.querySelector('.weekly-schedule');
    if (scheduleRoot?.classList.contains('mobile')) {
      return;
    }

    const eventElements = this.container.querySelectorAll<HTMLElement>('.event:not(.event-overflow-indicator)');

    eventElements.forEach(element => {
      const enterHandler = (_e: MouseEvent) => {
        if (this.hoverTimeout !== null) {
          clearTimeout(this.hoverTimeout);
          this.hoverTimeout = null;
        }

        if (this.hoveredElement === element) {
          return;
        }

        this.hoveredElement = element;

        const eventId = element.getAttribute('data-event-id');
        const event = this.allEvents.find(ev => ev.id === eventId);

        if (event) {
          this.container.dispatchEvent(new CustomEvent('schedule-event-hover', {
            detail: { event, element },
            bubbles: true,
            cancelable: true
          }));
        }
      };

      const leaveHandler = (_e: MouseEvent) => {
        if (this.hoveredElement !== element) {
          return;
        }

        this.hoveredElement = null;

        this.hoverTimeout = setTimeout(() => {
          const eventId = element.getAttribute('data-event-id');
          const event = this.allEvents.find(ev => ev.id === eventId);

          if (event) {
            this.container.dispatchEvent(new CustomEvent('schedule-event-hover-end', {
              detail: { event, element },
              bubbles: true,
              cancelable: true
            }));
          }
          this.hoverTimeout = null;
        }, 50);
      };

      element.addEventListener('mouseenter', enterHandler);
      element.addEventListener('mouseleave', leaveHandler);
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
      this.currentFilter = predicate;
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
      this.currentFilter = null;
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

    this.allEvents = [...events];
    
    // Reapply active filter if one exists
    if (this.currentFilter !== null) {
      this.events = this.allEvents.filter(ev => {
        try {
          return !!this.currentFilter!(ev);
        } catch (e) {
          // If predicate throws, treat as "do not include"
          return false;
        }
      });
    } else {
      this.events = [...this.allEvents];
    }
    
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
    if (this.zoomedDay === day) {
      return;
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
      visibleDays: mergedConfig.visibleDays || [...WORK_WEEK_DAYS],
      startHour: mergedConfig.startHour ?? 9,
      endHour: mergedConfig.endHour ?? 17,
      timeSlotInterval: mergedConfig.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes,
      className: mergedConfig.className ?? '',
      dayNameTranslations: mergedConfig.dayNameTranslations,
      orientation: mergedConfig.orientation ?? ScheduleOrientation.Vertical,
      icons: mergedConfig.icons,
      renderEvent: mergedConfig.renderEvent,
      eventGap: mergedConfig.eventGap,
      overflowIndicatorFormat: mergedConfig.overflowIndicatorFormat,
      translations: mergedConfig.translations,
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
    this.cleanupHoverListeners();
    this.container.innerHTML = '';
    this.events = [];
    this.resizeObserver.disconnect();
  }
}

