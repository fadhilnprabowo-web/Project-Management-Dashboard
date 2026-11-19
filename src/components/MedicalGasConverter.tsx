import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Camera, Check, Eye, EyeOff, FileUp, Maximize2, Minus, MousePointer2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import type { Project, Row } from '../types'
import GasPipeScene, { GasRoute, GasSettings, GasType, Point2, SceneApi } from './GasPipeScene'
import { loadPdfJs, loadThreeTools } from '../utils/externalModules'
import { extractPdfVectorRoutes } from '../utils/pdfVectorRoutes'
import { formatPercent } from '../utils/format'

const GAS_TYPES: GasType[] = ['Oxygen', 'Nitrous Oxide', 'Medical Air', 'Medical Vacuum']
const GAS_LABELS: Record<GasType, string> = {
  Oxygen: 'Oxygen (O₂)',
  'Nitrous Oxide': 'Nitrous Oxide (N₂O)',
  'Medical Air': 'Medical Air / Compressed Air',
  'Medical Vacuum': 'Medical Vacuum (VAC)',
}
const INITIAL_SETTINGS: GasSettings = {
  Oxygen: { color: '#b87333', diameter: 0.12, elevation: 0.5, visible: true },
  'Nitrous Oxide': { color: '#b87333', diameter: 0.12, elevation: 0.5, visible: true },
  'Medical Air': { color: '#b87333', diameter: 0.12, elevation: 0.5, visible: true },
  'Medical Vacuum': { color: '#b87333', diameter: 0.12, elevation: 0.5, visible: true },
}
const INITIAL_SIZE = { width: 1200, height: 800 }

type PlanSize = { width: number; height: number }
type DxfLine = { points: Point2[]; layer: string; color?: string }

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function createSettings(): GasSettings {
  return Object.fromEntries(GAS_TYPES.map(gas => [gas, { ...INITIAL_SETTINGS[gas] }])) as GasSettings
}

function parseDxfEntities(source: string) {
  const lines = source.replace(/\r/g, '').split('\n')
  const pairs: Array<[number, string]> = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim())
    if (Number.isFinite(code)) pairs.push([code, lines[i + 1].trim()])
  }
  let inEntities = false
  let foundEntities = false
  const entityPairs: Array<[number, string]> = []
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === 0 && pairs[i][1].toUpperCase() === 'SECTION' && pairs[i + 1]?.[0] === 2) {
      inEntities = pairs[i + 1][1].toUpperCase() === 'ENTITIES'
      foundEntities ||= inEntities
    }
    if (inEntities) entityPairs.push(pairs[i])
    if (pairs[i][0] === 0 && pairs[i][1].toUpperCase() === 'ENDSEC') inEntities = false
  }
  if (!foundEntities) throw new Error('DXF tidak memiliki section ENTITIES yang valid.')
  const entities: DxfLine[] = []
  let skippedBulge = 0
  let skipped3d = 0
  for (let i = 0; i < entityPairs.length;) {
    if (entityPairs[i][0] !== 0 || !['LINE', 'LWPOLYLINE'].includes(entityPairs[i][1].toUpperCase())) { i++; continue }
    const type = entityPairs[i][1].toUpperCase()
    let j = i + 1
    while (j < entityPairs.length && entityPairs[j][0] !== 0) j++
    const chunk = entityPairs.slice(i + 1, j)
    const layer = chunk.find(([code]) => code === 8)?.[1] || 'Layer tanpa nama'
    const hasElevation = chunk.some(([code, raw]) => [30,31,38].includes(code) && Number.isFinite(Number(raw)) && Number(raw) !== 0)
    if (hasElevation) { skipped3d++; i = j; continue }
    if (type === 'LWPOLYLINE' && chunk.some(([code, raw]) => code === 42 && Number.isFinite(Number(raw)) && Number(raw) !== 0)) {
      skippedBulge++; i = j; continue
    }
    const points: Point2[] = []
    if (type === 'LINE') {
      const get = (code: number) => Number(chunk.find(([current]) => current === code)?.[1] ?? NaN)
      const x1 = get(10), y1 = get(20), x2 = get(11), y2 = get(21)
      if ([x1, y1, x2, y2].every(Number.isFinite)) points.push({ x: x1, y: y1 }, { x: x2, y: y2 })
    } else {
      let current: { x?: number; y?: number } | null = null
      for (const [code, raw] of chunk) {
        if (code === 10) {
          if (current?.x != null && current.y != null) points.push({ x: current.x, y: current.y })
          current = { x: Number(raw) }
        } else if (code === 20 && current) current.y = Number(raw)
      }
      if (current?.x != null && current.y != null) points.push({ x: current.x, y: current.y })
      const closed = Number(chunk.find(([code]) => code === 70)?.[1] || 0) & 1
      if (closed && points.length > 2) points.push({ ...points[0] })
    }
    if (points.length >= 2) entities.push({ points, layer })
    i = j
  }
  // ARC, INSERT/block transforms, splines and polylines with bulges need review and are not fabricated.
  const unsupported = entityPairs.filter(([code, value]) => code === 0 && ['ARC', 'CIRCLE', 'SPLINE', 'INSERT', 'POLYLINE', 'ELLIPSE', '3DFACE'].includes(value.toUpperCase())).length + skippedBulge + skipped3d
  const allPoints = entities.flatMap(entity => entity.points)
  if (!entities.length || !allPoints.length) throw new Error('Tidak menemukan LINE/LWPOLYLINE yang dapat dibaca pada DXF ini.')
  const minX = Math.min(...allPoints.map(point => point.x))
  const maxX = Math.max(...allPoints.map(point => point.x))
  const minY = Math.min(...allPoints.map(point => point.y))
  const maxY = Math.max(...allPoints.map(point => point.y))
  const width = Math.max(0.0001, maxX - minX)
  const height = Math.max(0.0001, maxY - minY)
  return {
    unsupported,
    aspect: width / height,
    lines: entities.map(entity => ({
      layer: entity.layer,
      points: entity.points.map(point => ({ x: (point.x - minX) / width, y: 1 - (point.y - minY) / height })),
    })),
  }
}

