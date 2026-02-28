export default function SinglePlayerSetup({ onStart, onBack }) {
  return (
    <div className="single-setup-screen">
      <button className="single-setup-back" onClick={onBack}>← Back</button>
      <div className="single-setup-panel">
        <p className="single-setup-kicker">SINGLE PLAYER</p>
        <h1 className="single-setup-title">SOLO RACE</h1>
        <p className="single-setup-sub">
          Race against AI riders, build near-miss nitro, and survive collisions.
        </p>
        <div className="single-setup-features">
          <span>Near-Miss Nitro</span>
          <span>Bike Health</span>
          <span>Kicking Combat</span>
        </div>
        <button className="single-setup-start" onClick={onStart}>
          START SOLO RACE
        </button>
      </div>
    </div>
  );
}
