import CanvasBoard from "../components/CanvasBoard";
import ChatPanel from "../components/ChatPanel";
import PlayerList from "../components/PlayerList";
import Toolbar from "../components/Toolbar";

export default function Home() {
  return (
    <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <Toolbar />
        <CanvasBoard />
      </div>
      <div className="space-y-4">
        <PlayerList />
        <ChatPanel />
      </div>
    </div>
  );
}
