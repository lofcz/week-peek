/**
 * Animation Manager - RAF-based smooth animations
 */

import type { 
  Rect, 
  Point, 
  EventAnimationState, 
  AnimationState, 
  EasingFunction 
} from './types';

/**
 * Easing functions for smooth animations
 */
export const easings: Record<EasingFunction, (t: number) => number> = {
  linear: (t) => t,
  
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  
  easeInOutBack: (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
};

/**
 * AnimationManager handles all animations for the canvas schedule
 */
export class AnimationManager {
  private state: AnimationState;
  private rafId: number | null = null;
  private onFrame: ((state: AnimationState) => void) | null = null;
  private defaultDuration: number;
  private defaultEasing: EasingFunction;

  constructor(
    defaultDuration: number = 300,
    defaultEasing: EasingFunction = 'easeOutCubic'
  ) {
    this.defaultDuration = defaultDuration;
    this.defaultEasing = defaultEasing;
    this.state = {
      isAnimating: false,
      events: new Map(),
      zoomProgress: null,
      scrollOffset: { x: 0, y: 0 },
      targetScrollOffset: { x: 0, y: 0 },
    };
  }

  /**
   * Set callback for animation frame updates
   */
  setFrameCallback(callback: (state: AnimationState) => void): void {
    this.onFrame = callback;
  }

  /**
   * Get current animation state
   */
  getState(): AnimationState {
    return this.state;
  }

  /**
   * Check if any animations are running
   */
  isAnimating(): boolean {
    return this.state.isAnimating;
  }

  /**
   * Animate an event from one position to another
   */
  animateEvent(
    eventId: string,
    from: Rect,
    to: Rect,
    options: {
      duration?: number;
      easing?: EasingFunction;
      fromOpacity?: number;
      toOpacity?: number;
      fromScale?: number;
      toScale?: number;
    } = {}
  ): void {
    const now = performance.now();
    
    const animState: EventAnimationState = {
      eventId,
      currentBounds: { ...from },
      targetBounds: { ...to },
      progress: 0,
      startTime: now,
      duration: options.duration ?? this.defaultDuration,
      easing: options.easing ?? this.defaultEasing,
      opacity: options.fromOpacity ?? 1,
      targetOpacity: options.toOpacity ?? 1,
      scale: options.fromScale ?? 1,
      targetScale: options.toScale ?? 1,
    };

    this.state.events.set(eventId, animState);
    this.startAnimationLoop();
  }

  /**
   * Animate multiple events (batch)
   */
  animateEvents(
    animations: Array<{
      eventId: string;
      from: Rect;
      to: Rect;
      options?: {
        duration?: number;
        easing?: EasingFunction;
        fromOpacity?: number;
        toOpacity?: number;
      };
    }>
  ): void {
    const now = performance.now();

    for (const anim of animations) {
      const animState: EventAnimationState = {
        eventId: anim.eventId,
        currentBounds: { ...anim.from },
        targetBounds: { ...anim.to },
        progress: 0,
        startTime: now,
        duration: anim.options?.duration ?? this.defaultDuration,
        easing: anim.options?.easing ?? this.defaultEasing,
        opacity: anim.options?.fromOpacity ?? 1,
        targetOpacity: anim.options?.toOpacity ?? 1,
        scale: 1,
        targetScale: 1,
      };

      this.state.events.set(anim.eventId, animState);
    }

    this.startAnimationLoop();
  }

  /**
   * Animate appearance of an event (fade in + scale)
   */
  animateEventAppear(
    eventId: string,
    bounds: Rect,
    options: { duration?: number; easing?: EasingFunction } = {}
  ): void {
    this.animateEvent(eventId, bounds, bounds, {
      duration: options.duration ?? this.defaultDuration,
      easing: options.easing ?? 'easeOutBack',
      fromOpacity: 0,
      toOpacity: 1,
      fromScale: 0.8,
      toScale: 1,
    });
  }

  /**
   * Animate disappearance of an event (fade out + scale)
   */
  animateEventDisappear(
    eventId: string,
    bounds: Rect,
    options: { duration?: number; easing?: EasingFunction } = {}
  ): void {
    this.animateEvent(eventId, bounds, bounds, {
      duration: options.duration ?? this.defaultDuration * 0.7,
      easing: options.easing ?? 'easeInQuad',
      fromOpacity: 1,
      toOpacity: 0,
      fromScale: 1,
      toScale: 0.8,
    });
  }

  /**
   * Start zoom animation
   */
  animateZoom(duration: number = this.defaultDuration): void {
    this.state.zoomProgress = 0;
    this.startAnimationLoop();
    
    // Animate zoom progress
    const startTime = performance.now();
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      this.state.zoomProgress = easings[this.defaultEasing](progress);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.state.zoomProgress = null;
      }
    };
    requestAnimationFrame(animate);
  }

  /**
   * Animate scroll to position
   */
  animateScrollTo(
    target: Point,
    _duration: number = this.defaultDuration
  ): void {
    this.state.targetScrollOffset = { ...target };
    this.startAnimationLoop();
  }

  /**
   * Start the animation loop
   */
  private startAnimationLoop(): void {
    if (this.rafId !== null) return;
    
    this.state.isAnimating = true;
    this.rafId = requestAnimationFrame(this.tick.bind(this));
  }

  /**
   * Stop the animation loop
   */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.state.isAnimating = false;
  }

  /**
   * Animation tick
   */
  private tick(timestamp: number): void {
    let hasActiveAnimations = false;

    // Update event animations
    for (const [eventId, animState] of this.state.events.entries()) {
      const elapsed = timestamp - animState.startTime;
      const rawProgress = Math.min(1, elapsed / animState.duration);
      const easedProgress = easings[animState.easing](rawProgress);
      
      animState.progress = easedProgress;

      if (rawProgress >= 1) {
        // Animation complete
        this.state.events.delete(eventId);
      } else {
        hasActiveAnimations = true;
      }
    }

    // Update scroll animation
    const scrollDist = distance(this.state.scrollOffset, this.state.targetScrollOffset);
    if (scrollDist > 0.5) {
      // Smooth scroll interpolation
      this.state.scrollOffset.x = lerp(
        this.state.scrollOffset.x,
        this.state.targetScrollOffset.x,
        0.15
      );
      this.state.scrollOffset.y = lerp(
        this.state.scrollOffset.y,
        this.state.targetScrollOffset.y,
        0.15
      );
      hasActiveAnimations = true;
    } else {
      this.state.scrollOffset = { ...this.state.targetScrollOffset };
    }

    // Check zoom animation
    if (this.state.zoomProgress !== null && this.state.zoomProgress < 1) {
      hasActiveAnimations = true;
    }

    // Notify frame callback
    if (this.onFrame) {
      this.onFrame(this.state);
    }

    // Continue or stop loop
    if (hasActiveAnimations) {
      this.rafId = requestAnimationFrame(this.tick.bind(this));
    } else {
      this.rafId = null;
      this.state.isAnimating = false;
    }
  }

  /**
   * Get animation state for a specific event
   */
  getEventAnimationState(eventId: string): EventAnimationState | undefined {
    return this.state.events.get(eventId);
  }

  /**
   * Check if an event is animating
   */
  isEventAnimating(eventId: string): boolean {
    return this.state.events.has(eventId);
  }

  /**
   * Cancel animation for a specific event
   */
  cancelEventAnimation(eventId: string): void {
    this.state.events.delete(eventId);
  }

  /**
   * Cancel all animations
   */
  cancelAll(): void {
    this.state.events.clear();
    this.state.zoomProgress = null;
    this.state.scrollOffset = { ...this.state.targetScrollOffset };
    this.stop();
  }

  /**
   * Interpolate bounds based on animation state
   */
  getInterpolatedBounds(eventId: string, targetBounds: Rect): Rect {
    const animState = this.state.events.get(eventId);
    if (!animState) return targetBounds;

    return {
      x: lerp(animState.currentBounds.x, animState.targetBounds.x, animState.progress),
      y: lerp(animState.currentBounds.y, animState.targetBounds.y, animState.progress),
      width: lerp(animState.currentBounds.width, animState.targetBounds.width, animState.progress),
      height: lerp(animState.currentBounds.height, animState.targetBounds.height, animState.progress),
    };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.stop();
    this.state.events.clear();
    this.onFrame = null;
  }
}

