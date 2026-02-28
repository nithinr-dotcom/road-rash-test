import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import MenuScreen from '../components/MenuScreen';
import ModeSelect from '../components/ModeSelect';

const GAME_W = 1280;
const GAME_H = 720;

// Phaser requires browser APIs — load all game screens client-side only
const GameScreen            = dynamic(() => import('../components/GameScreen'),            { ssr: false });
const MultiplayerLobby      = dynamic(() => import('../components/MultiplayerLobby'),      { ssr: false });
const MultiplayerGameScreen = dynamic(() => import('../components/MultiplayerGameScreen'), { ssr: false });

// Screen flow:
//   menu → mode → sp_game → gameover
//                → mp_lobby → mp_game → gameover

export default function Home() {
  const [screen, setScreen] = useState('menu');
  const [scale,  setScale]  = useState(1);

  // Multiplayer session — socket and name passed from lobby to game
  const mpSocketRef = useRef(null);
  const mpNameRef   = useRef('');

  useEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  function handleRaceStart(socket, name) {
    mpSocketRef.current = socket;
    mpNameRef.current   = name;
    setScreen('mp_game');
  }

  return (
    <div className="viewport-wrapper">
      <div className="app-root" style={{ transform: `scale(${scale})` }}>

        {screen === 'menu' && (
          <MenuScreen onStart={() => setScreen('mode')} />
        )}

        {screen === 'mode' && (
          <ModeSelect
            onSinglePlayer={() => setScreen('sp_game')}
            onMultiplayer={()  => setScreen('mp_lobby')}
          />
        )}

        {screen === 'sp_game' && (
          <GameScreen onGameOver={() => setScreen('gameover')} />
        )}

        {screen === 'mp_lobby' && (
          <MultiplayerLobby
            onRaceStart={handleRaceStart}
            onBack={() => setScreen('mode')}
          />
        )}

        {screen === 'mp_game' && (
          <MultiplayerGameScreen
            socket={mpSocketRef.current}
            playerName={mpNameRef.current}
            onGameOver={() => setScreen('gameover')}
          />
        )}

        {screen === 'gameover' && (
          <div className="gameover-screen">
            <h1>GAME OVER</h1>
            <button onClick={() => setScreen('menu')}>MENU</button>
            <button onClick={() => setScreen('sp_game')}>PLAY AGAIN (SP)</button>
            <button onClick={() => setScreen('mp_lobby')}>PLAY AGAIN (MP)</button>
          </div>
        )}

      </div>
    </div>
  );
}
