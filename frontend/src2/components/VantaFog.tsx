import { useEffect, useRef } from "react";
import * as THREE from "three";
import FOG from "vanta/dist/vanta.fog.min";

export default function VantaFog() {
  const ref = useRef<HTMLDivElement>(null);
  const effectRef = useRef<ReturnType<typeof FOG> | null>(null);

  useEffect(() => {
    if (!ref.current || effectRef.current) return;

    effectRef.current = FOG({
      el: ref.current,
      THREE,
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200,
      minWidth: 200,
      highlightColor: 0xffc300,
      midtoneColor: 0xff1f00,
      lowlightColor: 0x2d00ff,
      baseColor: 0xffebeb,
      blurFactor: 0.6,
      speed: 1.0,
      zoom: 1.0,
    });

    return () => {
      if (effectRef.current) {
        effectRef.current.destroy();
        effectRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    />
  );
}