function PlanCanvas({
  size,
  imageUrl,
  dxfBackground,
  routes,
  draft,
  settings,
  drawing,
  onPoint,
  onFinish,
}: {
  size: PlanSize
  imageUrl: string
  dxfBackground: DxfLine[]
  routes: GasRoute[]
  draft: Point2[]
  settings: GasSettings
  drawing: boolean
  onPoint: (point: Point2) => void
  onFinish: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!imageUrl) { imageRef.current = null; return }
    const image = new Image()
    image.onload = () => { imageRef.current = image; draw() }
    image.src = imageUrl
    return () => { image.onload = null }
  }, [imageUrl])
  const draw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#f7f8fa'
    ctx.fillRect(0, 0, size.width, size.height)
    if (imageRef.current) ctx.drawImage(imageRef.current, 0, 0, size.width, size.height)
    if (!imageRef.current && !dxfBackground.length) {
      ctx.strokeStyle = '#e1e6ed'
      ctx.lineWidth = 1
      for (let x = 0; x < size.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.height); ctx.stroke() }
      for (let y = 0; y < size.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.width, y); ctx.stroke() }
    }
    const paint = (points: Point2[], color: string, dashed = false, width = 3) => {
      if (points.length < 2) return
      ctx.beginPath()
      ctx.moveTo(points[0].x * size.width, points[0].y * size.height)
      points.slice(1).forEach(point => ctx.lineTo(point.x * size.width, point.y * size.height))
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.setLineDash(dashed ? [10, 7] : [])
      ctx.stroke()
      ctx.setLineDash([])
      points.forEach(point => { ctx.beginPath(); ctx.arc(point.x * size.width, point.y * size.height, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill() })
    }
    dxfBackground.forEach(line => paint(line.points, line.color || '#8a939f66', true, 2))
    routes.forEach(route => paint(route.points, route.gas ? settings[route.gas].color : route.sourceColor || '#e0932c', !route.verified, 4))
    paint(draft, '#00a9b5', false, 3)
  }
  useEffect(() => { draw() }, [size.width, size.height, routes, draft, settings, dxfBackground])
  const addPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return
    const rect = event.currentTarget.getBoundingClientRect()
    onPoint({
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    })
  }
  return <div className={`plan-canvas-wrap ${drawing ? 'is-drawing' : ''}`}>
    <canvas ref={canvasRef} style={{ aspectRatio: `${size.width} / ${size.height}` }} onPointerDown={addPoint} onDoubleClick={event => { event.preventDefault(); onFinish() }} aria-label="Denah instalasi gas medis"/>
    {drawing && <div className="plan-drawing-hint"><MousePointer2 size={14}/> Klik titik jalur; double click atau tekan Selesai untuk menyimpan garis.</div>}
  </div>
}

