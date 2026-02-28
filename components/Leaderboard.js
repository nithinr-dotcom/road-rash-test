// Real-time leaderboard overlay — rendered by React over the Phaser canvas.

export default function Leaderboard({ board, phase }) {
  if (!board || board.length === 0) return null;

  return (
    <div className="leaderboard">
      <h3 className="leaderboard__title">
        {phase === 'finished' ? 'FINAL RESULTS' : 'LEADERBOARD'}
      </h3>
      <ol className="leaderboard__list">
        {board.map((entry, i) => (
          <li key={entry.playerId} className={`leaderboard__entry${entry.finished ? ' leaderboard__entry--done' : ''}`}>
            <span className="lb-pos">{i + 1}</span>
            <span className="lb-name">{entry.name}</span>
            <span className="lb-dist">{formatDist(entry.distance)}</span>
            {entry.finished && <span className="lb-done">✓</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatDist(m) {
  return m >= 1000
    ? `${(m / 1000).toFixed(1)} km`
    : `${Math.round(m)} m`;
}
