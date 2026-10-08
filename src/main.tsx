import { supabase } from './services/supabase'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, useNavigate } from 'react-router-dom'
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

import type { Project, Row, Store } from './types'
import { emptyStore, loadPreferences, savePreferences } from './services/storage'
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
  deleteMaterial,
  insertRowsBatch,
  duplicateProjectWithData,
  restoreBackupToSupabase,
  validateBackup,
  signIn,
  signOut,
  getSession
} from './services/database'

import {
  chartSvg,
  csvOut,
  elementPng,
  excelOut,
  jsonOut,
  pdfOut,
  projectWorkbook,
  readSpreadsheet,
  reportPdf,
  safe,
  templateOut
} from './exports/files'

import './style.css'
import { formatPercent, parseLocaleNumber } from './utils/format'

const LazyProgressChart = React.lazy(() => import('./components/ProgressChart'))

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
    'parentId',
    'description',
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
    'status',
    'notes'
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
    'materialCode',
    'material',
    'specification',
    'quantity',
    'unit',
    'required',
    'approval',
    'procurement',
    'delivery',
    'supplier',
    'status',
    'notes'
  ]
}

const label = (k: string) =>
  ({
    code: 'WBS Code',
    wbsCode: 'WBS Code',
    parentId: 'Parent WBS ID',
    materialCode: 'Material Code',
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

const isIssueComplete = (status: unknown) =>
  ['resolved', 'closed', 'complete', 'completed'].includes(String(status || '').trim().toLowerCase())

function validateProgressRow(row: Row, existing: Row[], projectWbs: Row[], ignoredId?: string) {
  const week = parseLocaleNumber(row.week)
  if (!Number.isInteger(week) || week < 1) return 'Minggu harus berupa angka bulat minimal 1.'
  if (!isValidDateInput(row.date)) return 'Tanggal progres harus diisi dengan format tanggal yang valid.'
  for (const [key, labelText] of [['plannedWeekly', 'Planned Weekly'], ['actualWeekly', 'Actual Weekly']] as const) {
    const value = parseLocaleNumber(row[key])
    if (!Number.isFinite(value) || value < 0 || value > 100) return `${labelText} harus berada di antara 0 dan 100%.`
  }
  const selectedWbsIds = [...new Set(Array.isArray(row.wbsIds) ? row.wbsIds : row.wbsId ? [row.wbsId] : [])]
  const projectWbsById = new Map(projectWbs.filter(item => item.projectId === row.projectId).map(item => [item.id, item]))
  for (const id of selectedWbsIds) {
    const linkedWbs = projectWbsById.get(id)
    if (!linkedWbs) return 'WBS yang dipilih tidak ditemukan pada project aktif. Muat ulang data lalu pilih kembali.'
    if (!String(linkedWbs.activity || '').trim()) return `Keterangan Activity untuk WBS ${linkedWbs.code || id} belum diisi.`
  }
  if (existing.some(item => item.id !== ignoredId && item.projectId === row.projectId && Number(item.week) === week)) {
    return `Minggu ${week} sudah memiliki data Weekly Progress untuk project ini.`
  }
  if (existing.some(item => item.id !== ignoredId && item.projectId === row.projectId && String(item.date) === String(row.date))) {
    return `Tanggal ${row.date} sudah digunakan oleh Weekly Progress lain dalam project ini.`
  }
  const ordered = [...existing.filter(item => item.id !== ignoredId && item.projectId === row.projectId), row]
    .sort((a, b) => Number(a.week) - Number(b.week))
  if (ordered.some((item, index) => index > 0 && String(ordered[index - 1].date) > String(item.date))) {
    return 'Tanggal progres harus berurutan sesuai nomor minggu.'
  }
  for (const key of ['plannedWeekly', 'actualWeekly'] as const) {
    const cumulative = existing
      .filter(item => item.id !== ignoredId && item.projectId === row.projectId)
      .reduce((total, item) => total + parseLocaleNumber(item[key]), 0)
      + parseLocaleNumber(row[key])
    if (cumulative > 100.000001) return `Total kumulatif ${key === 'plannedWeekly' ? 'rencana' : 'aktual'} tidak boleh melebihi 100%.`
  }
  return ''
}

function isValidDateInput(value: unknown) {
  const text = String(value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signIn(email, password)
      onLogin()
    } catch {
      setError('Email atau password salah.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="login-page"><div className="login-card">
    <div className="login-brand"><div className="login-logo">PM</div><div><h1>Project Management</h1><p>Project Engineer Dashboard</p></div></div>
    <form onSubmit={submit}>
      <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Enter your email" autoComplete="email" required /></label>
      <label>Password<div className="password-field"><input type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required /><button type="button" onClick={()=>setShowPassword(x=>!x)}>{showPassword?'Hide':'Show'}</button></div></label>
      {error&&<div className="login-error">{error}</div>}
      <button className="login-button" type="submit" disabled={loading}>{loading?'Signing in...':'Sign In'}</button>
    </form>
  </div></div>
}

function applyUserPreferences(data: Store, userId: string, preferredProjectId?: string) {
  const preferences = loadPreferences(userId)
  const selectedProject = data.projects.find(project => project.id === preferredProjectId)?.id
    || data.projects.find(project => project.id === preferences.defaultProject)?.id
    || data.projects[0]?.id
    || ''
  data.settings = { ...data.settings, ...preferences, defaultProject: selectedProject }
  savePreferences(userId, data.settings)
  return selectedProject
}

function App() {
  const [db, setDb] = useState<Store>(emptyStore)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loadedUserId, setLoadedUserId] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768)

  const [pid, setPid] = useState('')
  const [page, setPage] = useState<Page>('Dashboard')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState<Row | null>(null)
  const [toast, setToast] = useState('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [imp, setImp] = useState<any>(null)
  const [issueFilter, setIssueFilter] = useState('All')

  const chart = useRef<HTMLDivElement>(null)
  const report = useRef<HTMLDivElement>(null)
  const projectDrafts = useRef<Record<string, Project>>({})
  const projectSaveTimers = useRef<Record<string, number>>({})
  const projectSaveQueue = useRef<Promise<void>>(Promise.resolve())
  const saveRevision = useRef(0)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const navigate = useNavigate()

  useEffect(() => () => {
    Object.values(projectSaveTimers.current).forEach(window.clearTimeout)
  }, [])

  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        const currentSession = await getSession()
        if (mounted) setSession(currentSession)
      } catch (error) {
        console.error('AUTH SESSION ERROR:', error)
      } finally {
        if (mounted) setAuthLoading(false)
      }
    }

    void checkAuth()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Ambil data utama dari Supabase setelah pengguna terautentikasi.
  useEffect(() => {
    if (!session?.user?.id) {
      setDb(emptyStore())
      setPid('')
      setLoadedUserId('')
      setLoading(false)
      setLoadError('')
      return
    }

    let mounted = true
    setLoading(true)
    setLoadedUserId('')
    setLoadError('')
    setDb(emptyStore())
    setPid('')

    const loadData = async () => {
      try {
        const data = await loadFromSupabase()

        if (!mounted) return

        const selectedProject = applyUserPreferences(data, session.user.id)
        setDb(data)
        setPid(selectedProject)
        setLoadedUserId(session.user.id)
        document.documentElement.dataset.theme = data.settings.dark ? 'dark' : 'light'
      } catch (error) {
        console.error(
          'Gagal mengambil data dari Supabase:',
          error
        )
        if (mounted) {
          setDb(emptyStore())
          setPid('')
          setLoadError('Data project gagal dimuat dari server. Periksa koneksi Anda, lalu coba lagi.')
        }
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
  }, [session?.user?.id, loadAttempt])

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
  const runExport = (task: Promise<unknown>, message = 'Export gagal. Silakan coba lagi.') => {
    void task.catch(error => {
      console.error('EXPORT ERROR:', error)
      notify(message)
    })
  }

  const beginSave = () => {
    const revision = ++saveRevision.current
    setSaveStatus('saving')
    return revision
  }
  const finishSave = (revision: number, success: boolean) => {
    if (revision !== saveRevision.current) return
    setSaveStatus(success ? 'saved' : 'error')
    if (success) setLastSavedAt(new Date())
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
  const duplicateProgressWeeks = [...new Set(projectProgress.map(item => Number(item.week)).filter((week, index, all) => all.indexOf(week) !== index))]
  const projectIssues = rows('issues')
  const projectMaterials = rows('materials')
  const openIssues = projectIssues.filter(x => !isIssueComplete(x.status)).length
  const highIssues = projectIssues.filter(x => String(x.priority || '').toLowerCase() === 'high' && !isIssueComplete(x.status)).length
  const resolvedIssues = projectIssues.filter(x => isIssueComplete(x.status)).length
  const materialPending = projectMaterials.filter(x => !['received', 'completed', 'complete'].includes(String(x.delivery || '').toLowerCase())).length
  const latestProgress = projectProgress.length
    ? projectProgress.slice().sort((a, b) => Number(a.week || 0) - Number(b.week || 0)).at(-1)
    : null
  const latestPlanned = latestProgress ? Number(latestProgress.plannedWeekly || 0) : planned
  const latestActual = latestProgress ? Number(latestProgress.actualWeekly || 0) : actual
  const latestDeviation = latestActual - latestPlanned
  const progressStatus = actual >= planned ? 'On Track' : actual >= planned - 5 ? 'At Risk' : 'Delayed'
  const filteredIssues = projectIssues.filter((x: any) => issueFilter === 'All' || String(x.status || '') === issueFilter)
const goProject=(id:string)=>{setPid(id);setDb(s=>{const next={...s,settings:{...s.settings,defaultProject:id}};if(session?.user?.id)savePreferences(session.user.id,next.settings);return next});go('Dashboard')};const editProject = (k: string, v: any) => {
  if (!p) return

  const ownerId = session?.user?.id
  if (!ownerId) return
  const draftKey = `${ownerId}:${pid}`
  const updated: Project = {
    ...(projectDrafts.current[draftKey] || p),
    [k]: v
  }
  projectDrafts.current[draftKey] = updated
  setDb(s => ({ ...s, projects: s.projects.map(project => project.id === pid ? updated : project) }))
  const saveRevisionAtEdit = beginSave()

  window.clearTimeout(projectSaveTimers.current[draftKey])
  projectSaveTimers.current[draftKey] = window.setTimeout(() => {
    const snapshot = projectDrafts.current[draftKey]
    projectSaveQueue.current = projectSaveQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (sessionRef.current?.user?.id !== ownerId) throw new Error('Session changed before project save.')
        await updateProject(snapshot)
        if (projectDrafts.current[draftKey] === snapshot) delete projectDrafts.current[draftKey]
        finishSave(saveRevisionAtEdit, true)
      })
      .catch(error => {
        console.error('PROJECT UPDATE ERROR:', error)
        finishSave(saveRevisionAtEdit, false)
        notify('Project belum tersimpan. Periksa koneksi, lalu ubah kembali atau coba lagi.')
      })
    delete projectSaveTimers.current[draftKey]
  }, 600)
};
const saveRow = async (r: Row) => {
  if (!tableKey) return
  const saveRevisionAtStart = beginSave()

  if (tableKey === 'progress') {
      const validationError = validateProgressRow(r, db.progress, rows('wbs'), r.id)
    if (validationError) {
      notify(validationError)
      return
    }
  }

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
    finishSave(saveRevisionAtStart, true)
    notify(exists ? 'Data berhasil diperbarui' : 'Data berhasil ditambahkan')
  } catch (error) {
    console.error('SAVE ROW ERROR:', error)
    finishSave(saveRevisionAtStart, false)
    notify('Gagal menyimpan data ke Supabase')
  }
}

const remove = async (id: string) => {
  if (!tableKey || !confirm('Delete this record?')) return
  const saveRevisionAtStart = beginSave()
  try {
    if (tableKey === 'wbs') await deleteWBS(id)
    if (tableKey === 'activities') await deleteActivity(id)
    if (tableKey === 'progress') await deleteProgress(id)
    if (tableKey === 'issues') await deleteIssue(id)
    if (tableKey === 'materials') await deleteMaterial(id)
    setDb(s => ({ ...s, [tableKey]: s[tableKey].filter(x => x.id !== id) }))
    finishSave(saveRevisionAtStart, true)
    notify('Data berhasil dihapus')
  } catch (error) {
    console.error('DELETE ROW ERROR:', error)
    finishSave(saveRevisionAtStart, false)
    notify('Gagal menghapus data dari Supabase')
  }
}

const importExcelRows = async (
  key: 'wbs' | 'progress' | 'activities' | 'issues' | 'materials',
  rawRows: any[]
) => {
  if (!rawRows.length) {
    notify('Tidak ada data untuk diimport')
    return
  }
  if (!pid) {
    notify('Pilih project sebelum import')
    return
  }

  const pageName = key === 'wbs'
    ? 'WBS'
    : key === 'progress'
      ? 'Weekly Progress'
      : key === 'activities'
        ? 'Activities'
        : key === 'issues'
          ? 'Issues'
          : 'Materials'
  const reverseLabels: Record<string, string> = {}
  schemas[pageName].forEach(k => { reverseLabels[label(k)] = k })

  const preparedRows: Row[] = rawRows.map(raw => {
    const row: Row = { id: crypto.randomUUID(), projectId: pid }
    Object.entries(raw).forEach(([excelKey, value]) => {
      const internalKey = reverseLabels[excelKey] || excelKey
      row[internalKey] = value instanceof Date ? value.toISOString().slice(0, 10) : value
    })
    return row
  })

  const projectWbsRows = db.wbs.filter(item => item.projectId === pid)
  const wbsByCode = new Map(projectWbsRows.map(item => [String(item.code).trim(), item]))
  const dateIsValid = (value: unknown) => {
    return isValidDateInput(value)
  }

  for (const [index, row] of preparedRows.entries()) {
    if (key === 'wbs') {
      if (!String(row.code || '').trim() || !String(row.activity || '').trim()) {
        notify(`Baris ${index + 2}: WBS Code dan Activity wajib diisi.`)
        return
      }
      if (projectWbsRows.some(item => String(item.code).trim() === String(row.code).trim()) || preparedRows.slice(0, index).some(item => String(item.code).trim() === String(row.code).trim())) {
        notify(`Baris ${index + 2}: WBS Code ${row.code} sudah digunakan dalam project.`)
        return
      }
      if (row.parentId && !projectWbsRows.some(item => item.id === row.parentId)) {
        notify(`Baris ${index + 2}: Parent WBS tidak ditemukan pada project aktif.`)
        return
      }
    }
    if (key === 'activities') {
      if (!String(row.activity || '').trim()) {
        notify(`Baris ${index + 2}: Activity wajib diisi.`)
        return
      }
      const wbs = wbsByCode.get(String(row.wbsCode || '').trim())
      if (row.wbsCode && !wbs) {
        notify(`Baris ${index + 2}: WBS Code ${row.wbsCode} tidak ditemukan pada project aktif.`)
        return
      }
      row.wbsId = row.wbsId || wbs?.id || ''
    }
    if (key === 'progress') {
      const codes = String(row.wbsCode || '').split(',').map(code => code.trim()).filter(Boolean)
      const linkedWbs = codes.map(code => wbsByCode.get(code))
      if (linkedWbs.some(item => !item)) {
        const missing = codes.find(code => !wbsByCode.has(code))
        notify(`Baris ${index + 2}: WBS Code ${missing} tidak ditemukan pada project aktif.`)
        return
      }
      row.wbsIds = linkedWbs.map(item => item!.id)
      row.wbsCodes = linkedWbs.map(item => String(item!.code))
      row.wbsId = row.wbsIds[0] || ''
      row.activityIds = []
      row.activityNames = [...new Set(linkedWbs.map(item => String(item!.activity || '').trim()).filter(Boolean))]
      row.activityId = ''
      row.activity = row.activityNames.join(', ')
    }
    if (key === 'issues' && !String(row.issue || '').trim()) {
      notify(`Baris ${index + 2}: Judul issue wajib diisi.`)
      return
    }
    if (key === 'materials' && !String(row.material || '').trim()) {
      notify(`Baris ${index + 2}: Nama material wajib diisi.`)
      return
    }
    const numericFields = key === 'wbs'
      ? ['quantity', 'weight', 'planned', 'actual']
      : key === 'activities'
        ? ['duration', 'weight', 'planned', 'actual']
        : key === 'progress'
          ? ['plannedWeekly', 'actualWeekly']
          : key === 'materials'
            ? ['quantity']
            : []
    for (const field of numericFields) {
      if (row[field] === '' || row[field] == null) continue
      const value = parseLocaleNumber(row[field])
      if (!Number.isFinite(value) || value < 0 || (['weight', 'planned', 'actual', 'plannedWeekly', 'actualWeekly'].includes(field) && value > 100)) {
        notify(`Baris ${index + 2}: ${label(field)} harus berupa angka yang valid${['weight', 'planned', 'actual', 'plannedWeekly', 'actualWeekly'].includes(field) ? ' antara 0 dan 100' : ' dan tidak boleh negatif'}.`)
        return
      }
      row[field] = value
    }
    for (const dateField of key === 'wbs' || key === 'activities'
      ? ['start', 'finish']
      : key === 'progress'
        ? ['date']
        : key === 'issues'
          ? ['date', 'target']
          : ['required']) {
      if (row[dateField] && !dateIsValid(row[dateField])) {
        notify(`Baris ${index + 2}: ${label(dateField)} tidak menggunakan tanggal yang valid (YYYY-MM-DD).`)
        return
      }
    }
  }

  if (key === 'progress') {
    for (const [field, title] of [['plannedWeekly', 'rencana'], ['actualWeekly', 'aktual']] as const) {
      const total = db.progress
        .filter(item => item.projectId === pid)
        .reduce((sum, item) => sum + parseLocaleNumber(item[field]), 0)
        + preparedRows.reduce((sum, item) => sum + parseLocaleNumber(item[field]), 0)
      if (total > 100.000001) {
        notify(`Total kumulatif ${title} dari data lama dan file import melebihi 100%.`)
        return
      }
    }
    const seenWeeks = new Set<number>()
    const seenDates = new Set<string>()
    for (const [index, row] of preparedRows.entries()) {
      const message = validateProgressRow(row, db.progress, projectWbsRows)
      const week = Number(row.week)
      const date = String(row.date)
      if (message || seenWeeks.has(week) || seenDates.has(date)) {
        notify(message || (seenWeeks.has(week) ? `File Excel memiliki duplikasi minggu ${week}` : `File Excel memiliki duplikasi tanggal ${date}`) + ` (baris ${index + 2}).`)
        return
      }
      seenWeeks.add(week)
      seenDates.add(date)
    }
    const chronological = [...preparedRows].sort((a, b) => parseLocaleNumber(a.week) - parseLocaleNumber(b.week))
    if (chronological.some((row, index) => index > 0 && String(chronological[index - 1].date) > String(row.date))) {
      notify('Tanggal pada file Excel tidak berurutan sesuai nomor minggu.')
      return
    }
  }

  const saveRevisionAtStart = beginSave()
  try {
    const insertedRows = await insertRowsBatch(key, preparedRows)
    const imported = insertedRows.length

    const refreshed = await loadFromSupabase()
    const selectedProject = applyUserPreferences(refreshed, session.user.id, pid)
    setDb(refreshed)
    setPid(selectedProject)
    setImp(null)
    finishSave(saveRevisionAtStart, true)
    notify(`${imported} record berhasil diimport ke Supabase`)
  } catch (error) {
    console.error('IMPORT EXCEL ERROR:', error)
    finishSave(saveRevisionAtStart, false)
    notify('Import gagal. Periksa format kolom Excel.')
    try {
      const refreshed = await loadFromSupabase()
      applyUserPreferences(refreshed, session.user.id, pid)
      setDb(refreshed)
    } catch (refreshError) {
      console.error('IMPORT REFRESH ERROR:', refreshError)
    }
  }
}

const resolveIssue = async (row: Row) => {
  const resolved = { ...row, status: 'Resolved' }
  const saveRevisionAtStart = beginSave()
  try {
    await updateIssue(resolved)
    setDb(s => ({ ...s, issues: s.issues.map(issue => issue.id === row.id ? resolved : issue) }))
    finishSave(saveRevisionAtStart, true)
    notify('Issue berhasil diselesaikan')
  } catch (error) {
    console.error('RESOLVE ISSUE ERROR:', error)
    finishSave(saveRevisionAtStart, false)
    notify('Gagal memperbarui issue di Supabase')
  }
}
const addProject = async () => {
  const name = prompt('Project name')

  if (!name) return
  const saveRevisionAtStart = beginSave()

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

    setDb(s => {
      const next = { ...s, projects: [...s.projects, savedProject], settings: { ...s.settings, defaultProject: inserted.id } }
      if (session?.user?.id) savePreferences(session.user.id, next.settings)
      return next
    })

    setPid(inserted.id)
    go('Project Settings')

    finishSave(saveRevisionAtStart, true)
    notify('Project berhasil dibuat')
  } catch (error) {
    console.error(error)
    finishSave(saveRevisionAtStart, false)
    notify('Gagal membuat project')
  }
};
const duplicateProject = async (project: Project) => {
  const saveRevisionAtStart = beginSave()
  try {
    const duplicated = await duplicateProjectWithData(
      project,
      db.wbs.filter(x => x.projectId === project.id),
      db.activities.filter(x => x.projectId === project.id),
      db.progress.filter(x => x.projectId === project.id),
      db.issues.filter(x => x.projectId === project.id),
      db.materials.filter(x => x.projectId === project.id)
    )
    const refreshed = await loadFromSupabase()
    refreshed.settings = { ...refreshed.settings, ...loadPreferences(session.user.id), defaultProject: duplicated.id }
    savePreferences(session.user.id, refreshed.settings)
    setDb(refreshed)
    setPid(duplicated.id)
    go('Dashboard')
    finishSave(saveRevisionAtStart, true)
    notify('Project dan seluruh data berhasil diduplikasi')
  } catch (error) {
    console.error('DUPLICATE PROJECT ERROR:', error)
    finishSave(saveRevisionAtStart, false)
    notify('Gagal duplicate project dan data')
  }
}
const archiveProject = async (project: Project) => {
  const saveRevisionAtStart = beginSave()
  try {
    const updated: Project = {
      ...project,
      archived: !project.archived
    }
    await updateProject(updated)
    setDb(s => ({ ...s, projects: s.projects.map(x => x.id === project.id ? updated : x) }))
    finishSave(saveRevisionAtStart, true)
    notify(updated.archived ? 'Project diarsipkan' : 'Project dikembalikan')
  } catch (error) {
    console.error('ARCHIVE PROJECT ERROR:', error)
    finishSave(saveRevisionAtStart, false)
    notify('Gagal mengubah status archive')
  }
}
const deleteProjectFromSupabase = async (project: Project) => {
  if (!confirm(`Delete project "${project.name}"?\n\nSemua WBS, Activities, Progress, Issues, dan Materials project ini juga akan terhapus.`)) return
  const saveRevisionAtStart = beginSave()
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
      const nextId = remaining[0]?.id ?? ''
      setPid(nextId)
      setDb(s => {
        const next = { ...s, settings: { ...s.settings, defaultProject: nextId } }
        if (session?.user?.id) savePreferences(session.user.id, next.settings)
        return next
      })
      go('Projects')
    }
    finishSave(saveRevisionAtStart, true)
    notify('Project berhasil dihapus')
  } catch (error) {
    console.error('DELETE PROJECT ERROR:', error)
    finishSave(saveRevisionAtStart, false)
    notify('Gagal menghapus project')
  }
}
const exportReport=()=>p&&runExport(reportPdf(p,{Project:p.name,'Project Number':p.number,Client:p.client,Status:p.status,'Planned Progress':formatPercent(planned),'Actual Progress':formatPercent(actual),'Deviation':formatPercent(dev),'WBS Items':rows('wbs').length,'Open Issues':rows('issues').filter(x=>!isIssueComplete(x.status)).length},chart.current,`${safe(p.name)}_Project_Report.pdf`),'PDF report gagal dibuat.');const exportCurve=(t:string)=>{if(!p)return;try{if(t==='png'&&chart.current)runExport(elementPng(chart.current,`${safe(p.name)}_S-Curve.png`));if(t==='svg'&&chart.current)chartSvg(chart.current,`${safe(p.name)}_S-Curve.svg`);if(t==='pdf'&&report.current)runExport(pdfOut(report.current,`${safe(p.name)}_S-Curve.pdf`,'S-Curve',p),'PDF S-Curve gagal dibuat.');if(t==='excel')runExport(excelOut(sc,`${safe(p.name)}_S-Curve.xlsx`,'S-Curve'));if(t==='print')window.print()}catch(e){notify('Export gagal: '+String(e))}};
if (authLoading) return <div className="auth-loading">Loading...</div>
if (!session) return <LoginPage onLogin={() => { void getSession().then(setSession) }} />
if (loading || (session?.user?.id && loadedUserId !== session.user.id && !loadError)) return <div className="auth-loading">Loading project data...</div>
if (loadError) return <div className="auth-loading"><div className="panel"><h2>Project data unavailable</h2><p>{loadError}</p><button className="primary" onClick={() => setLoadAttempt(value => value + 1)}>Try again</button><button className="secondary" onClick={async()=>{try{await signOut();setSession(null);setDb(emptyStore());setPid('')}catch(error){console.error('SIGN OUT ERROR:',error)}}}>Logout</button></div></div>

