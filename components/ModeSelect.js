export default function ModeSelect({ onSinglePlayer, onMultiplayer, onBack }) {
  return (
    <div className="mode-select-screen">
      <button className="mode-back" onClick={onBack}>← Home</button>
      <h1 className="mode-title">CHOOSE RACE MODE</h1>
      <p className="mode-subtitle">Pick how you want to play Road Rash.</p>
      <div className="mode-buttons">
        <button className="mode-btn mode-btn--single" onClick={onSinglePlayer}>
          <span className="mode-btn__icon">01</span>
          <span className="mode-btn__label">Single Player</span>
          <span className="mode-btn__sub">Race against AI rivals</span>
        </button>
        <button className="mode-btn mode-btn--multi" onClick={onMultiplayer}>
          <span className="mode-btn__icon">02</span>
          <span className="mode-btn__label">Multiplayer</span>
          <span className="mode-btn__sub">Up to 5 players</span>
        </button>
      </div>
    </div>
  );
}
