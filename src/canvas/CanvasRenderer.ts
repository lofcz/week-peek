/**
 * Canvas Renderer - Low-level drawing primitives and utilities
 */

import type { Rect, Point, Color, FontSpec, CanvasTheme } from './types';
import { DEFAULT_THEME } from './LayoutEngine';

/**
 * CanvasRenderer provides low-level drawing primitives
 * with high-DPI support and consistent styling
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private dpr: number;
  private theme: CanvasTheme;

  constructor(
    canvas: HTMLCanvasElement,
    theme: Partial<CanvasTheme> = {}
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }
    this.ctx = ctx;
    this.dpr = window.devicePixelRatio || 1;
    this.theme = { ...DEFAULT_THEME, ...theme };
  }

  /**
   * Resize canvas to match container size with high-DPI support
   */
  resize(width: number, height: number): void {
    this.dpr = window.devicePixelRatio || 1;
    
    // Set actual size in memory (scaled for retina)
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);
    
    // Scale context to match
    this.ctx.scale(this.dpr, this.dpr);
  }

  /**
   * Get logical (CSS) dimensions
   */
  getSize(): { width: number; height: number } {
    return {
      width: this.canvas.width / this.dpr,
      height: this.canvas.height / this.dpr,
    };
  }

  /**
   * Get device pixel ratio
   */
  getDevicePixelRatio(): number {
    return this.dpr;
  }

  /**
   * Get the raw canvas context for advanced operations
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Get theme
   */
  getTheme(): CanvasTheme {
    return this.theme;
  }

  /**
   * Update theme
   */
  setTheme(theme: Partial<CanvasTheme>): void {
    this.theme = { ...this.theme, ...theme };
  }

  /**
   * Clear entire canvas
   */
  clear(color?: Color): void {
    const { width, height } = this.getSize();
    this.ctx.fillStyle = color ?? this.theme.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);
  }

  /**
   * Clear a specific region
   */
  clearRect(rect: Rect, color?: Color): void {
    this.ctx.fillStyle = color ?? this.theme.backgroundColor;
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  /**
   * Save canvas state
   */
  save(): void {
    this.ctx.save();
  }

  /**
   * Restore canvas state
   */
  restore(): void {
    this.ctx.restore();
  }

  /**
   * Set clipping region
   */
  clip(rect: Rect): void {
    this.ctx.beginPath();
    this.ctx.rect(rect.x, rect.y, rect.width, rect.height);
    this.ctx.clip();
  }

  /**
   * Translate canvas origin
   */
  translate(x: number, y: number): void {
    this.ctx.translate(x, y);
  }

  /**
   * Scale canvas
   */
  scale(x: number, y: number): void {
    this.ctx.scale(x, y);
  }

  /**
   * Set global alpha
   */
  setAlpha(alpha: number): void {
    this.ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  }

  /**
   * Reset global alpha
   */
  resetAlpha(): void {
    this.ctx.globalAlpha = 1;
  }

  // ==================== Drawing Primitives ====================

  /**
   * Fill a rectangle
   */
  fillRect(rect: Rect, color: Color): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  /**
   * Stroke a rectangle
   */
  strokeRect(rect: Rect, color: Color, lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    // Offset by half pixel for crisp lines
    const offset = lineWidth % 2 === 1 ? 0.5 : 0;
    this.ctx.strokeRect(
      rect.x + offset,
      rect.y + offset,
      rect.width,
      rect.height
    );
  }

  /**
   * Fill a rounded rectangle
   */
  fillRoundedRect(rect: Rect, color: Color, radius: number): void {
    this.ctx.fillStyle = color;
    this.roundedRectPath(rect, radius);
    this.ctx.fill();
  }

  /**
   * Stroke a rounded rectangle
   */
  strokeRoundedRect(
    rect: Rect,
    color: Color,
    radius: number,
    lineWidth: number = 1
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.roundedRectPath(rect, radius);
    this.ctx.stroke();
  }

  /**
   * Create rounded rectangle path
   */
  private roundedRectPath(rect: Rect, radius: number): void {
    const { x, y, width, height } = rect;
    const r = Math.min(radius, width / 2, height / 2);
    
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + width - r, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this.ctx.lineTo(x + width, y + height - r);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.ctx.lineTo(x + r, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  /**
   * Draw a line
   */
  drawLine(
    start: Point,
    end: Point,
    color: Color,
    lineWidth: number = 1,
    dash?: number[]
  ): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    
    if (dash) {
      this.ctx.setLineDash(dash);
    }
    
    // Offset for crisp lines
    const offset = lineWidth % 2 === 1 ? 0.5 : 0;
    
    this.ctx.beginPath();
    this.ctx.moveTo(Math.floor(start.x) + offset, Math.floor(start.y) + offset);
    this.ctx.lineTo(Math.floor(end.x) + offset, Math.floor(end.y) + offset);
    this.ctx.stroke();
    
    if (dash) {
      this.ctx.setLineDash([]);
    }
  }

  /**
   * Draw horizontal line
   */
  drawHorizontalLine(
    y: number,
    startX: number,
    endX: number,
    color: Color,
    lineWidth: number = 1
  ): void {
    this.drawLine({ x: startX, y }, { x: endX, y }, color, lineWidth);
  }

  /**
   * Draw vertical line
   */
  drawVerticalLine(
    x: number,
    startY: number,
    endY: number,
    color: Color,
    lineWidth: number = 1
  ): void {
    this.drawLine({ x, y: startY }, { x, y: endY }, color, lineWidth);
  }

  // ==================== Text Rendering ====================

  /**
   * Set font for text rendering
   */
  setFont(font: FontSpec): void {
    const style = font.style ?? 'normal';
    const weight = font.weight ?? 400;
    this.ctx.font = `${style} ${weight} ${font.size}px ${font.family}`;
  }

  /**
   * Measure text width
   */
  measureText(text: string): TextMetrics {
    return this.ctx.measureText(text);
  }

  /**
   * Draw text with basic positioning
   */
  drawText(
    text: string,
    x: number,
    y: number,
    color: Color,
    align: CanvasTextAlign = 'left',
    baseline: CanvasTextBaseline = 'top'
  ): void {
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = baseline;
    this.ctx.fillText(text, x, y);
  }

  /**
   * Draw text centered in a rectangle
   */
  drawTextCentered(text: string, rect: Rect, color: Color): void {
    this.drawText(
      text,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      color,
      'center',
      'middle'
    );
  }

  /**
   * Draw text with ellipsis if it exceeds width
   */
  drawTextEllipsis(
    text: string,
    rect: Rect,
    color: Color,
    padding: number = 0
  ): void {
    const maxWidth = rect.width - padding * 2;
    if (maxWidth <= 0) return;

    let displayText = text;
    const metrics = this.measureText(text);
    
    if (metrics.width > maxWidth) {
      // Binary search for ellipsis position
      let low = 0;
      let high = text.length;
      
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const testText = text.slice(0, mid) + '…';
        const testWidth = this.measureText(testText).width;
        
        if (testWidth <= maxWidth) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      
      displayText = low > 0 ? text.slice(0, low) + '…' : '…';
    }

    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(displayText, rect.x + padding, rect.y + padding);
  }

  // ==================== Effects ====================

  /**
   * Draw shadow for a rectangle
   */
  drawShadow(_rect: Rect, color: Color, blur: number, offsetX: number = 0, offsetY: number = 2): void {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur;
    this.ctx.shadowOffsetX = offsetX;
    this.ctx.shadowOffsetY = offsetY;
  }

  /**
   * Clear shadow
   */
  clearShadow(): void {
    this.ctx.shadowColor = 'transparent';
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }

  /**
   * Draw a gradient-filled rectangle
   */
  fillGradientRect(
    rect: Rect,
    colors: Color[],
    direction: 'horizontal' | 'vertical' = 'vertical'
  ): void {
    if (colors.length === 0) return;
    if (colors.length === 1) {
      this.fillRect(rect, colors[0]);
      return;
    }

    const gradient = direction === 'vertical'
      ? this.ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height)
      : this.ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);

    colors.forEach((color, i) => {
      gradient.addColorStop(i / (colors.length - 1), color);
    });

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // ==================== Utility ====================

  /**
   * Convert mouse event to canvas coordinates
   */
  eventToCanvasPoint(event: MouseEvent | Touch): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * Begin a new path
   */
  beginPath(): void {
    this.ctx.beginPath();
  }

  /**
   * Move to point
   */
  moveTo(point: Point): void {
    this.ctx.moveTo(point.x, point.y);
  }

  /**
   * Line to point
   */
  lineTo(point: Point): void {
    this.ctx.lineTo(point.x, point.y);
  }

  /**
   * Close path
   */
  closePath(): void {
    this.ctx.closePath();
  }

  /**
   * Fill current path
   */
  fill(color: Color): void {
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  /**
   * Stroke current path
   */
  stroke(color: Color, lineWidth: number = 1): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.stroke();
  }
}

