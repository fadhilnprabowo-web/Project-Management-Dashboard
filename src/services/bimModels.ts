import { supabase } from './supabase'
import type { ModelComponent } from '../utils/glbManifest'

export const BIM_BUCKET = 'project-models'
export type BimModel = {
  id: string
  projectId: string
  name: string
  version: string
  filePath: string
  usdzPath: string | null
  fileSizeBytes: number
  components: ModelComponent[]
  createdAt: string
}
export type BimMapping = { componentKey: string; componentName: string; wbsId: string; activityId: string | null }

const mapModel = (row: any): BimModel => ({
  id: row.id, projectId: row.project_id, name: row.model_name, version: row.model_version,
  filePath: row.file_path, usdzPath: row.usdz_path ?? null, fileSizeBytes: Number(row.file_size_bytes ?? 0),
  components: Array.isArray(row.component_manifest?.components) ? row.component_manifest.components : [], createdAt: row.created_at,
})

export async function getBimModels(projectId: string): Promise<BimModel[]> {
  const { data, error } = await supabase.from('project_models').select('*').eq('project_id', projectId).order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapModel)
}

export async function getBimSignedUrl(path: string) {
  const { data, error } = await supabase.storage.from(BIM_BUCKET).createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export async function addBimModel(input: { projectId: string; name: string; version: string; file: File; usdz?: File | null; components: ModelComponent[] }) {
  if (input.file.size < 1 || input.file.size > 200 * 1024 * 1024) throw new Error('File model maksimal 200 MB.')
  if (input.usdz && input.usdz.size > 200 * 1024 * 1024) throw new Error('File USDZ maksimal 200 MB.')
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  if (!auth.user) throw new Error('Sesi pengguna tidak tersedia.')
  const id = crypto.randomUUID()
  const extension = input.file.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb'
  const filePath = `${input.projectId}/${id}/model.${extension}`
  const usdzPath = input.usdz ? `${input.projectId}/${id}/ar.usdz` : null
  const paths = [filePath, ...(usdzPath ? [usdzPath] : [])]
  const storage = supabase.storage.from(BIM_BUCKET)
  const { error: fileError } = await storage.upload(filePath, input.file, { upsert: false, contentType: input.file.type || (extension === 'glb' ? 'model/gltf-binary' : 'model/gltf+json') })
  if (fileError) throw fileError
  if (input.usdz && usdzPath) {
    const { error } = await storage.upload(usdzPath, input.usdz, { upsert: false, contentType: 'model/vnd.usdz+zip' })
    if (error) { await storage.remove([filePath]); throw error }
  }
  const { data, error } = await supabase.from('project_models').insert({
    id, project_id: input.projectId, model_name: input.name.trim(), model_version: input.version.trim(),
    file_format: extension, file_path: filePath, usdz_path: usdzPath, file_size_bytes: input.file.size,
    component_manifest: { components: input.components }, created_by: auth.user.id,
  }).select().single()
  if (error) { await storage.remove(paths); throw error }
  return mapModel(data)
}

export async function getBimMappings(modelId: string) {
  const { data, error } = await supabase.from('model_wbs_mappings').select('*').eq('model_id', modelId)
  if (error) throw error
  return (data ?? []).map((row: any): BimMapping => ({ componentKey: row.component_key, componentName: row.component_name, wbsId: row.wbs_id, activityId: row.activity_id ?? null }))
}

export async function saveBimMapping(input: { projectId: string; modelId: string; componentKey: string; componentName: string; wbsId: string; activityId?: string }) {
  const { error } = await supabase.from('model_wbs_mappings').upsert({
    project_id: input.projectId, model_id: input.modelId, component_key: input.componentKey,
    component_name: input.componentName, wbs_id: input.wbsId, activity_id: input.activityId || null,
  }, { onConflict: 'model_id,component_key' })
  if (error) throw error
}

export async function removeBimMapping(modelId: string, componentKey: string) {
  const { error } = await supabase.from('model_wbs_mappings').delete().eq('model_id', modelId).eq('component_key', componentKey)
  if (error) throw error
}
