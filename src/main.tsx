import { supabase } from './services/supabase'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FolderKanban,
  LayoutDashboard,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  Edit3,
  Printer,
  CalendarDays
} from 'lucide-react'
import * as XLSX from 'xlsx'

import type { Project, Row, Store } from './types'
import { load, save } from './services/storage'
import {
  loadFromSupabase,
  insertProject,
  updateProject,
  deleteProject,
  insertWBS,
  updateWBS,
  deleteWBS,
  insertActivity,
  updateActivity,
  deleteActivity,
  insertProgress,
  updateProgress,
  deleteProgress,
  insertIssue,
  updateIssue,
  deleteIssue,
  insertMaterial,
  updateMaterial,
  deleteMaterial
} from './services/database'

import {
  chartSvg,
  csvOut,
  elementPng,
  excelOut,
  jsonOut,
  pdfOut,
  projectWorkbook,
  reportPdf,
  safe
} from './exports/files'

import './style.css'
import { formatPercent } from './utils/format'

import MonthlyRecap from './components/MonthlyRecap'
import WeeklyRecap from './components/WeeklyRecap'
import BeritaAcara from './components/BeritaAcara'
import WorkDocumentation from './components/WorkDocumentation'

type Page =
  | 'Projects'
  | 'Dashboard'
  | 'WBS'
  | 'Weekly Progress'
  | 'S-Curve'
  | 'Monthly Recap'
  | 'Weekly Recap'
  | 'Activities'
  | 'Issues'
  | 'Materials'
  | 'Project Report'
  | 'Export Center'
  | 'Project Settings'
  | 'Approval'
  | 'Berita Acara'
  | 'Dokumentasi Pekerjaan'
  | 'Company Branding'
  | 'Backup & Restore'

const nav: {
  label: Page
  icon: any
  group: string
}[] = [
  { label: 'Projects', icon: FolderKanban, group: 'PROJECT' },
  { label: 'Dashboard', icon: LayoutDashboard, group: 'PROJECT MANAGEMENT' },
  { label: 'WBS', icon: ClipboardList, group: 'PROJECT MANAGEMENT' },
  { label: 'Weekly Progress', icon: Activity, group: 'PROJECT MANAGEMENT' },
  { label: 'S-Curve', icon: ChartNoAxesCombined, group: 'PROJECT MANAGEMENT' },
  { label: 'Monthly Recap', icon: CalendarDays, group: 'PROJECT MANAGEMENT' },
  { label: 'Weekly Recap', icon: CalendarDays, group: 'PROJECT MANAGEMENT' },
  { label: 'Activities', icon: BriefcaseBusiness, group: 'PROJECT MANAGEMENT' },
  { label: 'Issues', icon: AlertTriangle, group: 'PROJECT MANAGEMENT' },
  { label: 'Materials', icon: Boxes, group: 'PROJECT MANAGEMENT' },
  { label: 'Project Report', icon: FileSpreadsheet, group: 'REPORTS' },
  { label: 'Export Center', icon: Download, group: 'REPORTS' },
  { label: 'Project Settings', icon: Settings, group: 'SETTINGS' },
  { label: 'Approval', icon: ShieldCheck, group: 'SETTINGS' },
  { label: 'Berita Acara', icon: FileSpreadsheet, group: 'REPORTS' },
  { label: 'Dokumentasi Pekerjaan', icon: FileSpreadsheet, group: 'REPORTS' },
  { label: 'Company Branding', icon: Upload, group: 'SETTINGS' },
  { label: 'Backup & Restore', icon: Download, group: 'SETTINGS' }
]

const schemas: Record<string, string[]> = {
  WBS: [
    'code',
    'activity',
    'discipline',
    'unit',
    'quantity',
    'weight',
    'start',
    'finish',
    'planned',
    'actual',
    'status',
    'pic',
    'notes'
  ],

  'Weekly Progress': [
    'week',
    'date',
    'wbsCode',
    'activity',
    'plannedWeekly',
    'actualWeekly',
    'notes'
  ],

  Activities: [
    'activityCode',
    'activity',
    'wbsCode',
    'pic',
    'start',
    'finish',
    'duration',
    'weight',
    'planned',
    'actual',
    'status'
  ],

  Issues: [
    'issueId',
    'date',
    'issue',
    'description',
    'category',
    'priority',
    'pic',
    'target',
    'status',
    'action',
    'notes'
  ],

  Materials: [
    'material',
    'specification',
    'quantity',
    'unit',
    'required',
    'approval',
    'procurement',
    'delivery',
    'supplier',
    'notes'
  ]
}