/**
 * Helper: Create crisp pixel-aligned coordinate
 */
export function crispPixel(value: number, lineWidth: number = 1): number {
  return lineWidth % 2 === 1 ? Math.floor(value) + 0.5 : Math.floor(value);
}

/**
 * Helper: Parse CSS color to RGBA components
 */
export function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  // Create temporary element to compute color
  const temp = document.createElement('div');
  temp.style.color = color;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);

  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return null;

  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] ? parseFloat(match[4]) : 1,
  };
}

/**
 * Helper: Darken a color by percentage
 */
export function darkenColor(color: string, percent: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const factor = 1 - percent / 100;
  const r = Math.round(parsed.r * factor);
  const g = Math.round(parsed.g * factor);
  const b = Math.round(parsed.b * factor);

  return `rgba(${r}, ${g}, ${b}, ${parsed.a})`;
}

/**
 * Helper: Lighten a color by percentage
 */
export function lightenColor(color: string, percent: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;

  const factor = percent / 100;
  const r = Math.round(parsed.r + (255 - parsed.r) * factor);
  const g = Math.round(parsed.g + (255 - parsed.g) * factor);
  const b = Math.round(parsed.b + (255 - parsed.b) * factor);

  return `rgba(${r}, ${g}, ${b}, ${parsed.a})`;
}

/**
 * Helper: Set color alpha
 */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${alpha})`;
}
