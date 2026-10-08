import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, Row } from '../types';
import { pdfOut, safe } from '../exports/files';
import { formatPercent } from '../utils/format';

const DAY = 86400000;
function utcDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function projectWeekStart(project: Project, progress: Row[]) {
  const firstReport = progress.map(r => String(r.date || '')).filter(Boolean).sort()[0];
  const start = project.start || firstReport || new Date().toISOString().slice(0, 10);
  const date = utcDate(start);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date;
}
function projectWeekNumber(value: string, anchor: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0;
  return Math.floor((utcDate(value).getTime() - anchor.getTime()) / (7 * DAY)) + 1;
}
function rangeForWeek(anchor: Date, week: number) {
  const start = new Date(anchor);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start, end };
}
function dateLabel(date: Date) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(date);
}
function periodLabel(anchor: Date, week: number) {
  const { start, end } = rangeForWeek(anchor, week);
  return `Minggu ${week} · ${dateLabel(start)} – ${dateLabel(end)} ${end.getUTCFullYear()}`;
}
function summary(rows: Row[]) {
  return rows.reduce((a, r) => ({ planned: a.planned + (Number(r.plannedWeekly) || 0), actual: a.actual + (Number(r.actualWeekly) || 0), entries: a.entries + 1 }), { planned: 0, actual: 0, entries: 0 });
}
function deviation(x: { planned: number; actual: number }) { return Math.min(100, x.actual) - Math.min(100, x.planned); }

export default function WeeklyRecap({ project, progress }: { project: Project; progress: Row[] }) {
  const anchor = useMemo(() => projectWeekStart(project, progress), [project.id, project.start, progress]);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const initialWeek = Math.max(1, projectWeekNumber(todayKey, anchor));
  const [week, setWeek] = useState(initialWeek);
  useEffect(() => setWeek(initialWeek), [project.id, project.start]);
  const report = useRef<HTMLDivElement>(null);
  const previous = week - 1;
  const rowsForWeek = (weekNumber: number) => progress.filter(r => projectWeekNumber(String(r.date || ''), anchor) === weekNumber);
  const prior = summary(rowsForWeek(previous));
  const current = summary(rowsForWeek(week));
  const totalPrevious = summary(progress.filter(r => {
    const n = projectWeekNumber(String(r.date || ''), anchor);
    return n >= 1 && n <= previous;
  }));
  const cumulative = summary(progress.filter(r => {
    const n = projectWeekNumber(String(r.date || ''), anchor);
    return n >= 1 && n <= week;
  }));
  const periods = [
    { name: 'Minggu lalu', label: previous > 0 ? periodLabel(anchor, previous) : 'Sebelum minggu proyek pertama', ...prior, total: totalPrevious },
    { name: 'Minggu ini', label: periodLabel(anchor, week), ...current, total: cumulative },
    { name: 'Kumulatif sampai minggu ini', label: `s.d. Minggu ${week}`, ...cumulative, total: cumulative },
  ];
  return <><div className="pagehead"><div><h1>Rekap Mingguan</h1><p>Periode proyek berjalan Minggu–Sabtu; minggu yang melewati pergantian bulan tetap dihitung sebagai satu minggu proyek.</p></div><div className="head-actions"><label className="month-picker">Minggu proyek<input type="number" min="1" value={week} onChange={e => setWeek(Math.max(1, Number(e.target.value) || 1))}/></label><button className="primary" onClick={() => report.current && void pdfOut(report.current, `${safe(project.name)}_Rekap_Mingguan_${week}.pdf`, 'REKAP PROGRES MINGGUAN', project)}>Download PDF</button></div></div>
    <div className="panel monthly-report" ref={report}><div className="monthly-heading">{project.logo && <img src={project.logo} alt="Logo perusahaan"/>}<div><small>PROJECT PROGRESS REPORT · {project.number || 'PROJECT'}</small><h2>Rekap Progres Mingguan</h2><p>{project.name} · {periodLabel(anchor, week)}</p></div></div>
      <div className="monthly-grid">{periods.map(x=><section className={`monthly-card ${x.name === 'Minggu ini' ? 'current-month' : ''}`} key={x.name}><small>{x.name}</small><h3>{x.label}</h3><div><span>Rencana</span><b>{formatPercent(Math.min(100, x.planned))}</b></div><div><span>Aktual</span><b>{formatPercent(Math.min(100, x.actual))}</b></div><div><span>Deviasi</span><b className={deviation(x) < 0 ? 'negative' : ''}>{formatPercent(deviation(x))}</b></div><div className="month-period-total"><span>Total kumulatif s.d. periode</span><strong>Rencana {formatPercent(Math.min(100, x.total.planned))} · Aktual {formatPercent(Math.min(100, x.total.actual))} · Deviasi {formatPercent(deviation(x.total))}</strong></div>{x.entries === 0 && <p className="no-month-data">Belum ada progres yang dicatat untuk {x.label}.</p>}<footer>{x.entries} entri progres</footer></section>)}</div>
      <h3 className="monthly-table-title">Ringkasan periode</h3><div className="table-scroll"><table><thead><tr><th>Periode</th><th>Rencana</th><th>Aktual</th><th>Deviasi</th><th>Entri progres</th></tr></thead><tbody>{periods.map(x=><tr key={x.name}><td>{x.name} · {x.label}</td><td>{formatPercent(Math.min(100, x.planned))}</td><td>{formatPercent(Math.min(100, x.actual))}</td><td>{formatPercent(deviation(x))}</td><td>{x.entries}</td></tr>)}</tbody></table></div>
      <p className="monthly-note">Progres dihitung dari penjumlahan planned weekly dan actual weekly pada Weekly Progress. Minggu 1 mengikuti minggu yang mencakup tanggal mulai proyek; batas minggunya Minggu–Sabtu dan tidak direset saat berganti bulan atau tahun.</p>
      <div className="approval monthly-approval"><div><b>PIHAK PERTAMA</b><p>{project.approval.firstCompany}</p>{project.approval.firstSignature && <img src={project.approval.firstSignature} alt="Tanda tangan pihak pertama"/>}<p>{project.approval.firstName}<br/>{project.approval.firstPosition}</p></div><div><b>PIHAK KEDUA</b><p>{project.approval.secondCompany}</p>{project.approval.secondSignature && <img src={project.approval.secondSignature} alt="Tanda tangan pihak kedua"/>}<p>{project.approval.secondName}<br/>{project.approval.secondPosition}</p></div></div>
    </div>
  </>;
}
