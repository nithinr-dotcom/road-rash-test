export default function MenuScreen({ onStart }) {
  return (
    <div className="menu-screen">
      <button className="start-btn" onClick={onStart}>
        START GAME
      </button>
    </div>
  );
}
