import { supabase } from './supabase'
import type { Project, Row, Store } from '../types'

const weeklyLinksMarker = '[[weekly-links]] '
let weeklyLinkRpcAvailable: boolean | null = null

async function requireCurrentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Sesi pengguna tidak tersedia.')
  return data.user.id
}

function readWeeklyLinks(notes: unknown) {
  const source = String(notes ?? '')
  const lines = source.split(/\r?\n/)
  const markerIndex = lines.findIndex(line => line.startsWith(weeklyLinksMarker))
  if (markerIndex < 0) {
    return { notes: source, links: null as any }
  }

  try {
    const links = JSON.parse(lines[markerIndex].slice(weeklyLinksMarker.length))
    lines.splice(markerIndex, 1)
    return { notes: lines.join('\n').trim(), links }
  } catch {
    return { notes: source, links: null as any }
  }
}

function writeWeeklyLinks(notes: unknown, row: Row) {
  const cleaned = readWeeklyLinks(notes).notes
  const links = {
    wbsIds: Array.isArray(row.wbsIds) ? row.wbsIds : [],
    wbsCodes: Array.isArray(row.wbsCodes) ? row.wbsCodes : [],
    activityIds: Array.isArray(row.activityIds) ? row.activityIds : [],
    activityNames: Array.isArray(row.activityNames) ? row.activityNames : [],
  }
  return `${cleaned ? `${cleaned}\n` : ''}${weeklyLinksMarker}${JSON.stringify(links)}`
}

/**
 * =========================================================
 * PROJECTS
 * =========================================================
 */

export async function getProjects(): Promise<Project[]> {
  const userId = await requireCurrentUserId()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.project_name ?? '',
    number: p.project_code ?? '',
    client: p.client ?? '',
    location: p.location ?? '',
    manager: p.project_manager ?? '',
    engineer: p.engineer ?? '',
    contractor: p.contractor ?? '',
    consultant: p.consultant ?? '',
    start: p.start_date ?? '',
    finish: p.end_date ?? '',
    value: Number(p.contract_value ?? 0),
    status: p.status ?? 'Planning',
    description: p.description ?? '',
    archived: p.archived ?? false,
    logo: p.logo ?? '',
    approval: p.approval ?? {
      firstCompany: '',
      firstName: '',
      firstPosition: '',
      firstSignature: '',
      secondCompany: '',
      secondName: '',
      secondPosition: '',
      secondSignature: '',
    },
    beritaAcara: p.berita_acara ?? {},
    documentation: Array.isArray(p.documentation)
      ? p.documentation
      : [],
  }))
}

export async function insertProject(project: Project) {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      project_code: project.number || null,
      project_name: project.name,
      client: project.client || null,
      location: project.location || null,
      project_manager: project.manager || null,
      engineer: project.engineer || null,
      contractor: project.contractor || null,
      consultant: project.consultant || null,
      start_date: project.start || null,
      end_date: project.finish || null,
      contract_value: Number(project.value || 0),
      status: project.status || 'Planning',
      description: project.description || null,
      logo: project.logo || null,
      archived: project.archived ?? false,
      approval: project.approval ?? {},
      berita_acara: project.beritaAcara ?? {},
      documentation: project.documentation ?? [],
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function updateProject(project: Project) {
  const userId = await requireCurrentUserId()
  const { data, error } = await supabase
    .from('projects')
    .update({
      project_code: project.number || null,
      project_name: project.name,
      client: project.client || null,
      location: project.location || null,
      project_manager: project.manager || null,
      engineer: project.engineer || null,
      contractor: project.contractor || null,
      consultant: project.consultant || null,
      start_date: project.start || null,
      end_date: project.finish || null,
      contract_value: Number(project.value || 0),
      status: project.status || 'Planning',
      description: project.description || null,
      logo: project.logo || null,
      archived: project.archived ?? false,
      approval: project.approval ?? {},
      berita_acara: project.beritaAcara ?? {},
      documentation: project.documentation ?? [],
    })
    .eq('id', project.id)
    .eq('owner_id', userId)
    .select()
    .single()

  if (error) throw error

  return data
}

export async function deleteProject(id: string) {
  const userId = await requireCurrentUserId()
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId)

  if (error) throw error
}


/**
 * =========================================================
 * WBS
 * =========================================================
 */

export async function getWBS(projectId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from('wbs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((x: any) => ({
    id: x.id,
    projectId: x.project_id,

    code: x.wbs_code ?? '',
    activity: x.wbs_name ?? '',
    parentId: x.parent_id ?? '',
    description: x.description ?? '',

    discipline: x.discipline ?? '',
    unit: x.unit ?? '',
    quantity: Number(x.quantity ?? 0),
    weight: Number(x.weight ?? 0),

    start: x.start_date ?? '',
    finish: x.finish_date ?? '',

    planned: Number(x.planned_progress ?? 0),
    actual: Number(x.actual_progress ?? 0),

    status: x.status ?? 'Not Started',

    pic: x.pic ?? '',
    notes: x.notes ?? '',
  }))
}

