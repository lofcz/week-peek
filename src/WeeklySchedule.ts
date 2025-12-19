import type {
  ScheduleConfig,
  ScheduleEvent,
  DayOfWeek,
} from './types';
import type { Result } from './types/internal';
import { WORK_WEEK_DAYS, TimeSlotInterval, ScheduleOrientation } from './types';

import { validateConfig, validateEvent } from './utils/validators';
import { groupEventsByDay, assignLanes } from './utils/layoutHelpers';

import type { 
  ScheduleLayout, 
  CanvasTheme,
  HitTestResult,
  InteractionState,
  Rect,
  EventLayout,
} from './canvas/types';
import { LayoutEngine, type LayoutDimensions } from './canvas/LayoutEngine';
import { CanvasRenderer } from './canvas/CanvasRenderer';
import { GridRenderer, renderNowIndicator, type GridRendererConfig } from './canvas/GridRenderer';
import { EventRenderer, type EventRendererConfig } from './canvas/EventRenderer';
import { HitTester } from './canvas/HitTester';
import { AnimationManager } from './canvas/AnimationManager';

/**
 * Snapshot of an event's position for animation
 */
interface EventSnapshot {
  bounds: Rect;
  opacity: number;
  backgroundColor: string;
  textColor: string;
  day: DayOfWeek;
}

/**
 * Day column snapshot for animation
 */
interface DaySnapshot {
  day: DayOfWeek;
  headerBounds: Rect;
  contentBounds: Rect;
}

/**
 * Transition state for zoom animations
 */
interface ZoomTransition {
  /** Progress from 0 to 1 */
  progress: number;
  /** Start time of the animation */
  startTime: number;
  /** Duration in ms */
  duration: number;
  /** Snapshots of events before the transition */
  fromSnapshots: Map<string, EventSnapshot>;
  /** Snapshots of day columns before transition */
  fromDays: Map<DayOfWeek, DaySnapshot>;
  /** Target layout after the transition */
  toLayout: ScheduleLayout | null;
  /** Whether transitioning to zoomed state */
  isZoomingIn: boolean;
  /** The day being zoomed to (if zooming in) */
  targetDay: DayOfWeek | null;
  /** Canvas width for calculating slide distances */
  canvasWidth: number;
  /** Canvas height for calculating slide distances */
  canvasHeight: number;
}

/**
 * Canvas configuration options
 */
export interface CanvasConfig {
  /** Device pixel ratio override (default: window.devicePixelRatio) */
  devicePixelRatio?: number;
  /** Animation duration in ms (default: 300) */
  animationDuration?: number;
  /** Default easing function */
  defaultEasing?: 'linear' | 'easeOutCubic' | 'easeInOutCubic' | 'easeOutBack';
  /** Theme overrides */
  theme?: Partial<CanvasTheme>;
  /** Enable debug rendering */
  debug?: boolean;
}

/**
 * Extended configuration with canvas options
 */
export interface WeeklyScheduleConfig extends ScheduleConfig {
  /** Canvas-specific configuration */
  canvas?: CanvasConfig;
  /** Layout dimensions overrides */
  dimensions?: Partial<LayoutDimensions>;
  /** Grid renderer configuration */
  grid?: Partial<GridRendererConfig>;
  /** events renderer configuration */
  events?: Partial<EventRendererConfig>;
  /** Show "now" indicator line */
  showNowIndicator?: boolean;
  /** Debounce resize events (ms) */
  resizeDebounce?: number;
}

/**
 * Weekly Schedule Component
 * High-performance canvas-based weekly schedule display
 */
export class WeeklySchedule {
  // DOM elements
  private container: HTMLElement;
  private scrollContainer: HTMLElement;
  private contentSizer: HTMLElement;
  private canvasWrapper: HTMLElement;
  private canvas: HTMLCanvasElement;
  
  // Configuration
  private config: WeeklyScheduleConfig;
  
  // Data
  private allEvents: ScheduleEvent[];
  private events: ScheduleEvent[];
  private currentFilter: ((event: ScheduleEvent) => boolean) | null = null;
  
  // State
  private zoomedDay: DayOfWeek | null = null;
  private originalVisibleDays: DayOfWeek[];
  private layout: ScheduleLayout | null = null;
  private interactionState: InteractionState;
  
  // Scroll state
  private scrollX: number = 0;
  private scrollY: number = 0;
  private contentWidth: number = 0;
  private contentHeight: number = 0;
  
  // Rendering components
  private renderer: CanvasRenderer;
  private gridRenderer: GridRenderer;
  private eventRenderer: EventRenderer;
  private layoutEngine: LayoutEngine;
  private hitTester: HitTester;
  private animationManager: AnimationManager;
  
  // Observers and timers
  private resizeObserver: ResizeObserver;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private needsRender: boolean = false;
  
  // Hover tracking
  private hoverDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastHoveredEventId: string | null = null;

  // Hover animation state (brightness only, no scale)
  private hoverBrightness: Map<string, { current: number; target: number }> = new Map();
  
  // Zoom transition state for View Transition-style animations
  private zoomTransition: ZoomTransition | null = null;

  // Original container state for cleanup
  private originalContainerClasses: string;
  private originalContainerStyle: string;

