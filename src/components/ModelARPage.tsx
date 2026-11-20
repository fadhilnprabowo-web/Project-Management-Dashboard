import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Box, ExternalLink, Maximize2, RotateCcw, Save, Upload } from 'lucide-react'
import type { Project, Row } from '../types'
import { addBimModel, BimMapping, BimModel, getBimMappings, getBimModels, getBimSignedUrl, removeBimMapping, saveBimMapping } from '../services/bimModels'
import { ModelComponent, readGlbManifest } from '../utils/glbManifest'
import { loadModelViewer } from '../utils/externalModules'
import { formatPercent } from '../utils/format'

function userError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/relation .* does not exist|could not find the table/i.test(message)) return 'Tabel BIM belum tersedia. Review dan jalankan migrasi supabase/migrations/20261119000000_bim_models_and_wbs_mappings.sql.'
  if (/bucket not found|no such bucket/i.test(message)) return 'Bucket project-models belum tersedia di Supabase yang digunakan website online. Jalankan migrasi BIM pada project Supabase yang sama dengan konfigurasi website; frontend tidak dapat membuat bucket privat.'
  if (/permission|policy|row-level|403|42501/i.test(message)) return 'Akses model ditolak. Periksa RLS metadata/Storage dan project aktif.'
  return message
}

