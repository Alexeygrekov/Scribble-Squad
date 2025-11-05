import { useRef, useEffect } from "react";

export default function CanvasBoard() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cvs = ref.current!;
    const ctx = cvs.getContext("2d")!;
    cvs.width = 800; cvs.height = 500;
    ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.strokeStyle = "black";
  }, []);

  return (
    <div className="rounded-2xl border bg-white p-2 shadow">
      <canvas ref={ref} className="block w-full" />
    </div>
  );
}