const label = (k: string) =>
  ({
    code: 'WBS Code',
    wbsCode: 'WBS Code',
    activity: 'Activity',
    plannedWeekly: 'Planned Weekly %',
    actualWeekly: 'Actual Weekly %',
    planned: 'Planned %',
    actual: 'Actual %',
    weight: 'Weight %',
    progress: 'Progress %',
    start: 'Start Date',
    finish: 'Finish Date',
    pic: 'PIC',
    target: 'Target Resolution',
    required: 'Required Date',
    week: 'Minggu',
    date: 'Tanggal',
    plannedCum: 'Rencana Kumulatif',
    actualCum: 'Aktual Kumulatif',
    deviation: 'Deviasi'
  } as any)[k] || k

function App() {
  const [db, setDb] = useState<Store>(load)
  const [loading, setLoading] = useState(true)

  const [pid, setPid] = useState(db.settings.defaultProject)
  const [page, setPage] = useState<Page>('Dashboard')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Row | null>(null)
  const [toast, setToast] = useState('')
  const [imp, setImp] = useState<any>(null)
  const [issueFilter, setIssueFilter] = useState('All')

  const chart = useRef<HTMLDivElement>(null)
  const report = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Tetap menyimpan data lokal untuk backup/fallback sementara.
  useEffect(() => {
    save(db)
  }, [db])

  // Ambil data utama dari Supabase saat aplikasi pertama kali dibuka.
  useEffect(() => {
    let mounted = true

    const loadData = async () => {
      try {
        const data = await loadFromSupabase()

        if (!mounted) return

        setDb(data)

        if (data.settings.defaultProject) {
          setPid(data.settings.defaultProject)
        }
      } catch (error) {
        console.error(
          'Gagal mengambil data dari Supabase:',
          error
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = db.settings.dark
      ? 'dark'
      : 'light'
  }, [db.settings.dark])

  const p =
    db.projects.find(x => x.id === pid) ||
    db.projects[0]

  const go = (x: Page) => {
    setPage(x)
    navigate('/' + x.toLowerCase().replaceAll(' ', '-'))
    setSearch('')
  }

  const notify = (m: string) => {
    setToast(m)
    setTimeout(() => setToast(''), 2500)
  }

  const rows = (
    k: 'wbs' | 'progress' | 'activities' | 'issues' | 'materials'
  ) => db[k].filter(x => x.projectId === p?.id)

  const tableKey = (
    {
      WBS: 'wbs',
      'Weekly Progress': 'progress',
      Activities: 'activities',
      Issues: 'issues',
      Materials: 'materials'
    } as any
  )[page] as
    | 'wbs'
    | 'progress'
    | 'activities'
    | 'issues'
    | 'materials'
    | undefined

  const cols = tableKey ? schemas[page] : []

  const shown = tableKey
    ? rows(tableKey).filter(x =>
        JSON.stringify(x)
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : []

  const sc = useMemo(() => {
    let plannedCum = 0
    let actualCum = 0

    return rows('progress')
      .slice()
      .sort((a, b) => Number(a.week || 0) - Number(b.week || 0))
      .map(item => {
        plannedCum += Number(item.plannedWeekly || 0)
        actualCum += Number(item.actualWeekly || 0)

        const plannedValue = Math.min(100, plannedCum)
        const actualValue = Math.min(100, actualCum)

        return {
          ...item,
          plannedCum: plannedValue,
          actualCum: actualValue,
          deviation: actualValue - plannedValue
        }
      })
  }, [db, pid])

  const planned = sc.at(-1)?.plannedCum || 0
  const actual = sc.at(-1)?.actualCum || 0
  const dev = actual - planned
  const projectWbs = rows('wbs')
  const projectActivities = rows('activities')
  const projectProgress = rows('progress')
  const projectIssues = rows('issues')
  const projectMaterials = rows('materials')
  const openIssues = projectIssues.filter(x => String(x.status || '').toLowerCase() !== 'closed').length
  const highIssues = projectIssues.filter(x => String(x.priority || '').toLowerCase() === 'high' && String(x.status || '').toLowerCase() !== 'closed').length
  const materialPending = projectMaterials.filter(x => !['received', 'completed', 'complete'].includes(String(x.delivery || '').toLowerCase())).length
  const latestProgress = projectProgress.length
    ? projectProgress.slice().sort((a, b) => Number(a.week || 0) - Number(b.week || 0)).at(-1)
    : null
  const latestPlanned = latestProgress ? Number(latestProgress.plannedWeekly || 0) : planned
  const latestActual = latestProgress ? Number(latestProgress.actualWeekly || 0) : actual
  const latestDeviation = latestActual - latestPlanned
  const progressStatus = actual >= planned ? 'On Track' : actual >= planned - 5 ? 'At Risk' : 'Delayed'
  const filteredIssues = projectIssues.filter((x: any) => issueFilter === 'All' || String(x.status || '') === issueFilter)
const goProject=(id:string)=>{setPid(id);setDb(s=>({...s,settings:{...s.settings,defaultProject:id}}));go('Dashboard')};const editProject = async (k: string, v: any) => {
  if (!p) return

  const updated: Project = {
    ...p,
    [k]: v
  }

  try {
    await updateProject(updated)

    setDb(s => ({
      ...s,
      projects: s.projects.map(x =>
        x.id === pid ? updated : x
      )
    }))

    notify('Project updated')
  } catch (error) {
    console.error('PROJECT UPDATE ERROR:', error)
    notify('Failed to update project')
  }
};
const saveRow = async (r: Row) => {
  if (!tableKey) return

  try {
    const exists = db[tableKey].some(x => x.id === r.id)
    let savedRow = r

    if (tableKey === 'wbs') {
      if (exists) {
        await updateWBS(r)
      } else {
        const inserted = await insertWBS(r)
        savedRow = { ...r, id: inserted.id }
      }
    }

    if (tableKey === 'activities') {
      if (exists) {
        await updateActivity(r)
      } else {
        const inserted = await insertActivity(r)
        savedRow = { ...r, id: inserted.id }
      }
    }

    if (tableKey === 'progress') {
      if (exists) {
        await updateProgress(r)
      } else {
        const inserted = await insertProgress(r)
        savedRow = { ...r, id: inserted.id }
      }
    }

    if (tableKey === 'issues') {
      if (exists) {
        await updateIssue(r)
      } else {
        const inserted = await insertIssue(r)
        savedRow = { ...r, id: inserted.id }
      }
    }

    if (tableKey === 'materials') {
      if (exists) {
        await updateMaterial(r)
      } else {
        const inserted = await insertMaterial(r)
        savedRow = { ...r, id: inserted.id }
      }
    }

    setDb(s => ({
      ...s,
      [tableKey]: exists
        ? s[tableKey].map(x => x.id === savedRow.id ? savedRow : x)
        : [...s[tableKey], savedRow],
    }))

    setModal(null)
    notify(exists ? 'Data berhasil diperbarui' : 'Data berhasil ditambahkan')
  } catch (error) {
    console.error('SAVE ROW ERROR:', error)
    notify('Gagal menyimpan data ke Supabase')
  }
}

const remove = async (id: string) => {
  if (!tableKey || !confirm('Delete this record?')) return
  try {
    if (tableKey === 'wbs') await deleteWBS(id)
    if (tableKey === 'activities') await deleteActivity(id)
    if (tableKey === 'progress') await deleteProgress(id)
    if (tableKey === 'issues') await deleteIssue(id)
    if (tableKey === 'materials') await deleteMaterial(id)
    setDb(s => ({ ...s, [tableKey]: s[tableKey].filter(x => x.id !== id) }))
    notify('Data berhasil dihapus')
  } catch (error) {
    console.error('DELETE ROW ERROR:', error)
    notify('Gagal menghapus data dari Supabase')
  }
}

const resolveIssue = async (row: Row) => {
  const resolved = { ...row, status: 'Resolved' }
  try {
    await updateIssue(resolved)
    setDb(s => ({ ...s, issues: s.issues.map(issue => issue.id === row.id ? resolved : issue) }))
    notify('Issue berhasil diselesaikan')
  } catch (error) {
    console.error('RESOLVE ISSUE ERROR:', error)
    notify('Gagal memperbarui issue di Supabase')
  }
}
const addProject = async () => {
  const name = prompt('Project name')

  if (!name) return

  const project: Project = {
    id: crypto.randomUUID(),
    name,
    number: '',
    client: '',
    location: '',
    manager: '',
    engineer: '',
    contractor: '',
    consultant: '',
    start: '',
    finish: '',
    value: 0,
    status: 'Planning',
    description: '',
    archived: false,
    logo: '',
    beritaAcara: {},
    documentation: [],
    approval: {
      firstCompany: '',
      firstName: '',
      firstPosition: '',
      firstSignature: '',
      secondCompany: '',
      secondName: '',
      secondPosition: '',
      secondSignature: ''
    }
  }

  try {
    const inserted = await insertProject(project)

    const savedProject: Project = {
      ...project,
      id: inserted.id
    }

    setDb(s => ({
      ...s,
      projects: [...s.projects, savedProject],
      settings: {
        ...s.settings,
        defaultProject: inserted.id
      }
    }))

    setPid(inserted.id)
    go('Project Settings')

    notify('Project berhasil dibuat')
  } catch (error) {
    console.error(error)
    notify('Gagal membuat project')
  }
};
const duplicateProject = async (project: Project) => {
  try {
    const duplicated: Project = {
      ...project,
      id: crypto.randomUUID(),
      name: `${project.name} - Copy`,
      number: project.number ? `${project.number}-COPY` : '',
      archived: false
    }
    const inserted = await insertProject(duplicated)
    const savedProject: Project = { ...duplicated, id: inserted.id }
    setDb(s => ({ ...s, projects: [...s.projects, savedProject] }))
    setPid(inserted.id)
    notify('Project berhasil diduplikasi')
  } catch (error) {
    console.error('DUPLICATE PROJECT ERROR:', error)
    notify('Gagal duplicate project')
  }
}
const archiveProject = async (project: Project) => {
  try {
    const updated: Project = {
      ...project,
      archived: !project.archived
    }
    await updateProject(updated)
    setDb(s => ({ ...s, projects: s.projects.map(x => x.id === project.id ? updated : x) }))
    notify(updated.archived ? 'Project diarsipkan' : 'Project dikembalikan')
  } catch (error) {
    console.error('ARCHIVE PROJECT ERROR:', error)
    notify('Gagal mengubah status archive')
  }
}
const deleteProjectFromSupabase = async (project: Project) => {
  if (!confirm(`Delete project "${project.name}"?\n\nSemua WBS, Activities, Progress, Issues, dan Materials project ini juga akan terhapus.`)) return
  try {
    await deleteProject(project.id)
    setDb(s => ({
      ...s,
      projects: s.projects.filter(x => x.id !== project.id),
      wbs: s.wbs.filter(x => x.projectId !== project.id),
      activities: s.activities.filter(x => x.projectId !== project.id),
      progress: s.progress.filter(x => x.projectId !== project.id),
      issues: s.issues.filter(x => x.projectId !== project.id),
      materials: s.materials.filter(x => x.projectId !== project.id)
    }))
    const remaining = db.projects.filter(x => x.id !== project.id)
    if (project.id === pid) {
      setPid(remaining[0]?.id ?? '')
      go('Projects')
    }
    notify('Project berhasil dihapus')
  } catch (error) {
    console.error('DELETE PROJECT ERROR:', error)
    notify('Gagal menghapus project')
  }
}
const exportReport=()=>p&&void reportPdf(p,{Project:p.name,'Project Number':p.number,Client:p.client,Status:p.status,'Planned Progress':formatPercent(planned),'Actual Progress':formatPercent(actual),'Deviation':formatPercent(dev),'WBS Items':rows('wbs').length,'Open Issues':rows('issues').filter(x=>!['Resolved','Closed'].includes(x.status)).length},chart.current,`${safe(p.name)}_Project_Report.pdf`);const exportCurve=(t:string)=>{if(!p)return;try{if(t==='png'&&chart.current)void elementPng(chart.current,`${safe(p.name)}_S-Curve.png`);if(t==='svg'&&chart.current)chartSvg(chart.current,`${safe(p.name)}_S-Curve.svg`);if(t==='pdf'&&report.current)void pdfOut(report.current,`${safe(p.name)}_S-Curve.pdf`,'S-Curve',p);if(t==='excel')excelOut(sc,`${safe(p.name)}_S-Curve.xlsx`,'S-Curve');if(t==='print')window.print()}catch(e){notify('Export failed: '+String(e))}};
return <div className="app"><aside className="sidebar"><div className="brand"><i>FN</i><div><b>Fadhil N Prabowo - Management Suites</b><small>PROJECT MANAGEMENT</small></div></div><div className="side-project"><small>ACTIVE PROJECT</small><select value={pid} onChange={e=>goProject(e.target.value)}>{db.projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div><nav>{[...new Set(nav.map(x=>x.group))].map(g=><section key={g}><label>{g}</label>{nav.filter(x=>x.group===g).map(x=><button className={page===x.label?'selected':''} key={x.label} onClick={()=>go(x.label)}><x.icon size={17}/>{x.label}</button>)}</section>)}</nav><div className="side-foot">{p?.engineer||'Project Engineer'}</div></aside><div className="main"><header><b>{page}</b><div><button className="secondary" onClick={addProject}>+ Project</button><button className="icon" onClick={()=>setDb(s=>({...s,settings:{...s.settings,dark:!s.settings.dark}}))}>{db.settings.dark?<Sun/>:<Moon/>}</button><select value={pid} onChange={e=>goProject(e.target.value)}>{db.projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div></header><main>
{page==='Projects'&&<><PageHead title="Projects" subtitle="Manage project workspaces." action="Create Project" onAction={addProject}/><div className="cards">{db.projects.map(x=><div className="panel" key={x.id}><Tag v={x.archived?'Archived':x.status}/><h3>{x.name}</h3><p>{x.number} · {x.client}</p><button className="primary" onClick={()=>goProject(x.id)}>Open project</button><button className="secondary" onClick={()=>void duplicateProject(x)}>Duplicate</button><button className="secondary" onClick={()=>void archiveProject(x)}>{x.archived?'Restore':'Archive'}</button><button className="danger-button" onClick={()=>void deleteProjectFromSupabase(x)}>Delete</button></div>)}</div></>}{page === 'Dashboard' && p && (
  <div className="dashboard-modern">
    <div className="panel dashboard-header">
      <div>
        <div className="eyebrow">PROJECT OVERVIEW</div>
        <h1>{p.name}</h1>
        <p>{p.client || '—'}{' · '}{p.location || '—'}</p>
      </div>
      <div className="project-status"><span className="status-dot" />{progressStatus}</div>
    </div>

    <div className="kpis dashboard-kpis">
      <Kpi title="Planned" value={formatPercent(planned)} />
      <Kpi title="Actual" value={formatPercent(actual)} />
      <Kpi title="Deviation" value={formatPercent(dev)} />
    </div>

    <div className="panel dashboard-chart">
      <div className="dashboard-section-head">
        <div><h2>S-Curve</h2><p>Planned vs actual cumulative progress</p></div>
        <div className="chart-summary"><strong>{formatPercent(actual)}</strong><span>Current Progress</span></div>
      </div>
      <Chart data={sc} refEl={chart} />
    </div>

    <div className="dashboard-grid">
      <div className="panel">
        <div className="dashboard-section-head">
          <div><h2>Activity Progress</h2><p>Latest activity performance</p></div>
          <strong>{projectActivities.length}</strong>
        </div>
        <div className="progress-list">
          {projectActivities.slice(0, 6).map((item: any) => {
            const value = Number(item.actual || 0)
            return <div className="progress-item" key={item.id}>
              <div className="progress-info"><span>{item.activity || '—'}</span><strong>{formatPercent(value)}</strong></div>
              <div className="progress-track"><div className="progress-fill" style={{width:`${Math.min(100,Math.max(0,value))}%`}} /></div>
            </div>
          })}
          {projectActivities.length === 0 && <p>Belum ada activity.</p>}
        </div>
      </div>

      <div className="panel">
        <div className="dashboard-section-head"><div><h2>Project Health</h2><p>Current project overview</p></div></div>
        <div className="health-list">
          <div className="health-row"><span>WBS</span><strong>{projectWbs.length}</strong></div>
          <div className="health-row"><span>Activities</span><strong>{projectActivities.length}</strong></div>
          <div className="health-row"><span>Weekly Progress</span><strong>{projectProgress.length}</strong></div>
          <div className="health-row"><span>Open Issues</span><strong>{openIssues}</strong></div>
          <div className="health-row"><span>High Priority</span><strong>{highIssues}</strong></div>
          <div className="health-row"><span>Pending Materials</span><strong>{materialPending}</strong></div>
        </div>
      </div>
    </div>
  </div>
)}{tableKey&&<><PageHead title={page} subtitle={`Manage ${page.toLowerCase()} for this project.`} action="Add record" onAction={()=>setModal({id:crypto.randomUUID(),projectId:pid})}/><div className="toolbar"><span><Search size={16}/><input placeholder="Search records" value={search} onChange={e=>setSearch(e.target.value)}/></span><button className="secondary" onClick={()=>{const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.json_to_sheet([Object.fromEntries(cols.map(k=>[label(k),'']))]),page);XLSX.writeFile(w,`${page}_template.xlsx`)}}>Template</button><label className="secondary">Import<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files?.[0];if(!f||!tableKey)return;const rd=new FileReader();rd.onload=()=>{try{const w=XLSX.read(rd.result,{type:'array'});setImp({key:tableKey,rows:XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]])})}catch{notify('Excel import failed')}};rd.readAsArrayBuffer(f)}}/></label><button className="secondary" onClick={()=>excelOut(shown,`${page}.xlsx`,page)}>Excel</button><button className="secondary" onClick={()=>csvOut(shown,`${page}.csv`)}>CSV</button><button className="secondary" onClick={()=>report.current&&void pdfOut(report.current,`${page}.pdf`,page,p)}>PDF</button></div><div className={`panel table-panel ${page==='Weekly Progress'?'weekly-progress-panel':''}`} ref={report}><div className="table-scroll"><table><thead><tr>{cols.map(k=><th key={k}>{label(k)}</th>)}<th>Actions</th></tr></thead><tbody>{shown.map(r=><tr key={r.id}>{cols.map(k=><td key={k}>{['planned','actual','plannedWeekly','actualWeekly','weight','progress'].includes(k)?formatPercent(r[k]):r[k]??'—'}</td>)}<td>{page==='Issues'&&!['Resolved','Closed'].includes(r.status)&&<button className='resolve-btn' onClick={()=>void resolveIssue(r)}>Mark Resolved</button>}<button className='icon' onClick={()=>setModal(r)}><Edit3 size={15}/></button><button className="icon" onClick={()=>remove(r.id)}><Trash2 size={15}/></button></td></tr>)}{!shown.length&&<tr><td colSpan={cols.length+1}>No {page.toLowerCase()} data available.</td></tr>}</tbody></table></div>{shown.length} records · auto-saved</div></>}
{page==='S-Curve'&&<><PageHead title="S-Curve Analysis" subtitle="Planned and actual cumulative progress with deviation."/><div className="kpis"><Kpi title="Total Persentase Rencana" value={formatPercent(planned)}/><Kpi title="Total Persentase Aktual" value={formatPercent(actual)}/><Kpi title="Selisih Aktual − Rencana" value={formatPercent(dev)}/></div><div className="panel" ref={report}><div className="line"><PanelTitle title="Progress curve"/>{['png','svg','pdf','excel'].map(x=><button className="secondary" key={x} onClick={()=>exportCurve(x)}>{x.toUpperCase()}</button>)}<button className="secondary" onClick={()=>window.print()}><Printer size={15}/> Print</button></div><Chart data={sc} refEl={chart} large/><SCurveBreakdownTable data={sc}/></div></>}
{page==='Dokumentasi Pekerjaan'&&p&&<WorkDocumentation project={p} entries={p.documentation||[]} onChange={items=>editProject('documentation',items)}/>} {page==='Berita Acara'&&p&&<BeritaAcara project={p} progress={actual} onChange={editProject}/>} {page==='Weekly Recap'&&p&&<WeeklyRecap project={p} progress={rows('progress')}/>} {page==='Monthly Recap'&&p&&<MonthlyRecap project={p} progress={rows('progress')}/>}{page==='Project Settings'&&p&&<ProjectForm p={p} change={editProject}/>}{page==='Approval'&&p&&<ApprovalForm p={p} change={editProject}/>}{page==='Company Branding'&&p&&<BrandForm p={p} change={editProject} notify={notify}/>}
{page==='Export Center'&&<><PageHead title="Export Center" subtitle="Generate project files from latest data."/><div className="cards">{[['Project Excel',()=>p&&projectWorkbook(p,db)],['Project JSON',()=>p&&jsonOut({project:p,wbs:rows('wbs'),progress:rows('progress'),activities:rows('activities'),issues:rows('issues'),materials:rows('materials')},`${safe(p.name)}.json`)],['Full backup JSON',()=>jsonOut(db,'Project_Backup.json')],['Project report PDF',exportReport]].map(([n,f]:any)=><div className="panel"><h3>{n}</h3><button className="primary" onClick={f}>Download</button></div>)}</div></>}
{page==='Backup & Restore'&&<><PageHead title="Backup & Restore"/><div className="panel"><h3>Export full backup</h3><button className="primary" onClick={()=>jsonOut(db,'Project_Dashboard_Backup.json')}>Export backup</button><h3>Restore backup</h3><input type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const x=JSON.parse(String(rd.result));if(x.projects&&confirm('Replace current data with backup?')){setDb(x);setPid(x.projects[0]?.id)}}catch{notify('Invalid backup')}};rd.readAsText(f)}}/></div></>}
{page==='Project Report'&&<><PageHead title="Project Report" action="Generate PDF" onAction={exportReport}/><div className="panel" ref={report}><h1>{p?.name}</h1><p>{p?.client} · {p?.number}</p><div className="kpis"><Kpi title="Total Persentase Rencana" value={formatPercent(planned)}/><Kpi title="Total Persentase Aktual" value={formatPercent(actual)}/><Kpi title="Selisih Aktual − Rencana" value={formatPercent(dev)}/></div><Chart data={sc} refEl={chart}/>{p&&<ApprovalSummary p={p}/>}</div></>}
</main><footer>Saved automatically in this browser</footer></div>{toast&&<div className="toast">{toast}</div>}{modal && <RowModal
  row={modal}
  cols={cols}
  wbsRows={rows('wbs')}
  activityRows={rows('activities')}
  isWeekly={page === 'Weekly Progress'}
  onSave={saveRow}
  close={() => setModal(null)}
/>}{imp&&<div className="backdrop"><div className="modal"><h2>Import preview</h2><p>{imp.rows.length} records found. Existing records are preserved.</p><button onClick={()=>setImp(null)}>Cancel</button><button className="primary" onClick={()=>{setDb(s=>({...s,[imp.key]:[...(s as any)[imp.key],...imp.rows.map((r:any)=>({...r,id:crypto.randomUUID(),projectId:pid}))]}));setImp(null)}}>Import</button></div></div>}</div>}
function ProjectForm({p,change}:any){const keys=['name','number','client','location','manager','engineer','contractor','consultant','start','finish','value','status','description'];return <div className="panel form-grid">{keys.map((k:string)=><label key={k}>{label(k)}<input value={p?.[k]??''} type={k==='value'?'number':k==='start'||k==='finish'?'date':'text'} onChange={e=>change(k,k==='value'?Number(e.target.value):e.target.value)}/></label>)}</div>}
function ApprovalForm({p,change}:any){const approval=p?.approval||{};const updateApproval=(key:string,value:string)=>change('approval',{...approval,[key]:value});const sections=[{title:'Approval 1',fields:[['firstCompany','Company'],['firstName','Name'],['firstPosition','Position'],['firstSignature','Signature']]},{title:'Approval 2',fields:[['secondCompany','Company'],['secondName','Name'],['secondPosition','Position'],['secondSignature','Signature']]}];return <div className="stack">{sections.map(section=><div className="panel" key={section.title}><h2>{section.title}</h2><div className="form-grid">{section.fields.map(([key,title])=><label key={key}>{title}<input value={approval[key]??''} onChange={e=>updateApproval(key,e.target.value)}/></label>)}</div></div>)}</div>}
function BrandForm({p,change,notify}:any){const [logo,setLogo]=useState(p?.logo||'');useEffect(()=>setLogo(p?.logo||''),[p?.logo]);const saveBranding=()=>{change('logo',logo);notify('Company branding updated')};return <div className="panel"><h2>Company Branding</h2><div className="form-grid"><label>Logo URL<input value={logo} onChange={e=>setLogo(e.target.value)} placeholder="https://..."/></label></div>{logo&&<div style={{marginTop:20}}><p>Preview</p><img src={logo} alt="Company Logo" style={{maxWidth:240,maxHeight:120,objectFit:'contain'}}/></div>}<button type="button" className="primary" onClick={saveBranding} style={{marginTop:20}}>Save Branding</button></div>}
function ApprovalSummary({p}:any){const approval=p?.approval||{};return <div className="panel" style={{marginTop:24}}><h2>Approval</h2><div className="kpis"><div><strong>{approval.firstCompany||'—'}</strong><div>{approval.firstName||'—'}</div><div>{approval.firstPosition||'—'}</div></div><div><strong>{approval.secondCompany||'—'}</strong><div>{approval.secondName||'—'}</div><div>{approval.secondPosition||'—'}</div></div></div></div>}
function PageHead({title,subtitle,action,onAction}:any){return <div className="pagehead"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action&&(typeof action==='string'?<button className="primary" onClick={onAction}>{action}</button>:<div className="head-actions">{action}</div>)}</div>}function Kpi({title,value}:any){return <div className="panel kpi"><small>{title}</small><b>{value}</b></div>}function PanelTitle({title,action}:any){return <div className="panel-title"><h3>{title}</h3>{action}</div>}function Tag({v}:any){return <span className="tag">{v||'—'}</span>}function Chart({data,refEl,large}:any){return <div className={`chart ${large?'large':''}`} ref={refEl}>{data.length?<ResponsiveContainer width="100%" height="100%"><AreaChart data={data}><CartesianGrid strokeDasharray="3 4" vertical={false}/><XAxis dataKey="week" tickFormatter={x=>`W${x}`}/><YAxis tickFormatter={(x:any)=>formatPercent(x)} domain={[0,100]}/><Tooltip formatter={(x:any)=>formatPercent(x)}/><Legend/><Area type="monotone" name="Planned" dataKey="plannedCum" stroke="#5578db" fill="#5578db22"/><Area type="monotone" name="Actual" dataKey="actualCum" stroke="#12a889" fill="#12a88922"/></AreaChart></ResponsiveContainer>:<p className="empty">No progress data available.</p>}</div>}function SCurveBreakdownTable({data}:any){if(!data.length)return <section className="sc-breakdown"><h3>Rekap Progres per Minggu</h3><p>No progress data available.</p></section>;const metrics=[['RENCANA','plannedWeekly'],['KUMULATIF RENCANA','plannedCum'],['REALISASI','actualWeekly'],['KUMULATIF REALISASI','actualCum'],['DEVIASI','deviation']];return <section className="sc-breakdown"><h3>Rekap Progres per Minggu</h3><div className="table-scroll"><table><thead><tr><th>Uraian</th>{data.map((r:any,i:number)=><th key={r.id||i}>Minggu {r.week}<small>{r.date||''}</small></th>)}</tr></thead><tbody>{metrics.map(([title,key])=><tr key={key}><th>{title}</th>{data.map((r:any,i:number)=><td key={r.id||i}>{formatPercent(r[key])}</td>)}</tr>)}</tbody></table></div></section>}function RowModal({
  row,
  cols,
  wbsRows = [],
  activityRows = [],
  isWeekly = false,
  onSave,
  close
}: any) {
const [v, setV] = useState<any>(() => row ?? {})

  const selectedWbs = wbsRows.find(
    (x: any) => x != null && String(x.code) === String(v.wbsCode)
  )

  const filteredActivities = activityRows.filter(
    (x: any) =>
      x != null && (!v.wbsCode ||
      String(x.wbsCode) === String(v.wbsCode))
  )

  const update = (key: string, value: any) => {
    setV((old: any) => ({
      ...old,
      [key]: value
    }))
  }

  const selectWbs = (code: string) => {
    const selected = wbsRows.find(
      (x: any) => x != null && String(x.code) === String(code)
    )

    setV((old: any) => ({
      ...old,
      wbsCode: code,
      wbsId: selected?.id || '',
      activity: '',
      activityId: ''
    }))
  }

  const selectActivity = (id: string) => {
    const selected = activityRows.find(
      (x: any) => x != null && x.id === id
    )

    setV((old: any) => ({
      ...old,
      activityId: id,
      activity: selected?.activity || ''
    }))
  }

  return (
    <div className="backdrop">
      <form
        className="modal"
        onSubmit={e => {
          e.preventDefault()
          onSave(v)
        }}
      >
        <h2>
          {row?.id ? 'Edit record' : 'Add record'}
        </h2>

        <div className="form-grid">

          {cols.map((k: string) => {

            /*
             * WEEKLY PROGRESS
             * ----------------
             */

            if (isWeekly && k === 'wbsCode') {
              return (
                <label key={k}>
                  WBS Code

                  <select
                    value={v.wbsCode || ''}
                    onChange={e =>
                      selectWbs(e.target.value)
                    }
                  >
                    <option value="">
                      Pilih WBS
                    </option>

                    {wbsRows.map((x: any) => (
                      <option
                        key={x.id}
                        value={x.code}
                      >
                        {x.code} · {x.activity}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }

            if (isWeekly && k === 'activity') {
              return (
                <label key={k}>
                  Activity

                  <select
                    value={v.activityId || ''}
                    onChange={e =>
                      selectActivity(e.target.value)
                    }
                    disabled={!v.wbsCode}
                  >
                    <option value="">
                      {v.wbsCode
                        ? 'Pilih Activity'
                        : 'Pilih WBS terlebih dahulu'}
                    </option>

                    {filteredActivities.map(
                      (x: any) => (
                        <option
                          key={x.id}
                          value={x.id}
                        >
                          {x.activity}
                        </option>
                      )
                    )}
                  </select>
                </label>
              )
            }

            /*
             * ACTIVITY
             * ----------------
             */

            if (!isWeekly && k === 'wbsCode') {
              return (
                <label key={k}>
                  WBS Code

                  <select
                    value={v.wbsCode || ''}
                    onChange={e => {
                      const selected =
                        wbsRows.find(
                          (x: any) => x != null &&
                            String(x.code) ===
                            String(e.target.value)
                        )

                      setV((old: any) => ({
                        ...old,
                        wbsCode:
                          e.target.value,
                        wbsId:
                          selected?.id || ''
                      }))
                    }}
                  >
                    <option value="">
                      Pilih WBS
                    </option>

                    {wbsRows.map((x: any) => (
                      <option
                        key={x.id}
                        value={x.code}
                      >
                        {x.code} · {x.activity}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }

            /*
             * NORMAL FIELD
             * ----------------
             */

            return (
              <label key={k}>
                {label(k)}

                <input
                  type={
                    ['date', 'start', 'finish']
                      .includes(k)
                      ? 'date'
                      : [
                          'week',
                          'quantity',
                          'weight',
                          'planned',
                          'actual',
                          'plannedWeekly',
                          'actualWeekly',
                          'progress',
                          'duration'
                        ].includes(k)
                      ? 'number'
                      : 'text'
                  }

                  min={
                    k === 'week'
                      ? 1
                      : [
                          'planned',
                          'actual',
                          'plannedWeekly',
                          'actualWeekly',
                          'progress'
                        ].includes(k)
                      ? 0
                      : undefined
                  }

                  max={
                    [
                      'planned',
                      'actual',
                      'plannedWeekly',
                      'actualWeekly',
                      'progress'
                    ].includes(k)
                      ? 100
                      : undefined
                  }

                  step={
                    k === 'week'
                      ? 1
                      : 'any'
                  }

                  value={v[k] ?? ''}

                  onChange={e =>
                    update(k, e.target.value)
                  }
                />
              </label>
            )
          })}

        </div>

        <div className="line">
          <button
            type="button"
            className="secondary"
            onClick={close}
          >
            Cancel
          </button>

          <button className="primary">
            Save record
          </button>
        </div>
      </form>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<HashRouter><App/></HashRouter>);
