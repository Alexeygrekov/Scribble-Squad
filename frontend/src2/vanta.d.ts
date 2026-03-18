declare module "three" {
  const THREE: unknown;
  export = THREE;
}

declare module "vanta/dist/vanta.fog.min" {
  interface VantaEffect {
    destroy: () => void;
    resize: () => void;
  }
  interface VantaFogOptions {
    el: HTMLElement;
    THREE: unknown;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    highlightColor?: number;
    midtoneColor?: number;
    lowlightColor?: number;
    baseColor?: number;
    blurFactor?: number;
    speed?: number;
    zoom?: number;
  }
  export default function FOG(opts: VantaFogOptions): VantaEffect;
}