  /**
   * Factory method to create a WeeklySchedule instance with validation
   * @param container - DOM element where schedule will be rendered
   * @param config - Configuration options
   * @param events - Array of events to display (default: empty array)
   * @returns Result containing either the WeeklySchedule instance or an error
   */
  static create(
    container: HTMLElement,
    config: WeeklyScheduleConfig,
    events: ScheduleEvent[] = []
  ): Result<WeeklySchedule, Error> {
    if (!container || !(container instanceof HTMLElement)) {
      return {
        success: false,
        error: new Error('Container must be a valid HTMLElement'),
      };
    }

    const configValidation = validateConfig(config);
    if (!configValidation.success) {
      const errorMessages = configValidation.error.map(e => e.message).join(', ');
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errorMessages}`),
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
        error: new Error(`Invalid events: ${eventErrors.join(', ')}`),
      };
    }

    const instance = new WeeklySchedule(container, config, events);
    return {
      success: true,
      data: instance,
    };
  }

  /**
   * Private constructor - use WeeklySchedule.create() instead
   */
  private constructor(
    container: HTMLElement,
    config: WeeklyScheduleConfig,
    events: ScheduleEvent[] = []
  ) {
    this.container = container;
    this.originalContainerClasses = container.className || '';
    this.originalContainerStyle = container.getAttribute('style') || '';
    
    this.allEvents = [...events];
    this.events = [...events];
    
    // Normalize configuration
    this.config = {
      visibleDays: config.visibleDays ?? [...WORK_WEEK_DAYS],
      startHour: config.startHour ?? 9,
      endHour: config.endHour ?? 17,
      timeSlotInterval: config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes,
      orientation: config.orientation ?? ScheduleOrientation.Vertical,
      dayNameTranslations: config.dayNameTranslations,
      icons: config.icons,
      eventGap: config.eventGap,
      overflowIndicatorFormat: config.overflowIndicatorFormat,
      translations: config.translations,
      canvas: config.canvas ?? {},
      dimensions: config.dimensions ?? {},
      grid: config.grid ?? {},
      events: config.events ?? {},
      showNowIndicator: config.showNowIndicator ?? false,
      resizeDebounce: config.resizeDebounce ?? 50,
    };

    this.originalVisibleDays = [...(this.config.visibleDays ?? WORK_WEEK_DAYS)];

    // Initialize interaction state
    this.interactionState = {
      hoveredEvent: null,
      hoveredDay: null,
      mousePosition: null,
      isMouseDown: false,
      dragStart: null,
      cursor: 'default',
    };

    // Set up container with scrollable structure
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.innerHTML = '';
    
    // Create scroll container - this provides native scrollbars
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow-x: auto;
      overflow-y: hidden;
    `;
    
    // Create content sizer - this defines the scrollable area size
    this.contentSizer = document.createElement('div');
    this.contentSizer.style.cssText = `
      position: relative;
    `;
    
    // Create canvas wrapper - contains the canvas at content size
    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;
    
    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      display: block;
      width: 100%;
      height: 100%;
      pointer-events: auto;
    `;
    
    // Assemble DOM structure
    this.canvasWrapper.appendChild(this.canvas);
    this.contentSizer.appendChild(this.canvasWrapper);
    this.scrollContainer.appendChild(this.contentSizer);
    this.container.appendChild(this.scrollContainer);

    // Initialize rendering components
    const theme: Partial<CanvasTheme> = this.config.canvas?.theme ?? {};
    this.renderer = new CanvasRenderer(this.canvas, theme);
    this.layoutEngine = new LayoutEngine(this.config, this.config.dimensions, theme);
    this.gridRenderer = new GridRenderer(this.renderer, {
      ...this.config.grid,
      dayNameTranslations: this.config.dayNameTranslations,
    });
    this.eventRenderer = new EventRenderer(this.renderer, this.config.events);
    this.hitTester = new HitTester();
    this.animationManager = new AnimationManager(
      this.config.canvas?.animationDuration ?? 300,
      this.config.canvas?.defaultEasing ?? 'easeOutCubic'
    );

    // Set up animation callback
    this.animationManager.setFrameCallback(() => {
      this.scheduleRender();
    });

    // Start continuous animation loop for smooth hover effects
    this.startAnimationLoop();

    // Set up event listeners
    this.attachEventListeners();

    // Set up resize observer
    this.resizeObserver = new ResizeObserver(this.handleResize.bind(this));
    this.resizeObserver.observe(this.container);

    // Initial render
    this.handleResize();
  }

  // ==================== Public API ====================

  /**
   * Get current events array (copy)
   */
  getEvents(): ScheduleEvent[] {
    return [...this.events];
  }

  /**
   * Update events and re-render
   * @param events - New events array
   * @returns Result indicating success or failure
   */
  updateEvents(events: ScheduleEvent[]): Result<void, Error> {
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
        error: new Error(`Invalid events: ${eventErrors.join(', ')}`),
      };
    }

    this.allEvents = [...events];
    this.applyFilter();
    this.invalidateLayout();
    this.scheduleRender();
    
    return { success: true, data: undefined };
  }

  /**
   * Filter events at runtime using a predicate function.
   * @param predicate - Function that returns true to keep event, false to hide
   * @returns Result indicating success or failure
   */
  filterEvents(predicate: (event: ScheduleEvent) => boolean): Result<void, Error> {
    if (typeof predicate !== 'function') {
      return {
        success: false,
        error: new Error('Predicate must be a function'),
      };
    }

    this.currentFilter = predicate;
    this.applyFilter();
    this.invalidateLayout();
    this.scheduleRender();
    
    return { success: true, data: undefined };
  }

  /**
   * Clear any active event filtering and restore original events.
   */
  clearFilter(): Result<void, Error> {
    this.currentFilter = null;
    this.events = [...this.allEvents];
    this.invalidateLayout();
    this.scheduleRender();
    
    return { success: true, data: undefined };
  }

  /**
   * Zoom to a specific day with animated transition
   */
  zoomToDay(day: DayOfWeek): void {
    if (this.zoomedDay === day) return;
    
    // Capture current layout state before transition
    this.captureLayoutSnapshot(true, day);

    this.zoomedDay = day;
    this.config.visibleDays = [day];
    this.layoutEngine.updateConfig({ visibleDays: [day] });
    
    // Compute new layout for the transition target
    this.invalidateLayout();
    this.computeLayout();
    
    if (this.zoomTransition && this.layout) {
      this.zoomTransition.toLayout = this.layout;
    }
    
    this.dispatchEvent('schedule-day-zoom', { day });
  }

  /**
   * Reset zoom to show all days with animated transition
   */
  resetZoom(): void {
    if (this.zoomedDay === null) return;

    // Capture current layout state before transition
    this.captureLayoutSnapshot(false, null);

    this.zoomedDay = null;
    this.config.visibleDays = [...this.originalVisibleDays];
    this.layoutEngine.updateConfig({ visibleDays: this.originalVisibleDays });
    
    // Compute new layout for the transition target
    this.invalidateLayout();
    this.computeLayout();
    
    if (this.zoomTransition && this.layout) {
      this.zoomTransition.toLayout = this.layout;
    }
    
    this.dispatchEvent('schedule-zoom-reset', {});
  }

  /**
   * Capture the current layout as a snapshot for animation
   */
  private captureLayoutSnapshot(isZoomingIn: boolean, targetDay: DayOfWeek | null): void {
    const fromSnapshots = new Map<string, EventSnapshot>();
    const fromDays = new Map<DayOfWeek, DaySnapshot>();
    const { width, height } = this.renderer.getSize();
    
    if (this.layout) {
      // Capture event positions
      for (const eventLayout of this.layout.events) {
        fromSnapshots.set(eventLayout.event.id, {
          bounds: { ...eventLayout.bounds },
          opacity: eventLayout.opacity,
          backgroundColor: eventLayout.backgroundColor,
          textColor: eventLayout.textColor,
          day: eventLayout.event.day,
        });
      }
      
      // Capture day column positions
      for (const dayLayout of this.layout.days) {
        fromDays.set(dayLayout.day, {
          day: dayLayout.day,
          headerBounds: { ...dayLayout.headerBounds },
          contentBounds: { ...dayLayout.contentBounds },
        });
      }
    }
    
    this.zoomTransition = {
      progress: 0,
      startTime: performance.now(),
      duration: this.config.canvas?.animationDuration ?? 350,
      fromSnapshots,
      fromDays,
      toLayout: null,
      isZoomingIn,
      targetDay,
      canvasWidth: width,
      canvasHeight: height,
    };
  }

  /**
   * Get current configuration (copy)
   */
  getConfig(): ScheduleConfig {
    return { ...this.config };
  }

  /**
   * Update configuration and re-render
   * @param newConfig - Partial configuration to merge
   * @returns Result indicating success or failure
   */
  updateConfig(newConfig: Partial<WeeklyScheduleConfig>): Result<void, Error> {
    const mergedConfig = { ...this.config, ...newConfig };

    const validation = validateConfig(mergedConfig);
    if (!validation.success) {
      const errorMessages = validation.error.map(e => e.message).join(', ');
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errorMessages}`),
      };
    }

    this.config = {
      ...this.config,
      ...newConfig,
      visibleDays: mergedConfig.visibleDays ?? [...WORK_WEEK_DAYS],
      startHour: mergedConfig.startHour ?? 9,
      endHour: mergedConfig.endHour ?? 17,
      timeSlotInterval: mergedConfig.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes,
      orientation: mergedConfig.orientation ?? ScheduleOrientation.Vertical,
    };
    
    if (newConfig.visibleDays && this.zoomedDay === null) {
      this.originalVisibleDays = [...newConfig.visibleDays];
    }
    
    this.layoutEngine.updateConfig(this.config);
    
    if (newConfig.dimensions) {
      this.layoutEngine.updateDimensions(newConfig.dimensions);
    }
    
    if (newConfig.grid || newConfig.dayNameTranslations) {
      this.gridRenderer.updateConfig({
        ...newConfig.grid,
        dayNameTranslations: newConfig.dayNameTranslations ?? this.config.dayNameTranslations,
      });
    }
    
    if (newConfig.events) {
      this.eventRenderer.updateConfig(newConfig.events);
    }
    
    if (newConfig.canvas?.theme) {
      this.renderer.setTheme(newConfig.canvas.theme);
    }
    
    this.invalidateLayout();
    this.scheduleRender();

    return { success: true, data: undefined };
  }

  /**
   * Force a re-render
   */
  render(): void {
    this.invalidateLayout();
    this.renderFrame();
  }

  /**
   * Clean up component and remove event listeners
   */
  destroy(): void {
    // Cancel animations
    this.animationManager.dispose();
    
    // Cancel pending renders
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }
    if (this.hoverDebounceTimeout !== null) {
      clearTimeout(this.hoverDebounceTimeout);
    }
    
    // Disconnect observers
    this.resizeObserver.disconnect();
    
    // Remove event listeners
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('click', this.handleClick);
    this.scrollContainer.removeEventListener('scroll', this.handleScroll);
    
    // Clear container and restore original state
    this.container.innerHTML = '';
    this.container.className = this.originalContainerClasses;
    if (this.originalContainerStyle) {
      this.container.setAttribute('style', this.originalContainerStyle);
    } else {
      this.container.removeAttribute('style');
    }
    
    this.events = [];
    this.allEvents = [];
  }

  // ==================== Private Methods ====================

  /**
   * Apply current filter to events
   */
  private applyFilter(): void {
    if (this.currentFilter) {
      this.events = this.allEvents.filter(ev => {
        try {
          return !!this.currentFilter!(ev);
        } catch {
          return false;
        }
      });
    } else {
      this.events = [...this.allEvents];
    }
  }

  /**
   * Invalidate layout (forces recomputation)
   */
  private invalidateLayout(): void {
    this.layout = null;
  }

  /**
   * Compute layout if needed
   */
  private computeLayout(): void {
    if (this.layout) return;

    const { width, height } = this.renderer.getSize();
    const dpr = this.renderer.getDevicePixelRatio();
    
    // Process events (handle overflow indicators, etc.)
    const processedEvents = this.processEventsForDisplay();
    
    this.layout = this.layoutEngine.computeLayout(
      width,
      height,
      processedEvents,
      dpr,
      this.zoomedDay
    );
    
    // Update hit tester
    this.hitTester.updateLayout(this.layout);
  }

  /**
   * Process events for display (compression, overflow indicators)
   */
  private processEventsForDisplay(): ScheduleEvent[] {
    // If zoomed, show all events for that day
    if (this.zoomedDay !== null) {
      return this.events.filter(e => e.day === this.zoomedDay);
    }

    // In normal view, compress events and create overflow indicators
    const visibleDays = this.config.visibleDays ?? [];
    const result: ScheduleEvent[] = [];
    const eventsByDay = groupEventsByDay(this.events);

    for (const day of visibleDays) {
      const dayEvents = eventsByDay.get(day) ?? [];
      if (dayEvents.length === 0) continue;

      const laneMap = assignLanes(dayEvents);
      const maxLaneIndex = Math.max(...Array.from(laneMap.values()).map(l => l.laneIndex));
      const visibleThreshold = maxLaneIndex <= 2 ? 3 : 2;

      // Priority-based lane swapping
      const eventsByLane = new Map<number, ScheduleEvent[]>();
      dayEvents.forEach(ev => {
        const info = laneMap.get(ev.id);
        if (info) {
          if (!eventsByLane.has(info.laneIndex)) {
            eventsByLane.set(info.laneIndex, []);
          }
          eventsByLane.get(info.laneIndex)!.push(ev);
        }
      });

      const lanePriorities = new Map<number, number>();
      for (const [laneIndex, laneEvents] of eventsByLane.entries()) {
        const maxPriority = Math.max(...laneEvents.map(ev => ev.lanePriority ?? 0));
        lanePriorities.set(laneIndex, maxPriority);
      }

      const visibleLaneIndices = new Set<number>();
      const hiddenLaneIndices = new Set<number>();
      for (const laneIndex of eventsByLane.keys()) {
        if (laneIndex < visibleThreshold) {
          visibleLaneIndices.add(laneIndex);
        } else {
          hiddenLaneIndices.add(laneIndex);
        }
      }

      // Swap based on priority
      let highestHiddenPriority = -Infinity;
      let highestHiddenLane = -1;
      for (const laneIndex of hiddenLaneIndices) {
        const priority = lanePriorities.get(laneIndex) ?? 0;
        if (priority > highestHiddenPriority) {
          highestHiddenPriority = priority;
          highestHiddenLane = laneIndex;
        }
      }

      if (highestHiddenLane >= 0 && highestHiddenPriority > 0) {
        let lowestVisiblePriority = Infinity;
        let lowestVisibleLane = -1;
        for (const laneIndex of visibleLaneIndices) {
          const priority = lanePriorities.get(laneIndex) ?? 0;
          if (priority < lowestVisiblePriority || (priority <= lowestVisiblePriority && laneIndex > lowestVisibleLane)) {
            lowestVisiblePriority = priority;
            lowestVisibleLane = laneIndex;
          }
        }

        if (lowestVisibleLane >= 0 && highestHiddenPriority > lowestVisiblePriority) {
          visibleLaneIndices.delete(lowestVisibleLane);
          visibleLaneIndices.add(highestHiddenLane);
          hiddenLaneIndices.delete(highestHiddenLane);
          hiddenLaneIndices.add(lowestVisibleLane);
        }
      }

      const visible: ScheduleEvent[] = [];
      const hidden: ScheduleEvent[] = [];

      for (const event of dayEvents) {
        const laneInfo = laneMap.get(event.id);
        if (laneInfo && visibleLaneIndices.has(laneInfo.laneIndex)) {
          visible.push(event);
        } else {
          hidden.push(event);
        }
      }

      result.push(...visible);

      // Create overflow indicators for hidden events
      if (hidden.length > 0) {
        hidden.sort((a, b) => a.startTime.toMinutes() - b.startTime.toMinutes());
        
        let cluster: ScheduleEvent[] = [hidden[0]];
        let clusterEnd = hidden[0].endTime.toMinutes();

        const addOverflow = (clusterEvents: ScheduleEvent[]) => {
          const earliest = clusterEvents.reduce((min, e) => 
            e.startTime.toMinutes() < min.startTime.toMinutes() ? e : min
          );
          const latest = clusterEvents.reduce((max, e) => 
            e.endTime.toMinutes() > max.endTime.toMinutes() ? e : max
          );
          
          const title = this.config.overflowIndicatorFormat
            ? this.config.overflowIndicatorFormat(clusterEvents.length)
            : `+${clusterEvents.length} more`;

          result.push({
            id: `overflow-${day}-${earliest.id}`,
            day,
            startTime: earliest.startTime,
            endTime: latest.endTime,
            title,
            className: 'event-overflow-indicator',
          });
        };

        for (let i = 1; i < hidden.length; i++) {
          const event = hidden[i];
          if (event.startTime.toMinutes() < clusterEnd) {
            cluster.push(event);
            clusterEnd = Math.max(clusterEnd, event.endTime.toMinutes());
          } else {
            addOverflow(cluster);
            cluster = [event];
            clusterEnd = event.endTime.toMinutes();
          }
        }
        addOverflow(cluster);
      }
    }

    return result;
  }

  /**
   * Schedule a render on next animation frame
   */
  private scheduleRender(): void {
    if (this.needsRender) return;
    
    this.needsRender = true;
    this.rafId = requestAnimationFrame(() => {
      this.needsRender = false;
      this.rafId = null;
      this.renderFrame();
    });
  }

  /**
   * Start the animation loop for smooth hover/zoom transitions
   */
  private startAnimationLoop(): void {
    const animate = () => {
      let needsUpdate = false;
      const lerpFactor = 0.18;
      const threshold = 0.005;

      // Animate hover brightness
      for (const [eventId, state] of this.hoverBrightness) {
        const diff = state.target - state.current;
        if (Math.abs(diff) > threshold) {
          state.current += diff * lerpFactor;
          needsUpdate = true;
        } else {
          state.current = state.target;
        }

        // Clean up settled animations
        if (state.current === 1 && state.target === 1) {
          this.hoverBrightness.delete(eventId);
        }
      }

      // Animate zoom transitions
      if (this.zoomTransition) {
        const elapsed = performance.now() - this.zoomTransition.startTime;
        const rawProgress = Math.min(1, elapsed / this.zoomTransition.duration);
        
        // Use easeOutCubic for smooth deceleration
        this.zoomTransition.progress = this.easeOutCubic(rawProgress);
        needsUpdate = true;
        
        if (rawProgress >= 1) {
          // Animation complete
          this.zoomTransition = null;
        }
      }

      if (needsUpdate) {
        this.scheduleRender();
      }

      requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }

  /**
   * Easing function: easeOutCubic
   */
  private easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Render a single frame
   */
  private renderFrame(): void {
    this.computeLayout();
    if (!this.layout) return;

    // Clear canvas
    this.renderer.clear();

    // Render grid (background, lines, headers)
    this.gridRenderer.render(this.layout);

    // Apply animation states to event layouts before rendering
    const animatedLayout = this.applyAnimations(this.layout);

    // Render events with animated values
    const hoveredId = this.interactionState.hoveredEvent?.id;
    this.eventRenderer.render(animatedLayout, hoveredId);

    // Render "now" indicator if enabled
    if (this.config.showNowIndicator) {
      renderNowIndicator(this.renderer, this.layout);
    }

    // Render hover highlight for day header
    if (this.interactionState.hoveredDay !== null) {
      const dayLayout = this.layout.days.find(d => d.day === this.interactionState.hoveredDay);
      if (dayLayout) {
        this.gridRenderer.renderDayHoverHighlight(dayLayout, this.renderer.getTheme());
      }
    }
  }

  /**
   * Apply animation states to event layouts
   */
  private applyAnimations(layout: ScheduleLayout): ScheduleLayout {
    const animatedEvents: EventLayout[] = [];
    const transition = this.zoomTransition;
    const progress = transition?.progress ?? 1;
    const isVertical = this.config.orientation === ScheduleOrientation.Vertical;

    // Process events that exist in the target layout
    for (const eventLayout of layout.events) {
      const eventId = eventLayout.event.id;
      let animatedLayout = { ...eventLayout };

      // Apply zoom transition animation
      if (transition && progress < 1) {
        const fromSnapshot = transition.fromSnapshots.get(eventId);
        
        if (fromSnapshot) {
          // Event exists in both states - animate position smoothly
          animatedLayout.bounds = this.lerpRect(fromSnapshot.bounds, eventLayout.bounds, progress);
          animatedLayout.opacity = this.lerp(fromSnapshot.opacity, eventLayout.opacity, progress);
        } else {
          // Event is new (appearing) - calculate entry animation based on day position
          const eventDay = eventLayout.event.day;
          const targetDayLayout = layout.days.find(d => d.day === eventDay);
          
          if (transition.isZoomingIn && targetDayLayout) {
            // Zooming in: new events slide in from the center
            // They start at the original day column position and expand
            const fromDaySnapshot = transition.fromDays.get(eventDay);
            
            if (fromDaySnapshot) {
              // Calculate where this event would have been in the original layout
              const originalDayCenter = isVertical 
                ? fromDaySnapshot.contentBounds.x + fromDaySnapshot.contentBounds.width / 2
                : fromDaySnapshot.contentBounds.y + fromDaySnapshot.contentBounds.height / 2;
              
              const targetCenter = isVertical
                ? eventLayout.bounds.x + eventLayout.bounds.width / 2
                : eventLayout.bounds.y + eventLayout.bounds.height / 2;
              
              const offset = (originalDayCenter - targetCenter) * (1 - progress);
              
              animatedLayout.bounds = {
                ...eventLayout.bounds,
                x: isVertical ? eventLayout.bounds.x + offset : eventLayout.bounds.x,
                y: isVertical ? eventLayout.bounds.y : eventLayout.bounds.y + offset,
                width: this.lerp(eventLayout.bounds.width * 0.3, eventLayout.bounds.width, progress),
                height: eventLayout.bounds.height,
              };
            }
            animatedLayout.opacity = progress;
          } else {
            // Zooming out: events fade in from their final positions
            animatedLayout.opacity = progress;
          }
        }
      }

      // Apply hover brightness animation
      const brightness = this.hoverBrightness.get(eventId);
      if (brightness && brightness.current !== 1) {
        animatedLayout.backgroundColor = this.adjustBrightness(
          animatedLayout.backgroundColor,
          (brightness.current - 1) * 100
        );
      }

      animatedEvents.push(animatedLayout);
    }

    // Render disappearing events during zoom transition
    if (transition && progress < 1) {
      for (const [eventId, snapshot] of transition.fromSnapshots) {
        const existsInTarget = layout.events.some(e => e.event.id === eventId);
        if (!existsInTarget) {
          // Find the original event data
          const originalEvent = this.allEvents.find(e => e.id === eventId) ?? 
                               this.events.find(e => e.id === eventId);
          
          if (originalEvent) {
            // Calculate slide direction based on day position relative to target
            let slideOffset = 0;
            
            if (transition.isZoomingIn && transition.targetDay !== null) {
              // Zooming in: slide events away from center based on their day
              const eventDayIndex = this.originalVisibleDays.indexOf(snapshot.day);
              const targetDayIndex = this.originalVisibleDays.indexOf(transition.targetDay);
              
              if (eventDayIndex !== -1 && targetDayIndex !== -1) {
                // Calculate direction: negative = slide left/up, positive = slide right/down
                const direction = eventDayIndex < targetDayIndex ? -1 : 1;
                const distance = isVertical ? transition.canvasWidth : transition.canvasHeight;
                slideOffset = direction * distance * 0.5 * progress;
              }
            } else {
              // Zooming out: events slide in from edges toward their positions
              const targetDayLayout = layout.days.find(d => d.day === snapshot.day);
              
              if (targetDayLayout) {
                // Calculate where this day column will be
                const targetCenter = isVertical
                  ? targetDayLayout.contentBounds.x + targetDayLayout.contentBounds.width / 2
                  : targetDayLayout.contentBounds.y + targetDayLayout.contentBounds.height / 2;
                
                const snapshotCenter = isVertical
                  ? snapshot.bounds.x + snapshot.bounds.width / 2
                  : snapshot.bounds.y + snapshot.bounds.height / 2;
                
                slideOffset = (targetCenter - snapshotCenter) * progress;
              }
            }
            
            animatedEvents.push({
              event: originalEvent,
              bounds: {
                ...snapshot.bounds,
                x: isVertical ? snapshot.bounds.x + slideOffset : snapshot.bounds.x,
                y: isVertical ? snapshot.bounds.y : snapshot.bounds.y + slideOffset,
                // Shrink width when zooming in
                width: transition.isZoomingIn 
                  ? this.lerp(snapshot.bounds.width, snapshot.bounds.width * 0.3, progress)
                  : snapshot.bounds.width,
              },
              opacity: 1 - progress,
              backgroundColor: snapshot.backgroundColor,
              textColor: snapshot.textColor,
              isOverflow: eventId.startsWith('overflow-'),
              scale: 1,
            });
          }
        }
      }
    }

    return {
      ...layout,
      events: animatedEvents,
    };
  }

  /**
   * Linear interpolation between two values
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Interpolate between two rectangles
   */
  private lerpRect(from: Rect, to: Rect, t: number): Rect {
    return {
      x: this.lerp(from.x, to.x, t),
      y: this.lerp(from.y, to.y, t),
      width: this.lerp(from.width, to.width, t),
      height: this.lerp(from.height, to.height, t),
    };
  }

  /**
   * Adjust brightness of a color by a percentage
   */
  private adjustBrightness(color: string, percent: number): string {
    // Handle rgba colors
    if (color.startsWith('rgba')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const factor = 1 + percent / 100;
        const r = Math.min(255, Math.round(parseInt(match[1]) * factor));
        const g = Math.min(255, Math.round(parseInt(match[2]) * factor));
        const b = Math.min(255, Math.round(parseInt(match[3]) * factor));
        return color.replace(/rgba?\((\d+),\s*(\d+),\s*(\d+)/, `rgba(${r}, ${g}, ${b}`);
      }
    }
    
    // Handle hex colors
    const hex = color.replace('#', '');
    if (hex.length !== 6) return color;
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    const factor = 1 + percent / 100;
    const newR = Math.min(255, Math.round(r * factor));
    const newG = Math.min(255, Math.round(g * factor));
    const newB = Math.min(255, Math.round(b * factor));
    
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  /**
   * Handle container resize
   */
  private handleResize(): void {
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = setTimeout(() => {
      // Calculate content size based on minimum requirements
      this.calculateContentSize();
      
      // Resize canvas to content size (not viewport size)
      this.renderer.resize(this.contentWidth, this.contentHeight);
      
      this.invalidateLayout();
      this.renderFrame();
      this.resizeTimeout = null;
    }, this.config.resizeDebounce ?? 50);
  }

  /**
   * Handle scroll events from the scroll container
   */
  private handleScroll(): void {
    this.scrollX = this.scrollContainer.scrollLeft;
    this.scrollY = this.scrollContainer.scrollTop;
    this.scheduleRender();
  }

  /**
   * Calculate content dimensions based on viewport and minimum requirements
   * This determines if scrollbars are needed and the canvas size
   * Uses container dimensions (stable) rather than scrollContainer (affected by scrollbar)
   */
  private calculateContentSize(): void {
    // Use container dimensions - these are stable and not affected by scrollbar presence
    const viewportWidth = this.container.clientWidth;
    const viewportHeight = this.container.clientHeight;
    
    // Get dimensions from layout
    const dims = this.layoutEngine.getDimensions();
    const isVertical = this.config.orientation === ScheduleOrientation.Vertical;
    const numDays = this.zoomedDay !== null ? 1 : (this.config.visibleDays?.length ?? 5);
    
    // Height always fits viewport (no vertical scroll)
    this.contentHeight = viewportHeight;
    
    let minWidth = 0;
    
    if (isVertical) {
      // Vertical: days are columns, time is rows
      // Calculate minimum width for all day columns
      minWidth = dims.crossAxisSize + (numDays * dims.minDayColumnWidth);
    } else {
      // Horizontal: time is columns, days are rows  
      // Calculate minimum width for all time slots
      const numHours = (this.config.endHour ?? 17) - (this.config.startHour ?? 9);
      minWidth = dims.crossAxisSize + (numHours * dims.minSlotSize);
    }
    
    this.contentWidth = Math.max(viewportWidth, minWidth);
    
    // Update sizing styles
    this.contentSizer.style.width = '100%';
    this.contentSizer.style.minWidth = `${minWidth}px`;
    this.contentSizer.style.height = `${this.contentHeight}px`;
  }

  /**
   * Attach event listeners to canvas
   */
  private attachEventListeners(): void {
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('click', this.handleClick);
    
    // Scroll events on the scroll container
    this.scrollContainer.addEventListener('scroll', this.handleScroll, { passive: true });
    
    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd);
  }

  /**
   * Handle mouse move
   */
  private handleMouseMove(e: MouseEvent): void {
    const point = this.renderer.eventToCanvasPoint(e);
    // Adjust point for scroll offset to match rendered positions
    const adjustedPoint = this.adjustPointForScroll(point);
    this.interactionState.mousePosition = adjustedPoint;
    
    const hitResult = this.hitTester.hitTest(adjustedPoint);
    this.updateHoverState(hitResult);
    this.updateCursor(hitResult);
    this.scheduleRender();
  }

  /**
   * Adjust a point for scroll offset (convert screen coords to content coords)
   */
  private adjustPointForScroll(point: { x: number; y: number }): { x: number; y: number } {
    const isVertical = this.config.orientation === ScheduleOrientation.Vertical;
    return {
      x: isVertical ? point.x : point.x + this.scrollX,
      y: isVertical ? point.y + this.scrollY : point.y,
    };
  }

  /**
   * Handle mouse leave
   */
  private handleMouseLeave(): void {
    this.interactionState.mousePosition = null;
    
    if (this.interactionState.hoveredEvent) {
      this.dispatchHoverEnd(this.interactionState.hoveredEvent);
    }
    
    this.interactionState.hoveredEvent = null;
    this.interactionState.hoveredDay = null;
    this.canvas.style.cursor = 'default';
    this.scheduleRender();
  }

  /**
   * Handle mouse down
   */
  private handleMouseDown(e: MouseEvent): void {
    const point = this.renderer.eventToCanvasPoint(e);
    const adjustedPoint = this.adjustPointForScroll(point);
    this.interactionState.isMouseDown = true;
    this.interactionState.dragStart = adjustedPoint;
  }

  /**
   * Handle mouse up
   */
  private handleMouseUp(): void {
    this.interactionState.isMouseDown = false;
    this.interactionState.dragStart = null;
  }

  /**
   * Handle click
   */
  private handleClick(e: MouseEvent): void {
    const point = this.renderer.eventToCanvasPoint(e);
    const adjustedPoint = this.adjustPointForScroll(point);
    const hitResult = this.hitTester.hitTest(adjustedPoint);

    switch (hitResult.type) {
      case 'event':
        if (hitResult.eventLayout?.isOverflow) {
          // Zoom to day when clicking overflow indicator
          const day = hitResult.event!.day;
          this.zoomToDay(day);
        } else if (hitResult.event) {
          this.dispatchEvent('schedule-event-click', { event: hitResult.event });
        }
        break;
        
      case 'day-header':
        if (hitResult.day !== undefined) {
          if (this.zoomedDay === hitResult.day) {
            this.resetZoom();
          } else {
            this.zoomToDay(hitResult.day);
          }
        }
        break;
    }
  }

  /**
   * Handle wheel event
   */
  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
  }

  /**
   * Handle touch start
   */
  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const point = this.renderer.eventToCanvasPoint(touch);
      const adjustedPoint = this.adjustPointForScroll(point);
      this.interactionState.mousePosition = adjustedPoint;
      this.interactionState.isMouseDown = true;
      this.interactionState.dragStart = adjustedPoint;
    }
  }

  /**
   * Handle touch move
   */
  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const point = this.renderer.eventToCanvasPoint(touch);
      const adjustedPoint = this.adjustPointForScroll(point);
      this.interactionState.mousePosition = adjustedPoint;
      
      const hitResult = this.hitTester.hitTest(adjustedPoint);
      this.updateHoverState(hitResult);
      this.scheduleRender();
    }
  }

  /**
   * Handle touch end
   */
  private handleTouchEnd(): void {
    if (this.interactionState.mousePosition && this.interactionState.dragStart) {
      const dx = this.interactionState.mousePosition.x - this.interactionState.dragStart.x;
      const dy = this.interactionState.mousePosition.y - this.interactionState.dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < 10) {
        // Treat as tap/click
        const hitResult = this.hitTester.hitTest(this.interactionState.mousePosition);
        this.handleTap(hitResult);
      }
    }
    
    this.interactionState.isMouseDown = false;
    this.interactionState.dragStart = null;
    this.interactionState.hoveredEvent = null;
    this.interactionState.hoveredDay = null;
    this.scheduleRender();
  }

  /**
   * Handle tap (touch equivalent of click)
   */
  private handleTap(hitResult: HitTestResult): void {
    switch (hitResult.type) {
      case 'event':
        if (hitResult.eventLayout?.isOverflow) {
          this.zoomToDay(hitResult.event!.day);
        } else if (hitResult.event) {
          this.dispatchEvent('schedule-event-click', { event: hitResult.event });
        }
        break;
        
      case 'day-header':
        if (hitResult.day !== undefined) {
          if (this.zoomedDay === hitResult.day) {
            this.resetZoom();
          } else {
            this.zoomToDay(hitResult.day);
          }
        }
        break;
    }
  }

  /**
   * Update hover state based on hit result
   */
  private updateHoverState(hitResult: HitTestResult): void {
    // Handle event hover
    if (hitResult.type === 'event' && hitResult.event) {
      if (this.lastHoveredEventId !== hitResult.event.id) {
        // End hover on previous event
        if (this.interactionState.hoveredEvent) {
          this.setEventHoverBrightness(this.interactionState.hoveredEvent.id, false);
          this.dispatchHoverEnd(this.interactionState.hoveredEvent);
        }
        
        // Start hover on new event
        this.interactionState.hoveredEvent = hitResult.event;
        this.lastHoveredEventId = hitResult.event.id;
        this.setEventHoverBrightness(hitResult.event.id, true);
        this.dispatchHover(hitResult.event);
      }
    } else {
      if (this.interactionState.hoveredEvent) {
        // End hover
        this.setEventHoverBrightness(this.interactionState.hoveredEvent.id, false);
        this.dispatchHoverEnd(this.interactionState.hoveredEvent);
        this.interactionState.hoveredEvent = null;
        this.lastHoveredEventId = null;
      }
    }

    // Handle day header hover
    this.interactionState.hoveredDay = hitResult.type === 'day-header' ? hitResult.day ?? null : null;
  }

  /**
   * Set hover brightness animation state for an event
   */
  private setEventHoverBrightness(eventId: string, isHovered: boolean): void {
    const existing = this.hoverBrightness.get(eventId);
    
    if (isHovered) {
      this.hoverBrightness.set(eventId, {
        current: existing?.current ?? 1,
        target: 1.12, // Brighten by 12% on hover
      });
    } else if (existing) {
      existing.target = 1;
    }
  }

  /**
   * Update cursor based on hit result
   */
  private updateCursor(hitResult: HitTestResult): void {
    let cursor = 'default';
    
    switch (hitResult.type) {
      case 'event':
      case 'day-header':
        cursor = 'pointer';
        break;
    }
    
    if (this.canvas.style.cursor !== cursor) {
      this.canvas.style.cursor = cursor;
    }
  }

  /**
   * Dispatch hover event
   */
  private dispatchHover(event: ScheduleEvent): void {
    this.dispatchEvent('schedule-event-hover', { event });
  }

  /**
   * Dispatch hover end event
   */
  private dispatchHoverEnd(event: ScheduleEvent): void {
    this.dispatchEvent('schedule-event-hover-end', { event });
  }

  /**
   * Dispatch custom event on container
   */
  private dispatchEvent(name: string, detail: Record<string, unknown>): void {
    const customEvent = new CustomEvent(name, {
      detail,
      bubbles: true,
      cancelable: true,
    });
    this.container.dispatchEvent(customEvent);
  }
}
