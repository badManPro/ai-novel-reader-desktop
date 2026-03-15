import { Outlet } from 'react-router-dom';
import { PlayerDock } from '../components/player/PlayerDock';

export function AppFrame() {
  return (
    <div className="app-frame">
      <div className="app-frame-content">
        <Outlet />
      </div>
      <PlayerDock />
    </div>
  );
}