export default function MedicalGasConverter({
  project,
  wbsRows,
  activityRows,
  progressRows,
  plannedTotal,
  actualTotal,
}: {
  project: Project
  wbsRows: Row[]
  activityRows: Row[]
  progressRows: Row[]
  plannedTotal: number
  actualTotal: number
}) {
  const [planName, setPlanName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [size, setSize] = useState<PlanSize>(INITIAL_SIZE)
  const [planAspect, setPlanAspect] = useState(1.5)
  const [dxfBackground, setDxfBackground] = useState<DxfLine[]>([])
  const [routes, setRoutes] = useState<GasRoute[]>([])
  const [draft, setDraft] = useState<Point2[]>([])
  const [settings, setSettings] = useState<GasSettings>(createSettings)
  const [gasForTrace, setGasForTrace] = useState<GasType | ''>('')
  const [drawing, setDrawing] = useState(false)
  const [view, setView] = useState<'isometric' | 'top' | 'front' | 'side'>('isometric')
  const [sceneApi, setSceneApi] = useState<SceneApi | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfPages, setPdfPages] = useState(0)
  const fileUrlRef = useRef('')
  const selectedRoute = routes.find(route => route.id === selectedRouteId) ?? null
  const exportableRoutes = routes.filter(route => route.verified && route.gas && route.points.length >= 2)
  const assignedRoutes = routes.filter(route => route.gas).length
  const verifiedRoutes = routes.filter(route => route.verified && route.gas).length
  const activitiesForWbs = useMemo(() => selectedRoute?.wbsId ? activityRows.filter(item => item.wbsId === selectedRoute.wbsId) : [], [selectedRoute?.wbsId, activityRows])
  const linkedWbs = wbsRows.find(item => item.id === selectedRoute?.wbsId)
  const lastProgress = selectedRoute?.wbsId
    ? progressRows.filter(item => (Array.isArray(item.wbsIds) ? item.wbsIds : [item.wbsId]).includes(selectedRoute.wbsId!))
      .slice().sort((a, b) => Number(b.week || 0) - Number(a.week || 0))[0]
    : null

  useEffect(() => () => {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
  }, [])

  const setPlanImage = (blob: Blob, name: string, aspect?: number) => {
    if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current)
    const url = URL.createObjectURL(blob)
    fileUrlRef.current = url
    const image = new Image()
    image.onload = () => {
      const ratio = aspect || image.width / image.height || 1.5
      const displayWidth = 1400
      setSize({ width: displayWidth, height: Math.max(260, Math.round(displayWidth / ratio)) })
      setPlanAspect(ratio)
    }
    image.src = url
    setImageUrl(url)
    setPlanName(name)
    setDxfBackground([])
    setPdfDoc(null)
    setPdfPages(0)
    setError('')
    setRoutes([])
    setDraft([])
  }

  const renderPdfPage = async (doc: any, pageNumber: number) => {
    try {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvasContext: canvas.getContext('2d'), canvas, viewport }).promise
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PDF tidak dapat dirender.')), 'image/png'))
      const operatorList = await page.getOperatorList()
      const pdfjs = await loadPdfJs()
      const baseViewport = page.getViewport({ scale: 1 })
      const detected = extractPdfVectorRoutes(pdfjs, operatorList, baseViewport.width, baseViewport.height)
      setPlanImage(blob, `${planName.replace(/ · halaman \d+$/i, '').replace(/\.pdf$/i, '')} · halaman ${pageNumber}`, viewport.width / viewport.height)
      const pdfRoutes: GasRoute[] = detected.routes.map((route, index) => ({
        id: crypto.randomUUID(),
        label: `PDF ${route.color === '#ff0000' ? 'merah' : 'hijau'} · ${index + 1}`,
        layer: 'Kandidat vektor PDF',
        sourceColor: route.color,
        gas: '',
        points: route.points,
        verified: false,
      }))
      setRoutes(pdfRoutes)
      setPdfDoc(doc)
      setPdfPages(doc.numPages)
      setPdfPage(pageNumber)
      setNotice(pdfRoutes.length
        ? `${pdfRoutes.length} jalur vektor terdeteksi otomatis dari halaman ${pageNumber} (${detected.redCount} merah, ${detected.greenCount} hijau). Pilih jenis gas dari legend lalu verifikasi; PDF ini tidak memiliki legend warna yang terbaca.`
        : 'Halaman PDF terbuka, tetapi tidak ditemukan garis vektor merah/hijau yang cocok. Raster/scanned PDF atau warna lain perlu proses deteksi khusus.')
    } catch (reason) {
      setError(`Halaman PDF gagal dirender: ${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }

  const handleFile = async (file?: File) => {
    if (!file) return
    setError('')
    setNotice('')
    if (file.size > 100 * 1024 * 1024) return setError('Ukuran denah maksimal 100 MB.')
    const extension = file.name.split('.').pop()?.toLowerCase()
    try {
      if (['png', 'jpg', 'jpeg'].includes(extension || '')) {
        setPlanImage(file, file.name)
        return
      }
      if (extension === 'pdf') {
        setPlanName(file.name)
        setNotice('Membuka halaman pertama PDF…')
        const pdfjs = await loadPdfJs()
        const documentTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
        const doc = await documentTask.promise
        setNotice('')
        await renderPdfPage(doc, 1)
        return
      }
      if (extension === 'dxf') {
        const dxf = parseDxfEntities(await file.text())
        setPlanName(file.name)
        setPlanAspect(dxf.aspect)
        const canvasWidth = 1400
        setSize({ width: canvasWidth, height: Math.max(260, Math.round(canvasWidth / dxf.aspect)) })
        setImageUrl('')
        setDxfBackground(dxf.lines)
        setPdfDoc(null)
        setPdfPages(0)
        const imported: GasRoute[] = dxf.lines.map((line, index) => ({
          id: crypto.randomUUID(), label: `DXF ${index + 1}`, layer: line.layer, gas: '', points: line.points, verified: false,
        }))
        setRoutes(imported)
        setDraft([])
        setNotice(`${imported.length} entitas LINE/LWPOLYLINE terbaca. Jenis gas belum diasumsikan; klasifikasikan tiap jalur dan verifikasi sebelum dijadikan geometri 3D.`)
        if (dxf.unsupported) setError(`${dxf.unsupported} objek (termasuk ARC/SPLINE, INSERT/block, polyline melengkung, atau koordinat Z) belum dikonversi. Periksa dan trace ulang secara manual jika merupakan jalur pipa.`)
        return
      }
      setError('Format tidak didukung. Unggah PNG/JPG, PDF, atau DXF dari AutoCAD. File DWG perlu diekspor dahulu ke DXF/PDF.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'File denah tidak dapat dibaca.')
      setNotice('')
    }
  }

  const changePdfPage = (page: number) => {
    if (pdfDoc && page >= 1 && page <= pdfPages) void renderPdfPage(pdfDoc, page)
  }

  const addDraftPoint = (point: Point2) => setDraft(current => {
    const last = current.at(-1)
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.002) return current
    return [...current, point]
  })

  const finishRoute = () => {
    if (draft.length < 2) return setError('Garis rute minimal membutuhkan dua titik.')
    if (!gasForTrace) return setError('Pilih jenis gas dari label atau legend sebelum menyimpan jalur.')
    const route: GasRoute = { id: crypto.randomUUID(), label: `Jalur manual ${routes.length + 1}`, gas: gasForTrace, points: draft, verified: false }
    setRoutes(current => [...current, route])
    setSelectedRouteId(route.id)
    setDraft([])
    setDrawing(false)
    setError('')
    setNotice('Jalur ditambahkan sebagai perlu verifikasi. Tandai diverifikasi setelah mencocokkan dengan denah/legend.')
  }

  const updateRoute = (id: string, updates: Partial<GasRoute>) => setRoutes(current => current.map(route => route.id === id ? { ...route, ...updates } : route))
  const updateGasSetting = (gas: GasType, updates: Partial<GasSettings[GasType]>) => setSettings(current => ({ ...current, [gas]: { ...current[gas], ...updates } }))

  const saveScenePng = () => {
    if (!sceneApi) return setError('Viewer 3D belum siap.')
    sceneApi.renderer.domElement.toBlob((blob: Blob | null) => blob && downloadBlob(blob, `${project.name.replace(/[^a-z0-9_-]+/gi, '_')}_medical_gas_3d.png`), 'image/png')
  }
  const zoomScene = (factor: number) => {
    if (!sceneApi) return
    sceneApi.camera.position.sub(sceneApi.controls.target).multiplyScalar(factor).add(sceneApi.controls.target)
    sceneApi.controls.update()
  }
  const exportObj = async () => {
    if (!sceneApi || !exportableRoutes.length) return setError('Tidak ada jalur terverifikasi untuk diekspor.')
    try {
      const { OBJExporter } = await loadThreeTools()
      const text = new OBJExporter().parse(sceneApi.scene)
      downloadBlob(new Blob([text], { type: 'text/plain' }), `${project.name.replace(/[^a-z0-9_-]+/gi, '_')}_medical_gas_3d.obj`)
    } catch (reason) { setError(`Export OBJ gagal: ${reason instanceof Error ? reason.message : String(reason)}`) }
  }
  const exportGlb = async () => {
    if (!sceneApi || !exportableRoutes.length) return setError('Tidak ada jalur terverifikasi untuk diekspor.')
    try {
      const { GLTFExporter } = await loadThreeTools()
      new GLTFExporter().parse(sceneApi.scene, (result: ArrayBuffer | object) => {
        const blob = new Blob([result as BlobPart], { type: 'model/gltf-binary' })
        downloadBlob(blob, `${project.name.replace(/[^a-z0-9_-]+/gi, '_')}_medical_gas_3d.glb`)
      }, (reason: ErrorEvent) => setError(`Export GLB gagal: ${reason.message}`), { binary: true, onlyVisible: true })
    } catch (reason) { setError(`Export GLB gagal: ${reason instanceof Error ? reason.message : String(reason)}`) }
  }

  return <div className="medical-gas-converter">
    <div className="pagehead medical-converter-heading">
      <div><h1>2D to 3D Converter</h1><p>{project.name} · visualisasi jaringan instalasi gas medis berdasarkan denah yang ditinjau.</p></div>
      <label className="primary medical-plan-upload"><FileUp size={15}/> Unggah denah<input type="file" accept=".pdf,.png,.jpg,.jpeg,.dxf,application/pdf,image/png,image/jpeg" onChange={event => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = '' }}/></label>
    </div>

    <div className="medical-converter-guidance"><AlertTriangle size={16}/><span>PDF vektor dapat dipindai otomatis menjadi kandidat jalur 3D. Konfirmasi jenis gas dan verifikasi posisi sebelum ekspor; warna, diameter, skala, dan elevasi tidak diasumsikan sebagai data aktual.</span></div>
    {error && <div className="medical-converter-alert error" role="alert"><AlertTriangle size={15}/><span>{error}</span><button onClick={() => setError('')} aria-label="Tutup">×</button></div>}
    {notice && <div className="medical-converter-alert info" role="status"><Check size={15}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Tutup">×</button></div>}

    {planName && <div className="medical-plan-meta"><span><strong>Denah aktif:</strong> {planName}</span>{pdfDoc && <label>Halaman PDF<select value={pdfPage} onChange={event => changePdfPage(Number(event.target.value))}>{Array.from({ length: pdfPages }, (_, index) => <option key={index + 1} value={index + 1}>Halaman {index + 1}</option>)}</select></label>}</div>}

    <div className="medical-converter-columns">
      <section className="panel medical-plan-panel">
        <div className="medical-panel-head"><div><h2>Denah 2D &amp; Trace Jalur</h2><p>{imageUrl || dxfBackground.length ? 'Garis DXF dan trace manual ditampilkan di atas denah.' : 'Unggah PNG/JPG, PDF, atau DXF untuk memulai.'}</p></div><div className="medical-plan-actions">
          <button className={`secondary ${drawing ? 'is-active' : ''}`} onClick={() => { if (!gasForTrace) return setError('Pilih jenis gas sebelum mulai menggambar.'); setError(''); setDrawing(value => !value) }} disabled={!imageUrl && !dxfBackground.length}><MousePointer2 size={14}/>{drawing ? 'Berhenti trace' : 'Trace jalur'}</button>
          {drawing && <button className="primary" onClick={finishRoute}><Check size={14}/>Selesai</button>}
        </div></div>
        <div className="medical-trace-toolbar">
          <label>Jenis gas untuk trace<select value={gasForTrace} onChange={event => setGasForTrace(event.target.value as GasType | '')}><option value="">Pilih dari legend…</option>{GAS_TYPES.map(gas => <option key={gas} value={gas}>{GAS_LABELS[gas]}</option>)}</select></label>
          <small>PDF vektor dan DXF dipindai otomatis; PNG/JPG atau PDF raster masih memerlukan trace manual. Semua kandidat perlu verifikasi.</small>
        </div>
        {notice.includes('Membuka halaman') ? <div className="medical-plan-loading">{notice}</div> : <PlanCanvas size={size} imageUrl={imageUrl} dxfBackground={dxfBackground} routes={routes} draft={draft} settings={settings} drawing={drawing} onPoint={addDraftPoint} onFinish={finishRoute}/>}
        <div className="medical-plan-footer"><span>Posisi jalur ditransformasikan proporsional dari denah; tidak mengklaim dimensi aktual.</span></div>
      </section>

      <section className="panel medical-scene-panel">
        <div className="medical-panel-head"><div><h2>Isolated 3D Piping</h2><p>Jaringan pipa saja · tanpa dinding, ruang, atau peralatan.</p></div><div className="medical-export-buttons"><button className="secondary" onClick={saveScenePng} title="Export PNG"><Camera size={14}/>PNG</button><button className="secondary" onClick={() => void exportObj()}>OBJ</button><button className="primary" onClick={() => void exportGlb()}>GLB</button></div></div>
        <div className="medical-view-presets">{(['isometric','top','front','side'] as const).map(preset => <button key={preset} className={view === preset ? 'selected' : ''} onClick={() => setView(preset)}>{preset === 'isometric' ? 'Isometric' : preset === 'top' ? 'Top' : preset === 'front' ? 'Front' : 'Side'}</button>)}<button onClick={() => zoomScene(0.82)} title="Zoom in"><Plus size={13}/></button><button onClick={() => zoomScene(1.22)} title="Zoom out"><Minus size={13}/></button><button className="view-help" title="Drag untuk orbit; scroll untuk zoom; right-click/shift+drag untuk pan."><Maximize2 size={13}/></button></div>
        <GasPipeScene routes={routes} settings={settings} view={view} planAspect={planAspect} onApi={setSceneApi}/>
        <div className="medical-gas-legend">{GAS_TYPES.map(gas => <div className="medical-gas-setting" key={gas}>
          <label className="gas-visible"><input type="checkbox" checked={settings[gas].visible} onChange={event => updateGasSetting(gas, { visible: event.target.checked })}/><span>{settings[gas].visible ? <Eye size={13}/> : <EyeOff size={13}/>}</span><strong>{GAS_LABELS[gas]}</strong></label>
          <label className="gas-color-label">Legend color<input type="color" value={settings[gas].color} onChange={event => updateGasSetting(gas, { color: event.target.value })}/></label>
          <label>Diameter visual<input type="number" min="0.02" max="1.5" step="0.01" value={settings[gas].diameter} onChange={event => updateGasSetting(gas, { diameter: Math.max(0.02, Number(event.target.value) || 0.02) })}/></label>
          <label>Elevasi visual<input type="number" min="-20" max="20" step="0.1" value={settings[gas].elevation} onChange={event => updateGasSetting(gas, { elevation: Number(event.target.value) || 0 })}/></label>
        </div>)}</div>
        <small className="medical-units-note">Diameter dan elevasi adalah unit visual tanpa kalibrasi. Cocokkan dengan gambar/spesifikasi proyek sebelum menyebutnya ukuran aktual. Warna awal netral tembaga dan belum berarti kode warna gas tertentu.</small>
      </section>
    </div>

    <div className="medical-converter-columns lower">
      <section className="panel medical-route-panel">
        <div className="medical-panel-head"><div><h2>Jalur teridentifikasi</h2><p>{verifiedRoutes} diverifikasi · {routes.length - verifiedRoutes} perlu tinjauan</p></div><span className="medical-route-count">{routes.length}</span></div>
        {!routes.length ? <div className="medical-routes-empty">Belum ada kandidat jalur. Unggah PDF vektor/DXF untuk deteksi otomatis, atau trace PNG/JPG/PDF raster.</div> : <div className="medical-route-list">{routes.map(route => <div key={route.id} className={`medical-route-row ${selectedRouteId === route.id ? 'active' : ''}`} onClick={() => setSelectedRouteId(route.id)}>
          <span className="route-line-swatch" style={{ backgroundColor: route.gas ? settings[route.gas].color : route.sourceColor || '#e0932c' }}/><span className="route-route-name"><strong>{route.label}</strong><small>{route.layer || 'Trace manual'} · {route.points.length} titik</small></span>
          <select aria-label={`Jenis gas ${route.label}`} value={route.gas} onClick={event => event.stopPropagation()} onChange={event => updateRoute(route.id, { gas: event.target.value as GasType | '' })}><option value="">Pilih gas…</option>{GAS_TYPES.map(gas => <option value={gas} key={gas}>{GAS_LABELS[gas]}</option>)}</select>
          <label className="route-verified" onClick={event => event.stopPropagation()} title="Verifikasi posisi dan jenis dari gambar"><input type="checkbox" checked={route.verified} disabled={!route.gas} onChange={event => updateRoute(route.id, { verified: event.target.checked })}/><span>{route.verified ? 'Terverifikasi' : 'Perlu cek'}</span></label>
          <button className="icon" onClick={event => { event.stopPropagation(); setRoutes(current => current.filter(item => item.id !== route.id)); if (selectedRouteId === route.id) setSelectedRouteId('') }} aria-label="Hapus kandidat jalur"><Trash2 size={14}/></button>
        </div>)}</div>}
      </section>

      <section className="panel medical-wbs-panel">
        <div className="medical-panel-head"><div><h2>WBS &amp; Progress Link</h2><p>Pemetaan opsional dan read-only ke data proyek.</p></div></div>
        {selectedRoute ? <>
          <div className="medical-route-selected"><span>Jalur terpilih</span><strong>{selectedRoute.label}</strong>{selectedRoute.layer && <small>Layer: {selectedRoute.layer}</small>}</div>
          <label className="medical-wbs-select">WBS Code · Activity<select value={selectedRoute.wbsId || ''} onChange={event => updateRoute(selectedRoute.id, { wbsId: event.target.value || undefined })}><option value="">Tidak dipetakan</option>{wbsRows.map(row => <option key={row.id} value={row.id}>{row.code} · {row.activity}</option>)}</select></label>
          {activitiesForWbs.length > 0 && <small className="medical-activity-hint">Activity tersedia: {activitiesForWbs.map(row => row.activity).join(', ')}</small>}
          {linkedWbs && <div className="medical-wbs-metrics"><div><small>Rencana WBS</small><strong>{formatPercent(linkedWbs.planned)}</strong></div><div><small>Aktual WBS</small><strong>{formatPercent(linkedWbs.actual)}</strong></div><div><small>Update mingguan terakhir</small><strong>{lastProgress ? `Minggu ${lastProgress.week} · ${formatPercent(lastProgress.actualWeekly)}` : 'Belum ada'}</strong></div></div>}
        </> : <p className="medical-wbs-empty">Pilih jalur untuk memetakannya ke WBS dan membaca progres terkait.</p>}
        <div className="medical-project-curve"><span>Project S-Curve · planned / actual</span><strong>{formatPercent(plannedTotal)} / {formatPercent(actualTotal)}</strong></div>
      </section>
    </div>

    <div className="medical-converter-footer"><strong>{verifiedRoutes} jalur siap diekspor</strong><span>{assignedRoutes} dari {routes.length} jalur sudah diberi jenis gas. Kandidat tanpa verifikasi tetap tampak redup di preview, tetapi tidak disertakan pada export.</span></div>
  </div>
}
