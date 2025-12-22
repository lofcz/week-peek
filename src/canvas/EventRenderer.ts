/**
 * Event Renderer - Renders schedule events on canvas
 */

import type { EventLayout, ScheduleLayout, Rect, FontSpec, EventAnimationState } from './types';
import { CanvasRenderer, withAlpha } from './CanvasRenderer';
import { EventIcon, ScheduleEvent } from '../types';

/**
 * Configuration for event rendering
 */
export interface EventRendererConfig {
  /** Title font */
  titleFont: FontSpec;
  /** Time font */
  timeFont: FontSpec;
  /** Description font */
  descriptionFont: FontSpec;
  /** Padding inside events */
  padding: number;
  /** Border radius */
  borderRadius: number;
  /** Show event shadow */
  showShadow: boolean;
  /** Shadow blur radius */
  shadowBlur: number;
  /** Shadow color */
  shadowColor: string;
  /** Hover border width */
  hoverBorderWidth: number;
  /** Minimum height to show time */
  minHeightForTime: number;
  /** Minimum height to show description */
  minHeightForDescription: number;
  /** Line height multiplier */
  lineHeight: number;
  /** Spacing between icon and title */
  iconSpacing: number;
}

const DEFAULT_CONFIG: EventRendererConfig = {
  titleFont: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: 13,
    weight: 600,
  },
  timeFont: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: 11,
    weight: 400,
  },
  descriptionFont: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    size: 11,
    weight: 400,
  },
  padding: 6,
  borderRadius: 4,
  showShadow: false,
  shadowBlur: 4,
  shadowColor: 'rgba(0, 0, 0, 0.15)',
  hoverBorderWidth: 2,
  minHeightForTime: 40,
  minHeightForDescription: 80,
  lineHeight: 1.3,
  iconSpacing: 4,
};

/**
 * Text color for event content (used for all events)
 */
const EVENT_TEXT_COLOR = '#000000';

/**
 * EventRenderer handles rendering of schedule events
 */
export class EventRenderer {
  private renderer: CanvasRenderer;
  private config: EventRendererConfig;
  private imageCache: Map<string, HTMLImageElement> = new Map();
  private imageLoadPromises: Map<string, Promise<HTMLImageElement>> = new Map();

