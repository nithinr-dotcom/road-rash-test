// Mode selection screen shown after the main menu.
// Player picks Single Player or Multiplayer.

export default function ModeSelect({ onSinglePlayer, onMultiplayer }) {
  return (
    <div className="mode-select-screen">
      <h1 className="mode-title">SELECT MODE</h1>
      <div className="mode-buttons">
        <button className="mode-btn mode-btn--single" onClick={onSinglePlayer}>
          <span className="mode-btn__icon">🏍️</span>
          <span className="mode-btn__label">Single Player</span>
          <span className="mode-btn__sub">Race against AI</span>
        </button>
        <button className="mode-btn mode-btn--multi" onClick={onMultiplayer}>
          <span className="mode-btn__icon">👥</span>
          <span className="mode-btn__label">Multiplayer</span>
          <span className="mode-btn__sub">Up to 5 players</span>
        </button>
      </div>
    </div>
  );
}
