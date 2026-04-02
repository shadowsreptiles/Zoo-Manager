import { db } from './supabase'
import { useStore } from './store'
import { todayET } from '../utils/dates'
import { getTeamPins } from '../utils/permissions'

const _pendingDeleteIds = new Set()
let _lastSyncAt = null
let _syncTimer = null

// ── Helpers ────────────────────────────────────────────────────────────────
function buildTaskTree(nodes) {
  const map = {}
  nodes.forEach(n => { map[n.id] = { ...n, children: [] } })
  const roots = []
  nodes.forEach(n => {
    if (n.parent_id && map[n.parent_id]) map[n.parent_id].children.push(map[n.id])
    else roots.push(map[n.id])
  })
  const sort = arr => arr.sort((a,b) => (a.sort_order||0)-(b.sort_order||0)).map(n => ({ ...n, children: sort(n.children) }))
  return sort(roots)
}

// ── apiGet ─────────────────────────────────────────────────────────────────
export async function apiGet() {
  const { update, setSyncStatus } = useStore.getState()
  try {
    setSyncStatus('saving')
    const _delta = _lastSyncAt
    const _qNotes      = _delta ? db.from('notes').select('*').gt('timestamp', _delta)          : db.from('notes').select('*')
    const _qHealth     = _delta ? db.from('health_log').select('*').gt('timestamp', _delta)     : db.from('health_log').select('*')
    const _qWeight     = _delta ? db.from('weight_log').select('*').gt('timestamp', _delta)     : db.from('weight_log').select('*')
    const _qBreeding   = _delta ? db.from('breeding_log').select('*').gt('timestamp', _delta)   : db.from('breeding_log').select('*')
    const _qEnrichment = _delta ? db.from('enrichment_log').select('*').gt('timestamp', _delta) : db.from('enrichment_log').select('*')
    const _qSnakeLog   = _delta ? db.from('snake_log').select('*').gt('updated_at', _delta)     : db.from('snake_log').select('*')

    const [
      { data: _notes }, { data: _health }, { data: _weightLog },
      { data: _breeding }, { data: _enrichment },
      { data: _snakeLog },
      { data: _daysOff }, { data: _photoSubs },
      { data: _teamMembers },
      { data: _teamFeedback },
      { data: _taskNodes }, { data: _taskCompletions }, { data: _taskSeedLog },
      { data: _animalInventory },
      { data: _timeclock },
      { data: _deletedAnimals },
      { data: _customAnimals },
      { data: _animalLayout },
      { data: _preyOverrides },
    ] = await Promise.all([
      _qNotes, _qHealth, _qWeight, _qBreeding, _qEnrichment,
      _qSnakeLog,
      db.from('days_off').select('*'),
      db.from('photo_submissions').select('*'),
      db.from('team_members').select('*'),
      db.from('team_feedback').select('*').order('submitted_at', { ascending: false }).limit(500),
      _delta ? db.from('task_nodes').select('*').gt('updated_at', _delta).order('sort_order', { ascending: true }) : db.from('task_nodes').select('*').order('sort_order', { ascending: true }),
      db.from('task_completions').select('*').in('date', [todayET(), '2099-01-01']),
      db.from('task_seed_log').select('*'),
      _delta ? db.from('animal_inventory').select('*').gt('updated_at', _delta).order('enclosure_id').order('name') : db.from('animal_inventory').select('*').order('enclosure_id').order('name'),
      db.from('timeclock').select('*').eq('date', todayET()),
      db.from('deleted_animals').select('uid'),
      db.from('custom_animals').select('*'),
      db.from('animal_layout').select('*').order('id', { ascending: false }).limit(1),
      db.from('prey_overrides').select('*'),
    ])

    const st = useStore.getState()

    const animalNotes = { ...st.animalNotes }
    const animalNameOverrides = { ...st.animalNameOverrides }
    const animalSpeciesOverrides = { ...st.animalSpeciesOverrides }
    const animalTypeOverrides = { ...st.animalTypeOverrides }
    const animalFamilyOverrides = { ...st.animalFamilyOverrides }
    const animalSubspeciesOverrides = { ...st.animalSubspeciesOverrides }

    // Merge notes, health, weight, breeding, enrichment, care log
    if (_notes) _notes.forEach(n => {
      const cur = animalNotes[n.uid] || {}
      if (!cur.notes) cur.notes = []
      if (!cur.notes.some(x => x.timestamp === n.timestamp))
        cur.notes.push({ date: n.date, text: n.text, addedBy: n.added_by, timestamp: n.timestamp })
      animalNotes[n.uid] = cur
    })
    if (_health) _health.forEach(h => {
      const cur = animalNotes[h.uid] || {}
      if (!cur.health) cur.health = []
      if (!cur.health.some(x => x.timestamp === h.timestamp))
        cur.health.push({ date: h.date, text: h.text, type: h.type, addedBy: h.added_by, timestamp: h.timestamp })
      animalNotes[h.uid] = cur
    })
    if (_weightLog) _weightLog.forEach(w => {
      const cur = animalNotes[w.uid] || {}
      if (!cur.weightLog) cur.weightLog = []
      if (!cur.weightLog.some(x => x.timestamp === w.timestamp))
        cur.weightLog.push({ value: w.value, date: w.date, timestamp: w.timestamp })
      animalNotes[w.uid] = cur
    })
    if (_breeding) _breeding.forEach(b => {
      const cur = animalNotes[b.uid] || {}
      if (!cur.breeding) cur.breeding = []
      if (!cur.breeding.some(x => x.timestamp === b.timestamp))
        cur.breeding.push({ type: b.type, date: b.date, notes: b.notes, count: b.count, timestamp: b.timestamp })
      animalNotes[b.uid] = cur
    })
    if (_enrichment) _enrichment.forEach(en => {
      const cur = animalNotes[en.uid] || {}
      if (!cur.enrichment) cur.enrichment = []
      if (!cur.enrichment.some(x => x.timestamp === en.timestamp))
        cur.enrichment.push({ type: en.type, activity: en.activity, date: en.date, response: en.response, timestamp: en.timestamp })
      animalNotes[en.uid] = cur
    })
    // Merge animal inventory (delta-aware)
    let animalInventory = st.animalInventory || []
    if (_animalInventory && _delta) {
      const updatedUids = new Set(_animalInventory.map(a => a.uid))
      animalInventory = [...animalInventory.filter(a => !updatedUids.has(a.uid)), ..._animalInventory]
    } else if (_animalInventory) {
      animalInventory = _animalInventory
    }

    // Populate overrides and animalNotes from animal_inventory (replaces old profiles merge)
    animalInventory.forEach(a => {
      const cur = animalNotes[a.uid] || {}
      if (a.status) cur.status = a.status
      ;['sex','dob','genes','marks','behaviors','cage','common_name','tax_class','tax_order','family','tax_genus','species','subspecies']
        .forEach(f => { if (a[f]) cur[f] = a[f] })
      animalNotes[a.uid] = cur
      if (a.name) animalNameOverrides[a.uid] = a.name
      if (a.species) animalSpeciesOverrides[a.uid] = a.species
      if (a.tax_class) animalTypeOverrides[a.uid] = a.tax_class
      if (a.family) animalFamilyOverrides[a.uid] = a.family
      if (a.subspecies) animalSubspeciesOverrides[a.uid] = a.subspecies
    })

    // Merge snake log
    const snakeLog = { ...st.snakeLog }
    if (_snakeLog) _snakeLog.forEach(s => {
      const animal = animalInventory.find(a => a.name === s.snake_name)
      if (!animal) return
      if (s.meals_json) { try { snakeLog[animal.uid] = JSON.parse(s.meals_json) } catch {} }
      else if (s.last_fed) {
        if (!Array.isArray(snakeLog[animal.uid]) || snakeLog[animal.uid].length === 0)
          snakeLog[animal.uid] = [{ date: s.last_fed, quality: 'good', by: s.updated_by || '', timestamp: s.updated_at || '' }]
      }
    })

    // Merge days off
    const daysOff = [...st.daysOff]
    if (_daysOff) _daysOff.forEach(d => {
      if (!daysOff.some(x => x.id === d.id))
        daysOff.push({ id: d.id, name: d.name, date: d.date, endDate: d.end_date || d.date, note: d.note || '', approved: d.approved === 'true' || d.approved === true, createdAt: d.created_at || '' })
    })

    // Merge team feedback
    let teamFeedback = [...st.teamFeedback]
    if (_teamFeedback?.length > 0) {
      const serverIds = new Set(_teamFeedback.map(f => f.id))
      _teamFeedback.forEach(f => {
        if (_pendingDeleteIds.has(f.id)) return
        if (!teamFeedback.some(x => x.id === f.id)) {
          try { const data = JSON.parse(f.data_json); data.id = f.id; teamFeedback.unshift(data) } catch {}
        }
      })
      teamFeedback = teamFeedback.filter(f => serverIds.has(f.id) || _pendingDeleteIds.has(f.id))
    }

    // Merge photo submissions
    const photoSubmissions = [...st.photoSubmissions]
    if (_photoSubs) _photoSubs.forEach(ps => {
      const existing = photoSubmissions.find(x => x.id === ps.id)
      if (existing) {
        if (ps.status) existing.status = ps.status
        if (ps.reviewed_by) existing.reviewedBy = ps.reviewed_by
        if (ps.reviewed_at) existing.reviewedAt = ps.reviewed_at
        if (!existing.photoData && ps.photo_data) existing.photoData = ps.photo_data
      } else {
        photoSubmissions.push({ id: ps.id, animalUid: ps.animal_uid, animalName: ps.animal_name, photoData: ps.photo_data || '', submittedBy: ps.submitted_by, submittedAt: ps.submitted_at, status: ps.status || 'pending', reviewedBy: ps.reviewed_by || '', reviewedAt: ps.reviewed_at || '' })
      }
    })

    // Merge team members (pins, permissions, nav restrictions)
    const teamPermissions = { ...st.teamPermissions }
    const navRestrictions = { ...st.navRestrictions }
    if (_teamMembers) {
      const pins = getTeamPins()
      _teamMembers.forEach(tm => {
        if (!tm.name) return
        if (tm.pin) pins[tm.name] = tm.pin
        if (tm.permissions_json) { try { teamPermissions[tm.name] = JSON.parse(tm.permissions_json) } catch {} }
        if (tm.nav_restrictions_json) { try { navRestrictions[tm.name] = JSON.parse(tm.nav_restrictions_json) } catch {} }
      })
      localStorage.setItem('teamPins', JSON.stringify(pins))
    }

    // Merge task_nodes → build tree (delta-aware)
    let taskNodes = st.taskNodes || []
    if (_taskNodes && _delta && taskNodes.length > 0) {
      const updatedIds = new Set(_taskNodes.map(n => n.id))
      taskNodes = [...taskNodes.filter(n => !updatedIds.has(n.id)), ..._taskNodes]
    } else if (_taskNodes && _taskNodes.length > 0) {
      taskNodes = _taskNodes
    }
    let taskTree = null
    if (taskNodes.length > 0) {
      const dbIds = new Set(taskNodes.map(n => n.id))
      const careRoot = dbIds.has('care_schedule') ? [] : [{ id: 'care_schedule', parent_id: null, title: 'Animal Care', emoji: '🐾', sort_order: -9999, node_type: 'project', status: 'active' }]
      taskTree = buildTaskTree([...taskNodes, ...careRoot])
    }

    // Merge task_completions
    const taskCompletions = {}
    ;(_taskCompletions || []).forEach(c => {
      taskCompletions[c.task_id] = { by: c.completed_by, at: c.completed_at }
    })

    _lastSyncAt = new Date(Date.now() - 5000).toISOString()

    // Merge timeclock records (today's only)
    const timeclockRecords = _timeclock || st.timeclockRecords || []

    // Merge deleted animals
    const deletedAnimals = _deletedAnimals ? _deletedAnimals.map(d => d.uid) : st.deletedAnimals || []

    // Merge custom animals
    let customAnimals = st.customAnimals || []
    if (_customAnimals) {
      customAnimals = _customAnimals.map(ca => {
        try { return { uid: ca.uid, ...JSON.parse(ca.data_json) } } catch { return { uid: ca.uid } }
      })
    }

    // Merge animal layout
    let animalLayout = st.animalLayout
    if (_animalLayout && _animalLayout.length > 0) {
      try { animalLayout = JSON.parse(_animalLayout[0].layout_json) } catch {}
    }

    // Merge prey overrides
    const snakePreyOverrides = { ...st.snakePreyOverrides }
    if (_preyOverrides) _preyOverrides.forEach(po => {
      if (po.snake_index && po.prey) snakePreyOverrides[po.snake_index] = po.prey
    })

    update({
      animalInventory, animalNotes, animalNameOverrides, animalSpeciesOverrides,
      animalTypeOverrides, animalFamilyOverrides, animalSubspeciesOverrides,
      snakeLog, daysOff, teamFeedback,
      photoSubmissions, teamPermissions, navRestrictions,
      teamMembers: _teamMembers || st.teamMembers || [],
      taskNodes, taskTree, taskCompletions, timeclockRecords, deletedAnimals, customAnimals,
      animalLayout, snakePreyOverrides, syncStatus: 'synced',
    })
  } catch(e) {
    useStore.getState().setSyncStatus('error')
    console.error('Supabase load error:', e)
  }
}