export default function ModelARPage({ project, wbsRows, activityRows, progressRows, issueRows, materialRows, plannedTotal, actualTotal }: {
  project: Project; wbsRows: Row[]; activityRows: Row[]; progressRows: Row[]; issueRows: Row[]; materialRows: Row[]; plannedTotal: number; actualTotal: number
}) {
  const [models, setModels] = useState<BimModel[]>([])
  const [modelId, setModelId] = useState('')
  const [modelUrl, setModelUrl] = useState('')
  const [usdzUrl, setUsdzUrl] = useState('')
  const [mappings, setMappings] = useState<BimMapping[]>([])
  const [componentKey, setComponentKey] = useState('')
  const [wbsId, setWbsId] = useState('')
  const [activityId, setActivityId] = useState('')
  const [modelName, setModelName] = useState('')
  const [version, setVersion] = useState('v1')
  const [file, setFile] = useState<File | null>(null)
  const [usdz, setUsdz] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewerReady, setViewerReady] = useState(false)
  const [viewerError, setViewerError] = useState('')
  const [componentQuery, setComponentQuery] = useState('')
  const viewerRef = useRef<HTMLElement & { cameraOrbit?: string; cameraTarget?: string; jumpCameraToGoal?: () => void }>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const model = models.find(row => row.id === modelId) ?? null
  const components: ModelComponent[] = model?.components ?? []
  const selectedComponent = components.find(item => item.key === componentKey)
  const mapping = mappings.find(item => item.componentKey === componentKey)
  const selectedWbs = wbsRows.find(row => row.id === wbsId)
  const selectedActivity = activityRows.find(row => row.id === activityId)
  const componentMappings = useMemo(() => new Map(mappings.map(item => [item.componentKey, item])), [mappings])
  const visibleComponents = useMemo(() => components.filter(item => item.name.toLowerCase().includes(componentQuery.toLowerCase())).slice(0, 150), [components, componentQuery])
  const availableActivities = activityId || wbsId ? activityRows.filter(row => row.wbsId === wbsId) : []
  const latestProgress = wbsId ? progressRows.filter(row => (Array.isArray(row.wbsIds) ? row.wbsIds : [row.wbsId]).includes(wbsId)).slice().sort((a,b) => Number(b.week)-Number(a.week))[0] : null
  const openIssues = issueRows.filter(row => !['resolved','closed','complete','completed'].includes(String(row.status||'').toLowerCase())).length

  const refresh = async (select?: string) => {
    const next = await getBimModels(project.id)
    setModels(next)
    const nextId = select || (next.some(item => item.id === modelId) ? modelId : next[0]?.id || '')
    setModelId(nextId)
  }

  useEffect(() => {
    let live = true
    setLoading(true)
    setModels([])
    setModelId('')
    setError('')
    void getBimModels(project.id).then(rows => {
      if (!live) return
      setModels(rows)
      setModelId(rows[0]?.id || '')
    }).catch(reason => live && setError(userError(reason))).finally(() => live && setLoading(false))
    return () => { live = false }
  }, [project.id])

  useEffect(() => {
    if (!model) return
    let live = true
    setViewerReady(false)
    setViewerError('')
    setModelUrl('')
    setUsdzUrl('')
    void Promise.all([loadModelViewer(), getBimSignedUrl(model.filePath), model.usdzPath ? getBimSignedUrl(model.usdzPath) : Promise.resolve(''), getBimMappings(model.id)])
      .then(([, url, arUrl, saved]) => {
        if (!live) return
        setModelUrl(url); setUsdzUrl(arUrl); setMappings(saved)
        setComponentKey(model.components[0]?.key || '$model')
      }).catch(reason => live && setViewerError(userError(reason)))
    return () => { live = false }
  }, [model?.id])

  useEffect(() => {
    const entry = mappings.find(item => item.componentKey === componentKey)
    setWbsId(entry?.wbsId || '')
    setActivityId(entry?.activityId || '')
  }, [mappings, componentKey])

  useEffect(() => {
    if (!modelUrl) return
    const viewer = viewerRef.current
    if (!viewer) return
    const onLoad = () => { setViewerReady(true); setViewerError('') }
    const onError = () => { setViewerReady(false); setViewerError('Model tidak dapat dibaca browser. Pastikan file GLB valid dan signed URL masih berlaku.') }
    viewer.addEventListener('load', onLoad)
    viewer.addEventListener('error', onError)
    return () => { viewer.removeEventListener('load', onLoad); viewer.removeEventListener('error', onError) }
  }, [modelUrl])

  const uploadModel = async () => {
    if (!file) return setError('Pilih file GLB atau glTF terlebih dahulu.')
    if (!modelName.trim()) return setError('Isi nama model.')
    setBusy(true); setError('')
    try {
      const components = await readGlbManifest(file)
      const saved = await addBimModel({ projectId: project.id, name: modelName, version, file, usdz, components })
      await refresh(saved.id)
      setFile(null); setUsdz(null); setModelName(''); setVersion(`v${models.length + 2}`)
    } catch (reason) { setError(userError(reason)) } finally { setBusy(false) }
  }

  const saveMapping = async () => {
    if (!model || !selectedComponent) return setError('Pilih komponen model terlebih dahulu.')
    if (!wbsId) return setError('Pilih WBS yang sesuai.')
    setBusy(true); setError('')
    try {
      await saveBimMapping({ projectId: project.id, modelId: model.id, componentKey, componentName: selectedComponent.name, wbsId, activityId })
      const next = await getBimMappings(model.id); setMappings(next)
    } catch (reason) { setError(userError(reason)) } finally { setBusy(false) }
  }
  const unmap = async () => {
    if (!model || !mapping) return
    setBusy(true); setError('')
    try { await removeBimMapping(model.id, componentKey); setMappings(current => current.filter(item => item.componentKey !== componentKey)) }
    catch (reason) { setError(userError(reason)) } finally { setBusy(false) }
  }
  const resetCamera = () => { if (viewerRef.current) { viewerRef.current.cameraOrbit = '0deg 75deg auto'; viewerRef.current.cameraTarget = 'auto'; viewerRef.current.jumpCameraToGoal?.() } }
  const fullscreen = () => void viewportRef.current?.requestFullscreen?.().catch(() => setViewerError('Fullscreen tidak didukung browser ini.'))

  return <div className="model-ar-page">
    <div className="pagehead"><div><h1>3D Model &amp; AR</h1><p>{project.name} · kelola versi model dan tautkan bagian bernama ke WBS.</p></div></div>
    {error && <div className="model-ar-notice error"><AlertTriangle size={15}/><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
    <section className="panel model-ar-upload">
      <div className="model-ar-upload-head"><div><h2>Tambah versi BIM</h2><p>File proyek disimpan privat di Supabase Storage, maksimal 200 MB per file.</p></div></div>
      <div className="model-ar-upload-fields"><label>Nama model<input value={modelName} onChange={event => setModelName(event.target.value)} placeholder="MOT — Instalasi gas"/></label><label>Versi<input value={version} onChange={event => setVersion(event.target.value)}/></label><label>Model GLB/glTF<input type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={event => setFile(event.target.files?.[0] || null)}/><small>{file?.name || 'GLB disarankan; glTF harus mandiri/embedded.'}</small></label><label>USDZ untuk iOS (opsional)<input type="file" accept=".usdz,model/vnd.usdz+zip" onChange={event => setUsdz(event.target.files?.[0] || null)}/><small>{usdz?.name || 'Untuk Quick Look AR di perangkat Apple.'}</small></label></div>
      <div className="model-ar-form-actions"><button className="primary" onClick={() => void uploadModel()} disabled={busy || !file}><Upload size={14}/>{busy ? 'Menyimpan…' : 'Upload model version'}</button></div>
    </section>
    {loading ? <div className="panel">Memuat model proyek…</div> : !models.length ? <div className="panel model-ar-empty"><Box size={30}/><h2>Belum ada model pada proyek ini</h2><p>Unggah file GLB/glTF untuk membuka viewer dan pemetaan WBS.</p></div> : <>
      <div className="panel model-ar-version"><div><small>MODEL AKTIF</small><strong>{model?.name}</strong><span>{project.name} · {model?.fileSizeBytes ? `${(model.fileSizeBytes/1048576).toFixed(1)} MB` : ''}</span></div><label>Pilih versi<select value={modelId} onChange={event => setModelId(event.target.value)}>{models.map(item => <option key={item.id} value={item.id}>{item.name} · {item.version} · {new Date(item.createdAt).toLocaleDateString('id-ID')}</option>)}</select></label></div>
      <div className="model-ar-grid">
        <section className="panel"><div className="model-ar-section-head"><div><h2>Interactive BIM Viewer</h2><p>Orbit, zoom, pan, dan AR tersedia pada device/browser yang kompatibel.</p></div><div><button className="secondary" onClick={resetCamera}><RotateCcw size={14}/>Reset</button> <button className="secondary" onClick={fullscreen}><Maximize2 size={14}/></button></div></div>
          <div className="model-ar-viewport" ref={viewportRef}>{modelUrl && <model-viewer ref={viewerRef as any} src={modelUrl} ios-src={usdzUrl || undefined} alt={model?.name || 'Project BIM model'} camera-controls touch-action="pan-y" ar ar-modes="webxr scene-viewer quick-look" ar-scale="auto" shadow-intensity="1"><button slot="ar-button" className="primary model-ar-native"><ExternalLink size={14}/> View in AR</button></model-viewer>}{!viewerReady && !viewerError && <div className="model-ar-wait">Mengunduh dan menyiapkan model privat…</div>}{viewerError && <div className="model-ar-wait model-ar-error"><AlertTriangle size={22}/><p>{viewerError}</p><button className="secondary" onClick={() => model && void getBimSignedUrl(model.filePath).then(setModelUrl).catch(reason => setViewerError(userError(reason)))}>Coba lagi</button></div>}</div>
          <small className="model-ar-footnote">AR memerlukan HTTPS serta browser/perangkat kompatibel. iOS dapat memakai USDZ; viewer desktop tetap tersedia saat AR tidak didukung.</small>
        </section>
        <section className="panel"><div className="model-ar-section-head"><div><h2>Komponen bernama</h2><p>{components.length} node mesh dari scene aktif. Model-viewer tidak menyediakan ray-picking umum; pilih komponen melalui daftar ini.</p></div><span className="model-ar-count">{components.length}</span></div>
          {model && model.components.length===1 && <div className="model-ar-notice warn"><AlertTriangle size={14}/>Model tampak sebagai satu mesh/komponen gabungan; bagian internal tidak dapat dipetakan satu per satu.</div>}
          <input className="model-ar-search" value={componentQuery} onChange={event => setComponentQuery(event.target.value)} placeholder="Cari node komponen…"/>
          <div className="model-ar-components">{visibleComponents.map(component => {
            const mapped = componentMappings.get(component.key)
            const linked = wbsRows.find(row => row.id === mapped?.wbsId)
            return <button key={component.key} className={`model-ar-component ${componentKey === component.key ? 'selected' : ''}`} onClick={() => setComponentKey(component.key)}><Box size={14}/><span><strong>{component.name}</strong><small>{linked ? `${linked.code} · ${linked.activity}` : 'Belum dipetakan'}</small></span><i>{linked ? 'WBS' : '—'}</i></button>
          })}</div>
        </section>
      </div>
      <div className="model-ar-grid model-ar-lower">
        <section className="panel"><div className="model-ar-section-head"><div><h2>Mapping ke WBS / Activity</h2><p>{selectedComponent?.name || 'Pilih komponen terlebih dahulu.'}</p></div></div>
          {selectedComponent && <><div className="model-ar-map-fields"><label>WBS Code · Activity<select value={wbsId} onChange={event => { setWbsId(event.target.value); setActivityId('') }}><option value="">Pilih WBS…</option>{wbsRows.map(row => <option key={row.id} value={row.id}>{row.code} · {row.activity}</option>)}</select></label><label>Activity record (opsional)<select value={activityId} disabled={!availableActivities.length} onChange={event => setActivityId(event.target.value)}><option value="">{availableActivities.length ? 'Semua activity pada WBS' : 'Tidak ada activity terhubung'}</option>{availableActivities.map(row => <option key={row.id} value={row.id}>{row.activityCode ? `${row.activityCode} · ` : ''}{row.activity}</option>)}</select></label></div><div className="model-ar-form-actions"><button className="secondary" onClick={() => void unmap()} disabled={!mapping || busy}>Lepas mapping</button><button className="primary" onClick={() => void saveMapping()} disabled={busy || !wbsRows.length}><Save size={14}/>Simpan mapping</button></div></>}
        </section>
        <section className="panel"><div className="model-ar-section-head"><div><h2>Data proyek terkait</h2><p>Progress bersifat read-only. Pemilihan komponen tidak mengubah progress.</p></div></div>
          {selectedWbs ? <><div className="model-ar-wbs-name"><small>WBS {selectedWbs.code}</small><strong>{selectedWbs.activity}</strong></div><div className="model-ar-metrics"><div><small>Planned WBS</small><strong>{formatPercent(selectedWbs.planned)}</strong></div><div><small>Actual WBS</small><strong>{formatPercent(selectedWbs.actual)}</strong></div><div><small>Latest linked week</small><strong>{latestProgress ? `W${latestProgress.week}: ${formatPercent(latestProgress.actualWeekly)}` : '—'}</strong></div></div><p className="model-ar-context">{selectedActivity?.activity || (availableActivities.length ? `${availableActivities.length} Activity terkait` : 'Activity belum terhubung ke WBS ini.')}</p></> : <p className="model-ar-context">Mapping WBS menampilkan planned/actual dan weekly progress yang menautkan WBS tersebut.</p>}
          <div className="model-ar-project-facts"><div><span>S-Curve proyek · rencana / aktual</span><strong>{formatPercent(plannedTotal)} / {formatPercent(actualTotal)}</strong></div><div><span>Open Issues proyek</span><strong>{openIssues}</strong></div><div><span>Materials proyek</span><strong>{materialRows.length}</strong></div></div>
          <small className="model-ar-footnote">Issue/material saat ini tidak punya foreign key ke WBS atau komponen pada skema aplikasi, jadi hanya ditampilkan sebagai total proyek.</small>
        </section>
      </div>
    </>}
  </div>
}