  constructor(renderer: CanvasRenderer, config: Partial<EventRendererConfig> = {}) {
    this.renderer = renderer;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EventRendererConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Load an image from URL with caching
   * Returns the cached image if available, otherwise loads and caches it
   */
  private loadImage(url: string): HTMLImageElement | null {
    // Return cached image if available
    const cached = this.imageCache.get(url);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      return cached;
    }

    // If already loading, return null (will be rendered on next frame after load)
    if (this.imageLoadPromises.has(url)) {
      return null;
    }

    // Start loading
    const img = new Image();
    img.crossOrigin = 'anonymous'; // Allow CORS if needed
    
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => {
        this.imageCache.set(url, img);
        this.imageLoadPromises.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        this.imageLoadPromises.delete(url);
        reject(new Error(`Failed to load image: ${url}`));
      };
    });

    this.imageLoadPromises.set(url, promise);
    img.src = url;

    return null; // Image not loaded yet
  }

  /**
   * Render all events
   */
  render(
    layout: ScheduleLayout,
    hoveredEventId?: string,
    highlightPredicate?: ((event: ScheduleEvent) => boolean) | null
  ): void {
    // Sort events by size (larger first) for better overlap handling
    const sortedEvents = [...layout.events].sort((a, b) => {
      const areaA = a.bounds.width * a.bounds.height;
      const areaB = b.bounds.width * b.bounds.height;
      return areaB - areaA;
    });

    // Clip to grid bounds
    this.renderer.save();
    this.renderer.clip(layout.gridBounds);

    for (const eventLayout of sortedEvents) {
      const isHovered = eventLayout.event.id === hoveredEventId;
      
      // Check if event should be highlighted
      const isHighlighted = highlightPredicate
        ? highlightPredicate(eventLayout.event)
        : true;
      
      // Pass highlight state to renderEvent
      this.renderEvent(eventLayout, isHovered, isHighlighted);
    }

    this.renderer.restore();
  }

  /**
   * Render a single event
   */
  renderEvent(eventLayout: EventLayout, _isHovered: boolean = false, isHighlighted: boolean = true): void {
    const { bounds, backgroundColor, opacity, scale, isOverflow } = eventLayout;

    // Apply animation transforms
    let renderBounds = bounds;
    if (scale !== 1) {
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const scaledWidth = bounds.width * scale;
      const scaledHeight = bounds.height * scale;
      renderBounds = {
        x: centerX - scaledWidth / 2,
        y: centerY - scaledHeight / 2,
        width: scaledWidth,
        height: scaledHeight,
      };
    }

    // Combine animation opacity with highlight opacity (50% for non-highlighted)
    const highlightOpacity = isHighlighted ? 1.0 : 0.5;
    const combinedOpacity = opacity * highlightOpacity;
    if (combinedOpacity < 1) {
      this.renderer.setAlpha(combinedOpacity);
    }

    // Draw shadow if enabled
    if (this.config.showShadow && !isOverflow) {
      this.renderer.drawShadow(renderBounds, this.config.shadowColor, this.config.shadowBlur);
    }

    const bgColor = desaturateColor(backgroundColor, 0.7);
    const borderColor = backgroundColor;

    this.renderer.fillRoundedRect(renderBounds, bgColor, this.config.borderRadius);

    this.renderer.clearShadow();

    this.renderer.strokeRoundedRect(
      renderBounds,
      borderColor,
      this.config.borderRadius,
      1
    );

    // Draw content (always use black text now)
    if (isOverflow) {
      this.renderOverflowContent(eventLayout, renderBounds);
    } else {
      this.renderEventContent(eventLayout, renderBounds);
    }

    // Reset opacity
    if (combinedOpacity < 1) {
      this.renderer.resetAlpha();
    }
  }

  /**
   * Render an event icon and return its width
   * @param icon - The icon to render
   * @param x - X position for icon
   * @param y - Y position (same as title's yOffset, which is contentBounds.y)
   * @param textColor - Color to use for font icons
   * @param defaultSize - Default size if icon doesn't specify one
   * @returns Width of the rendered icon (0 if not rendered)
   */
  private renderIcon(
    icon: EventIcon,
    x: number,
    y: number,
    textColor: string,
    defaultSize: number
  ): number {
    const iconSize = icon.size ?? defaultSize;

    switch (icon.type) {
      case 'font': {
        // Render icon font character
        // Use the font family from icon config, or fall back to title font
        // Material Symbols font name should match CSS exactly: 'Material Symbols Outlined'
        let fontFamily = icon.fontFamily ?? this.config.titleFont.family;
        
        // Normalize Material Symbols font names to the CSS font name
        if (fontFamily === 'material-symbols-outlined' || fontFamily.includes('Material Symbols')) {
          fontFamily = 'Material Symbols Outlined';
        }
        
        this.renderer.setFont({
          family: fontFamily,
          size: iconSize,
          weight: this.config.titleFont.weight,
        });
        // Draw icon aligned to the title's visual center
        // Use the same alignment as the title text
        this.renderer.drawText(icon.content, x, y, textColor, 'left', 'top');
        return iconSize;
      }

      case 'image': {
        // Render preloaded image
        if (icon.image.complete && icon.image.naturalWidth > 0) {
          this.renderer.drawImage(icon.image, {
            x,
            y,
            width: iconSize,
            height: iconSize,
          });
          return iconSize;
        }
        return 0; // Image not loaded yet
      }

      case 'url': {
        // Load and render image from URL
        const loadedImage = this.loadImage(icon.url);
        if (loadedImage) {
          this.renderer.drawImage(loadedImage, {
            x,
            y,
            width: iconSize,
            height: iconSize,
          });
          return iconSize;
        }
        return 0; // Image not loaded yet
      }
    }
  }

  /**
   * Render event content (title, time, description)
   */
  private renderEventContent(eventLayout: EventLayout, bounds: Rect): void {
    const { event } = eventLayout;
    const padding = this.config.padding;
    
    // Always use configured text color for all events
    const displayTextColor = EVENT_TEXT_COLOR;
    
    // Calculate content area
    const contentBounds: Rect = {
      x: bounds.x + padding,
      y: bounds.y + padding,
      width: bounds.width - padding * 2,
      height: bounds.height - padding * 2,
    };

    if (contentBounds.width <= 0 || contentBounds.height <= 0) return;

    let yOffset = contentBounds.y;
    let xOffset = contentBounds.x;

    // Render icon if present
    let iconWidth = 0;
    if (event.icon) {
      const iconSize = event.icon.size ?? this.config.titleFont.size;
      
      iconWidth = this.renderIcon(event.icon, xOffset, yOffset, displayTextColor, iconSize);
      
      if (iconWidth > 0) {
        xOffset += iconWidth + this.config.iconSpacing;
      }
    }

    // Render title
    this.renderer.setFont(this.config.titleFont);
    const titleHeight = this.config.titleFont.size * this.config.lineHeight;
    const titleWidth = contentBounds.width - (iconWidth > 0 ? iconWidth + this.config.iconSpacing : 0);
    
    if (titleWidth > 0) {
      this.renderer.drawTextEllipsis(
        event.title,
        {
          x: xOffset,
          y: yOffset,
          width: titleWidth,
          height: titleHeight,
        },
        displayTextColor
      );
    }
    yOffset += titleHeight;

    // Render time if there's enough space
    if (bounds.height >= this.config.minHeightForTime) {
      const timeStr = `${event.startTime.toString()} - ${event.endTime.toString()}`;
      this.renderer.setFont(this.config.timeFont);
      const timeHeight = this.config.timeFont.size * this.config.lineHeight;
      
      this.renderer.drawTextEllipsis(
        timeStr,
        {
          x: contentBounds.x,
          y: yOffset,
          width: contentBounds.width,
          height: timeHeight,
        },
        withAlpha(displayTextColor, 0.8)
      );
      yOffset += timeHeight;
    }

    // Render description if there's enough space
    if (bounds.height >= this.config.minHeightForDescription && event.description) {
      this.renderer.setFont(this.config.descriptionFont);
      const descHeight = this.config.descriptionFont.size * this.config.lineHeight;
      const remainingHeight = contentBounds.y + contentBounds.height - yOffset;
      
      if (remainingHeight >= descHeight) {
        this.renderer.drawTextEllipsis(
          event.description,
          {
            x: contentBounds.x,
            y: yOffset,
            width: contentBounds.width,
            height: remainingHeight,
          },
          withAlpha(displayTextColor, 0.7)
        );
      }
    }
  }

  /**
   * Render overflow indicator content
   */
  private renderOverflowContent(eventLayout: EventLayout, bounds: Rect): void {
    const { event } = eventLayout;
    
    // Always use configured text color
    const displayTextColor = EVENT_TEXT_COLOR;
    
    this.renderer.setFont({
      ...this.config.titleFont,
      size: this.config.titleFont.size - 1,
    });
    
    this.renderer.drawTextCentered(event.title, bounds, displayTextColor);
  }

  /**
   * Render event with animation state
   */
  renderAnimatedEvent(
    eventLayout: EventLayout,
    animState: EventAnimationState,
    isHovered: boolean = false
  ): void {
    // Interpolate bounds
    const progress = animState.progress;
    const currentBounds: Rect = {
      x: lerp(animState.currentBounds.x, animState.targetBounds.x, progress),
      y: lerp(animState.currentBounds.y, animState.targetBounds.y, progress),
      width: lerp(animState.currentBounds.width, animState.targetBounds.width, progress),
      height: lerp(animState.currentBounds.height, animState.targetBounds.height, progress),
    };

    // Create modified layout with animated values
    const animatedLayout: EventLayout = {
      ...eventLayout,
      bounds: currentBounds,
      opacity: lerp(animState.opacity, animState.targetOpacity, progress),
      scale: lerp(animState.scale, animState.targetScale, progress),
    };

    this.renderEvent(animatedLayout, isHovered);
  }

  /**
   * Render all events in mobile layout (list style)
   */
  renderMobile(
    layout: ScheduleLayout,
    highlightPredicate?: ((event: ScheduleEvent) => boolean) | null
  ): void {
    // Clip to grid bounds
    this.renderer.save();
    this.renderer.clip(layout.gridBounds);

    for (const eventLayout of layout.events) {
      // Check if event should be highlighted
      const isHighlighted = highlightPredicate
        ? highlightPredicate(eventLayout.event)
        : true;
      
      this.renderMobileEvent(eventLayout, isHighlighted);
    }

    this.renderer.restore();
  }

  /**
   * Render a single event in mobile list style
   * Format: [start time] [title with time range below]
   */
  renderMobileEvent(eventLayout: EventLayout, isHighlighted: boolean = true): void {
    const { event, bounds, backgroundColor, opacity } = eventLayout;
    
    const BORDER_RADIUS = 6;
    const PADDING = 16; // Increased from 12 for more vertical padding
    const TIME_WIDTH = 60;
    const GAP = 6; // Reduced gap between start time and title
    
    // Combine animation opacity with highlight opacity (50% for non-highlighted)
    const highlightOpacity = isHighlighted ? 1.0 : 0.5;
    const combinedOpacity = opacity * highlightOpacity;
    if (combinedOpacity < 1) {
      this.renderer.setAlpha(combinedOpacity);
    }
    
    // All events get desaturated background with 1px border
    const bgColor = desaturateColor(backgroundColor, 0.7);
    const borderColor = backgroundColor; // Use original color for border
    
    // Draw background
    this.renderer.fillRoundedRect(bounds, bgColor, BORDER_RADIUS);
    
    // Draw 1px border with event color
    this.renderer.strokeRoundedRect(bounds, borderColor, BORDER_RADIUS, 1);
    
    // Calculate content positions
    const leftX = bounds.x + PADDING;
    const rightX = leftX + TIME_WIDTH + GAP;
    const rightWidth = bounds.x + bounds.width - rightX - PADDING;
    
    // Draw start time on the left (black)
    const startTimeStr = event.startTime.toString();
    this.renderer.setFont({
      ...this.config.timeFont,
      size: 14,
      weight: 500,
    });
    this.renderer.drawText(
      startTimeStr,
      leftX,
      bounds.y + bounds.height / 2,
      EVENT_TEXT_COLOR,
      'left',
      'middle'
    );
    
    // Draw title on the right (black)
    if (rightWidth > 0) {
      const titleFont = {
        ...this.config.titleFont,
        size: 14,
      };
      this.renderer.setFont(titleFont);
      const titleHeight = titleFont.size * this.config.lineHeight;
      const titleY = bounds.y + (bounds.height - titleHeight - 12) / 2; // Position title above time range
      
      this.renderer.drawTextEllipsis(
        event.title,
        {
          x: rightX,
          y: titleY,
          width: rightWidth,
          height: titleHeight,
        },
        EVENT_TEXT_COLOR
      );
      
      // Draw time range under title in smaller font (slightly less dark gray)
      const timeRangeStr = `${event.startTime.toString()} - ${event.endTime.toString()}`;
      this.renderer.setFont({
        ...this.config.timeFont,
        size: 11,
      });
      const timeRangeY = titleY + titleHeight + 2;
      this.renderer.drawTextEllipsis(
        timeRangeStr,
        {
          x: rightX,
          y: timeRangeY,
          width: rightWidth,
          height: 14,
        },
        '#666666' // Slightly less dark gray
      );
    }
    
    // Reset alpha after rendering if combined opacity was less than 1
    if (combinedOpacity < 1) {
      this.renderer.resetAlpha();
    }
  }
}