// ── apiPost ────────────────────────────────────────────────────────────────
export async function apiPost(body) {
  const { userName, setSyncStatus } = useStore.getState()
  const user = userName || 'Unknown'
  const now = new Date().toISOString()
  const action = body.action
  const u = { updated_by: user, updated_at: now }
  try {
    setSyncStatus('saving')
    switch (action) {
      case 'updateProfile':
        await db.from('animal_inventory').upsert({ uid: body.uid, status: body.status, sex: body.sex, dob: body.dob, genes: body.genes, marks: body.marks, behaviors: body.behaviors, cage: body.cage, name: body.name || '', species: body.species || '', family: body.family || '', subspecies: body.subspecies || '', ...u }, { onConflict: 'uid' }); break
      case 'addNote':
        await db.from('notes').insert({ uid: body.uid, date: body.date, text: body.text, added_by: user, timestamp: body.timestamp || now }); break
      case 'deleteNote':
        await db.from('notes').delete().eq('uid', body.uid).eq('timestamp', body.timestamp); break
      case 'addHealth':
        await db.from('health_log').insert({ uid: body.uid, date: body.date, text: body.text, type: body.type, added_by: user, timestamp: body.timestamp || now }); break
      case 'deleteHealth':
        await db.from('health_log').delete().eq('uid', body.uid).eq('timestamp', body.timestamp); break
      case 'addWeight':
        await db.from('weight_log').insert({ uid: body.uid, value: body.value, date: body.date, added_by: user, timestamp: body.timestamp || now }); break
      case 'deleteWeight':
        await db.from('weight_log').delete().eq('uid', body.uid).eq('timestamp', body.timestamp); break
      case 'addBreeding':
        await db.from('breeding_log').insert({ uid: body.uid, type: body.type, date: body.date, notes: body.notes, count: body.count, added_by: user, timestamp: body.timestamp || now }); break
      case 'deleteBreeding':
        await db.from('breeding_log').delete().eq('uid', body.uid).eq('timestamp', body.timestamp); break
      case 'addEnrichment':
        await db.from('enrichment_log').insert({ uid: body.uid, type: body.type, activity: body.activity, date: body.date, response: body.response, added_by: user, timestamp: body.timestamp || now }); break
      case 'deleteEnrichment':
        await db.from('enrichment_log').delete().eq('uid', body.uid).eq('timestamp', body.timestamp); break
      case 'addCustomAnimal':
        await db.from('custom_animals').upsert({ uid: body.uid, data_json: JSON.stringify(body.data), created_by: user, created_at: now }, { onConflict: 'uid' }); break
      case 'removeAnimal':
        await db.from('custom_animals').delete().eq('uid', body.uid); break
      case 'deleteAnimal':
        await db.from('deleted_animals').upsert({ uid: body.uid, deleted_by: user, deleted_at: now }, { onConflict: 'uid' }); break
      case 'saveSnakeLog':
        await db.from('snake_log').upsert({ snake_name: body.snake_name, last_fed: body.last_fed || '', meals_json: body.meals_json || '[]', ...u }, { onConflict: 'snake_name' }); break
      case 'saveSnakeMeal':
        await db.from('snake_log').upsert({ snake_name: body.snake_name, last_fed: body.last_fed || '', meals_json: body.meals_json || '[]', ...u }, { onConflict: 'snake_name' }); break
      case 'savePreyOverride':
        if (!body.prey) await db.from('prey_overrides').delete().eq('snake_index', String(body.snake_index))
        else await db.from('prey_overrides').upsert({ snake_index: String(body.snake_index), prey: body.prey, ...u }, { onConflict: 'snake_index' }); break
      case 'addDayOff':
        await db.from('days_off').upsert({ id: body.id, name: body.name, date: body.date, end_date: body.end_date, note: body.note || '', approved: body.approved, created_at: now }, { onConflict: 'id' }); break
      case 'removeDayOff':
        await db.from('days_off').delete().eq('id', body.id); break
      case 'savePhotoSubmission':
        await db.from('photo_submissions').upsert({ id: body.id, animal_uid: body.animal_uid, animal_name: body.animal_name, photo_data: body.photo_data || '', submitted_by: body.submitted_by || user, submitted_at: body.submitted_at || now, status: body.status || 'pending', reviewed_by: body.reviewed_by || '', reviewed_at: body.reviewed_at || '' }, { onConflict: 'id' }); break
      case 'deletePhotoSubmission':
        await db.from('photo_submissions').delete().eq('id', body.id); break
      case 'saveTeamPin':
        await db.from('team_members').upsert({ name: body.name, pin: body.pin, ...u }, { onConflict: 'name' }); break
      case 'saveTeamPermissions':
        await db.from('team_members').upsert({ name: body.employee, permissions_json: JSON.stringify(body.permissions), ...u }, { onConflict: 'name' }); break
      case 'saveNavRestrictions':
        await db.from('team_members').upsert({ name: body.employee, nav_restrictions_json: JSON.stringify(body.restrictions), ...u }, { onConflict: 'name' }); break
      case 'addTeamMember':
        await db.from('team_members').insert({ name: body.name, role: body.role, pin: body.pin || null, permissions_json: body.permissions_json, nav_restrictions_json: body.nav_restrictions_json, ...u }); break
      case 'removeTeamMember':
        await db.from('team_members').delete().eq('name', body.name); break
      case 'saveAnimalLayout':
        if (!body.layout || body.layout.length === 0) await db.from('animal_layout').delete().neq('id', 0)
        else await db.from('animal_layout').insert({ layout_json: JSON.stringify(body.layout), ...u }); break
      case 'clockIn':
        await db.from('timeclock').upsert({ id: body.id, employee: body.employee, date: body.date, clock_in: body.clock_in, created_at: now }, { onConflict: 'id' }); break
      case 'clockOut':
        await db.from('timeclock').update({ clock_out: body.clock_out }).eq('employee', body.employee).eq('date', body.date); break
      case 'saveFeedback':
        await db.from('team_feedback').upsert({ id: body.id, data_json: JSON.stringify(body.data), submitted_by: user, submitted_at: now }, { onConflict: 'id' }); break
      case 'deleteFeedback':
        await db.from('team_feedback').delete().eq('id', body.id); break
      case 'acknowledgeFeedback':
        await db.from('team_feedback').update({ acknowledged: body.acknowledged }).eq('id', body.id); break
      case 'saveTaskNode':
        if (body.node?.title) await db.from('task_nodes').upsert({ ...body.node, updated_at: now }, { onConflict: 'id' }); break
      case 'deleteTaskNode':
        await db.from('task_nodes').delete().eq('id', body.id); break
      case 'toggleTaskCompletion':
        if (body.undo) await db.from('task_completions').delete().eq('task_id', body.taskId).eq('date', body.date)
        else await db.from('task_completions').upsert({ task_id: body.taskId, date: body.date, completed_by: body.completedBy || user, completed_at: body.completedAt || now }, { onConflict: 'task_id,date' }); break
      case 'seedTaskNodes':
        if (body.nodes?.length > 0) {
          for (let i = 0; i < body.nodes.length; i += 100)
            await db.from('task_nodes').upsert(body.nodes.slice(i, i+100), { onConflict: 'id', ignoreDuplicates: true })
        }
        await db.from('task_seed_log').upsert({ key: body.seedKey, seeded_at: now }); break
      default:
        console.warn('Unknown apiPost action:', action)
    }
    useStore.getState().setSyncStatus('synced')
  } catch(e) {
    useStore.getState().setSyncStatus('error')
    console.error('Supabase write error:', e)
  }
}

export function apiPostDebounced(body) {
  clearTimeout(_syncTimer)
  _syncTimer = setTimeout(() => apiPost(body), 800)
}

export { buildTaskTree }
