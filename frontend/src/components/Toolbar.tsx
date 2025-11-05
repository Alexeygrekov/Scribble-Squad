export default function Toolbar() {
  return (
    <div className="flex gap-2 rounded-2xl border bg-white p-3 shadow">
      <button className="rounded bg-gray-100 px-3 py-1 text-sm">Brush</button>
      <button className="rounded bg-gray-100 px-3 py-1 text-sm">Eraser</button>
      <button className="rounded bg-gray-100 px-3 py-1 text-sm">Clear</button>
    </div>
  );
}
