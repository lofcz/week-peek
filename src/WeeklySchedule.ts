import type {
  ScheduleConfig,
  ScheduleEvent,
  DayOfWeek,
} from './types';
import type { Result } from './types/internal';
import { WORK_WEEK_DAYS, TimeSlotInterval, ScheduleOrientation, getDayName, TranslationKey } from './types';

import { validateConfig, validateEvent } from './utils/validators';
import { groupEventsByDay, assignLanes, eventsOverlap } from './utils/layoutHelpers';

import type { 
  ScheduleLayout, 
  CanvasTheme,
  HitTestResult,
  InteractionState,
  Rect,
  EventLayout,
} from './canvas/types';
import { LayoutEngine, type LayoutDimensions, ZOOMED_SLOT_SIZE_MULTIPLIER } from './canvas/LayoutEngine';
import { CanvasRenderer, withAlpha } from './canvas/CanvasRenderer';
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
  /** Scroll offset delta to compensate for scroll changes during zoom */
  scrollOffsetX: number;
  /** Scroll offset delta for Y axis */
  scrollOffsetY: number;
  /** Whether this is a day-to-day navigation (up/down while zoomed) */
  isDayNavigation: boolean;
  /** Direction of day navigation: 'up' (prev day) or 'down' (next day) */
  navigationDirection: 'up' | 'down' | null;
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
  private dayHeaderContainer: HTMLElement;
  private intersectionDiv: HTMLElement;
  private dayHeadersContainer: HTMLElement;
  private dayHeaders: HTMLElement[] = [];
  private scrollAreaWrapper: HTMLElement;
  private timeHeaderRow: HTMLElement | null = null;
  private timeHeaderContent: HTMLElement | null = null;
  private scrollContainer: HTMLElement;
  private contentSizer: HTMLElement;
  private canvasWrapper: HTMLElement;
  private canvas: HTMLCanvasElement;
  
  // Track if we need separate time header (for vertical scrolling in horizontal mode)
  private usesSeparateTimeHeader: boolean = false;
  
  // Configuration
  private config: WeeklyScheduleConfig;
  
  // Data
  private allEvents: ScheduleEvent[];
  private events: ScheduleEvent[];
  private currentFilter: ((event: ScheduleEvent) => boolean) | null = null;
  private highlightPredicate: ((event: ScheduleEvent) => boolean) | null = null;
  
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
  private isProgrammaticScroll: boolean = false;

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
  
  // Initial render tracking (for FOUC prevention)
  private hasCompletedInitialRender: boolean = false;
  
  // Hover tracking
  private hoverDebounceTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastHoveredEventId: string | null = null;

  // Hover animation state (brightness only, no scale)
  private hoverBrightness: Map<string, { current: number; target: number }> = new Map();
  
  // Zoom transition state for View Transition-style animations
  private zoomTransition: ZoomTransition | null = null;

  // Mobile mode state
  private isMobileMode: boolean = false;
  private originalContainerHeight: string | undefined;

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
      hoveredNavButton: null,
      mousePosition: null,
      isMouseDown: false,
      dragStart: null,
      cursor: 'default',
    };

    // Set up container with hybrid DOM-canvas structure
    // Preserve any existing classes and add schedule-container class
    const existingClasses = this.originalContainerClasses ? this.originalContainerClasses.split(' ').filter(c => c && c !== 'schedule-container') : [];
    this.container.className = ['schedule-container', ...existingClasses].join(' ').trim();
    this.container.innerHTML = '';
    
    const isVertical = this.config.orientation === ScheduleOrientation.Vertical;
    const dims = { crossAxisSize: 80, headerSize: 40 };  // Will be properly set after layoutEngine initialization
    const canvasTheme = this.config.canvas?.theme;
    
    // Update container orientation class
    this.container.classList.add(isVertical ? 'vertical' : 'horizontal');
    
    // Set CSS custom properties for theme values on container
    this.container.style.setProperty('--schedule-header-bg-color', canvasTheme?.headerBackgroundColor ?? '#f3f4f6');
    this.container.style.setProperty('--schedule-grid-line-color', canvasTheme?.gridLineColor ?? '#e5e7eb');
    this.container.style.setProperty('--schedule-grid-line-major-color', canvasTheme?.gridLineMajorColor ?? '#d1d5db');
    this.container.style.setProperty('--schedule-text-color', canvasTheme?.textColor ?? '#374151');
    this.container.style.setProperty('--schedule-day-hover-color', canvasTheme?.dayHoverColor ?? '#e5e7eb');
    
    // Create day header container (fixed, non-scrolling)
    this.dayHeaderContainer = document.createElement('div');
    this.dayHeaderContainer.className = 'schedule-day-header-container';
    // Only set dynamic styles (dimensions and orientation)
    this.dayHeaderContainer.style.cssText = `
      flex-direction: ${isVertical ? 'row' : 'column'};
      ${isVertical ? `height: ${dims.headerSize}px;` : `width: ${dims.crossAxisSize}px;`}
      border-bottom: ${isVertical ? '1px' : '0'} solid var(--schedule-grid-line-major-color);
      border-right: ${isVertical ? '0' : '1px'} solid var(--schedule-grid-line-major-color);
    `;
    
    // Create intersection cell (top-left corner)
    this.intersectionDiv = document.createElement('div');
    this.intersectionDiv.className = 'schedule-intersection';
    // Only set dynamic dimension
    this.intersectionDiv.style.cssText = `
      ${isVertical ? `width: ${dims.crossAxisSize}px;` : `height: ${dims.headerSize}px;`}
    `;
    
    // Create day headers container
    this.dayHeadersContainer = document.createElement('div');
    this.dayHeadersContainer.className = 'schedule-day-headers';
    // Only set dynamic orientation
    this.dayHeadersContainer.style.cssText = `
      flex-direction: ${isVertical ? 'row' : 'column'};
    `;
    
    this.dayHeaderContainer.appendChild(this.intersectionDiv);
    this.dayHeaderContainer.appendChild(this.dayHeadersContainer);
    
    // Create scroll area wrapper - contains optional time header + scroll container
    this.scrollAreaWrapper = document.createElement('div');
    this.scrollAreaWrapper.className = 'schedule-scroll-area-wrapper';
    
    // Create scroll container - this provides native scrollbars
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'schedule-scroll-container scroll-hidden';
    
    // Create content sizer - this defines the scrollable area size
    this.contentSizer = document.createElement('div');
    this.contentSizer.className = 'schedule-content-sizer';
    
    // Create canvas wrapper - contains the canvas at content size
    this.canvasWrapper = document.createElement('div');
    this.canvasWrapper.className = 'schedule-canvas-wrapper';
    
    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'schedule-canvas';
    // Hide canvas initially to prevent FOUC (black flash before first render)
    this.canvas.style.opacity = '0';
    
    // Assemble DOM structure
    this.canvasWrapper.appendChild(this.canvas);
    this.contentSizer.appendChild(this.canvasWrapper);
    this.scrollContainer.appendChild(this.contentSizer);
    this.scrollAreaWrapper.appendChild(this.scrollContainer);
    this.container.appendChild(this.dayHeaderContainer);
    this.container.appendChild(this.scrollAreaWrapper);

    // Initialize rendering components
    const theme: Partial<CanvasTheme> = this.config.canvas?.theme ?? {};
    this.renderer = new CanvasRenderer(this.canvas, theme);
    this.layoutEngine = new LayoutEngine(this.config, this.config.dimensions, theme);
    this.gridRenderer = new GridRenderer(this.renderer, {
      ...this.config.grid,
      dayNameTranslations: this.config.dayNameTranslations,
      icons: this.config.icons,
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
    
    // Recalculate content size (especially important for mobile mode height)
    this.calculateContentSize();
    this.renderer.resize(this.contentWidth, this.contentHeight);
    
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
    
    // Recalculate content size (especially important for mobile mode height)
    this.calculateContentSize();
    this.renderer.resize(this.contentWidth, this.contentHeight);
    
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
    
    // Recalculate content size (especially important for mobile mode height)
    this.calculateContentSize();
    this.renderer.resize(this.contentWidth, this.contentHeight);
    
    this.invalidateLayout();
    this.scheduleRender();
    
    return { success: true, data: undefined };
  }

  /**
   * Highlight events that match the predicate by reducing opacity of non-matching events.
   * Events that pass the predicate are rendered at full opacity, making them stand out.
   * @param predicate - Function that returns true for events to highlight
   * @returns Result indicating success or failure
   */
  highlightEvents(predicate: (event: ScheduleEvent) => boolean): Result<void, Error> {
    if (typeof predicate !== 'function') {
      return {
        success: false,
        error: new Error('Predicate must be a function'),
      };
    }

    this.highlightPredicate = predicate;
    this.invalidateLayout();
    this.scheduleRender();
    
    return { success: true, data: undefined };
  }

  /**
   * Stop highlighting and restore all events to normal opacity.
   * @returns Result indicating success or failure
   */
  stopHighlighting(): Result<void, Error> {
    this.highlightPredicate = null;
    this.invalidateLayout();
    this.scheduleRender();
    
    return { success: true, data: undefined };
  }

  /**
   * Update scrollContainer overflow based on zoom state, orientation, and content dimensions
   * Should be called AFTER calculateContentSize() to have accurate overflow detection
   * Uses this.usesSeparateTimeHeader which is set by calculateContentSize()
   */
  private updateScrollContainerOverflow(): void {
    const isVertical = this.config.orientation === ScheduleOrientation.Vertical;
    const isZoomed = this.zoomedDay !== null;
    const isHorizontal = !isVertical;
    
    // Remove all scroll classes
    this.scrollContainer.classList.remove('scroll-hidden', 'scroll-vertical', 'scroll-horizontal', 'scroll-both');
    
    // Mobile mode - handled by handleMobileModeChange, just ensure no time header
    if (this.isMobileMode) {
      this.removeTimeHeaderRow();
      this.scrollAreaWrapper.classList.remove('has-time-header');
      // Mobile overflow is handled by handleMobileModeChange
      return;
    }
    
    if (isHorizontal) {
      // Horizontal desktop mode - ALWAYS use DOM time header for consistency
      this.createTimeHeaderRow();
      this.scrollAreaWrapper.classList.add('has-time-header');
      
      if (isZoomed) {
        // Zoomed: horizontal scroll + possible vertical scroll
        // Check if vertical scrolling is needed (content height > available)
        // DOM header is 41px (40px + 1px border), scrollbar is ~17px
        const needsVerticalScroll = this.contentHeight > (this.scrollAreaWrapper.clientHeight - 41 - 17);
        if (needsVerticalScroll) {
          this.scrollContainer.classList.add('scroll-both');
        } else {
          this.scrollContainer.classList.add('scroll-horizontal');
        }
      } else {
        // Normal week view - no scrollbars needed
        this.scrollContainer.classList.add('scroll-hidden');
      }
    } else if (isVertical && isZoomed) {
      // Vertical zoomed mode
      this.removeTimeHeaderRow();
      this.scrollAreaWrapper.classList.remove('has-time-header');
      this.scrollContainer.classList.add('scroll-vertical');
    } else {
      // Vertical normal mode
      this.removeTimeHeaderRow();
      this.scrollAreaWrapper.classList.remove('has-time-header');
      this.scrollContainer.classList.add('scroll-hidden');
    }
  }

  /**
   * Get the first event of a day (by start time)
   * @param day - The day to find events for
   * @returns The first event of the day, or undefined if no events
   */
  private getFirstEventOfDay(day: DayOfWeek): ScheduleEvent | undefined {
    // Get visible event IDs from current layout
    const visibleEventIds = new Set<string>();
    if (this.layout) {
      for (const eventLayout of this.layout.events) {
        if (!eventLayout.isOverflow && eventLayout.event.day === day) {
          visibleEventIds.add(eventLayout.event.id);
        }
      }
    }

    const dayEvents = this.events.filter(e =>
      e.day === day && (visibleEventIds.has(e.id) || visibleEventIds.size === 0)
    );
    
    return dayEvents.sort((a, b) => {
      const aMinutes = a.startTime.hours * 60 + a.startTime.minutes;
      const bMinutes = b.startTime.hours * 60 + b.startTime.minutes;
      return aMinutes - bMinutes;
    })[0];
  }

  /**
   * Zoom to a specific day with animated transition
   * @param day - The day to zoom to
   * @param anchorEvent - Optional event to use as anchor for stable positioning (defaults to first event of day)
   * @param scrollToShowAll - When true (e.g., from overflow indicator click), scroll to show all events including rightmost
   */
  zoomToDay(day: DayOfWeek, anchorEvent?: ScheduleEvent, scrollToShowAll: boolean = false): void {
    if (this.zoomedDay === day) return;
    
    // If no anchor event provided, use the first event of the day
    if (!anchorEvent) {
      anchorEvent = this.getFirstEventOfDay(day);
    }

    // Detect day-to-day navigation (switching days while already zoomed)
    const isDayNavigation = this.zoomedDay !== null;
    let navigationDirection: 'up' | 'down' | null = null;
    
    if (isDayNavigation) {
      const currentIndex = this.originalVisibleDays.indexOf(this.zoomedDay!);
      const targetIndex = this.originalVisibleDays.indexOf(day);
      navigationDirection = targetIndex < currentIndex ? 'up' : 'down';
    }

    // Capture current layout state before transition
    this.captureLayoutSnapshot(true, day, isDayNavigation, navigationDirection);

    this.zoomedDay = day;
    this.config.visibleDays = [day];
    this.layoutEngine.updateConfig({ visibleDays: [day] });
    
    // Recalculate content size for new zoom state (affects horizontal scrolling in horizontal mode)
    this.calculateContentSize();
    this.renderer.resize(this.contentWidth, this.contentHeight);
    
    // Update scroll container overflow AFTER calculating content size
    // so we know if both directions need scrolling
    this.updateScrollContainerOverflow();
    
    // Compute new layout for the transition target
    this.invalidateLayout();
    this.computeLayout();
    
    // Calculate scroll offset to keep anchor event at same screen position
    // We'll apply it AFTER all DOM/canvas changes are complete to avoid browser reset
    let pendingScrollOffsetX: number | null = null;
    
    if (this.layout && this.zoomTransition) {
      const isHorizontal = this.config.orientation === ScheduleOrientation.Horizontal;
      
      if (isHorizontal) {
        if (scrollToShowAll) {
          // Case: Clicking overflow indicator - scroll to show all events, especially rightmost
          // Find the rightmost event position in the new layout
          let rightmostX = 0;
          for (const eventLayout of this.layout.events) {
            const rightEdge = eventLayout.bounds.x + eventLayout.bounds.width;
            if (rightEdge > rightmostX) {
              rightmostX = rightEdge;
            }
          }
          
          // Scroll to make the rightmost events visible (scroll to the right)
          // We want the right edge of the rightmost event visible with padding
          const viewportWidth = this.scrollContainer.clientWidth;
          const padding = 20;
          
          // Calculate scroll to show rightmost events
          pendingScrollOffsetX = Math.max(0, rightmostX - viewportWidth + padding);
          
          // Pre-calculate scroll offset for animation interpolation
          const maxScrollX = Math.max(0, this.scrollContainer.scrollWidth - viewportWidth);
          const targetScrollX = Math.max(0, Math.min(pendingScrollOffsetX, maxScrollX));
          this.zoomTransition.scrollOffsetX += targetScrollX;
          // Vertical scroll always resets to 0 when zooming
          this.zoomTransition.scrollOffsetY = 0;
        } else if (anchorEvent) {
          // Find the event in the new layout
          const eventLayout = this.layout.events.find(e => e.event.id === anchorEvent.id);
          // Find the event's OLD position from the snapshot
          const oldSnapshot = this.zoomTransition.fromSnapshots.get(anchorEvent.id);
          
          if (eventLayout && oldSnapshot) {
            // Case 1: Zooming from unzoomed to zoomed (same day) - keep event at same screen position
            const oldEventX = oldSnapshot.bounds.x;
            const newEventX = eventLayout.bounds.x;
            
            // Scroll offset = difference between new and old canvas positions
            // This keeps the event at the same visual screen position
            pendingScrollOffsetX = newEventX - oldEventX;
            
            // Pre-calculate scroll offset for animation interpolation
            // This needs to be set now so animations render correctly from the first frame
            const maxScroll = Math.max(0, this.scrollContainer.scrollWidth - this.scrollContainer.clientWidth);
            const targetScroll = Math.max(0, Math.min(pendingScrollOffsetX, maxScroll));
            this.zoomTransition.scrollOffsetX += targetScroll;
            // Vertical scroll always resets to 0 when zooming
            this.zoomTransition.scrollOffsetY = 0;
          } else if (eventLayout && !oldSnapshot) {
            // Case 2: Navigating between days in zoomed mode - scroll to show the first event
            // Scroll so the event's left edge is visible (with small padding from left edge)
            const eventX = eventLayout.bounds.x;
            const padding = 20; // Small padding from left edge
            pendingScrollOffsetX = Math.max(0, eventX - padding);
            
            // Pre-calculate scroll offset for animation interpolation
            const maxScroll = Math.max(0, this.scrollContainer.scrollWidth - this.scrollContainer.clientWidth);
            const targetScroll = Math.max(0, Math.min(pendingScrollOffsetX, maxScroll));
            this.zoomTransition.scrollOffsetX += targetScroll;
            // Vertical scroll always resets to 0 when zooming
            this.zoomTransition.scrollOffsetY = 0;
          }
        }
      }
    }
    
    if (this.zoomTransition && this.layout) {
      this.zoomTransition.toLayout = this.layout;
    }
    
    // Update DOM day headers for new zoom state
    this.renderDayHeadersDOM();
    
    // Immediately render to avoid black flash after canvas resize
    this.renderFrame();
    
    // Apply scroll offset AFTER all DOM and canvas changes are complete
    // This prevents the browser from resetting scroll during layout recalculation
    this.isProgrammaticScroll = true;
    
    if (pendingScrollOffsetX !== null) {
      const maxScrollX = Math.max(0, this.scrollContainer.scrollWidth - this.scrollContainer.clientWidth);
      const targetScrollX = Math.max(0, Math.min(pendingScrollOffsetX, maxScrollX));
      this.scrollContainer.scrollLeft = targetScrollX;
    } else {
      // No horizontal scroll offset calculated - reset to 0
      this.scrollContainer.scrollLeft = 0;
    }
    this.scrollX = this.scrollContainer.scrollLeft;
    
    // Always reset vertical scroll to top when zooming - this provides consistent UX
    this.scrollContainer.scrollTop = 0;
    this.scrollY = 0;
    
    // Sync time header if present
    this.syncTimeHeaderScroll();
    
    // Re-enable scroll event handler after next frame
    requestAnimationFrame(() => {
      this.isProgrammaticScroll = false;
    });
    
    this.dispatchEvent('schedule-day-zoom', { day });
  }

  /**
   * Get the currently zoomed day, or null if not zoomed
   * @returns The zoomed day, or null if not zoomed
   */
  getZoomedDay(): DayOfWeek | null {
    return this.zoomedDay;
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
    
    // Recalculate content size for unzoomed state
    this.calculateContentSize();
    this.renderer.resize(this.contentWidth, this.contentHeight);
    
    // Update scroll container overflow AFTER calculating content size
    this.updateScrollContainerOverflow();
    
    // Compute new layout for the transition target
    this.invalidateLayout();
    this.computeLayout();
    
    if (this.zoomTransition && this.layout) {
      this.zoomTransition.toLayout = this.layout;
    }
    
    // Update DOM day headers for unzoomed state
    this.renderDayHeadersDOM();
    
    // Immediately render to avoid black flash after canvas resize
    this.renderFrame();
    
    this.dispatchEvent('schedule-zoom-reset', {});
  }

  /**
   * Capture the current layout as a snapshot for animation
   * @param isZoomingIn - Whether transitioning to zoomed state
   * @param targetDay - The day being zoomed to (if zooming in)
   * @param isDayNavigation - Whether this is a day-to-day navigation while zoomed
   * @param navigationDirection - Direction of day navigation ('up' for prev, 'down' for next)
   */
  private captureLayoutSnapshot(
    isZoomingIn: boolean, 
    targetDay: DayOfWeek | null,
    isDayNavigation: boolean = false,
    navigationDirection: 'up' | 'down' | null = null
  ): void {
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
    
    // Store current scroll position - will be used to calculate scroll delta for animation
    // This ensures events animate from their visual screen position, not their canvas position
    const oldScrollX = this.scrollX;
    const oldScrollY = this.scrollY;
    
    this.zoomTransition = {
      progress: 0,
      startTime: performance.now(),
      duration: isDayNavigation ? 250 : (this.config.canvas?.animationDuration ?? 350), // Faster for day nav
      fromSnapshots,
      fromDays,
      toLayout: null,
      isZoomingIn,
      targetDay,
      canvasWidth: width,
      canvasHeight: height,
      // Initialize with negative old scroll - will add new scroll after it's set
      // This gives us (newScroll - oldScroll) which is the offset to apply to fromSnapshots
      scrollOffsetX: -oldScrollX,
      scrollOffsetY: -oldScrollY,
      isDayNavigation,
      navigationDirection,
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

    // Use mobile layout in mobile mode
    if (this.isMobileMode) {
      this.layout = this.layoutEngine.computeMobileLayout(
        width,
        this.events,
        dpr
      );
    } else {
      // Process events (handle overflow indicators, etc.)
      const processedEvents = this.processEventsForDisplay();

      this.layout = this.layoutEngine.computeLayout(
        width,
        height,
        processedEvents,
        dpr,
        this.zoomedDay,
        this.originalVisibleDays,
        this.usesSeparateTimeHeader
      );
    }

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

      // Highlight-based lane swapping: ensure highlighted events are visible
      if (this.highlightPredicate && visibleLaneIndices.size > 0 && hiddenLaneIndices.size > 0) {
        // Find all highlighted events for this day
        const highlightedEvents = dayEvents.filter(ev => this.highlightPredicate!(ev));
        
        if (highlightedEvents.length > 0) {
          // Build conflict clusters (events that overlap transitively)
          const conflictClusters: Set<string>[] = [];
          
          for (const event of dayEvents) {
            // Find which cluster this event belongs to
            let clusterFound = false;
            for (const cluster of conflictClusters) {
              for (const eventId of cluster) {
                const otherEvent = dayEvents.find(e => e.id === eventId);
                if (otherEvent && eventsOverlap(event, otherEvent)) {
                  cluster.add(event.id);
                  clusterFound = true;
                  break;
                }
              }
              if (clusterFound) break;
            }
            
            // If not in any cluster, create new cluster
            if (!clusterFound) {
              const newCluster = new Set<string>([event.id]);
              let changed = true;
              while (changed) {
                changed = false;
                for (const otherEvent of dayEvents) {
                  if (newCluster.has(otherEvent.id)) continue;
                  
                  for (const eventId of newCluster) {
                    const clusterEvent = dayEvents.find(e => e.id === eventId);
                    if (clusterEvent && eventsOverlap(clusterEvent, otherEvent)) {
                      newCluster.add(otherEvent.id);
                      changed = true;
                      break;
                    }
                  }
                }
              }
              conflictClusters.push(newCluster);
            }
          }
          
          // For each conflict cluster, check if any highlighted event is hidden
          for (const cluster of conflictClusters) {
            // Find highlighted events in this cluster that are in hidden lanes
            const highlightedHiddenEvents = highlightedEvents.filter(ev => {
              if (!cluster.has(ev.id)) return false;
              const laneInfo = laneMap.get(ev.id);
              return laneInfo && hiddenLaneIndices.has(laneInfo.laneIndex);
            });
            
            // If we found a highlighted event in a hidden lane, swap with last visible lane
            // Only one swap per cluster (as per requirement)
            if (highlightedHiddenEvents.length > 0 && visibleLaneIndices.size > 0) {
              // Get the lane index of the first highlighted hidden event
              const highlightedEvent = highlightedHiddenEvents[0];
              const highlightedLaneInfo = laneMap.get(highlightedEvent.id);
              
              if (highlightedLaneInfo) {
                const highlightedLaneIndex = highlightedLaneInfo.laneIndex;
                
                // Find the last visible lane (highest lane index in visibleLaneIndices)
                const visibleLaneArray = Array.from(visibleLaneIndices);
                const lastVisibleLane = Math.max(...visibleLaneArray);
                
                // Swap: move highlighted event's lane to visible, move last visible lane to hidden
                visibleLaneIndices.delete(lastVisibleLane);
                visibleLaneIndices.add(highlightedLaneIndex);
                hiddenLaneIndices.delete(highlightedLaneIndex);
                hiddenLaneIndices.add(lastVisibleLane);
              }
            }
          }
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
    if (this.needsRender) {
      return;
    }
    
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
  /**
   * Render day headers as DOM elements
   */
  private renderDayHeadersDOM(): void {
    const visibleDays = this.zoomedDay ? [this.zoomedDay] : (this.config.visibleDays ?? []);
    
    // Update intersection div with reset zoom button when zoomed
    this.intersectionDiv.innerHTML = '';
    if (this.zoomedDay !== null) {
      const resetButton = document.createElement('button');
      resetButton.className = 'schedule-reset-zoom-button';
      resetButton.setAttribute('aria-label', 'Reset zoom');
      
      const iconText = this.config.icons?.resetZoom ?? '⟲';
      if (this.config.icons?.className) {
        const iconSpan = document.createElement('span');
        iconSpan.className = this.config.icons.className;
        iconSpan.innerHTML = iconText;
        resetButton.appendChild(iconSpan);
      } else {
        resetButton.innerHTML = iconText;
      }
      
      resetButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resetZoom();
      });
      
      this.intersectionDiv.appendChild(resetButton);
    }
    
    // Clear existing headers
    this.dayHeadersContainer.innerHTML = '';
    this.dayHeaders = [];
    
    for (const day of visibleDays) {
      const headerDiv = document.createElement('div');
      headerDiv.className = 'schedule-day-header';
      
      // Add navigation buttons if zoomed
      if (this.zoomedDay === day) {
        const currentIndex = this.originalVisibleDays.indexOf(day);
        const prevDisabled = currentIndex <= 0;
        
        // Create prev button
        const prevButton = document.createElement('button');
        prevButton.className = 'schedule-nav-button schedule-nav-button-prev';
        prevButton.disabled = prevDisabled;
        
        const prevIconText = this.config.icons?.prevDay ?? '↑';
        if (this.config.icons?.className) {
          const iconSpan = document.createElement('span');
          iconSpan.className = this.config.icons.className;
          iconSpan.innerHTML = prevIconText;
          prevButton.appendChild(iconSpan);
        } else {
          prevButton.innerHTML = prevIconText;
        }
        
        if (!prevDisabled) {
          prevButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
              this.zoomToDay(this.originalVisibleDays[currentIndex - 1]);
            }
          });
        }
        
        headerDiv.appendChild(prevButton);
      }
      
      // Add day label
      const labelDiv = document.createElement('div');
      labelDiv.className = 'schedule-day-label';
      labelDiv.textContent = getDayName(day, this.config.dayNameTranslations);
      labelDiv.addEventListener('click', () => {
        if (this.zoomedDay !== null) {
          // When zoomed, clicking the day label unzooms
          this.resetZoom();
        } else {
          // When not zoomed, clicking zooms to that day
          this.zoomToDay(day);
        }
      });
      
      headerDiv.appendChild(labelDiv);
      
      // Add next button if zoomed
      if (this.zoomedDay === day) {
        const currentIndex = this.originalVisibleDays.indexOf(day);
        const nextDisabled = currentIndex >= this.originalVisibleDays.length - 1;
        
        const nextButton = document.createElement('button');
        nextButton.className = 'schedule-nav-button schedule-nav-button-next';
        nextButton.disabled = nextDisabled;
        
        const nextIconText = this.config.icons?.nextDay ?? '↓';
        if (this.config.icons?.className) {
          const iconSpan = document.createElement('span');
          iconSpan.className = this.config.icons.className;
          iconSpan.innerHTML = nextIconText;
          nextButton.appendChild(iconSpan);
        } else {
          nextButton.innerHTML = nextIconText;
        }
        
        if (!nextDisabled) {
          nextButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentIndex < this.originalVisibleDays.length - 1) {
              this.zoomToDay(this.originalVisibleDays[currentIndex + 1]);
            }
          });
        }
        
        headerDiv.appendChild(nextButton);
      }
      
      this.dayHeaders.push(headerDiv);
      this.dayHeadersContainer.appendChild(headerDiv);
    }
  }

  /**
   * Create or update the time header row for horizontal mode with vertical scrolling
   * This keeps time labels visible while events scroll vertically
   */
  private createTimeHeaderRow(): void {
    const isHorizontal = this.config.orientation === ScheduleOrientation.Horizontal;
    if (!isHorizontal) return;
    
    // Create time header row if it doesn't exist
    if (!this.timeHeaderRow) {
      this.timeHeaderRow = document.createElement('div');
      this.timeHeaderRow.className = 'schedule-time-header-row';
      
      this.timeHeaderContent = document.createElement('div');
      this.timeHeaderContent.className = 'schedule-time-header-content';
      
      this.timeHeaderRow.appendChild(this.timeHeaderContent);
      
      // Insert time header row before scroll container
      this.scrollAreaWrapper.insertBefore(this.timeHeaderRow, this.scrollContainer);
    }
    
    // Update time header content width to match canvas content
    if (this.timeHeaderContent) {
      this.timeHeaderContent.style.width = `${this.contentWidth}px`;
    }
    
    // Render time slot labels
    this.renderTimeHeaderLabels();
    
    this.usesSeparateTimeHeader = true;
  }

  /**
   * Remove the time header row when not needed
   */
  private removeTimeHeaderRow(): void {
    if (this.timeHeaderRow && this.timeHeaderRow.parentNode) {
      this.timeHeaderRow.parentNode.removeChild(this.timeHeaderRow);
    }
    this.timeHeaderRow = null;
    this.timeHeaderContent = null;
    this.usesSeparateTimeHeader = false;
  }

  /**
   * Render time slot labels in the time header row
   */
  private renderTimeHeaderLabels(): void {
    if (!this.timeHeaderContent) return;
    
    // Clear existing labels
    this.timeHeaderContent.innerHTML = '';
    
    const startHour = this.config.startHour ?? 9;
    const endHour = this.config.endHour ?? 17;
    const interval = this.config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes;
    const slotCount = Math.ceil((endHour - startHour) * 60 / interval);
    
    // Calculate slot width - use contentWidth to match the canvas
    // Slot width = total content width / number of slots
    const slotWidth = this.contentWidth / slotCount;
    
    for (let i = 0; i < slotCount; i++) {
      const minutes = startHour * 60 + i * interval;
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const label = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
      
      const slotDiv = document.createElement('div');
      slotDiv.className = 'schedule-time-slot-label';
      slotDiv.style.width = `${slotWidth}px`;
      slotDiv.textContent = label;
      
      this.timeHeaderContent.appendChild(slotDiv);
    }
  }

  /**
   * Sync time header scroll with main scroll container
   */
  private syncTimeHeaderScroll(): void {
    if (this.timeHeaderRow && this.usesSeparateTimeHeader) {
      this.timeHeaderRow.scrollLeft = this.scrollContainer.scrollLeft;
    }
  }

  private renderFrame(): void {
    this.computeLayout();
    if (!this.layout) return;

    // Clear canvas
    this.renderer.clear();

    // Mobile mode: simplified rendering
    if (this.isMobileMode) {
      this.renderMobileFrame();
      return;
    }

    // Desktop mode: full rendering
    // Render grid (background, lines, headers)
    // Skip time axis rendering if using separate DOM time header
    this.gridRenderer.render(this.layout, this.usesSeparateTimeHeader);

    // Apply animation states to event layouts before rendering
    const animatedLayout = this.applyAnimations(this.layout);

    // Render events with animated values
    const hoveredId = this.interactionState.hoveredEvent?.id;
    this.eventRenderer.render(animatedLayout, hoveredId, this.highlightPredicate);

    // Render "now" indicator if enabled
    if (this.config.showNowIndicator) {
      renderNowIndicator(this.renderer, this.layout);
    }

    // Day headers and navigation buttons are now in DOM
    // No need to render hover highlights on canvas
  }
  
  /**
   * Render mobile layout frame
   */
  private renderMobileFrame(): void {
    if (!this.layout) return;
    
    const theme = this.layoutEngine.getTheme();
    
    // Render background
    this.renderer.fillRect(
      { x: 0, y: 0, width: this.layout.canvasWidth, height: this.layout.canvasHeight },
      theme.backgroundColor
    );
    
    // Group events by day to check for empty days
    const eventsByDay = new Map<DayOfWeek, ScheduleEvent[]>();
    for (const eventLayout of this.layout.events) {
      const day = eventLayout.event.day;
      if (!eventsByDay.has(day)) {
        eventsByDay.set(day, []);
      }
      eventsByDay.get(day)!.push(eventLayout.event);
    }
    
    // Render day headers on canvas (no background, just text and divider)
    for (const dayLayout of this.layout.days) {
      // Day header text
      const dayName = getDayName(dayLayout.day, this.config.dayNameTranslations);
      this.renderer.setFont({
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        size: 14,
        weight: 600,
      });
      this.renderer.drawText(
        dayName,
        dayLayout.headerBounds.x + 12,
        dayLayout.headerBounds.y + dayLayout.headerBounds.height / 2,
        theme.headerTextColor,
        'left',
        'middle'
      );
      
      // Day header bottom border (divider line)
      this.renderer.drawLine(
        { x: dayLayout.headerBounds.x, y: dayLayout.headerBounds.y + dayLayout.headerBounds.height },
        { x: dayLayout.headerBounds.x + dayLayout.headerBounds.width, y: dayLayout.headerBounds.y + dayLayout.headerBounds.height },
        theme.gridLineColor,
        1
      );
      
      // Render "no events" message for days with no events
      const dayEvents = eventsByDay.get(dayLayout.day) ?? [];
      if (dayEvents.length === 0) {
        const noEventsText = this.config.translations?.[TranslationKey.mobileNoEvents] ?? 'No events';
        this.renderer.setFont({
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          size: 13,
          weight: 400,
        });
        this.renderer.drawTextCentered(
          noEventsText,
          {
            x: dayLayout.contentBounds.x,
            y: dayLayout.contentBounds.y,
            width: dayLayout.contentBounds.width,
            height: dayLayout.contentBounds.height,
          },
          withAlpha(theme.headerTextColor ?? '#666666', 0.6)
        );
      }
    }
    
    // Render events in mobile style
    this.eventRenderer.renderMobile(this.layout, this.highlightPredicate);
  }

  /**
   * Apply animation states to event layouts
   */
  private applyAnimations(layout: ScheduleLayout): ScheduleLayout {
    const animatedEvents: EventLayout[] = [];
    const transition = this.zoomTransition;
    const progress = transition?.progress ?? 1;
    const isVertical = this.config.orientation === ScheduleOrientation.Vertical;

    // Use special vertical slide animation for day-to-day navigation
    if (transition && progress < 1 && transition.isDayNavigation) {
      return this.applyDayNavigationAnimation(layout, transition, progress);
    }

    // Process events that exist in the target layout
    for (const eventLayout of layout.events) {
      const eventId = eventLayout.event.id;
      let animatedLayout = { ...eventLayout };

      // Apply zoom transition animation
      if (transition && progress < 1) {
        const fromSnapshot = transition.fromSnapshots.get(eventId);
        
        if (fromSnapshot) {
          // Event exists in both states - animate position smoothly
          // Apply scroll offset to fromSnapshot to compensate for scroll changes during zoom
          // This ensures events animate from their visual screen position, not canvas position
          const adjustedFromBounds: Rect = {
            x: fromSnapshot.bounds.x + transition.scrollOffsetX,
            y: fromSnapshot.bounds.y + transition.scrollOffsetY,
            width: fromSnapshot.bounds.width,
            height: fromSnapshot.bounds.height,
          };
          animatedLayout.bounds = this.lerpRect(adjustedFromBounds, eventLayout.bounds, progress);
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
              // Apply scroll offset to fromDaySnapshot to compensate for scroll changes
              const adjustedDayX = fromDaySnapshot.contentBounds.x + transition.scrollOffsetX;
              const adjustedDayY = fromDaySnapshot.contentBounds.y + transition.scrollOffsetY;
              
              const originalDayCenter = isVertical 
                ? adjustedDayX + fromDaySnapshot.contentBounds.width / 2
                : adjustedDayY + fromDaySnapshot.contentBounds.height / 2;
              
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
            // Apply scroll offset to snapshot bounds to compensate for scroll changes
            const adjustedBoundsX = snapshot.bounds.x + transition.scrollOffsetX;
            const adjustedBoundsY = snapshot.bounds.y + transition.scrollOffsetY;
            
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
                  ? adjustedBoundsX + snapshot.bounds.width / 2
                  : adjustedBoundsY + snapshot.bounds.height / 2;
                
                slideOffset = (targetCenter - snapshotCenter) * progress;
              }
            }
            
            animatedEvents.push({
              event: originalEvent,
              bounds: {
                x: isVertical ? adjustedBoundsX + slideOffset : adjustedBoundsX,
                y: isVertical ? adjustedBoundsY : adjustedBoundsY + slideOffset,
                width: transition.isZoomingIn 
                  ? this.lerp(snapshot.bounds.width, snapshot.bounds.width * 0.3, progress)
                  : snapshot.bounds.width,
                height: snapshot.bounds.height,
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
   * Apply clean vertical slide animation for day-to-day navigation
   * Old day slides out (up or down), new day slides in from the opposite direction
   */
  private applyDayNavigationAnimation(
    layout: ScheduleLayout, 
    transition: ZoomTransition, 
    progress: number
  ): ScheduleLayout {
    const animatedEvents: EventLayout[] = [];
    
    // Slide distance - use canvas height for vertical motion
    const slideDistance = transition.canvasHeight;
    
    // Direction: 'up' means going to previous day (old slides down, new slides in from top)
    // 'down' means going to next day (old slides up, new slides in from bottom)
    const isGoingUp = transition.navigationDirection === 'up';
    
    // Old events slide OUT: if going up, old slides down (+Y); if going down, old slides up (-Y)
    const oldSlideOffset = isGoingUp 
      ? slideDistance * progress 
      : -slideDistance * progress;
    
    // New events slide IN: if going up, new comes from top (-Y to 0); if going down, new comes from bottom (+Y to 0)
    const newSlideOffset = isGoingUp
      ? -slideDistance * (1 - progress)
      : slideDistance * (1 - progress);

    // Render OLD events (from snapshots) sliding out
    for (const [eventId, snapshot] of transition.fromSnapshots) {
      const originalEvent = this.allEvents.find(e => e.id === eventId) ?? 
                           this.events.find(e => e.id === eventId);
      
      if (originalEvent) {
        animatedEvents.push({
          event: originalEvent,
          bounds: {
            x: snapshot.bounds.x,
            y: snapshot.bounds.y + oldSlideOffset,
            width: snapshot.bounds.width,
            height: snapshot.bounds.height,
          },
          opacity: 1 - progress, // Fade out as it slides
          backgroundColor: snapshot.backgroundColor,
          textColor: snapshot.textColor,
          isOverflow: eventId.startsWith('overflow-'),
          scale: 1,
        });
      }
    }

    // Render NEW events (target layout) sliding in
    for (const eventLayout of layout.events) {
      const eventId = eventLayout.event.id;
      let animatedLayout = { ...eventLayout };
      
      // Apply slide-in offset
      animatedLayout.bounds = {
        ...eventLayout.bounds,
        y: eventLayout.bounds.y + newSlideOffset,
      };
      animatedLayout.opacity = progress; // Fade in as it slides

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
    // For initial render, skip debounce to prevent FOUC
    const isInitialRender = !this.hasCompletedInitialRender;
    
    if (this.resizeTimeout !== null) {
      clearTimeout(this.resizeTimeout);
    }

    const doResize = () => {
      // Detect mobile mode based on container width
      const containerWidth = this.container.clientWidth;
      const mobileBreakpoint = this.config.mobileBreakpoint ?? 768;
      const wasMobile = this.isMobileMode;
      this.isMobileMode = mobileBreakpoint > 0 && containerWidth < mobileBreakpoint;
      
      // Handle mode transition
      if (wasMobile !== this.isMobileMode) {
        this.handleMobileModeChange();
      }
      
      // Calculate content size based on minimum requirements
      this.calculateContentSize();
      
      // Update scroll container and time header (creates DOM time header in horizontal desktop mode)
      this.updateScrollContainerOverflow();
      
      // Resize canvas to content size (not viewport size)
      this.renderer.resize(this.contentWidth, this.contentHeight);
      
      // Update DOM day headers (skip in mobile mode - we render on canvas)
      if (!this.isMobileMode) {
        this.renderDayHeadersDOM();
      }
      
      this.invalidateLayout();
      this.renderFrame();
      this.resizeTimeout = null;
      
      // Reveal canvas after first render to prevent FOUC
      if (!this.hasCompletedInitialRender) {
        this.hasCompletedInitialRender = true;
        // Use requestAnimationFrame to ensure paint has completed
        requestAnimationFrame(() => {
          this.canvas.style.opacity = '1';
        });
      }
    };

    if (isInitialRender) {
      // Immediate render on first call to prevent black flash
      doResize();
    } else {
      // Debounce subsequent resize events
      this.resizeTimeout = setTimeout(doResize, this.config.resizeDebounce ?? 50);
    }
  }
  
  /**
   * Handle transition between mobile and desktop modes
   */
  private handleMobileModeChange(): void {
    if (this.isMobileMode) {
      // Entering mobile mode - reset zoom and hide navigation
      if (this.zoomedDay !== null) {
        this.resetZoom();
      }
      this.hideNavigationDOM();
      this.hideDayHeadersDOM();
      // Remove time header if present
      this.removeTimeHeaderRow();
      this.scrollAreaWrapper.classList.remove('has-time-header');
      
      // Mobile: expand to full content height, page scrolls instead of component
      // Store original container height to restore later
      if (!this.originalContainerHeight) {
        this.originalContainerHeight = this.container.style.height;
      }
      // Let container expand to content
      this.container.style.height = 'auto';
      this.container.style.overflow = 'visible';
      this.scrollAreaWrapper.style.overflow = 'visible';
      this.scrollContainer.style.overflow = 'visible';
      this.scrollContainer.classList.add('scroll-hidden');
    } else {
      // Exiting mobile mode - restore desktop state
      this.showDayHeadersDOM();
      
      // Restore original container height
      if (this.originalContainerHeight !== undefined) {
        this.container.style.height = this.originalContainerHeight;
      }
      this.container.style.overflow = '';
      this.scrollAreaWrapper.style.overflow = '';
      this.scrollContainer.style.overflow = '';
      
      this.updateScrollContainerOverflow();
    }
  }
  
  /**
   * Hide navigation DOM elements (for mobile mode)
   */
  private hideNavigationDOM(): void {
    // Navigation buttons are created in renderDayHeadersDOM when zoomed
    // Since we reset zoom when entering mobile, they should already be gone
    // But let's make sure the day header container hides any nav elements
    if (this.dayHeaderContainer) {
      const navButtons = this.dayHeaderContainer.querySelectorAll('.schedule-nav-button, .schedule-reset-zoom');
      navButtons.forEach(btn => (btn as HTMLElement).style.display = 'none');
    }
  }
  
  /**
   * Hide day headers DOM (for mobile mode - headers rendered on canvas)
   */
  private hideDayHeadersDOM(): void {
    if (this.dayHeaderContainer) {
      this.dayHeaderContainer.style.display = 'none';
    }
  }
  
  /**
   * Show day headers DOM (for desktop mode)
   */
  private showDayHeadersDOM(): void {
    if (this.dayHeaderContainer) {
      this.dayHeaderContainer.style.display = '';
    }
  }

  /**
   * Handle scroll events from the scroll container
   */
  private handleScroll(): void {
    const currentScrollLeft = this.scrollContainer.scrollLeft;
    
    // Ignore scroll events triggered by programmatic scroll to prevent race conditions
    if (this.isProgrammaticScroll) {
      // Still sync scrollX/Y but don't schedule render
      this.scrollX = currentScrollLeft;
      this.scrollY = this.scrollContainer.scrollTop;
      // Sync time header scroll even during programmatic scroll
      this.syncTimeHeaderScroll();
      return;
    }
    
    this.scrollX = currentScrollLeft;
    this.scrollY = this.scrollContainer.scrollTop;
    
    // Sync time header scroll position
    this.syncTimeHeaderScroll();
    
    this.scheduleRender();
  }

  /**
   * Calculate content dimensions based on viewport and minimum requirements
   * This determines if scrollbars are needed and the canvas size
   * Uses scrollAreaWrapper dimensions (stable container that doesn't change with scrollbars)
   */
  private calculateContentSize(): void {
    const isVertical = this.config.orientation === ScheduleOrientation.Vertical;
    const dims = this.layoutEngine.getDimensions();
    
    // Reset flag - will be set to true only in horizontal zoomed mode
    this.usesSeparateTimeHeader = false;
    
    // Get the actual available viewport from scrollAreaWrapper (the stable outer container)
    // Use Math.floor to avoid rounding issues that cause 1-2px overflow
    let viewportWidth = Math.floor(this.scrollAreaWrapper.clientWidth);
    let viewportHeight = Math.floor(this.scrollAreaWrapper.clientHeight);
    
    // Ensure we have valid dimensions
    viewportWidth = Math.max(0, viewportWidth);
    viewportHeight = Math.max(0, viewportHeight);
    
    // Mobile mode: simple full-height layout
    if (this.isMobileMode) {
      // Mobile never uses separate time header
      this.usesSeparateTimeHeader = false;
      
      this.contentWidth = viewportWidth;
      // Calculate height based on mobile layout
      const mobileLayout = this.layoutEngine.computeMobileLayout(
        viewportWidth,
        this.events,
        this.config.canvas?.devicePixelRatio ?? window.devicePixelRatio
      );
      // Use the full calculated height
      this.contentHeight = mobileLayout.canvasHeight;
      
      // Update sizing styles for mobile
      const finalWidth = Math.floor(this.contentWidth);
      const finalHeight = Math.floor(this.contentHeight);
      
      this.contentSizer.style.width = `${finalWidth}px`;
      this.contentSizer.style.minWidth = '0';
      this.contentSizer.style.height = `${finalHeight}px`;
      this.contentSizer.style.maxWidth = `${finalWidth}px`;
      this.contentSizer.style.maxHeight = '';
      this.contentSizer.style.minHeight = '0';
      return;
    }
    
    // Desktop mode: original logic
    // Get dimensions from layout (already retrieved above)
    const numDays = this.zoomedDay !== null ? 1 : (this.config.visibleDays?.length ?? 5);
    
    // Default: height fits viewport (no vertical scroll)
    this.contentHeight = viewportHeight;
    
    let minWidth = 0;
    let minHeight = 0;
    const headerHeight = dims.headerSize;
    
    // Horizontal scrollbar height - needed for calculations when scrollbar is present
    const SCROLLBAR_HEIGHT = 17; // Typical scrollbar height across browsers
    
    if (isVertical) {
      // Vertical: days are columns, time is rows
      // Calculate minimum width for all day columns plus time axis
      minWidth = dims.crossAxisSize + (numDays * dims.minDayColumnWidth);
    } else {
      // Horizontal: time is columns, days are rows
      // ALWAYS use DOM-based time header in horizontal desktop mode for consistency
      this.usesSeparateTimeHeader = true;
      
      // Calculate available height for canvas (viewport minus DOM header)
      // Canvas will NOT include time header - it's rendered separately in DOM
      // DOM header is headerHeight (40px) + 1px border = 41px
      // Add 2px padding at bottom and right for visual breathing room
      const DOM_HEADER_HEIGHT = headerHeight + 1;
      const EDGE_PADDING = 2;
      let canvasAvailableHeight = viewportHeight - DOM_HEADER_HEIGHT - EDGE_PADDING;
      
      if (this.zoomedDay !== null) {
        // Zoomed mode: enforce larger minimum slot size to trigger horizontal scrolling
        const startHour = this.config.startHour ?? 9;
        const endHour = this.config.endHour ?? 17;
        const interval = this.config.timeSlotInterval ?? TimeSlotInterval.SixtyMinutes;
        const slotCount = Math.ceil((endHour - startHour) * 60 / interval);
        const effectiveMinSlotSize = dims.minSlotSize * ZOOMED_SLOT_SIZE_MULTIPLIER;
        minWidth = slotCount * effectiveMinSlotSize;
        
        // Horizontal scrollbar will be present - subtract its height from available space
        canvasAvailableHeight -= SCROLLBAR_HEIGHT;
        
        // Calculate required height based on number of lanes for the zoomed day
        const zoomedDayEvents = this.events.filter(e => e.day === this.zoomedDay);
        if (zoomedDayEvents.length > 0) {
          const laneMap = assignLanes(zoomedDayEvents);
          
          // Find max total lanes needed
          let maxLanes = 1;
          for (const laneInfo of laneMap.values()) {
            if (laneInfo.totalLanes > maxLanes) {
              maxLanes = laneInfo.totalLanes;
            }
          }
          
          // Calculate minimum height needed for events to be readable
          const MIN_LANE_HEIGHT = 80; // Minimum pixels per lane for readability
          const requiredMinHeight = maxLanes * MIN_LANE_HEIGHT;
          
          // Decision: can events fit in available space at minimum readable size?
          if (requiredMinHeight > canvasAvailableHeight) {
            // Events don't fit at minimum size - need vertical scrolling
            minHeight = requiredMinHeight;
          }
          // Otherwise: events scale to fill canvasAvailableHeight
        }
      }
      // Store the canvas height for horizontal mode (excluding DOM header and scrollbar if present)
      this.contentHeight = Math.max(canvasAvailableHeight, minHeight);
    }
    
    // Only enforce minimum width when zoomed (or in vertical mode with narrow viewport)
    // In normal horizontal mode, contentWidth = viewportWidth minus padding
    if (minWidth > 0) {
      // Zoomed mode: allow content to exceed viewport to trigger scrolling
      this.contentWidth = Math.max(viewportWidth, minWidth);
    } else if (!isVertical && this.usesSeparateTimeHeader) {
      // Normal horizontal mode with DOM header: subtract edge padding for breathing room
      const EDGE_PADDING = 2;
      this.contentWidth = viewportWidth - EDGE_PADDING;
    } else {
      // Vertical mode or other: exact match
      this.contentWidth = viewportWidth;
    }
    // Note: contentHeight for horizontal mode is already set in the else branch above
    
    // Update sizing styles
    // Always set explicit pixel dimensions for canvas rendering
    // Use Math.floor to ensure no fractional pixels that could cause overflow
    const finalWidth = Math.floor(this.contentWidth);
    const finalHeight = Math.floor(this.contentHeight);
    
    this.contentSizer.style.width = `${finalWidth}px`;
    this.contentSizer.style.minWidth = minWidth > 0 ? `${Math.floor(minWidth)}px` : '0';
    this.contentSizer.style.height = `${finalHeight}px`;
    this.contentSizer.style.maxWidth = `${finalWidth}px`;
    // Allow vertical growth if minHeight is set
    this.contentSizer.style.maxHeight = minHeight > 0 ? '' : `${finalHeight}px`;
    this.contentSizer.style.minHeight = minHeight > 0 ? `${Math.floor(minHeight)}px` : '0';
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
    // Navigation button hover is handled by DOM
    this.scheduleRender();
  }

  /**
   * Adjust a point for scroll offset (convert screen coords to content coords)
   * NOTE: When the canvas is inside a scroll container, getBoundingClientRect().left
   * already changes with scroll position. So eventToCanvasPoint() already returns
   * scroll-adjusted canvas content coordinates. No additional adjustment needed.
   */
  private adjustPointForScroll(point: { x: number; y: number }): { x: number; y: number } {
    return point;
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
    // hoveredDay and hoveredNavButton are now handled by DOM
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

    // Mobile mode: just emit events, no zoom
    if (this.isMobileMode) {
      this.handleMobileClick(hitResult);
      return;
    }

    // Desktop mode: full interaction logic
    switch (hitResult.type) {
      case 'event':
        if (hitResult.eventLayout?.isOverflow) {
          // Zoom to day when clicking overflow indicator
          // Pass scrollToShowAll=true to scroll to show all events including the hidden ones
          const overflowEvent = hitResult.event!;
          const day = overflowEvent.day;
          this.zoomToDay(day, undefined, true);
        } else if (hitResult.event) {
          // Always dispatch click event for regular events (no zoom)
          this.dispatchEvent('schedule-event-click', { event: hitResult.event });
        }
        break;

      case 'day-header':
        if (hitResult.day !== undefined) {
          if (this.zoomedDay === hitResult.day) {
            this.resetZoom();
          } else {
            // No anchor event for day header click
            this.zoomToDay(hitResult.day);
          }
        }
        break;

      case 'prev-day-button':
        if (hitResult.day !== undefined && this.zoomedDay !== null) {
          const currentIndex = this.originalVisibleDays.indexOf(this.zoomedDay);
          if (currentIndex > 0) {
            const prevDay = this.originalVisibleDays[currentIndex - 1];
            this.zoomToDay(prevDay);
          }
        }
        break;

      case 'next-day-button':
        if (hitResult.day !== undefined && this.zoomedDay !== null) {
          const currentIndex = this.originalVisibleDays.indexOf(this.zoomedDay);
          if (currentIndex < this.originalVisibleDays.length - 1) {
            const nextDay = this.originalVisibleDays[currentIndex + 1];
            this.zoomToDay(nextDay);
          }
        }
        break;
    }
  }
  
  /**
   * Handle click in mobile mode - just emit events
   */
  private handleMobileClick(hitResult: HitTestResult): void {
    switch (hitResult.type) {
      case 'event':
        if (hitResult.event) {
          this.dispatchEvent('schedule-event-click', { event: hitResult.event });
        }
        break;
      case 'day-header':
        if (hitResult.day !== undefined) {
          this.dispatchEvent('schedule-day-click', { day: hitResult.day });
        }
        break;
      // No other interactions in mobile mode
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
    // Mobile mode: just emit events, no zoom
    if (this.isMobileMode) {
      this.handleMobileClick(hitResult);
      return;
    }

    // Desktop mode: full interaction logic
    switch (hitResult.type) {
      case 'event':
        if (hitResult.eventLayout?.isOverflow) {
          // Zoom to day when clicking overflow indicator
          // Pass scrollToShowAll=true to scroll to show all events including the hidden ones
          this.zoomToDay(hitResult.event!.day, undefined, true);
        } else if (hitResult.event) {
          // Always dispatch click event for regular events (no zoom)
          this.dispatchEvent('schedule-event-click', { event: hitResult.event });
        }
        break;

      // Day headers and navigation buttons are now DOM elements
      // Click handling is done via DOM event listeners
    }
  }

  /**
   * Update hover state based on hit result
   */
  private updateHoverState(hitResult: HitTestResult): void {
    // Handle event hover (skip overflow indicators)
    if (hitResult.type === 'event' && hitResult.event && !hitResult.eventLayout?.isOverflow) {
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

    // Day header hover is now handled by DOM
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
        cursor = 'pointer';
        break;
      // Day headers and navigation buttons are now DOM elements
      // Cursor handling is done via CSS
    }

    if (this.canvas.style.cursor !== cursor) {
      this.canvas.style.cursor = cursor;
    }
  }

  /**
   * Dispatch hover event
   */
  private dispatchHover(event: ScheduleEvent): void {
    // Find the event layout to get position information
    let bounds: Rect | undefined;
    let viewportBounds: Rect | undefined;

    if (this.layout) {
      const eventLayout = this.layout.events.find(e => e.event.id === event.id);
      
      if (eventLayout) {
        // Canvas content coordinates (bounds from layout)
        bounds = { ...eventLayout.bounds };
        
        // Convert to viewport coordinates (like getBoundingClientRect)
        // The canvas is inside the scroll container, so getBoundingClientRect() already accounts for scroll
        // We just need to add the bounds offset relative to the canvas origin
        const canvasRect = this.canvas.getBoundingClientRect();
        viewportBounds = {
          x: canvasRect.left + eventLayout.bounds.x,
          y: canvasRect.top + eventLayout.bounds.y,
          width: eventLayout.bounds.width,
          height: eventLayout.bounds.height,
        };
      }
    }

    this.dispatchEvent('schedule-event-hover', { 
      event,
      bounds,
      viewportBounds,
    });
  }

  /**
   * Dispatch hover end event
   */
  private dispatchHoverEnd(event: ScheduleEvent): void {
    // Include position information for consistency (useful for cleanup/animations)
    let bounds: Rect | undefined;
    let viewportBounds: Rect | undefined;

    if (this.layout) {
      const eventLayout = this.layout.events.find(e => e.event.id === event.id);
      
      if (eventLayout) {
        // Canvas content coordinates (bounds from layout)
        bounds = { ...eventLayout.bounds };
        
        // Convert to viewport coordinates (like getBoundingClientRect)
        // The canvas is inside the scroll container, so getBoundingClientRect() already accounts for scroll
        // We just need to add the bounds offset relative to the canvas origin
        const canvasRect = this.canvas.getBoundingClientRect();
        viewportBounds = {
          x: canvasRect.left + eventLayout.bounds.x,
          y: canvasRect.top + eventLayout.bounds.y,
          width: eventLayout.bounds.width,
          height: eventLayout.bounds.height,
        };
      }
    }

    this.dispatchEvent('schedule-event-hover-end', { 
      event,
      bounds,
      viewportBounds,
    });
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