export async function insertWBS(row: Row) {
  const { data, error } = await supabase
    .from('wbs')
    .insert({
      project_id: row.projectId,
      parent_id: row.parentId || null,

      wbs_code: row.code || null,
      wbs_name: row.activity || '',

      discipline: row.discipline || null,
      unit: row.unit || null,
      quantity: Number(row.quantity || 0),
      weight: Number(row.weight || 0),

      start_date: row.start || null,
      finish_date: row.finish || null,

      planned_progress: Number(row.planned || 0),
      actual_progress: Number(row.actual || 0),

      status: row.status || 'Not Started',

      pic: row.pic || null,
      notes: row.notes || null,

      description: row.description || null,
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function updateWBS(row: Row) {
  const { data, error } = await supabase
    .from('wbs')
    .update({
      parent_id: row.parentId || null,
      wbs_code: row.code || null,
      wbs_name: row.activity || '',

      discipline: row.discipline || null,
      unit: row.unit || null,
      quantity: Number(row.quantity || 0),
      weight: Number(row.weight || 0),

      start_date: row.start || null,
      finish_date: row.finish || null,

      planned_progress: Number(row.planned || 0),
      actual_progress: Number(row.actual || 0),

      status: row.status || 'Not Started',

      pic: row.pic || null,
      notes: row.notes || null,

      description: row.description || null,
    })
    .eq('id', row.id)
    .select()
    .single()

  if (error) throw error

  return data
}

export async function deleteWBS(id: string) {
  const { error } = await supabase
    .from('wbs')
    .delete()
    .eq('id', id)

  if (error) throw error
}


/**
 * =========================================================
 * ACTIVITIES
 * =========================================================
 */

export async function getActivities(projectId: string): Promise<Row[]> {
  const [{ data, error }, { data: wbsData, error: wbsError }] = await Promise.all([
    supabase
    .from('activities')
    .select('*')
    .eq('project_id', projectId)
    .order('start_date', { ascending: true }),
    supabase
      .from('wbs')
      .select('id, wbs_code')
      .eq('project_id', projectId)
  ])

  if (error) throw error
  if (wbsError) throw wbsError
  const wbsCodeById = new Map((wbsData ?? []).map((item: any) => [item.id, item.wbs_code ?? '']))

  return (data ?? []).map((x: any) => ({
    id: x.id,
    projectId: x.project_id,

    activityCode: x.activity_code ?? '',
    activity: x.activity_name ?? '',

    wbsId: x.wbs_id ?? '',
    wbsCode: wbsCodeById.get(x.wbs_id) ?? '',

    start: x.start_date ?? '',
    finish: x.finish_date ?? '',
    duration: Number(x.duration ?? 0),

    weight: Number(x.weight ?? 0),
    planned: Number(x.planned_progress ?? 0),
    actual: Number(x.actual_progress ?? 0),

    status: x.status ?? 'Not Started',

    pic: x.pic ?? '',
    notes: x.notes ?? '',
  }))
}

export async function insertActivity(row: Row) {
  const { data, error } = await supabase
    .from('activities')
    .insert({
      project_id: row.projectId,

      wbs_id: row.wbsId || null,

      activity_code: row.activityCode || null,
      activity_name: row.activity || '',

      start_date: row.start || null,
      finish_date: row.finish || null,

      duration: Number(row.duration || 0),
      weight: Number(row.weight || 0),

      planned_progress: Number(row.planned || 0),
      actual_progress: Number(row.actual || 0),

      status: row.status || 'Not Started',

      pic: row.pic || null,
      notes: row.notes || null,
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function updateActivity(row: Row) {
  const { data, error } = await supabase
    .from('activities')
    .update({
      wbs_id: row.wbsId || null,

      activity_code: row.activityCode || null,
      activity_name: row.activity || '',

      start_date: row.start || null,
      finish_date: row.finish || null,

      duration: Number(row.duration || 0),
      weight: Number(row.weight || 0),

      planned_progress: Number(row.planned || 0),
      actual_progress: Number(row.actual || 0),

      status: row.status || 'Not Started',

      pic: row.pic || null,
      notes: row.notes || null,
    })
    .eq('id', row.id)
    .select()
    .single()

  if (error) throw error

  return data
}

export async function deleteActivity(id: string) {
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', id)

  if (error) throw error
}


/**
 * =========================================================
 * WEEKLY PROGRESS
 * =========================================================
 */

export async function getProgress(projectId: string): Promise<Row[]> {
  const [
    { data, error },
    { data: wbsData, error: wbsError },
    { data: activityData, error: activityError },
  ] = await Promise.all([
    supabase.from('weekly_progress').select('*').eq('project_id', projectId).order('week_number', { ascending: true }),
    supabase.from('wbs').select('id, wbs_code, wbs_name').eq('project_id', projectId),
    supabase.from('activities').select('id, activity_name').eq('project_id', projectId),
  ])

  if (error) throw error
  if (wbsError) throw wbsError
  if (activityError) throw activityError

  let normalizedLinks: Map<string, string[]> | null = null
  const progressIds = (data ?? []).map((item: any) => item.id).filter(Boolean)
  if (progressIds.length) {
    const { data: linkData, error: linkError } = await supabase
      .from('weekly_progress_wbs')
      .select('weekly_progress_id, wbs_id')
      .in('weekly_progress_id', progressIds)

    if (linkError) {
      const missingTable = linkError.code === '42P01' || linkError.code === 'PGRST205'
      if (!missingTable) throw linkError
    } else {
      normalizedLinks = new Map()
      for (const link of linkData ?? []) {
        const current = normalizedLinks.get(link.weekly_progress_id) ?? []
        current.push(link.wbs_id)
        normalizedLinks.set(link.weekly_progress_id, current)
      }
    }
  }

  const wbsById = new Map((wbsData ?? []).map((item: any) => [item.id, {
    code: item.wbs_code ?? '',
    activity: item.wbs_name ?? '',
  }]))
  const activityById = new Map((activityData ?? []).map((item: any) => [item.id, item.activity_name ?? '']))

  return (data ?? []).map((x: any) => {
    const parsed = readWeeklyLinks(x.notes)
    const links = parsed.links ?? {}
    const normalizedWbsIds = normalizedLinks?.get(x.id) ?? []
    const wbsIds = Array.isArray(links.wbsIds)
      ? links.wbsIds
      : normalizedWbsIds.length
        ? normalizedWbsIds
        : x.wbs_id
          ? [x.wbs_id]
          : []
    const activityIds = links.activityIds?.length ? links.activityIds : x.activity_id ? [x.activity_id] : []
    const wbsCodes = links.wbsCodes?.length
      ? links.wbsCodes
      : wbsIds.map((id: string) => wbsById.get(id)?.code).filter(Boolean)
    const legacyActivityNames = activityIds.map((id: string) => activityById.get(id)).filter(Boolean)
    const activityNames = links.activityNames?.length
      ? links.activityNames
      : legacyActivityNames.length
        ? legacyActivityNames
        : wbsIds.map((id: string) => wbsById.get(id)?.activity).filter(Boolean)

    return {
      id: x.id,
      projectId: x.project_id,
      week: Number(x.week_number ?? 0),
      date: x.week_end ?? '',
      weekStart: x.week_start ?? '',
      weekEnd: x.week_end ?? '',
      wbsId: wbsIds[0] ?? '',
      wbsIds,
      wbsCode: wbsCodes.join(', '),
      wbsCodes,
      activityId: activityIds[0] ?? '',
      activityIds,
      activity: activityNames.join(', '),
      activityNames,
      plannedWeekly: Number(x.planned_progress ?? 0),
      actualWeekly: Number(x.actual_progress ?? 0),
      deviation: Number(x.variance ?? 0),
      notes: parsed.notes,
    }
  })
}

async function syncProgressWbsLinks(progressId: string, row: Row) {
  if (weeklyLinkRpcAvailable === false) return false
  const wbsIds = [...new Set(
    (Array.isArray(row.wbsIds) ? row.wbsIds : row.wbsId ? [row.wbsId] : [])
      .filter((id: unknown): id is string => typeof id === 'string' && Boolean(id))
  )]
  const { error } = await supabase.rpc('set_weekly_progress_wbs_links', {
    p_progress_id: progressId,
    p_wbs_ids: wbsIds,
  })

  if (error) {
    // Older deployments continue to store the same link list in notes until
    // the additive junction-table migration has been applied.
    if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') {
      weeklyLinkRpcAvailable = false
    }
    console.warn('Weekly WBS relation table is not synchronized; notes fallback remains active.', error)
    return false
  }

  weeklyLinkRpcAvailable = true

  const cleanNotes = readWeeklyLinks(row.notes).notes || null
  const { error: notesError } = await supabase
    .from('weekly_progress')
    .update({ notes: cleanNotes })
    .eq('id', progressId)

  if (notesError) {
    // The junction data is already saved. Leaving the compatible notes marker
    // is safe; the loader prefers it until a later successful save.
    console.warn('Weekly WBS relation saved but legacy notes marker could not be removed.', notesError)
    return false
  }

  return true
}

export async function insertProgress(row: Row) {
  const { data, error } = await supabase
    .from('weekly_progress')
    .insert({
      project_id: row.projectId,

      week_number: Number(row.week || 0),
      week_start: row.weekStart || row.date || null,
      week_end: row.weekEnd || row.date || null,

      wbs_id: row.wbsIds?.[0] || row.wbsId || null,
      activity_id: row.activityIds?.[0] || row.activityId || null,

      planned_progress: Number(row.plannedWeekly || 0),
      actual_progress: Number(row.actualWeekly || 0),

      notes: writeWeeklyLinks(row.notes, row),
    })
    .select()
    .single()

  if (error) throw error

  await syncProgressWbsLinks(data.id, row)

  return data
}

export async function updateProgress(row: Row) {
  const { data, error } = await supabase
    .from('weekly_progress')
    .update({
      week_number: Number(row.week || 0),
      week_start: row.weekStart || row.date || null,
      week_end: row.weekEnd || row.date || null,

      wbs_id: row.wbsIds?.[0] || row.wbsId || null,
      activity_id: row.activityIds?.[0] || row.activityId || null,

      planned_progress: Number(row.plannedWeekly || 0),
      actual_progress: Number(row.actualWeekly || 0),

      notes: writeWeeklyLinks(row.notes, row),
    })
    .eq('id', row.id)
    .select()
    .single()

  if (error) throw error

  await syncProgressWbsLinks(row.id, row)

  return data
}

export async function deleteProgress(id: string) {
  const { error } = await supabase
    .from('weekly_progress')
    .delete()
    .eq('id', id)

  if (error) throw error
}


/**
 * =========================================================
 * ISSUES
 * =========================================================
 */

export async function getIssues(projectId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((x: any) => ({
    id: x.id,
    projectId: x.project_id,

    issueId: x.issue_code ?? '',
    date: x.reported_date ?? '',
    issue: x.issue_title ?? '',
    description: x.description ?? '',
    category: x.category ?? '',
    priority: x.priority ?? 'Medium',
    pic: x.assigned_to ?? '',
    target: x.due_date ?? '',
    status: x.status ?? 'Open',
    action: x.action ?? '',
    notes: x.notes ?? '',
  }))
}

export async function insertIssue(row: Row) {
  const { data, error } = await supabase
    .from('issues')
    .insert({
      project_id: row.projectId,

      issue_code: row.issueId || null,
      reported_date: row.date || null,

      issue_title: row.issue || '',
      description: row.description || null,
      category: row.category || null,

      priority: row.priority || 'Medium',

      assigned_to: row.pic || null,
      due_date: row.target || null,

      status: row.status || 'Open',

      action: row.action || null,
      notes: row.notes || null,
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function updateIssue(row: Row) {
  const { data, error } = await supabase
    .from('issues')
    .update({
      issue_code: row.issueId || null,
      reported_date: row.date || null,

      issue_title: row.issue || '',
      description: row.description || null,
      category: row.category || null,

      priority: row.priority || 'Medium',

      assigned_to: row.pic || null,
      due_date: row.target || null,

      status: row.status || 'Open',

      action: row.action || null,
      notes: row.notes || null,
    })
    .eq('id', row.id)
    .select()
    .single()

  if (error) throw error

  return data
}

export async function deleteIssue(id: string) {
  const { error } = await supabase
    .from('issues')
    .delete()
    .eq('id', id)

  if (error) throw error
}


/**
 * =========================================================
 * MATERIALS
 * =========================================================
 */

export async function getMaterials(projectId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((x: any) => ({
    id: x.id,
    projectId: x.project_id,

    materialCode: x.material_code ?? '',
    material: x.material_name ?? '',
    specification: x.specification ?? '',
    quantity: Number(x.planned_quantity ?? 0),
    unit: x.unit ?? '',

    required: x.required_date ?? '',
    approval: x.approval_status ?? '',
    procurement: x.procurement_status ?? '',
    delivery: x.delivery_date ?? '',

    supplier: x.supplier ?? '',
    notes: x.notes ?? '',
    status: x.status ?? 'Planned',
  }))
}

export async function insertMaterial(row: Row) {
  const { data, error } = await supabase
    .from('materials')
    .insert({
      project_id: row.projectId,

      material_code: row.materialCode || null,
      material_name: row.material || '',

      specification: row.specification || null,

      planned_quantity: Number(row.quantity || 0),
      unit: row.unit || null,

      required_date: row.required || null,
      approval_status: row.approval || null,
      procurement_status: row.procurement || null,
      delivery_date: row.delivery || null,

      supplier: row.supplier || null,
      notes: row.notes || null,

      status: row.status || 'Planned',
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function updateMaterial(row: Row) {
  const { data, error } = await supabase
    .from('materials')
    .update({
      material_code: row.materialCode || null,
      material_name: row.material || '',

      specification: row.specification || null,

      planned_quantity: Number(row.quantity || 0),
      unit: row.unit || null,

      required_date: row.required || null,
      approval_status: row.approval || null,
      procurement_status: row.procurement || null,
      delivery_date: row.delivery || null,

      supplier: row.supplier || null,
      notes: row.notes || null,

      status: row.status || 'Planned',
    })
    .eq('id', row.id)
    .select()
    .single()

  if (error) throw error

  return data
}

export async function deleteMaterial(id: string) {
  const { error } = await supabase
    .from('materials')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export type ImportTable = 'wbs' | 'activities' | 'progress' | 'issues' | 'materials'

/** One insert request per sheet keeps a sheet atomic at the database statement level. */
export async function insertRowsBatch(table: ImportTable, rows: Row[]) {
  if (!rows.length) return []
  const payload = rows.map(row => {
    if (table === 'wbs') return {
      project_id: row.projectId,
      parent_id: row.parentId || null,
      wbs_code: row.code || null,
      wbs_name: row.activity || '',
      description: row.description || row.discipline || row.notes || null,
      discipline: row.discipline || null,
      unit: row.unit || null,
      quantity: Number(row.quantity || 0),
      weight: Number(row.weight || 0),
      start_date: row.start || null,
      finish_date: row.finish || null,
      planned_progress: Number(row.planned || 0),
      actual_progress: Number(row.actual || 0),
      status: row.status || 'Not Started',
      pic: row.pic || null,
      notes: row.notes || null,
    }
    if (table === 'activities') return {
      project_id: row.projectId,
      wbs_id: row.wbsId || null,
      activity_code: row.activityCode || null,
      activity_name: row.activity || '',
      start_date: row.start || null,
      finish_date: row.finish || null,
      duration: Number(row.duration || 0),
      weight: Number(row.weight || 0),
      planned_progress: Number(row.planned || 0),
      actual_progress: Number(row.actual || 0),
      status: row.status || 'Not Started',
      pic: row.pic || null,
      notes: row.notes || null,
    }
    if (table === 'progress') return {
      project_id: row.projectId,
      week_number: Number(row.week),
      week_start: row.weekStart || row.date || null,
      week_end: row.weekEnd || row.date || null,
      wbs_id: row.wbsIds?.[0] || row.wbsId || null,
      activity_id: row.activityIds?.[0] || row.activityId || null,
      planned_progress: Number(row.plannedWeekly),
      actual_progress: Number(row.actualWeekly),
      notes: writeWeeklyLinks(row.notes, row),
    }
    if (table === 'issues') return {
      project_id: row.projectId,
      issue_code: row.issueId || null,
      reported_date: row.date || null,
      issue_title: row.issue || '',
      description: row.description || null,
      category: row.category || null,
      priority: row.priority || 'Medium',
      assigned_to: row.pic || null,
      due_date: row.target || null,
      status: row.status || 'Open',
      action: row.action || null,
      notes: row.notes || null,
    }
    return {
      project_id: row.projectId,
      material_code: row.materialCode || null,
      material_name: row.material || '',
      specification: row.specification || null,
      planned_quantity: Number(row.quantity || 0),
      unit: row.unit || null,
      required_date: row.required || null,
      approval_status: row.approval || null,
      procurement_status: row.procurement || null,
      delivery_date: row.delivery || null,
      supplier: row.supplier || null,
      notes: row.notes || null,
      status: row.status || 'Planned',
    }
  })
  const { data, error } = await supabase.from(table).insert(payload).select(table === 'progress' ? 'id, week_number' : 'id')
  if (error) throw error
  if (table === 'progress' && data) {
    const rowByWeek = new Map(rows.map(row => [Number(row.week), row]))
    await Promise.all(data.map((saved: any) => {
      const sourceRow = rowByWeek.get(Number(saved.week_number))
      return sourceRow ? syncProgressWbsLinks(saved.id, sourceRow) : Promise.resolve(false)
    }))
  }
  return data ?? []
}


/**
 * =========================================================
 * DUPLICATE PROJECT + ALL DATA
 * =========================================================
 */

export async function duplicateProjectWithData(
  project: Project,
  wbsRows: Row[],
  activityRows: Row[],
  progressRows: Row[],
  issueRows: Row[],
  materialRows: Row[]
) {
  const newProjectId = crypto.randomUUID()

  const duplicatedProject: Project = {
    ...project,
    id: newProjectId,
    name: `${project.name} - Copy`,
    number: project.number
      ? `${project.number}-COPY`
      : '',
    archived: false,
  }

  const { error: projectError } = await supabase
    .from('projects')
    .insert({
      id: newProjectId,

      project_code:
        duplicatedProject.number || null,

      project_name:
        duplicatedProject.name,

      client:
        duplicatedProject.client || null,

      location:
        duplicatedProject.location || null,

      project_manager:
        duplicatedProject.manager || null,

      engineer:
        duplicatedProject.engineer || null,

      contractor:
        duplicatedProject.contractor || null,

      consultant:
        duplicatedProject.consultant || null,

      start_date:
        duplicatedProject.start || null,

      end_date:
        duplicatedProject.finish || null,

      contract_value:
        Number(duplicatedProject.value || 0),

      status:
        duplicatedProject.status || 'Planning',

      description:
        duplicatedProject.description || null,

      logo:
        duplicatedProject.logo || null,

      archived: false,

      approval:
        duplicatedProject.approval ?? {},

      berita_acara:
        duplicatedProject.beritaAcara ?? {},

      documentation:
        duplicatedProject.documentation ?? [],
    })

  if (projectError) throw projectError

  try {

  /**
   * WBS
   */

  const wbsIdMap = new Map<string, string>()

  if (wbsRows.length) {
    for (const row of wbsRows) {
      wbsIdMap.set(row.id, crypto.randomUUID())
    }

    const newWbsRows = wbsRows.map((row: any) => ({
        id: wbsIdMap.get(row.id)!,
        project_id: newProjectId,

        wbs_code: row.code || null,
        wbs_name: row.activity || '',

        discipline: row.discipline || null,
        unit: row.unit || null,
        quantity: Number(row.quantity || 0),
        weight: Number(row.weight || 0),

        start_date: row.start || null,
        finish_date: row.finish || null,

        planned_progress: Number(row.planned || 0),
        actual_progress: Number(row.actual || 0),

        status: row.status || 'Not Started',

        pic: row.pic || null,
        notes: row.notes || null,

        description:
          row.discipline ||
          row.notes ||
          null,

        parent_id:
          row.parentId
            ? wbsIdMap.get(row.parentId) || null
            : null,
      }))

    const { error } = await supabase
      .from('wbs')
      .insert(newWbsRows)

    if (error) throw error
  }


  /**
   * ACTIVITIES
   */

  const activityIdMap = new Map<string, string>()

  if (activityRows.length) {
    const newActivityRows = activityRows.map((row: any) => {
      const newId = crypto.randomUUID()

      activityIdMap.set(row.id, newId)

      return {
        id: newId,
        project_id: newProjectId,

        wbs_id:
          row.wbsId
            ? wbsIdMap.get(row.wbsId) || null
            : null,

        activity_code:
          row.activityCode || null,

        activity_name:
          row.activity || '',

        start_date:
          row.start || null,

        finish_date:
          row.finish || null,

        duration:
          Number(row.duration || 0),

        weight:
          Number(row.weight || 0),

        planned_progress:
          Number(row.planned || 0),

        actual_progress:
          Number(row.actual || 0),

        status:
          row.status || 'Not Started',

        pic:
          row.pic || null,

        notes:
          row.notes || null,
      }
    })

    const { error } = await supabase
      .from('activities')
      .insert(newActivityRows)

    if (error) throw error
  }


  /**
   * WEEKLY PROGRESS
   */

  if (progressRows.length) {
    const newProgressRows = progressRows.map((row: any) => {
      const oldWbsIds = row.wbsIds?.length ? row.wbsIds : row.wbsId ? [row.wbsId] : []
      const oldActivityIds = row.activityIds?.length ? row.activityIds : row.activityId ? [row.activityId] : []
      const newWbsIds = oldWbsIds.map((id: string) => wbsIdMap.get(id)).filter(Boolean)
      const newActivityIds = oldActivityIds.map((id: string) => activityIdMap.get(id)).filter(Boolean)
      const linkedRow = { ...row, wbsIds: newWbsIds, activityIds: newActivityIds }

      return {
      id: crypto.randomUUID(),

      project_id: newProjectId,

      week_number:
        Number(row.week || 0),

      week_start:
        row.weekStart ||
        row.date ||
        null,

      week_end:
        row.weekEnd ||
        row.date ||
        null,

      wbs_id: newWbsIds[0] || null,

      activity_id: newActivityIds[0] || null,

      planned_progress:
        Number(row.plannedWeekly || 0),

      actual_progress:
        Number(row.actualWeekly || 0),

      notes: writeWeeklyLinks(row.notes, linkedRow),
      }
    })

    const { data: insertedProgress, error } = await supabase
      .from('weekly_progress')
      .insert(newProgressRows)
      .select('id')

    if (error) throw error
    await Promise.all((insertedProgress ?? []).map((saved: any, index: number) => {
      const oldWbsIds = progressRows[index].wbsIds?.length ? progressRows[index].wbsIds : progressRows[index].wbsId ? [progressRows[index].wbsId] : []
      const linkedRow = {
        ...progressRows[index],
        wbsIds: oldWbsIds.map((id: string) => wbsIdMap.get(id)).filter(Boolean),
        notes: newProgressRows[index].notes,
      }
      return syncProgressWbsLinks(saved.id, linkedRow)
    }))
  }


  /**
   * ISSUES
   */

  if (issueRows.length) {
    const newIssueRows = issueRows.map((row: any) => ({
      id: crypto.randomUUID(),

      project_id: newProjectId,

      issue_code:
        row.issueId || null,

      reported_date:
        row.date || null,

      issue_title:
        row.issue || '',

      description:
        row.description || null,

      category:
        row.category || null,

      priority:
        row.priority || 'Medium',

      assigned_to:
        row.pic || null,

      due_date:
        row.target || null,

      status:
        row.status || 'Open',

      action:
        row.action || null,

      notes:
        row.notes || null,
    }))

    const { error } = await supabase
      .from('issues')
      .insert(newIssueRows)

    if (error) throw error
  }


  /**
   * MATERIALS
   */

  if (materialRows.length) {
    const newMaterialRows = materialRows.map((row: any) => ({
      id: crypto.randomUUID(),

      project_id: newProjectId,

      material_code:
        row.materialCode || null,

      material_name:
        row.material || '',

      specification:
        row.specification || null,

      planned_quantity:
        Number(row.quantity || 0),

      unit:
        row.unit || null,

      required_date:
        row.required || null,

      approval_status:
        row.approval || null,

      procurement_status:
        row.procurement || null,

      delivery_date:
        row.delivery || null,

      supplier:
        row.supplier || null,

      notes:
        row.notes || null,

      status:
        row.status || 'Planned',
    }))

    const { error } = await supabase
      .from('materials')
      .insert(newMaterialRows)

    if (error) throw error
  }

  return duplicatedProject
  } catch (error) {
    // Remove the partially duplicated project if a child insert fails.
    try {
      await deleteProject(newProjectId)
    } catch (cleanupError) {
      console.error('DUPLICATE PROJECT ROLLBACK ERROR:', cleanupError)
    }
    throw error
  }
}


/**
 * =========================================================
 * RESTORE BACKUP
 * =========================================================
 */

export async function restoreBackupToSupabase(
  backup: Store
) {
  validateBackup(backup)

  /**
   * Restore projects
   */

  const projectsPayload = backup.projects.map(
    (project: any) => ({
      id: project.id,

      project_code:
        project.number || null,

      project_name:
        project.name || '',

      client:
        project.client || null,

      location:
        project.location || null,

      project_manager:
        project.manager || null,

      engineer:
        project.engineer || null,

      contractor:
        project.contractor || null,

      consultant:
        project.consultant || null,

      start_date:
        project.start || null,

      end_date:
        project.finish || null,

      contract_value:
        Number(project.value || 0),

      status:
        project.status || 'Planning',

      description:
        project.description || null,

      archived:
        project.archived ?? false,

      logo:
        project.logo || null,

      approval:
        project.approval ?? {},

      berita_acara:
        project.beritaAcara ?? {},

      documentation:
        project.documentation ?? [],
    })
  )

  const { error: projectError } = await supabase
    .from('projects')
    .upsert(projectsPayload, {
      onConflict: 'id',
    })

  if (projectError) throw projectError


  /**
   * Restore WBS
   */

  if (backup.wbs?.length) {
    const payload = backup.wbs.map((row: any) => ({
      id: row.id,

      project_id:
        row.projectId,

      wbs_code:
        row.code || null,

      wbs_name:
        row.activity || '',

      discipline:
        row.discipline || null,

      unit:
        row.unit || null,

      quantity:
        Number(row.quantity || 0),

      weight:
        Number(row.weight || 0),

      start_date:
        row.start || null,

      finish_date:
        row.finish || null,

      planned_progress:
        Number(row.planned || 0),

      actual_progress:
        Number(row.actual || 0),

      status:
        row.status || 'Not Started',

      pic:
        row.pic || null,

      notes:
        row.notes || null,

      parent_id:
        row.parentId || null,

      description:
        row.discipline ||
        row.notes ||
        null,
    }))

    const { error } = await supabase
      .from('wbs')
      .upsert(payload, {
        onConflict: 'id',
      })

    if (error) throw error
  }


  /**
   * Restore Activities
   */

  if (backup.activities?.length) {
    const payload = backup.activities.map((row: any) => ({
      id: row.id,

      project_id:
        row.projectId,

      wbs_id:
        row.wbsId || null,

      activity_code:
        row.activityCode || null,

      activity_name:
        row.activity || '',

      start_date:
        row.start || null,

      finish_date:
        row.finish || null,

      duration:
        Number(row.duration || 0),

      weight:
        Number(row.weight || 0),

      planned_progress:
        Number(row.planned || 0),

      actual_progress:
        Number(row.actual || 0),

      status:
        row.status || 'Not Started',

      pic:
        row.pic || null,

      notes:
        row.notes || null,
    }))

    const { error } = await supabase
      .from('activities')
      .upsert(payload, {
        onConflict: 'id',
      })

    if (error) throw error
  }


  /**
   * Restore Weekly Progress
   */

  if (backup.progress?.length) {
    const payload = backup.progress.map((row: any) => ({
      id: row.id,

      project_id:
        row.projectId,

      week_number:
        Number(row.week || 0),

      week_start:
        row.weekStart ||
        row.date ||
        null,

      week_end:
        row.weekEnd ||
        row.date ||
        null,

      wbs_id:
        row.wbsIds?.[0] || row.wbsId || null,

      activity_id:
        row.activityIds?.[0] || row.activityId || null,

      planned_progress:
        Number(row.plannedWeekly || 0),

      actual_progress:
        Number(row.actualWeekly || 0),

      notes:
        writeWeeklyLinks(row.notes, row),
    }))

    const { data: restoredProgress, error } = await supabase
      .from('weekly_progress')
      .upsert(payload, {
        onConflict: 'id',
      })
      .select('id')

    if (error) throw error
    const progressById = new Map((backup.progress ?? []).map((row: any) => [row.id, row]))
    await Promise.all((restoredProgress ?? []).map((saved: any) => {
      const row = progressById.get(saved.id)
      return row ? syncProgressWbsLinks(saved.id, row) : Promise.resolve(false)
    }))
  }


  /**
   * Restore Issues
   */

  if (backup.issues?.length) {
    const payload = backup.issues.map((row: any) => ({
      id: row.id,

      project_id:
        row.projectId,

      issue_code:
        row.issueId || null,

      reported_date:
        row.date || null,

      issue_title:
        row.issue || '',

      description:
        row.description || null,

      category:
        row.category || null,

      priority:
        row.priority || 'Medium',

      assigned_to:
        row.pic || null,

      due_date:
        row.target || null,

      status:
        row.status || 'Open',

      action:
        row.action || null,

      notes:
        row.notes || null,
    }))

    const { error } = await supabase
      .from('issues')
      .upsert(payload, {
        onConflict: 'id',
      })

    if (error) throw error
  }


  /**
   * Restore Materials
   */

  if (backup.materials?.length) {
    const payload = backup.materials.map((row: any) => ({
      id: row.id,

      project_id:
        row.projectId,

      material_code:
        row.materialCode || null,

      material_name:
        row.material || '',

      specification:
        row.specification || null,

      planned_quantity:
        Number(row.quantity || 0),

      unit:
        row.unit || null,

      required_date:
        row.required || null,

      approval_status:
        row.approval || null,

      procurement_status:
        row.procurement || null,

      delivery_date:
        row.delivery || null,

      supplier:
        row.supplier || null,

      notes:
        row.notes || null,

      status:
        row.status || 'Planned',
    }))

    const { error } = await supabase
      .from('materials')
      .upsert(payload, {
        onConflict: 'id',
      })

    if (error) throw error
  }

  return true
}

export function validateBackup(backup: Store) {
  if (!backup || !Array.isArray(backup.projects) || backup.projects.length === 0) {
    throw new Error('Backup tidak memiliki daftar project yang valid.')
  }
  const collections: Array<[string, Row[] | undefined]> = [
    ['WBS', backup.wbs], ['Activities', backup.activities], ['Weekly Progress', backup.progress],
    ['Issues', backup.issues], ['Materials', backup.materials],
  ]
  for (const [name, rows] of collections) {
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Bagian ${name} pada backup harus berupa array.`)
  }
  if (backup.projects.some(project => !project || typeof project.id !== 'string' || !project.id)) {
    throw new Error('Backup berisi project tanpa ID yang valid.')
  }
  const projectIds = new Set(backup.projects.map(project => project.id))
  if (projectIds.size !== backup.projects.length) throw new Error('Backup memiliki project tanpa ID atau ID project duplikat.')
  const assertRows = (name: string, rows: Row[] = []) => {
    const ids = new Set<string>()
    for (const row of rows) {
      if (!row?.id || !row.projectId || !projectIds.has(row.projectId)) throw new Error(`${name}: setiap baris harus memiliki ID dan merujuk project di dalam backup.`)
      if (ids.has(row.id)) throw new Error(`${name}: ID ${row.id} muncul lebih dari satu kali.`)
      ids.add(row.id)
    }
  }
  for (const [name, rows] of collections) assertRows(name, rows || [])
  const wbsById = new Map((backup.wbs || []).map(row => [row.id, row]))
  const activityById = new Map((backup.activities || []).map(row => [row.id, row]))
  for (const row of backup.wbs || []) {
    if (row.parentId && (!wbsById.has(row.parentId) || row.parentId === row.id || wbsById.get(row.parentId)?.projectId !== row.projectId)) throw new Error(`WBS ${row.code || row.id}: parent WBS tidak valid atau berbeda project.`)
  }
  for (const row of backup.activities || []) {
    if (row.wbsId && wbsById.get(row.wbsId)?.projectId !== row.projectId) throw new Error(`Activity ${row.activity || row.id}: WBS tidak ditemukan pada project yang sama di backup.`)
  }
  for (const row of backup.progress || []) {
    const linkedWbs = Array.isArray(row.wbsIds) ? row.wbsIds : row.wbsId ? [row.wbsId] : []
    const linkedActivities = Array.isArray(row.activityIds) ? row.activityIds : row.activityId ? [row.activityId] : []
    if (linkedWbs.some((id: string) => wbsById.get(id)?.projectId !== row.projectId)) throw new Error(`Weekly Progress minggu ${row.week}: ada WBS yang tidak ditemukan pada project yang sama di backup.`)
    if (linkedActivities.some((id: string) => activityById.get(id)?.projectId !== row.projectId)) throw new Error(`Weekly Progress minggu ${row.week}: ada Activity yang tidak ditemukan pada project yang sama di backup.`)
  }
}


/**
 * =========================================================
 * LOAD ALL DATA
 * =========================================================
 */

export async function loadFromSupabase(): Promise<Store> {
  const projects = await getProjects()

  const wbsResults = await Promise.all(
    projects.map(p => getWBS(p.id))
  )

  const progressResults = await Promise.all(
    projects.map(p => getProgress(p.id))
  )

  const activityResults = await Promise.all(
    projects.map(p => getActivities(p.id))
  )

  const issueResults = await Promise.all(
    projects.map(p => getIssues(p.id))
  )

  const materialResults = await Promise.all(
    projects.map(p => getMaterials(p.id))
  )

  return {
    projects,

    wbs:
      wbsResults.flat(),

    progress:
      progressResults.flat(),

    activities:
      activityResults.flat(),

    issues:
      issueResults.flat(),

    materials:
      materialResults.flat(),

    settings: {
      dark: false,
      defaultProject:
        projects[0]?.id ?? '',
    },
  }
}


/**
 * =========================================================
 * AUTH
 * =========================================================
 */

export async function signIn(
  email: string,
  password: string
) {
  const {
    data,
    error
  } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error

  return data
}

export async function signOut() {
  const { error } =
    await supabase.auth.signOut()

  if (error) throw error
}

export async function getSession() {
  const {
    data: { session }
  } = await supabase.auth.getSession()

  return session
}
