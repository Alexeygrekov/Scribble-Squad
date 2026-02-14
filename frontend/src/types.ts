export type Player = { name: string; score: number };

export type StrokePoint = {
  x: number;
  y: number;
};

export type Stroke = {
  id: string;
  mode: "stroke" | "fill";
  color: string;
  size: number;
  points: StrokePoint[];
};