/**
 * Linear interpolation
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Convert sRGB to linear RGB
 */
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * Convert linear RGB to sRGB
 */
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, v)) * 255);
}

/**
 * Convert linear RGB to oklab
 */
function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  // Convert to linear RGB
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  
  // Convert to LMS cone space
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  
  // Apply cube root
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  
  // Convert to oklab
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

/**
 * Convert oklab to linear RGB
 */
function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  // Convert from oklab to LMS
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  
  // Cube
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  
  // Convert to linear RGB
  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  
  // Convert to sRGB
  return [
    linearToSrgb(lr),
    linearToSrgb(lg),
    linearToSrgb(lb),
  ];
}

/**
 * Desaturate a color by mixing it with white in oklab color space
 * @param color - Hex color string (e.g., '#3b82f6')
 * @param amount - Amount to desaturate (0-1, where 1 is fully white)
 * @returns Desaturated color as hex string
 */
function desaturateColor(color: string, amount: number = 0.7): string {
  // Parse hex color
  const hex = color.replace('#', '');
  const red = parseInt(hex.substring(0, 2), 16);
  const green = parseInt(hex.substring(2, 4), 16);
  const blue = parseInt(hex.substring(4, 6), 16);
  
  // Convert to oklab
  const [L1, a1, b1] = rgbToOklab(red, green, blue);
  
  // White in oklab is [1, 0, 0]
  const L2 = 1;
  const a2 = 0;
  const b2 = 0;
  
  // Mix in oklab space
  const L = L1 + (L2 - L1) * amount;
  const a = a1 + (a2 - a1) * amount;
  const bMixed = b1 + (b2 - b1) * amount;
  
  // Convert back to RGB
  const [mixR, mixG, mixB] = oklabToRgb(L, a, bMixed);
  
  // Convert to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mixR)}${toHex(mixG)}${toHex(mixB)}`;
}

