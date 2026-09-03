import { Player, money, scoreClass } from './types';

export function Card({ title, value, sub }: { title: string; value: string; sub: string }) {
  return <div className="card"><small>{title}</small><b>{value}</b><span>{sub}</span></div>;
}

export function Empty({ onImport, squad = false, busy = false }: { onImport: () => void; squad?: boolean; busy?: boolean }) {
  return <div className="empty">
    <div aria-hidden="true">⇧</div>
    <h2>{squad ? 'Eigenen FM-Kader importieren' : 'FM-Spielerexport importieren'}</h2>
    <p>CSV, TSV oder TXT · deutsche und englische Spaltennamen werden automatisch erkannt.</p>
    <button className="primary" onClick={onImport} disabled={busy}>{busy ? 'Import läuft…' : 'Datei auswählen'}</button>
  </div>;
}

function Score({ number, label, big = false }: { number: number; label: string; big?: boolean }) {
  return <span className={`score ${scoreClass(number)} ${big ? 'big' : ''}`} title={`${label}: ${number} von 100`}>{number}</span>;
}

export function PlayerTable({
  players,
  onToggle,
  onDecision,
  hideShortlist = false,
  busyId = null
}: {
  players: Player[];
  onToggle: (player: Player) => void;
  onDecision: (player: Player) => void;
  hideShortlist?: boolean;
  busyId?: number | null;
}) {
  if (!players.length) return <div className="filteredEmpty">Keine Spieler entsprechen den aktuellen Filtern.</div>;
  return <div className="tableWrap">
    <table>
      <thead><tr>
        <th>Spieler</th><th>Pos.</th><th>Alter</th><th>Wert</th><th>Perf.</th><th>Value</th><th>Role Fit</th><th>Conf.</th><th>Moneyball</th><th>Tags</th><th><span className="srOnly">Aktionen</span></th>
      </tr></thead>
      <tbody>{players.map(player => <tr key={player.id}>
        <td><b>{player.name}</b><small>{player.club || 'Verein unbekannt'}</small></td>
        <td title={player.position || 'Position unbekannt'}>{player.positionGroup || player.position || '—'}</td>
        <td>{player.age ?? '—'}</td>
        <td className={player.value == null ? 'unknown' : ''}>{money(player.value)}</td>
        <td><Score number={player.scores.performance} label="Performance" /></td>
        <td><Score number={player.scores.value} label="Value" /></td>
        <td><Score number={player.scores.roleFit} label="Role Fit" /></td>
        <td><Score number={player.scores.confidence} label="Confidence" /></td>
        <td><Score number={player.scores.moneyball} label="Moneyball" big /></td>
        <td>{player.tags.length ? player.tags.map(tag => <span className={`tag ${tag === 'Low Confidence' ? 'warningTag' : ''}`} key={tag}>{tag}</span>) : <span className="muted">—</span>}</td>
        <td className="rowActions">
          {!hideShortlist && <button aria-label={player.shortlisted ? `${player.name} von Shortlist entfernen` : `${player.name} zur Shortlist hinzufügen`} title="Shortlist" onClick={() => onToggle(player)} disabled={busyId === player.id}>{player.shortlisted ? '★' : '☆'}</button>}
          <button onClick={() => onDecision(player)} disabled={busyId === player.id}>{busyId === player.id ? 'Prüfe…' : 'Entscheidung'}</button>
        </td>
      </tr>)}</tbody>
    </table>
  </div>;
}
