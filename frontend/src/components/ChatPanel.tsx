export default function ChatPanel() {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow">
      <h2 className="mb-2 font-semibold">Chat</h2>
      <div className="h-64 overflow-auto border p-2 text-sm">No messages yet.</div>
      <input className="mt-2 w-full rounded border p-2 text-sm" placeholder="Type a guess..." />
    </div>
  );
}