/**
 * Linear interpolation
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Distance between two points
 */
function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Create a simple spring animation
 */
export class SpringAnimation {
  private value: number;
  private velocity: number = 0;
  private target: number;
  private stiffness: number;
  private damping: number;
  private mass: number;
  private onUpdate: ((value: number) => void) | null = null;
  private onComplete: (() => void) | null = null;
  private rafId: number | null = null;
  private threshold: number = 0.01;

  constructor(
    initialValue: number,
    options: {
      stiffness?: number;
      damping?: number;
      mass?: number;
    } = {}
  ) {
    this.value = initialValue;
    this.target = initialValue;
    this.stiffness = options.stiffness ?? 170;
    this.damping = options.damping ?? 26;
    this.mass = options.mass ?? 1;
  }

  /**
   * Set target value and start animation
   */
  animateTo(
    target: number,
    onUpdate?: (value: number) => void,
    onComplete?: () => void
  ): void {
    this.target = target;
    this.onUpdate = onUpdate ?? null;
    this.onComplete = onComplete ?? null;
    this.start();
  }

  /**
   * Get current value
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Start animation loop
   */
  private start(): void {
    if (this.rafId !== null) return;
    
    let lastTime = performance.now();
    
    const tick = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTime) / 1000, 0.064); // Cap at ~15fps minimum
      lastTime = timestamp;

      // Spring physics
      const displacement = this.value - this.target;
      const springForce = -this.stiffness * displacement;
      const dampingForce = -this.damping * this.velocity;
      const acceleration = (springForce + dampingForce) / this.mass;
      
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;

      // Notify update
      if (this.onUpdate) {
        this.onUpdate(this.value);
      }

      // Check if settled
      if (Math.abs(this.velocity) < this.threshold && Math.abs(displacement) < this.threshold) {
        this.value = this.target;
        this.velocity = 0;
        this.rafId = null;
        if (this.onComplete) {
          this.onComplete();
        }
        return;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Stop animation
   */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Immediately set value
   */
  setValue(value: number): void {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }
}

