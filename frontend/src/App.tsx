import { useAppSelector } from "./hooks";
import Home from "./pages/Home";

export default function App() {
  const status = useAppSelector(s => s.connection.status);
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scribble Squad</h1>
        <span className="text-sm text-gray-500">Status: {status}</span>
      </header>
      <main className="mt-6">
        <Home />
      </main>
    </div>
  );
}
