export type ModelComponent = { key: string; name: string; nodeIndex: number; meshIndex: number; named: boolean }

/** Reads the GLB JSON metadata chunk only (no geometry/texture payload download or expansion). */
export async function readGlbManifest(file: File): Promise<ModelComponent[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  let gltf: any
  if (ext === 'gltf') {
    if (file.size > 64 * 1024 * 1024) throw new Error('Metadata glTF terlalu besar untuk dibaca.')
    gltf = JSON.parse(await file.text())
    const external = [...(gltf.buffers ?? []), ...(gltf.images ?? [])].some((item: any) => item.uri && !String(item.uri).startsWith('data:'))
    if (external) throw new Error('glTF dengan file pendamping eksternal harus digabung menjadi GLB sebelum upload.')
  } else {
    const head = new DataView(await file.slice(0, 20).arrayBuffer())
    const jsonLength = head.getUint32(12, true)
    if (head.getUint32(0, true) !== 0x46546c67 || head.getUint32(4, true) !== 2 || head.getUint32(16, true) !== 0x4e4f534a) throw new Error('File GLB harus versi 2 yang valid.')
    if (jsonLength < 2 || jsonLength > 64 * 1024 * 1024 || 20 + jsonLength > file.size) throw new Error('Chunk JSON GLB tidak valid.')
    gltf = JSON.parse(new TextDecoder().decode(await file.slice(20, 20 + jsonLength).arrayBuffer()).replace(/\0+$/g, '').trim())
  }
  const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : []
  const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : []
  const parent = new Map<number, number>()
  nodes.forEach((node: any, i: number) => (node.children ?? []).forEach((child: number) => { if (!parent.has(child)) parent.set(child, i) }))
  const components: ModelComponent[] = []
  const names = new Set<string>()
  const visited = new Set<number>()
  const walk = (index: number, chain: number[] = []) => {
    if (!Number.isInteger(index) || index < 0 || index >= nodes.length || visited.has(index)) return
    visited.add(index)
    const node = nodes[index]
    const path = [...chain, index]
    if (Number.isInteger(node.mesh) && meshes[node.mesh]) {
      const parts = path.map(n => String(nodes[n]?.name ?? '').trim() || `Node ${n + 1}`)
      const name = parts.join(' / ')
      let key = `node:${name}`
      if (names.has(key)) key += ` [node ${index + 1}]`
      names.add(key)
      components.push({ key, name, nodeIndex: index, meshIndex: node.mesh, named: path.every(n => Boolean(String(nodes[n]?.name ?? '').trim())) })
    }
    ;(node.children ?? []).forEach((child: number) => walk(child, path))
  }
  const roots: number[] = Array.isArray(gltf.scenes?.[gltf.scene ?? 0]?.nodes)
    ? gltf.scenes[gltf.scene ?? 0].nodes
    : nodes.map((_node: any, i: number) => i).filter((i: number) => !parent.has(i))
  roots.forEach((index: number) => walk(index))
  if (!components.length) return [{ key: '$model', name: 'Seluruh model (mesh gabungan/tidak bernama)', nodeIndex: -1, meshIndex: -1, named: false }]
  return components
}
