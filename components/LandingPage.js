export default function LandingPage({ onStart }) {
  return (
    <div className="landing-screen">
      <div className="landing-bg-grid" />
      <div className="landing-content">
        <p className="landing-kicker">MULTIPLAYER ARCADE RACING</p>
        <h1 className="landing-title">STREET HEAT</h1>
        <p className="landing-subtitle">
          Race, kick rivals, use near-miss nitro, and fight for the top spot.
        </p>
        <button className="landing-cta" onClick={onStart}>
          ENTER GARAGE
        </button>
      </div>
    </div>
  );
}