return <div className={`app ${sidebarOpen ? 'sidebar-is-open' : 'sidebar-is-closed'}`}><aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}><div className="brand"><i>FN</i><div><b className="sidebar-label">Fadhil N Prabowo - Management Suites</b><small className="sidebar-label">PROJECT MANAGEMENT</small></div></div><div className="side-project"><small className="sidebar-section-title">ACTIVE PROJECT</small><select className="sidebar-label" value={pid} onChange={e=>goProject(e.target.value)}>{db.projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div><nav>{[...new Set(nav.map(x=>x.group))].map(g=><section key={g}><label className="sidebar-section-title">{g}</label>{nav.filter(x=>x.group===g).map(x=><button className={page===x.label?'selected':''} key={x.label} onClick={()=>{go(x.label);if(window.innerWidth<=768)setSidebarOpen(false)}}><x.icon size={17}/><span className="sidebar-label">{x.label}</span></button>)}</section>)}</nav><div className="side-foot sidebar-label">{p?.engineer||'Project Engineer'}</div></aside>{sidebarOpen&&<div className="sidebar-overlay" onClick={()=>setSidebarOpen(false)}/>}<div className="main"><header><button className="mobile-menu-button" onClick={()=>setSidebarOpen(x=>!x)} aria-label="Open menu">Menu</button><button className="sidebar-toggle" onClick={()=>setSidebarOpen(x=>!x)} aria-label="Toggle sidebar">{sidebarOpen?"<":">"}</button><b>{page}</b><div><button className="secondary" onClick={addProject}>+ Project</button><button className="icon" onClick={()=>setDb(s=>{const next={...s,settings:{...s.settings,dark:!s.settings.dark}};if(session?.user?.id)savePreferences(session.user.id,next.settings);return next})}>{db.settings.dark?<Sun/>:<Moon/>}</button><select value={pid} onChange={e=>goProject(e.target.value)}>{db.projects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="secondary" onClick={async()=>{try{await signOut();setSession(null);setDb(emptyStore());setPid('')}catch(error){console.error('SIGN OUT ERROR:',error);notify('Logout failed')}}}>Logout</button></div></header><main>
{page==='Projects'&&<><PageHead title="Projects" subtitle="Manage project workspaces." action="Create Project" onAction={addProject}/><div className="cards">{db.projects.map(x=><div className="panel" key={x.id}><Tag v={x.archived?'Archived':x.status}/><h3>{x.name}</h3><p>{x.number}  |  {x.client}</p><button className="primary" onClick={()=>goProject(x.id)}>Open project</button><button className="secondary" onClick={()=>void duplicateProject(x)}>Duplicate</button><button className="secondary" onClick={()=>void archiveProject(x)}>{x.archived?'Restore':'Archive'}</button><button className="danger-button" onClick={()=>void deleteProjectFromSupabase(x)}>Delete</button></div>)}</div></>}{page === 'Dashboard' && p && (
  <div className="dashboard-modern">
    <div className="panel dashboard-header">
      <div>
        <div className="eyebrow">PROJECT OVERVIEW</div>
        <h1>{p.name}</h1>
        <p>{p.client || '-'}{'  |  '}{p.location || '-'}</p>
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
              <div className="progress-info"><span>{item.activity || '-'}</span><strong>{formatPercent(value)}</strong></div>
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
          <div className="health-row"><span>Resolved Issues</span><strong>{resolvedIssues}</strong></div>
          <div className="health-row"><span>Pending Materials</span><strong>{materialPending}</strong></div>
        </div>
      </div>
    </div>
  </div>
)}{tableKey&&<><PageHead title={page} subtitle={page === 'Weekly Progress' ? 'Weekly progress diisi sebagai progres inkremental per minggu; S-Curve menjumlahkan nilai mingguan.' : `Manage ${page.toLowerCase()} for this project.`} action="Add record" onAction={()=>setModal({id:crypto.randomUUID(),projectId:pid})}/><div className="toolbar"><span><Search size={16}/><input placeholder="Search records" value={search} onChange={e=>setSearch(e.target.value)}/></span><button className="secondary" onClick={()=>runExport(templateOut(cols.map(k=>label(k)),page),'Template gagal dibuat.')}>Template</button><label className="secondary">Import<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const f=e.target.files?.[0];if(!f||!tableKey)return;const rd=new FileReader();rd.onload=async()=>{try{const importedRows=await readSpreadsheet(rd.result as ArrayBuffer);setImp({key:tableKey,rows:importedRows})}catch{notify('Excel import failed')}};rd.readAsArrayBuffer(f);e.currentTarget.value=''}}/></label><button className="secondary" onClick={()=>runExport(excelOut(shown,`${page}.xlsx`,page))}>Excel</button><button className="secondary" onClick={()=>runExport(csvOut(shown,`${page}.csv`))}>CSV</button><button className="secondary" onClick={()=>report.current&&runExport(pdfOut(report.current,`${page}.pdf`,page,p),'PDF gagal dibuat.')}>PDF</button></div><div className={`panel table-panel ${page==='Weekly Progress'?'weekly-progress-panel':''}`} ref={report}><div className="table-scroll"><table><thead><tr>{cols.map(k=><th key={k}>{label(k)}</th>)}<th>Actions</th></tr></thead><tbody>{shown.map(r=><tr key={r.id}>{cols.map(k=><td key={k}>{['planned','actual','plannedWeekly','actualWeekly','weight','progress'].includes(k)?formatPercent(r[k]):r[k]??'-'}</td>)}<td>{page==='Issues'&&!isIssueComplete(r.status)&&<button className='resolve-btn' onClick={()=>void resolveIssue(r)}>Mark Resolved</button>}<button className='icon' onClick={()=>setModal(r)}><Edit3 size={15}/></button><button className="icon" onClick={()=>remove(r.id)}><Trash2 size={15}/></button></td></tr>)}{!shown.length&&<tr><td colSpan={cols.length+1}>No {page.toLowerCase()} data available.</td></tr>}</tbody></table></div>{shown.length} records  |  synced with Supabase</div></>}
{page==='S-Curve'&&<><PageHead title="S-Curve Analysis" subtitle="Planned and actual cumulative progress with deviation."/>{duplicateProgressWeeks.length>0&&<div className="panel" role="alert">Ditemukan nomor minggu ganda: {duplicateProgressWeeks.join(', ')}. Data lama tidak diubah; periksa Weekly Progress agar kurva tidak menjumlahkan entri ganda.</div>}<div className="kpis"><Kpi title="Total Persentase Rencana" value={formatPercent(planned)}/><Kpi title="Total Persentase Aktual" value={formatPercent(actual)}/><Kpi title="Selisih Aktual - Rencana" value={formatPercent(dev)}/></div><div className="panel" ref={report}><div className="line"><PanelTitle title="Progress curve"/>{['png','svg','pdf','excel'].map(x=><button className="secondary" key={x} onClick={()=>exportCurve(x)}>{x.toUpperCase()}</button>)}<button className="secondary" onClick={()=>window.print()}><Printer size={15}/> Print</button></div><Chart data={sc} refEl={chart} large/><SCurveBreakdownTable data={sc}/></div></>}
{page==='Dokumentasi Pekerjaan'&&p&&<WorkDocumentation project={p} entries={p.documentation||[]} onChange={items=>editProject('documentation',items)}/>} {page==='Berita Acara'&&p&&<BeritaAcara project={p} progress={actual} onChange={editProject}/>} {page==='Weekly Recap'&&p&&<WeeklyRecap project={p} progress={rows('progress')}/>} {page==='Monthly Recap'&&p&&<MonthlyRecap project={p} progress={rows('progress')}/>}{page==='Project Settings'&&p&&<ProjectForm p={p} change={editProject}/>}{page==='Approval'&&p&&<ApprovalForm p={p} change={editProject}/>}{page==='Company Branding'&&p&&<BrandForm p={p} change={editProject} notify={notify}/>}
{page==='Export Center'&&<><PageHead title="Export Center" subtitle="Generate project files from latest data."/><div className="cards">{[['Project Excel',()=>p&&runExport(projectWorkbook(p,db))],['Project JSON',()=>p&&jsonOut({project:p,wbs:rows('wbs'),progress:rows('progress'),activities:rows('activities'),issues:rows('issues'),materials:rows('materials')},`${safe(p.name)}.json`)],['Full backup JSON',()=>jsonOut(db,'Project_Backup.json')],['Project report PDF',exportReport]].map(([n,f]:any)=><div className="panel"><h3>{n}</h3><button className="primary" onClick={f}>Download</button></div>)}</div></>}
{page === 'Backup & Restore' && <><PageHead title="Backup & Restore" subtitle="Backup and restore project data from Supabase."/><div className="panel"><h3>Export full backup</h3><p>Export seluruh project dan data WBS, Activities, Weekly Progress, Issues, dan Materials.</p><button className="primary" onClick={()=>jsonOut(db,'Project_Dashboard_Backup.json')}>Export backup</button></div><div className="panel"><h3>Restore backup</h3><p>Restore melakukan validasi relasi sebelum upsert. Operasi lintas tabel belum transaksional; simpan backup terlebih dahulu.</p><input type="file" accept=".json" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=async()=>{try{const backup=JSON.parse(String(rd.result));validateBackup(backup);const confirmed=confirm(`Restore ${backup.projects.length} project(s) ke Supabase?\n\nData dengan ID yang sama akan diperbarui.`);if(!confirmed)return;await restoreBackupToSupabase(backup);const refreshed=await loadFromSupabase();const selected=applyUserPreferences(refreshed,session.user.id,pid);setDb(refreshed);setPid(selected);notify('Backup berhasil direstore ke Supabase')}catch(error){console.error('RESTORE ERROR:',error);notify(error instanceof Error ? error.message : 'Restore backup gagal')}};rd.readAsText(f);e.currentTarget.value=''}}/></div></>}{page==='Project Report'&&<><PageHead title="Project Report" action="Generate PDF" onAction={exportReport}/><div className="panel" ref={report}><h1>{p?.name}</h1><p>{p?.client}  |  {p?.number}</p><div className="kpis"><Kpi title="Total Persentase Rencana" value={formatPercent(planned)}/><Kpi title="Total Persentase Aktual" value={formatPercent(actual)}/><Kpi title="Selisih Aktual - Rencana" value={formatPercent(dev)}/></div><Chart data={sc} refEl={chart}/>{p&&<ApprovalSummary p={p}/>}</div></>}
</main><footer aria-live="polite" data-save-state={saveStatus}>{saveStatus === 'saving' ? 'Menyimpan perubahan ke Supabase…' : saveStatus === 'error' ? 'Gagal menyimpan perubahan. Periksa koneksi dan coba lagi.' : `Tersinkron ke Supabase${lastSavedAt ? ` · terakhir disimpan ${lastSavedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}`}</footer></div>{toast&&<div className="toast">{toast}</div>}{modal && <RowModal
  row={modal}
  cols={cols}
  wbsRows={rows('wbs')}
  isWeekly={page === 'Weekly Progress'}
  onSave={saveRow}
  close={() => setModal(null)}
/>}{imp && <div className="backdrop"><div className="modal"><h2>Import preview</h2><p>{imp.rows.length} records found.</p><p>Data akan langsung disimpan ke Supabase.</p><div className="line"><button className="secondary" onClick={()=>setImp(null)}>Cancel</button><button className="primary" onClick={()=>void importExcelRows(imp.key,imp.rows)}>Import to Supabase</button></div></div></div>}</div>}
function ProjectForm({p,change}:any){const keys=['name','number','client','location','manager','engineer','contractor','consultant','start','finish','value','status','description'];return <div className="panel form-grid">{keys.map((k:string)=><label key={k}>{label(k)}<input value={p?.[k]??''} type={k==='value'?'number':k==='start'||k==='finish'?'date':'text'} onChange={e=>change(k,k==='value'?Number(e.target.value):e.target.value)}/></label>)}</div>}
function ApprovalForm({p,change}:any){const approval=p?.approval||{};const updateApproval=(key:string,value:string)=>change('approval',{...approval,[key]:value});const sections=[{title:'Approval 1',fields:[['firstCompany','Company'],['firstName','Name'],['firstPosition','Position'],['firstSignature','Signature']]},{title:'Approval 2',fields:[['secondCompany','Company'],['secondName','Name'],['secondPosition','Position'],['secondSignature','Signature']]}];return <div className="stack">{sections.map(section=><div className="panel" key={section.title}><h2>{section.title}</h2><div className="form-grid">{section.fields.map(([key,title])=><label key={key}>{title}<input value={approval[key]??''} onChange={e=>updateApproval(key,e.target.value)}/></label>)}</div></div>)}</div>}
function BrandForm({p,change,notify}:any){const [logo,setLogo]=useState(p?.logo||'');useEffect(()=>setLogo(p?.logo||''),[p?.logo]);const saveBranding=()=>{change('logo',logo);notify('Company branding updated')};return <div className="panel"><h2>Company Branding</h2><div className="form-grid"><label>Logo URL<input value={logo} onChange={e=>setLogo(e.target.value)} placeholder="https://..."/></label></div>{logo&&<div style={{marginTop:20}}><p>Preview</p><img src={logo} alt="Company Logo" style={{maxWidth:240,maxHeight:120,objectFit:'contain'}}/></div>}<button type="button" className="primary" onClick={saveBranding} style={{marginTop:20}}>Save Branding</button></div>}
function ApprovalSummary({p}:any){const approval=p?.approval||{};return <div className="panel" style={{marginTop:24}}><h2>Approval</h2><div className="kpis"><div><strong>{approval.firstCompany||'-'}</strong><div>{approval.firstName||'-'}</div><div>{approval.firstPosition||'-'}</div></div><div><strong>{approval.secondCompany||'-'}</strong><div>{approval.secondName||'-'}</div><div>{approval.secondPosition||'-'}</div></div></div></div>}
function PageHead({title,subtitle,action,onAction}:any){return <div className="pagehead"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action&&(typeof action==='string'?<button className="primary" onClick={onAction}>{action}</button>:<div className="head-actions">{action}</div>)}</div>}function Kpi({title,value}:any){return <div className="panel kpi"><small>{title}</small><b>{value}</b></div>}function PanelTitle({title,action}:any){return <div className="panel-title"><h3>{title}</h3>{action}</div>}function Tag({v}:any){return <span className="tag">{v||'-'}</span>}function Chart(props:any){return <React.Suspense fallback={<div className="chart"><p className="empty">Loading chart…</p></div>}><LazyProgressChart {...props}/></React.Suspense>}function SCurveBreakdownTable({data}:any){if(!data.length)return <section className="sc-breakdown"><h3>Rekap Progres per Minggu</h3><p>No progress data available.</p></section>;const metrics=[['RENCANA','plannedWeekly'],['KUMULATIF RENCANA','plannedCum'],['REALISASI','actualWeekly'],['KUMULATIF REALISASI','actualCum'],['DEVIASI','deviation']];return <section className="sc-breakdown"><h3>Rekap Progres per Minggu</h3><div className="table-scroll"><table><thead><tr><th>Uraian</th>{data.map((r:any,i:number)=><th key={r.id||i}>Minggu {r.week}<small>{r.date||''}</small></th>)}</tr></thead><tbody>{metrics.map(([title,key])=><tr key={key}><th>{title}</th>{data.map((r:any,i:number)=><td key={r.id||i}>{formatPercent(r[key])}</td>)}</tr>)}</tbody></table></div></section>}function RowModal({
  row,
  cols,
  wbsRows = [],
  isWeekly = false,
  onSave,
  close
}: any) {
const [v, setV] = useState<any>(() => row ?? {})
  const [wbsPickerOpen, setWbsPickerOpen] = useState(false)
  const selectedWbsIds: string[] = Array.isArray(v.wbsIds)
    ? v.wbsIds
    : v.wbsId
      ? [v.wbsId]
      : []
  const selectedWbsRows = wbsRows.filter(
    (x: any) => x != null && selectedWbsIds.includes(x.id)
  )
  const weeklyActivities = selectedWbsRows
    .map((x: any) => ({
      id: x.id,
      code: String(x.code ?? ''),
      activity: String(x.activity ?? '').trim(),
    }))
    .filter((x: any) => x.activity)

  const update = (key: string, value: any) => {
    setV((old: any) => ({
      ...old,
      [key]: value
    }))
  }

  const selectWbs = (ids: string[]) => {
    const selected = wbsRows.filter((x: any) => x != null && ids.includes(x.id))
    const codes = selected.map((x: any) => String(x.code ?? ''))
    const activityNames = [...new Set(selected.map((x: any) => String(x.activity ?? '').trim()).filter(Boolean))]

    setV((old: any) => ({
      ...old,
      wbsIds: ids,
      wbsId: ids[0] ?? '',
      wbsCodes: codes,
      wbsCode: codes.join(', '),
      activityIds: [],
      activityId: '',
      activityNames,
      activity: activityNames.join(', ')
    }))
  }

  return (
    <div className="backdrop">
      <form
        className="modal"
        onSubmit={e => {
          e.preventDefault()
          if (isWeekly) {
            const activityNames = [...new Set(selectedWbsRows.map((x: any) => String(x.activity ?? '').trim()).filter(Boolean))]
            onSave({
              ...v,
              wbsIds: selectedWbsRows.map((x: any) => x.id),
              wbsId: selectedWbsRows[0]?.id ?? '',
              wbsCodes: selectedWbsRows.map((x: any) => String(x.code ?? '')),
              wbsCode: selectedWbsRows.map((x: any) => String(x.code ?? '')).join(', '),
              activityIds: [],
              activityId: '',
              activityNames,
              activity: activityNames.join(', '),
            })
          } else {
            onSave(v)
          }
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
                <div className="wbs-field" key={k}>
                  <span>WBS Code</span>
                  <button type="button" className="wbs-picker-trigger" onClick={() => setWbsPickerOpen(open => !open)}>
                    {selectedWbsIds.length ? `${selectedWbsIds.length} WBS dipilih` : 'Pilih satu atau beberapa WBS'}
                    <span aria-hidden="true">v</span>
                  </button>
                  {wbsPickerOpen && <div className="wbs-multi-select">
                    {wbsRows.filter((x: any) => x != null).map((x: any) => <label key={x.id}>
                      <input type="checkbox" checked={selectedWbsIds.includes(x.id)} onChange={e => {
                        const nextIds = e.target.checked
                          ? [...selectedWbsIds, x.id]
                          : selectedWbsIds.filter(id => id !== x.id)
                        selectWbs(nextIds)
                      }} />
                      <span><b>{x.code || '-'}</b><small>{x.activity || 'Tanpa keterangan'}</small></span>
                    </label>)}
                    {!wbsRows.length && <small className="wbs-empty">Belum ada data WBS.</small>}
                    <button type="button" className="wbs-done primary" onClick={() => setWbsPickerOpen(false)}>Selesai</button>
                  </div>}
                </div>
              )
            }

            if (isWeekly && k === 'activity') {
              return (
                <label key={k}>
                  Activity
                  <div className="activity-autofill">
                    {weeklyActivities.length
                      ? weeklyActivities.map((x: any) => <div key={x.id}><strong>{x.activity}</strong><small>{x.code ? `WBS ${x.code}` : ''}</small></div>)
                      : selectedWbsIds.length
                        ? 'Keterangan Activity pada WBS pilihan belum diisi.'
                        : 'Pilih WBS untuk menampilkan Activity secara otomatis.'}
                  </div>
                </label>
              )
            }

            if (!isWeekly && k === 'parentId') {
              const childPrefix = v.code ? `${String(v.code)}.` : ''
              const possibleParents = wbsRows.filter((item: any) => item && item.id !== row.id && !(childPrefix && String(item.code || '').startsWith(childPrefix)))
              return <label key={k}>Parent WBS
                <select value={v.parentId || ''} onChange={e => update('parentId', e.target.value)}>
                  <option value="">Tanpa parent (level utama)</option>
                  {possibleParents.map((item: any) => <option key={item.id} value={item.id}>{item.code || '-'}  |  {item.activity || 'Tanpa keterangan'}</option>)}
                </select>
              </label>
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
                        {x.code}  |  {x.activity}
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
