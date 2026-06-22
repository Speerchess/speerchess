declare module 'gifenc' {
  export class GIFEncoder {
    constructor();
    writeFrame(index: Uint8Array, width: number, height: number, options?: { palette?: any, delay?: number, transparent?: boolean, dispose?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  }
  export function quantize(data: Uint8ClampedArray | Uint8Array, maxColors: number, options?: any): any;
  export function applyPalette(data: Uint8ClampedArray | Uint8Array, palette: any, format?: string): Uint8Array;
}
