import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  speed: number;
  sway: number;
  swaySpeed: number;
  swayOffset: number;
  opacity: number;
}

const COLORS = [
  "#f9a8d4", // pink
  "#93c5fd", // blue
  "#fcd34d", // yellow
  "#6ee7b7", // green
  "#c4b5fd", // purple
  "#fca5a5", // red
  "#fdba74", // orange
  "#67e8f9", // cyan
  "#a5b4fc", // indigo
  "#fde68a", // amber
];

const PARTICLE_COUNT = 60;

function createParticle(canvasWidth: number, canvasHeight: number, startAtTop = false): Particle {
  return {
    x: Math.random() * canvasWidth,
    y: startAtTop ? -20 : Math.random() * canvasHeight,
    w: 6 + Math.random() * 8,
    h: 4 + Math.random() * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.04,
    speed: 0.3 + Math.random() * 0.7,
    sway: 20 + Math.random() * 30,
    swaySpeed: 0.005 + Math.random() * 0.01,
    swayOffset: Math.random() * Math.PI * 2,
    opacity: 0.5 + Math.random() * 0.5,
  };
}

export default function ConfettiBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let w = 0;
    let h = 0;
    let particles: Particle[] = [];
    let tick = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
    }

    function init() {
      resize();
      particles = Array.from({ length: PARTICLE_COUNT }, () => createParticle(w, h));
    }

    function draw() {
      tick += 1;
      ctx!.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.y += p.speed;
        p.x += Math.sin(tick * p.swaySpeed + p.swayOffset) * 0.5;
        p.rotation += p.rotationSpeed;

        if (p.y > h + 20) {
          Object.assign(p, createParticle(w, h, true));
        }

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.globalAlpha = p.opacity;
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx!.restore();
      }

      animId = requestAnimationFrame(draw);
    }

    init();
    draw();

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0"
      aria-hidden="true"
    />
  );
}