/**
 * Render a selection highlight around an event
 */
export function renderEventSelection(
  renderer: CanvasRenderer,
  bounds: Rect,
  color: string = 'rgba(59, 130, 246, 0.3)',
  borderRadius: number = 4,
  padding: number = 2
): void {
  const expandedBounds: Rect = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
  
  renderer.fillRoundedRect(expandedBounds, color, borderRadius);
}

/**
 * Render a dragging preview of an event
 */
export function renderEventDragPreview(
  renderer: CanvasRenderer,
  eventLayout: EventLayout,
  offsetX: number,
  offsetY: number,
  eventRenderer: EventRenderer
): void {
  renderer.save();
  renderer.setAlpha(0.7);
  
  const previewLayout: EventLayout = {
    ...eventLayout,
    bounds: {
      ...eventLayout.bounds,
      x: eventLayout.bounds.x + offsetX,
      y: eventLayout.bounds.y + offsetY,
    },
  };
  
  eventRenderer.renderEvent(previewLayout, false);
  renderer.restore();
}

// Drag n Drop is not something we need @ddcveng
/**
 * Render drop zone highlight
 */
export function renderDropZone(
  renderer: CanvasRenderer,
  bounds: Rect,
  color: string = 'rgba(59, 130, 246, 0.2)',
  borderColor: string = '#3b82f6',
  borderRadius: number = 4
): void {
  renderer.fillRoundedRect(bounds, color, borderRadius);
  renderer.strokeRoundedRect(bounds, borderColor, borderRadius, 2);
}
