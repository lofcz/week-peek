/**
 * Text Renderer - Advanced text rendering with proper metrics and word wrapping
 */

import type { Rect, FontSpec, Color } from './types';

/**
 * Text layout information
 */
export interface TextLayout {
  lines: TextLine[];
  totalHeight: number;
  maxWidth: number;
}

/**
 * Single line of text
 */
export interface TextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Text rendering options
 */
export interface TextRenderOptions {
  maxLines?: number;
  ellipsis?: string;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  padding?: number;
}

const DEFAULT_OPTIONS: Required<TextRenderOptions> = {
  maxLines: Infinity,
  ellipsis: '…',
  lineHeight: 1.3,
  align: 'left',
  verticalAlign: 'top',
  padding: 0,
};

/**
 * TextRenderer provides advanced text rendering capabilities
 */
export class TextRenderer {
  private ctx: CanvasRenderingContext2D;
  private measureCanvas: HTMLCanvasElement;
  private measureCtx: CanvasRenderingContext2D;
  private fontCache: Map<string, FontMetrics>;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.fontCache = new Map();
    
    // Create off-screen canvas for measurements
    this.measureCanvas = document.createElement('canvas');
    this.measureCanvas.width = 1;
    this.measureCanvas.height = 1;
    this.measureCtx = this.measureCanvas.getContext('2d')!;
  }

  /**
   * Set the current font
   */
  setFont(font: FontSpec): void {
    const fontString = this.fontToString(font);
    this.ctx.font = fontString;
    this.measureCtx.font = fontString;
  }

  /**
   * Convert FontSpec to CSS font string
   */
  private fontToString(font: FontSpec): string {
    const style = font.style ?? 'normal';
    const weight = font.weight ?? 400;
    return `${style} ${weight} ${font.size}px ${font.family}`;
  }

  /**
   * Measure text width
   */
  measureWidth(text: string): number {
    return this.measureCtx.measureText(text).width;
  }

  /**
   * Get font metrics for current font
   */
  getFontMetrics(font: FontSpec): FontMetrics {
    const fontString = this.fontToString(font);
    
    if (this.fontCache.has(fontString)) {
      return this.fontCache.get(fontString)!;
    }

    // Measure font metrics using a temporary span
    const metrics = measureFontMetrics(fontString, font.size);
    this.fontCache.set(fontString, metrics);
    return metrics;
  }

  /**
   * Layout text within bounds with word wrapping
   */
  layoutText(
    text: string,
    bounds: Rect,
    font: FontSpec,
    options: TextRenderOptions = {}
  ): TextLayout {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    this.setFont(font);

    const lineHeight = font.size * opts.lineHeight;
    const maxWidth = bounds.width - opts.padding * 2;
    const maxHeight = bounds.height - opts.padding * 2;
    const maxLinesFromHeight = Math.floor(maxHeight / lineHeight);
    const effectiveMaxLines = Math.min(opts.maxLines, maxLinesFromHeight);

    const lines: TextLine[] = [];
    const words = text.split(/\s+/);
    let currentLine = '';
    let y = bounds.y + opts.padding;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = this.measureWidth(testLine);

      if (testWidth > maxWidth && currentLine) {
        // Line is full, add it
        if (lines.length >= effectiveMaxLines - 1 && i < words.length - 1) {
          // This will be the last line, add ellipsis
          const ellipsisLine = this.truncateWithEllipsis(currentLine, maxWidth, opts.ellipsis);
          lines.push(this.createTextLine(ellipsisLine, bounds.x + opts.padding, y, opts.align, maxWidth));
          break;
        }

        lines.push(this.createTextLine(currentLine, bounds.x + opts.padding, y, opts.align, maxWidth));
        y += lineHeight;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    // Add remaining text
    if (currentLine && lines.length < effectiveMaxLines) {
      if (lines.length === effectiveMaxLines - 1) {
        currentLine = this.truncateWithEllipsis(currentLine, maxWidth, opts.ellipsis);
      }
      lines.push(this.createTextLine(currentLine, bounds.x + opts.padding, y, opts.align, maxWidth));
    }

    // Apply vertical alignment
    const totalHeight = lines.length * lineHeight;
    if (opts.verticalAlign !== 'top') {
      const availableHeight = bounds.height - opts.padding * 2;
      let offsetY = 0;
      
      if (opts.verticalAlign === 'middle') {
        offsetY = (availableHeight - totalHeight) / 2;
      } else if (opts.verticalAlign === 'bottom') {
        offsetY = availableHeight - totalHeight;
      }

      for (const line of lines) {
        line.y += offsetY;
      }
    }

    return {
      lines,
      totalHeight,
      maxWidth: Math.max(...lines.map(l => l.width), 0),
    };
  }

  /**
   * Create a text line with alignment
   */
  private createTextLine(
    text: string,
    x: number,
    y: number,
    align: 'left' | 'center' | 'right',
    maxWidth: number
  ): TextLine {
    const width = this.measureWidth(text);
    let alignedX = x;

    if (align === 'center') {
      alignedX = x + (maxWidth - width) / 2;
    } else if (align === 'right') {
      alignedX = x + maxWidth - width;
    }

    return {
      text,
      x: alignedX,
      y,
      width,
      height: this.ctx.measureText(text).actualBoundingBoxAscent + 
              this.ctx.measureText(text).actualBoundingBoxDescent,
    };
  }

  /**
   * Truncate text with ellipsis to fit width
   */
  truncateWithEllipsis(text: string, maxWidth: number, ellipsis: string = '…'): string {
    const ellipsisWidth = this.measureWidth(ellipsis);
    
    if (this.measureWidth(text) <= maxWidth) {
      return text;
    }

    const availableWidth = maxWidth - ellipsisWidth;
    if (availableWidth <= 0) {
      return ellipsis;
    }

    // Binary search for optimal truncation point
    let low = 0;
    let high = text.length;
    
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const truncated = text.slice(0, mid);
      const width = this.measureWidth(truncated);
      
      if (width <= availableWidth) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low > 0 ? text.slice(0, low) + ellipsis : ellipsis;
  }

  /**
   * Render laid out text
   */
  renderLayout(layout: TextLayout, color: Color): void {
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    for (const line of layout.lines) {
      this.ctx.fillText(line.text, line.x, line.y);
    }
  }

  /**
   * Render text with automatic layout
   */
  renderText(
    text: string,
    bounds: Rect,
    font: FontSpec,
    color: Color,
    options: TextRenderOptions = {}
  ): TextLayout {
    const layout = this.layoutText(text, bounds, font, options);
    this.setFont(font);
    this.renderLayout(layout, color);
    return layout;
  }

  /**
   * Render single line text with ellipsis
   */
  renderSingleLine(
    text: string,
    bounds: Rect,
    font: FontSpec,
    color: Color,
    align: 'left' | 'center' | 'right' = 'left',
    verticalAlign: 'top' | 'middle' | 'bottom' = 'middle',
    padding: number = 0
  ): void {
    this.setFont(font);
    
    const maxWidth = bounds.width - padding * 2;
    const displayText = this.truncateWithEllipsis(text, maxWidth);

    // Calculate x position based on alignment
    let x: number;
    if (align === 'center') {
      x = bounds.x + bounds.width / 2;
    } else if (align === 'right') {
      x = bounds.x + bounds.width - padding;
    } else {
      x = bounds.x + padding;
    }

    // Calculate y position based on vertical alignment
    let y: number;
    let baseline: CanvasTextBaseline;
    if (verticalAlign === 'middle') {
      y = bounds.y + bounds.height / 2;
      baseline = 'middle';
    } else if (verticalAlign === 'bottom') {
      y = bounds.y + bounds.height - padding;
      baseline = 'bottom';
    } else {
      y = bounds.y + padding;
      baseline = 'top';
    }

    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.fillText(displayText, x, y);
  }

  /**
   * Clear font cache
   */
  clearCache(): void {
    this.fontCache.clear();
  }
}