/**
 * Create a 2D spring animation for points
 */
export class SpringAnimation2D {
  private springX: SpringAnimation;
  private springY: SpringAnimation;

  constructor(
    initial: Point,
    options: { stiffness?: number; damping?: number; mass?: number } = {}
  ) {
    this.springX = new SpringAnimation(initial.x, options);
    this.springY = new SpringAnimation(initial.y, options);
  }

  animateTo(
    target: Point,
    onUpdate?: (point: Point) => void,
    onComplete?: () => void
  ): void {
    let xDone = false;
    let yDone = false;
    
    const checkComplete = () => {
      if (xDone && yDone && onComplete) {
        onComplete();
      }
    };

    this.springX.animateTo(
      target.x,
      () => {
        if (onUpdate) {
          onUpdate(this.getValue());
        }
      },
      () => {
        xDone = true;
        checkComplete();
      }
    );

    this.springY.animateTo(
      target.y,
      undefined,
      () => {
        yDone = true;
        checkComplete();
      }
    );
  }

  getValue(): Point {
    return {
      x: this.springX.getValue(),
      y: this.springY.getValue(),
    };
  }

  setValue(point: Point): void {
    this.springX.setValue(point.x);
    this.springY.setValue(point.y);
  }

  stop(): void {
    this.springX.stop();
    this.springY.stop();
  }
}
