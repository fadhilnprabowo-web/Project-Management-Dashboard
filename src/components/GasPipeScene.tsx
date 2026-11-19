import { useEffect, useRef, useState } from 'react'
import { loadThreeTools } from '../utils/externalModules'

export type GasType = 'Oxygen' | 'Nitrous Oxide' | 'Medical Air' | 'Medical Vacuum'
export type Point2 = { x: number; y: number }
export type GasRoute = {
  id: string
  label: string
  layer?: string
  gas: GasType | ''
  points: Point2[]
  verified: boolean
  wbsId?: string
}
export type GasSettings = Record<GasType, { color: string; diameter: number; elevation: number; visible: boolean }>

export type SceneApi = {
  scene: any
  renderer: any
  camera: any
  controls: any
}

export default function GasPipeScene({
  routes,
  settings,
  view,
  planAspect,
  onApi,
}: {
  routes: GasRoute[]
  settings: GasSettings
  view: 'isometric' | 'top' | 'front' | 'side'
  planAspect: number
  onApi: (api: SceneApi | null) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<SceneApi | null>(null)
  const geometryRef = useRef<any>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('Memuat engine 3D…')

  useEffect(() => {
    let alive = true
    let frame = 0
    let resizeObserver: ResizeObserver | null = null
    let controls: any
    let renderer: any
    let scene: any
    let camera: any
    void loadThreeTools().then(({ THREE, OrbitControls }) => {
      if (!alive || !hostRef.current) return
      scene = new THREE.Scene()
      scene.background = new THREE.Color('#101722')
      camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000)
      camera.position.set(14, 12, 14)
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.15
      renderer.domElement.className = 'gas-three-canvas'
      hostRef.current.replaceChildren(renderer.domElement)
      scene.add(new THREE.HemisphereLight(0xe7eef8, 0x263241, 2.0))
      const keyLight = new THREE.DirectionalLight(0xffffff, 3.2)
      keyLight.position.set(7, 12, 8)
      scene.add(keyLight)
      const rimLight = new THREE.DirectionalLight(0x89a8d4, 1.4)
      rimLight.position.set(-8, 5, -10)
      scene.add(rimLight)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.075
      controls.enablePan = true
      controls.minDistance = 3
      controls.maxDistance = 100
      controls.target.set(0, 0, 0)
      const resize = () => {
        if (!hostRef.current || !renderer) return
        const width = Math.max(1, hostRef.current.clientWidth)
        const height = Math.max(1, hostRef.current.clientHeight)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
      }
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(hostRef.current)
      resize()
      const render = () => {
        if (!alive) return
        frame = requestAnimationFrame(render)
        controls.update()
        renderer.render(scene, camera)
      }
      render()
      apiRef.current = { scene, renderer, camera, controls }
      onApi(apiRef.current)
      setState('ready')
      setMessage('')
    }).catch(error => {
      if (!alive) return
      console.error('THREE MODULE LOAD ERROR:', error)
      setState('error')
      setMessage('Library Three.js tidak dapat dimuat. Periksa koneksi internet lalu muat ulang halaman.')
    })
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      controls?.dispose()
      if (geometryRef.current) geometryRef.current.traverse((node: any) => {
        node.geometry?.dispose?.()
        if (Array.isArray(node.material)) node.material.forEach((material: any) => material.dispose?.())
        else node.material?.dispose?.()
      })
      renderer?.dispose()
      renderer?.domElement?.remove()
      apiRef.current = null
      onApi(null)
    }
  }, [])

  useEffect(() => {
    const api = apiRef.current
    if (!api || state !== 'ready') return
    const { scene, camera, controls } = api
    const center = controls.target
    if (view === 'top') camera.position.set(center.x, center.y + 16, center.z + 0.001)
    else if (view === 'front') camera.position.set(center.x, center.y + 0.01, center.z + 18)
    else if (view === 'side') camera.position.set(center.x + 18, center.y + 0.01, center.z)
    else camera.position.set(center.x + 14, center.y + 12, center.z + 14)
    if (view === 'top') camera.up.set(0, 0, -1)
    else camera.up.set(0, 1, 0)
    camera.lookAt(center)
    controls.update()
  }, [view, state])

  useEffect(() => {
    const api = apiRef.current
    if (!api || state !== 'ready') return
    // Use the namespace loaded by the runtime promise; this avoids bundling a second renderer.
    let active = true
    void loadThreeTools().then(({ THREE: Three }) => {
      if (!active || !apiRef.current) return
      const scene = api.scene
      if (geometryRef.current) {
        scene.remove(geometryRef.current)
        geometryRef.current.traverse((node: any) => {
          node.geometry?.dispose?.()
          if (Array.isArray(node.material)) node.material.forEach((material: any) => material.dispose?.())
          else node.material?.dispose?.()
        })
      }
      const group = new Three.Group()
      const visibleRoutes = routes.filter(route => route.gas && route.verified && settings[route.gas].visible && route.points.length >= 2)
      const extent = 10
      for (const route of visibleRoutes) {
        const gas = route.gas as GasType
        const config = settings[gas]
        const radius = Math.max(0.025, Number(config.diameter) / 2)
        const y = Number(config.elevation)
        const material = new Three.MeshStandardMaterial({
          color: config.color,
          metalness: 0.78,
          roughness: 0.28,
          envMapIntensity: 1.05,
        })
        const points = route.points.map(point => new Three.Vector3((point.x - 0.5) * extent, y, (point.y - 0.5) * extent / Math.max(0.2, planAspect)))
        for (let index = 0; index < points.length - 1; index++) {
          const start = points[index]
          const end = points[index + 1]
          const direction = new Three.Vector3().subVectors(end, start)
          const length = direction.length()
          if (length < 0.001) continue
          const geometry = new Three.CylinderGeometry(radius, radius, length, 16, 1, false)
          const mesh = new Three.Mesh(geometry, material)
          mesh.position.copy(start).add(end).multiplyScalar(0.5)
          mesh.quaternion.setFromUnitVectors(new Three.Vector3(0, 1, 0), direction.normalize())
          mesh.castShadow = true
          mesh.receiveShadow = true
          group.add(mesh)
        }
        // Visible joint sleeves at traced bends/intersections; actual fitting type needs site review.
        const jointGeometry = new Three.SphereGeometry(radius * 1.12, 14, 10)
        for (let index = 1; index < points.length - 1; index++) {
          const joint = new Three.Mesh(jointGeometry, material)
          joint.position.copy(points[index])
          group.add(joint)
        }
        if (points.length > 2) {
          const endpoint = new Three.Mesh(jointGeometry, material)
          endpoint.position.copy(points[points.length - 1])
          group.add(endpoint)
        }
      }
      if (!visibleRoutes.length) {
        setMessage('Belum ada jalur yang sudah diverifikasi dan diberi jenis gas. Jalur yang belum pasti tidak dibuat menjadi pipa 3D.')
      } else {
        setMessage('')
      }
      geometryRef.current = group
      scene.add(group)
      api.renderer.render(scene, api.camera)
    })
    return () => { active = false }
  }, [routes, settings, planAspect, state])

  return <div className="gas-three-stage" ref={hostRef}>
    {state === 'loading' && <div className="gas-three-message">{message}</div>}
    {state === 'error' && <div className="gas-three-message gas-three-error">{message}</div>}
    {state === 'ready' && message && <div className="gas-three-message gas-three-empty">{message}</div>}
  </div>
}
