import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import MainScene from '../src/game/scenes/MainScene.js';

const GAME_W = 1280;
const GAME_H = 720;

/**
 * Mounts a Phaser game instance into a div that fills the app-root container.
 * When the race ends, MainScene calls the `onGameOver` React callback which
 * swaps the screen to the game-over overlay.
 *
 * The Phaser instance is fully destroyed when this component unmounts.
 */
export default function GameScreen({ onGameOver }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const config = {
      type:   Phaser.CANVAS,
      width:  GAME_W,
      height: GAME_H,
      parent: containerRef.current,
      backgroundColor: '#72D7EE',
      clearBeforeRender: false,
      audio: { disableWebAudio: false },
      scene: [MainScene],
    };

    const game = new Phaser.Game(config);

    game.events.once('ready', () => {
      game.registry.set('onGameOver', onGameOver);
    });

    return () => game.destroy(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="game-screen" />;
}
