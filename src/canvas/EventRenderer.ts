/**
 * Event Renderer - Renders schedule events on canvas
 */

import type { EventLayout, ScheduleLayout, Rect, FontSpec, EventAnimationState } from './types';
import { CanvasRenderer, darkenColor, withAlpha } from './CanvasRenderer';
import { EventIcon } from '../types';

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
  render(layout: ScheduleLayout, hoveredEventId?: string): void {
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
      this.renderEvent(eventLayout, isHovered);
    }

    this.renderer.restore();
  }

  /**
   * Render a single event
   */
  renderEvent(eventLayout: EventLayout, isHovered: boolean = false): void {
    const { bounds, backgroundColor, opacity, scale, isOverflow } = eventLayout;
    const theme = this.renderer.getTheme();

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

    // Set opacity
    if (opacity < 1) {
      this.renderer.setAlpha(opacity);
    }

    // Draw shadow if enabled
    if (this.config.showShadow && !isOverflow) {
      this.renderer.drawShadow(renderBounds, this.config.shadowColor, this.config.shadowBlur);
    }

    // Draw background
    const bgColor = isHovered ? darkenColor(backgroundColor, 10) : backgroundColor;
    this.renderer.fillRoundedRect(renderBounds, bgColor, this.config.borderRadius);

    // Clear shadow for subsequent draws
    this.renderer.clearShadow();

    // Draw hover border
    if (isHovered) {
      this.renderer.strokeRoundedRect(
        renderBounds,
        theme.eventHoverBorderColor,
        this.config.borderRadius,
        this.config.hoverBorderWidth
      );
    }

    // Draw content
    if (isOverflow) {
      this.renderOverflowContent(eventLayout, renderBounds);
    } else {
      this.renderEventContent(eventLayout, renderBounds);
    }

    // Reset opacity
    if (opacity < 1) {
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
    const { event, textColor } = eventLayout;
    const padding = this.config.padding;
    
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
      
      iconWidth = this.renderIcon(event.icon, xOffset, yOffset, textColor, iconSize);
      
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
        textColor
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
        withAlpha(textColor, 0.8)
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
          withAlpha(textColor, 0.7)
        );
      }
    }
  }

  /**
   * Render overflow indicator content
   */
  private renderOverflowContent(eventLayout: EventLayout, bounds: Rect): void {
    const { event, textColor } = eventLayout;
    
    this.renderer.setFont({
      ...this.config.titleFont,
      size: this.config.titleFont.size - 1,
    });
    
    this.renderer.drawTextCentered(event.title, bounds, textColor);
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
}

/**
 * Linear interpolation
 */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
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
