import { supabase } from './supabase'
import type { Project, Row, Store } from '../types'

/**
 * PROJECTS
 */

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
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
    documentation: Array.isArray(p.documentation) ? p.documentation : [],
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
      contract_value: project.value || 0,
      status: project.status || 'Planning',
      description: project.description || null,
      logo: project.logo || null,
      archived: project.archived || false,
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
      contract_value: project.value || 0,
      status: project.status || 'Planning',
      description: project.description || null,
      logo: project.logo || null,
      archived: project.archived ?? false,
      approval: project.approval ?? {},
      berita_acara: project.beritaAcara ?? {},
      documentation: project.documentation ?? [],
    })
    .eq('id', project.id)
    .select()
    .single()

  if (error) throw error

  return data
}

export async function deleteProject(id: string) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) throw error
}


/**
 * WBS
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
    discipline: x.description ?? '',
    unit: '',
    quantity: 0,
    weight: 0,
    start: '',
    finish: '',
    planned: 0,
    actual: 0,
    status: 'Not Started',
    pic: '',
    notes: '',
  }))
}

export async function insertWBS(row: Row) {
  const { data, error } = await supabase
    .from('wbs')
    .insert({
      project_id: row.projectId,
      wbs_code: row.code || null,
      wbs_name: row.activity,
      description: row.notes || null,
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function updateWBS(row: Row) {
  const { error } = await supabase
    .from('wbs')
    .update({
      wbs_code: row.code || null,
      wbs_name: row.activity,
      description: row.notes || null,
    })
    .eq('id', row.id)

  if (error) throw error
}

export async function deleteWBS(id: string) {
  const { error } = await supabase
    .from('wbs')
    .delete()
    .eq('id', id)

  if (error) throw error
}


/**
 * ACTIVITIES
 */

export async function getActivities(projectId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from('activities')
    .select(`
      *,
      wbs:wbs_id (
        wbs_code
      )
    `)
    .eq('project_id', projectId)
    .order('start_date', { ascending: true })

  if (error) throw error

  return (data ?? []).map((x: any) => ({
    id: x.id,
    projectId: x.project_id,

    activityCode: x.activity_code ?? '',
    activity: x.activity_name ?? '',

    wbsId: x.wbs_id ?? '',
    wbsCode: x.wbs?.wbs_code ?? '',

    start: x.start_date ?? '',
    finish: x.finish_date ?? '',
    duration: Number(x.duration ?? 0),

    weight: Number(x.weight ?? 0),
    planned: Number(x.planned_progress ?? 0),
    actual: Number(x.actual_progress ?? 0),

    status: x.status ?? 'Not Started',

    pic: '',
    notes: ''
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
      status: row.status || 'Not Started'
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
      status: row.status || 'Not Started'
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
 * WEEKLY PROGRESS
 */

export async function getProgress(projectId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from('weekly_progress')
    .select(`
      *,
      wbs:wbs_id (
        wbs_code
      ),
      activity:activity_id (
        activity_name
      )
    `)
    .eq('project_id', projectId)
    .order('week_number', { ascending: true })

  if (error) throw error

  return (data ?? []).map((x: any) => ({
    id: x.id,
    projectId: x.project_id,

    week: Number(x.week_number ?? 0),

    date: x.week_end ?? '',
    weekStart: x.week_start ?? '',
    weekEnd: x.week_end ?? '',

    wbsId: x.wbs_id ?? '',
    wbsCode: x.wbs?.wbs_code ?? '',

    activityId: x.activity_id ?? '',
    activity: x.activity?.activity_name ?? '',

    plannedWeekly: Number(x.planned_progress ?? 0),
    actualWeekly: Number(x.actual_progress ?? 0),

    deviation: Number(x.variance ?? 0),

    notes: x.notes ?? ''
  }))
}

export async function insertProgress(row: Row) {
  const { data, error } = await supabase
    .from('weekly_progress')
    .insert({
      project_id: row.projectId,
      week_number: Number(row.week || 0),
      week_start: row.weekStart || row.date || null,
      week_end: row.weekEnd || row.date || null,

      wbs_id: row.wbsId || null,
      activity_id: row.activityId || null,

      planned_progress: Number(row.plannedWeekly || 0),
      actual_progress: Number(row.actualWeekly || 0),

      notes: row.notes || null
    })
    .select()
    .single()

  if (error) throw error

  return data
}

export async function updateProgress(row: Row) {
  const { data, error } = await supabase
    .from('weekly_progress')
    .update({
      week_number: Number(row.week || 0),
      week_start: row.weekStart || row.date || null,
      week_end: row.weekEnd || row.date || null,

      wbs_id: row.wbsId || null,
      activity_id: row.activityId || null,

      planned_progress: Number(row.plannedWeekly || 0),
      actual_progress: Number(row.actualWeekly || 0),

      notes: row.notes || null
    })
    .eq('id', row.id)
    .select()
    .single()

  if (error) throw error

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
 * ISSUES
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
    notes: x.notes ?? ''
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
      notes: row.notes || null
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
      notes: row.notes || null
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
 * MATERIALS
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
    material: x.material_name ?? '',
    specification: x.specification ?? '',
    quantity: Number(x.planned_quantity ?? 0),
    unit: x.unit ?? '',
    required: x.required_date ?? '',
    approval: x.approval_status ?? '',
    procurement: x.procurement_status ?? '',
    delivery: x.delivery_date ?? '',
    supplier: x.supplier ?? '',
    notes: x.notes ?? ''
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
      status: row.status || 'Planned'
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
      status: row.status || 'Planned'
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

/**
 * LOAD ALL DATA
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
    wbs: wbsResults.flat(),
    progress: progressResults.flat(),
    activities: activityResults.flat(),
    issues: issueResults.flat(),
    materials: materialResults.flat(),
    settings: {
      dark: false,
      defaultProject: projects[0]?.id ?? '',
    },
  }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
