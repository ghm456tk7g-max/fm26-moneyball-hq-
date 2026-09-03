import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Card, Empty, PlayerTable } from './components';
import { DatasetType, Player, Settings, TransferDecision, friendlyError, money, scoreClass } from './types';

type Tab = 'dashboard' | 'players' | 'squad' | 'settings';
type Notice = { kind: 'success' | 'warning' | 'error' | 'info'; text: string; details?: string[] };
type DecisionState = { player: Player; data: TransferDecision };

const DEFAULT_SETTINGS: Settings = { transferBudget: 65000, maxWeeklyWage: 1000, formation: '4-2-3-1' };

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [players, setPlayers] = useState<Player[]>([]);
  const [squad, setSquad] = useState<Player[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [query, setQuery] = useState('');
  const [shortOnly, setShortOnly] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [decision, setDecision] = useState<DecisionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyPlayerId, setBusyPlayerId] = useState<number | null>(null);

  const load = async () => {
    const [targetPlayers, squadPlayers, clubSettings] = await Promise.all([
      window.moneyball.listPlayers('targets'),
      window.moneyball.listPlayers('squad'),
      window.moneyball.getSettings()
    ]);
    setPlayers(targetPlayers);
    setSquad(squadPlayers);
    setSettings(clubSettings);
  };

  useEffect(() => {
    let active = true;
    Promise.all([load(), window.moneyball.startupStatus()])
      .then(([, status]) => {
        if (active && status.notice) setNotice({ kind: 'warning', text: status.notice });
      })
      .catch(error => {
        if (active) setNotice({ kind: 'error', text: `Lokale Daten konnten nicht geladen werden: ${friendlyError(error)}` });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!decision) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDecision(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [decision]);

  const importData = async (type: DatasetType) => {
    setBusy(`import-${type}`);
    try {
      const result = await window.moneyball.importPlayers(type);
      if (result.canceled) return;
      await load();
      const separator = result.delimiter === '\t' ? 'Tabulator' : result.delimiter === ';' ? 'Semikolon' : 'Komma';
      setNotice({
        kind: result.warnings?.length ? 'warning' : 'success',
        text: `${result.rowCount} Spieler sicher importiert · ${result.encoding || 'Text'} · ${separator}`,
        details: result.warnings
      });
    } catch (error) {
      setNotice({ kind: 'error', text: `Import nicht durchgeführt: ${friendlyError(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('de-DE');
    return players.filter(player =>
      (!shortOnly || player.shortlisted) &&
      `${player.name} ${player.club} ${player.position} ${player.positionGroup}`.toLocaleLowerCase('de-DE').includes(search)
    );
  }, [players, query, shortOnly]);

  const groups = useMemo(() => {
    const grouped = new Map<string, Map<number, Player>>();
    squad.forEach(player => {
      const positions = player.scoreMeta?.positionGroups?.length
        ? player.scoreMeta.positionGroups
        : [player.positionGroup || 'Unknown'];
      positions.forEach(position => {
        if (!grouped.has(position)) grouped.set(position, new Map());
        grouped.get(position)?.set(player.id, player);
      });
    });
    return [...grouped.entries()].map(([position, entries]) => {
      const list = [...entries.values()];
      const average = list.length ? Math.round(list.reduce((sum, player) => sum + player.scores.performance * 0.6 + player.scores.roleFit * 0.4, 0) / list.length) : 0;
      return { position, count: list.length, average };
    }).sort((left, right) => left.count - right.count || left.average - right.average);
  }, [squad]);

  const toggle = async (player: Player) => {
    setBusyPlayerId(player.id);
    try {
      const shortlisted = await window.moneyball.toggleShortlist(player.id);
      setPlayers(current => current.map(candidate => candidate.id === player.id ? { ...candidate, shortlisted } : candidate));
    } catch (error) {
      setNotice({ kind: 'error', text: `Shortlist konnte nicht geändert werden: ${friendlyError(error)}` });
    } finally {
      setBusyPlayerId(null);
    }
  };

  const decide = async (player: Player) => {
    setBusyPlayerId(player.id);
    try {
      setDecision({ player, data: await window.moneyball.transferDecision(player.id) });
    } catch (error) {
      setNotice({ kind: 'error', text: `Transferentscheidung nicht möglich: ${friendlyError(error)}` });
    } finally {
      setBusyPlayerId(null);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!Number.isFinite(settings.transferBudget) || settings.transferBudget < 0 || !Number.isFinite(settings.maxWeeklyWage) || settings.maxWeeklyWage < 0) {
      setNotice({ kind: 'error', text: 'Budget und Wochengehalt müssen gültige Werte ab 0 € sein.' });
      return;
    }
    setBusy('settings');
    try {
      const saved = await window.moneyball.saveSettings(settings);
      setSettings(saved);
      setNotice({ kind: 'success', text: 'Clubgrenzen wurden gespeichert und gelten sofort für neue Entscheidungen.' });
    } catch (error) {
      setNotice({ kind: 'error', text: `Clubgrenzen konnten nicht gespeichert werden: ${friendlyError(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const createBackup = async () => {
    setBusy('backup');
    try {
      const result = await window.moneyball.backup();
      if (!result.canceled) setNotice({ kind: 'success', text: 'Datenbank-Backup wurde erstellt und geprüft.' });
    } catch (error) {
      setNotice({ kind: 'error', text: `Backup fehlgeschlagen: ${friendlyError(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const restoreBackup = async () => {
    setBusy('restore');
    try {
      const result = await window.moneyball.restoreBackup();
      if (!result.canceled) {
        await load();
        setNotice({ kind: 'success', text: 'Backup wurde wiederhergestellt. Eine Sicherheitskopie des vorherigen Stands bleibt erhalten.' });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: `Wiederherstellung fehlgeschlagen: ${friendlyError(error)}` });
    } finally {
      setBusy(null);
    }
  };

  const titles: Record<Tab, string> = {
    dashboard: 'Recruitment Command Center',
    players: 'Player Intelligence',
    squad: 'Squad Intelligence',
    settings: 'Club & Budget'
  };

  return <div className="app">
    <aside>
      <div className="brand"><div className="logo">M</div><div><b>FM26</b><span>MONEYBALL HQ</span></div></div>
      <nav aria-label="Hauptnavigation">
        {([['dashboard', 'HQ Dashboard'], ['players', 'Recruitment'], ['squad', 'Squad Intelligence'], ['settings', 'Club & Budget']] as [Tab, string][]).map(([id, label]) =>
          <button className={tab === id ? 'active' : ''} onClick={() => setTab(id)} key={id}>{label}</button>
        )}
      </nav>
      <div className="asideFoot"><small>LOCAL DATABASE</small><b>● OFFLINE READY</b></div>
    </aside>

    <main aria-busy={loading || Boolean(busy)}>
      <header>
        <div><h1>{titles[tab]}</h1><p>{settings.formation} Moneyball recruitment · transparent & local</p></div>
        <div className="actions">
          <button onClick={() => importData('squad')} disabled={Boolean(busy)}>{busy === 'import-squad' ? 'Import läuft…' : 'Kader importieren'}</button>
          <button className="primary" onClick={() => importData('targets')} disabled={Boolean(busy)}>{busy === 'import-targets' ? 'Import läuft…' : '+ Spieler importieren'}</button>
        </div>
      </header>

      {notice && <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
        <button className="noticeClose" onClick={() => setNotice(null)} aria-label="Meldung schließen">×</button>
        <b>{notice.text}</b>
        {notice.details?.length ? <ul>{notice.details.map(detail => <li key={detail}>{detail}</li>)}</ul> : null}
      </div>}

      {loading ? <div className="loadingPanel"><div className="spinner" />Lokale Daten werden geladen…</div> : null}

      {!loading && tab === 'dashboard' && <>
        <section className="stats">
          <Card title="Analysierte Targets" value={String(players.length)} sub="aktueller Import" />
          <Card title="Hidden Gems" value={String(players.filter(player => player.tags.includes('Hidden Gem')).length)} sub="nur bei belastbarer Datenlage" />
          <Card title="Shortlist" value={String(players.filter(player => player.shortlisted).length)} sub="aktive Kandidaten" />
          <Card title="Transferbudget" value={money(settings.transferBudget)} sub={`${money(settings.maxWeeklyWage)}/W Gehaltslimit`} />
        </section>
        {players.length
          ? <section className="panel"><div className="panelHead"><h2>Top Transfer Targets</h2><span>Confidence separat prüfen</span></div><PlayerTable players={players.slice(0, 5)} onToggle={toggle} onDecision={decide} busyId={busyPlayerId} /></section>
          : <Empty onImport={() => importData('targets')} busy={Boolean(busy)} />}
        <section className="grid2">
          <div className="panel"><h2>Kaderbedarf</h2>
            {groups.length ? groups.slice(0, 8).map(group => <div className="need" key={group.position}>
              <b>{group.position === 'Unknown' ? 'Position unbekannt' : group.position}</b>
              <span>{group.count} Spieler</span>
              <strong className={scoreClass(group.average)}>{group.average}</strong>
            </div>) : <p className="muted">Importiere deinen Kader, um Positionsbreite und interne Schwachstellen zu sehen.</p>}
            {groups.length ? <p className="hint">Mehrfachpositionen werden in jeder passenden Gruppe berücksichtigt. Der Leistungs-/Rollen-Score ist innerhalb des importierten Kaders zu lesen.</p> : null}
          </div>
          <div className="panel"><h2>Score-Modell</h2><p className="muted">Fehlende Werte bleiben neutral und senken die Confidence. Kleine Vergleichsgruppen werden bewusst zur Mitte gedämpft.</p><div className="formula">30% Performance · 25% Value · 15% Financial · 15% Development · 10% Role Fit · 5% Confidence</div></div>
        </section>
      </>}

      {!loading && tab === 'players' && <section className="panel">
        <div className="toolbar">
          <input aria-label="Spieler suchen" placeholder="Spieler, Verein oder Position suchen…" value={query} onChange={event => setQuery(event.target.value)} />
          <label><input type="checkbox" checked={shortOnly} onChange={event => setShortOnly(event.target.checked)} /> Nur Shortlist</label>
          <span>{filtered.length} Spieler</span>
        </div>
        {players.length
          ? <PlayerTable players={filtered} onToggle={toggle} onDecision={decide} busyId={busyPlayerId} />
          : <Empty onImport={() => importData('targets')} busy={Boolean(busy)} />}
      </section>}

      {!loading && tab === 'squad' && <section className="panel">
        <div className="panelHead"><h2>Eigener Kader</h2><span>Mehrfachpositionen berücksichtigt</span></div>
        {squad.length ? <>
          <div className="squadGrid">{groups.map(group => <div className="squadCard" key={group.position}><span>{group.position === 'Unknown' ? 'Unbekannt' : group.position}</span><b className={scoreClass(group.average)}>{group.average}</b><small>{group.count} Spieler</small></div>)}</div>
          <PlayerTable players={squad} onToggle={() => undefined} onDecision={decide} hideShortlist busyId={busyPlayerId} />
        </> : <Empty squad onImport={() => importData('squad')} busy={Boolean(busy)} />}
      </section>}

      {!loading && tab === 'settings' && <form className="panel settings" onSubmit={saveSettings}>
        <h2>Club Constraints</h2>
        <p className="muted">Spieler außerhalb dieser Grenzen erhalten immer PASS. Fehlen Finanzdaten, ist höchstens WATCH möglich.</p>
        <label>Transferbudget (€)<input type="number" min="0" step="1" required value={settings.transferBudget} onChange={event => setSettings({ ...settings, transferBudget: Number(event.target.value) })} /></label>
        <label>Max. Wochengehalt (€)<input type="number" min="0" step="1" required value={settings.maxWeeklyWage} onChange={event => setSettings({ ...settings, maxWeeklyWage: Number(event.target.value) })} /></label>
        <label>Formation<input maxLength={40} required value={settings.formation} onChange={event => setSettings({ ...settings, formation: event.target.value })} /></label>
        <div className="settingsActions">
          <button className="primary" type="submit" disabled={Boolean(busy)}>{busy === 'settings' ? 'Speichert…' : 'Clubgrenzen speichern'}</button>
          <button type="button" onClick={createBackup} disabled={Boolean(busy)}>{busy === 'backup' ? 'Sichert…' : 'Datenbank-Backup'}</button>
          <button type="button" onClick={restoreBackup} disabled={Boolean(busy)}>{busy === 'restore' ? 'Stellt wieder her…' : 'Backup wiederherstellen'}</button>
        </div>
      </form>}
    </main>

    {decision && <div className="modalBack" onMouseDown={() => setDecision(null)} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="decision-title" onMouseDown={event => event.stopPropagation()}>
        <button className="close" onClick={() => setDecision(null)} aria-label="Transferentscheidung schließen">×</button>
        <small>TRANSFER DECISION</small><h2 id="decision-title">{decision.player.name}</h2>
        <div className={`verdict ${decision.data.verdict.toLowerCase()}`}>{decision.data.verdict}</div>
        <div className="decisionGrid">
          <Card title="Moneyball" value={String(decision.player.scores.moneyball)} sub={`Confidence ${decision.player.scores.confidence}`} />
          <Card title="Max. Bid" value={money(decision.data.maxBid)} sub="konservative Obergrenze" />
          <Card title="Max. Wage" value={money(decision.data.maxWage)} sub="pro Woche" />
          <Card title="1. Jahr" value={money(decision.data.firstYearCost)} sub={decision.data.budgetImpact == null ? 'Finanzdaten unvollständig' : `${decision.data.budgetImpact}% des Transferbudgets + Gehalt`} />
        </div>
        <div className="decisionColumns">
          <section><h3>Dafür</h3>{decision.data.reasons.length ? <ul>{decision.data.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> : <p className="muted">Kein ausreichend belastbarer positiver Trigger.</p>}</section>
          <section><h3>Risiken</h3>{decision.data.risks.length ? <ul>{decision.data.risks.map(risk => <li key={risk}>{risk}</li>)}</ul> : <p>Keine unmittelbaren Warnungen.</p>}</section>
        </div>
        {decision.data.squadComparison ? <div className="squadComparison">
          <b>Kadervergleich {decision.data.squadComparison.group}</b>
          <span>Kandidat {decision.data.squadComparison.candidateScore}</span>
          <span>Kaderschnitt {decision.data.squadComparison.squadAverage}</span>
          <span>Bester Kaderspieler {decision.data.squadComparison.squadBest}</span>
          <strong className={decision.data.squadComparison.deltaToAverage >= 0 ? 'good' : 'bad'}>{decision.data.squadComparison.deltaToAverage >= 0 ? '+' : ''}{decision.data.squadComparison.deltaToAverage} zum Schnitt</strong>
        </div> : <p className="dataFoot">Kein belastbarer Kadervergleich für diese Positionsgruppe verfügbar.</p>}
        {decision.player.scoreMeta?.missing?.length ? <p className="dataFoot">Fehlende Felder: {decision.player.scoreMeta.missing.join(', ')}</p> : null}
      </div>
    </div>}
  </div>;
}