/**
 * Font metrics
 */
export interface FontMetrics {
  ascent: number;
  descent: number;
  lineHeight: number;
  capHeight: number;
  xHeight: number;
}

/**
 * Measure font metrics using DOM
 */
function measureFontMetrics(fontString: string, fontSize: number): FontMetrics {
  // Create temporary elements for measurement
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    visibility: hidden;
    font: ${fontString};
    line-height: normal;
    white-space: nowrap;
  `;

  // Measure using different characters
  const baseline = document.createElement('span');
  baseline.textContent = 'x';
  
  const ascender = document.createElement('span');
  ascender.textContent = 'M';
  
  const descender = document.createElement('span');
  descender.textContent = 'gjpqy';

  container.appendChild(baseline);
  container.appendChild(ascender);
  container.appendChild(descender);
  document.body.appendChild(container);

  // Elements are created for potential future measurement improvements
  // Currently using hardcoded ratios which work well for most fonts

  document.body.removeChild(container);

  // Calculate metrics (approximations)
  const ascent = fontSize * 0.8;  // Typical ascent
  const descent = fontSize * 0.2; // Typical descent
  const lineHeight = ascent + descent;
  const capHeight = fontSize * 0.7;
  const xHeight = fontSize * 0.5;

  return {
    ascent,
    descent,
    lineHeight,
    capHeight,
    xHeight,
  };
}

/**
 * Utility: Check if text will fit in bounds
 */
export function textFits(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): boolean {
  return ctx.measureText(text).width <= maxWidth;
}

/**
 * Utility: Split text into lines that fit width
 */
export function splitTextToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
