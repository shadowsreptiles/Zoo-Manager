import { useState } from 'react'
import { Icons } from '../components/Icons'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { isSupervisor } from '../utils/permissions'
import { apiPost } from '../lib/api'
import { todayET, toETDate } from '../utils/dates'
import { db } from '../lib/supabase'
import { findNode, TaskDetailModal } from './Tasks'

function fmtTime12(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm
}

const SPECIES_CLASSES = {
  'Ball Python': 'snake', 'Corn Snake': 'snake', 'King Snake': 'snake', 'Milk Snake': 'snake',
  'Boa Constrictor': 'snake', 'Western Hognose': 'snake', 'Blood Python': 'snake',
  'Burmese Python': 'snake', 'Reticulated Python': 'snake', 'Green Tree Python': 'snake',
  'Leopard Gecko': 'lizard', 'Crested Gecko': 'lizard', 'Blue Tongue Skink': 'lizard',
  'Bearded Dragon': 'lizard', 'Chameleon': 'lizard', 'Monitor': 'lizard',
  'Sulcata Tortoise': 'tortoise', 'Red Foot Tortoise': 'tortoise', 'Russian Tortoise': 'tortoise',
  'Red Ear Slider': 'turtle', 'Box Turtle': 'turtle',
  'Pacman Frog': 'frog', 'Tree Frog': 'frog', 'Dart Frog': 'frog',
}

const wixImg = (id, w = 200, h = 200) =>
  id ? `https://static.wixstatic.com/media/6e20dc_${id}~mv2.jpg/v1/fill/w_${w},h_${h},al_c,q_80,enc_auto/6e20dc_${id}~mv2.jpg` : ''

function getAnimalClass(a) {
  return a.animal_class || SPECIES_CLASSES[a.species] || 'reptile'
}

function SexDisplay({ sex }) {
  if (!sex) return null
  const s = sex.toUpperCase()
  if (s === 'M' || s === 'MALE') return <span style={{ fontSize: 11, color: '#42A5F5', fontWeight: 600 }}>{'\u2642'} Male</span>
  if (s === 'F' || s === 'FEMALE') return <span style={{ fontSize: 11, color: '#F48FB1', fontWeight: 600 }}>{'\u2640'} Female</span>
  return <span style={{ fontSize: 11, color: 'var(--muted)' }}>{sex}</span>
}

function CardDetail({ label, value }) {
  if (!value) return null
  return (
    <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>
      <span style={{ color: 'var(--silverDark)', fontWeight: 600 }}>{label}:</span>{' '}
      <span style={{ color: 'var(--silverLight)' }}>{value}</span>
    </div>
  )
}

function AnimalCard({ animal, profile, onClick }) {
  const imgSrc = animal.img_id ? wixImg(animal.img_id, 120, 120) : (profile?.photoData || '')
  const displayName = profile?.name || animal.name
  const status = profile?.status || ''
  const sex = profile?.sex || animal.sex || ''
  const dob = profile?.dob || animal.dob || ''
  const genes = profile?.genes || animal.genes || ''
  const marks = profile?.marks || animal.marks || ''
  const behaviors = profile?.behaviors || animal.behaviors || ''
  const location = animal.location || animal.zone || ''

  return (
    <div className="animal-card" onClick={onClick} role="button" tabIndex={0} aria-label={'View ' + displayName} onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        {imgSrc
          ? <img src={imgSrc} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} alt={displayName} onError={e => e.target.style.display='none'} />
          : <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--dark3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}><span style={{color:'var(--silverDark)'}}>{Icons.paw}</span></div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{animal.species}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: (animal.uid || location || sex || dob || genes || marks || behaviors) ? 8 : 0 }}>
        {animal.zone && <span className="pill pill-blue" style={{ fontSize: 9 }}>{animal.zone}</span>}
        {status && <span className="pill pill-orange" style={{ fontSize: 9 }}>{status}</span>}
      </div>
      <div style={{ display: 'grid', gap: 3 }}>
        <CardDetail label="ID" value={animal.uid} />
        <CardDetail label="Location" value={location} />
        {sex && <div style={{ fontSize: 10 }}><span style={{ color: 'var(--silverDark)', fontWeight: 600 }}>Sex:</span>{' '}<SexDisplay sex={sex} /></div>}
        <CardDetail label="DOB" value={dob} />
        <CardDetail label="Genes" value={genes} />
        <CardDetail label="Marks" value={marks} />
        <CardDetail label="Behaviors" value={behaviors} />
      </div>
    </div>
  )
}

function DetailCell({ label, value }) {
  if (!value || value === '—') return null
  return (
    <div style={{ background: 'var(--dark3)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--silverLight)', wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

function ExpandableCell({ label, value, subFields, open, onToggle }) {
  if (!value) return null
  const hasContent = subFields.some(([, v]) => v && String(v).trim() !== '')
  return (
    <div
      style={{ background: 'var(--dark3)', borderRadius: 8, padding: '8px 10px', cursor: hasContent ? 'pointer' : 'default', gridColumn: open ? '1 / -1' : undefined, transition: 'all 0.15s' }}
      onClick={() => hasContent && onToggle()}
      role={hasContent ? 'button' : undefined}
      tabIndex={hasContent ? 0 : undefined}
      aria-expanded={hasContent ? open : undefined}
      onKeyDown={hasContent ? (e => e.key === 'Enter' && onToggle()) : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--silverLight)', wordBreak: 'break-all' }}>{value}</div>
        </div>
        {hasContent && <span style={{ fontSize: 10, color: 'var(--dimmed)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', marginLeft: 8, flexShrink: 0 }}>{Icons.chevronDown}</span>}
      </div>
      {open && hasContent && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--dark4)' }}>
          {subFields.filter(([, v]) => v && String(v).trim() !== '').map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 9, color: 'var(--dimmed)', textTransform: 'uppercase', marginBottom: 1 }}>{l}</div>
              <div style={{ fontSize: 11, color: 'var(--silverLight)', wordBreak: 'break-all' }}>{String(v)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AnimalProfile({ animal, profile, onBack }) {
  const sup = isSupervisor()
  const { userName, update, animalNameOverrides, animalSpeciesOverrides, animalTypeOverrides, animalFamilyOverrides, animalSubspeciesOverrides, taskTree, animalInventory: storeAnimals, animalNotes: storeAnimalNotes } = useStore(useShallow(s => ({
    userName: s.userName, update: s.update,
    animalNameOverrides: s.animalNameOverrides || {},
    animalSpeciesOverrides: s.animalSpeciesOverrides || {},
    animalTypeOverrides: s.animalTypeOverrides || {},
    animalFamilyOverrides: s.animalFamilyOverrides || {},
    animalSubspeciesOverrides: s.animalSubspeciesOverrides || {},
    taskTree: s.taskTree,
    animalInventory: s.animalInventory,
    animalNotes: s.animalNotes,
  })))
  const [tab, setTab] = useState('notes')
  const [noteText, setNoteText] = useState('')
  const [editing, setEditing] = useState(false)
  const [speciesOpen, setSpeciesOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  // Task modal state: null = closed, '__new__' = creating, or task id = editing
  const [taskModalId, setTaskModalId] = useState(null)

  const displayName = profile?.name || animalNameOverrides[animal.uid] || animal.name
  const imgSrc = animal.img_id ? wixImg(animal.img_id, 300, 300) : ''

  const TABS = ['notes', 'health', 'weight', 'breeding', 'enrichment', 'care']

  function addNote() {
    if (!noteText.trim()) return
    const ts = new Date().toISOString()
    const note = { date: todayET(), text: noteText.trim(), addedBy: userName, timestamp: ts }
    const cur = profile || {}
    const notes = [...(cur.notes || []), note]
    update({ animalNotes: { ...useStore.getState().animalNotes, [animal.uid]: { ...cur, notes } } })
    apiPost({ action: 'addNote', uid: animal.uid, date: note.date, text: note.text, timestamp: ts })
    setNoteText('')
  }

  const notes = profile?.notes || []
  const health = profile?.health || []
  const weightLog = profile?.weightLog || []
  const breeding = profile?.breeding || []
  const enrichment = profile?.enrichment || []
  // Count care schedule tasks for this animal (used in tab badge)
  const careTaskCount = (() => {
    if (!taskTree) return 0
    const careRoot = taskTree.find(n => n.id === 'care_schedule')
    if (!careRoot) return 0
    let count = 0
    const name = (profile?.name || animalNameOverrides[animal.uid] || animal.name || '').toLowerCase()
    const uidPrefix = animal.uid ? animal.uid.split('_').slice(0, -1).join('_') : ''
    const targetSpeciesId = uidPrefix ? 'species_' + uidPrefix : ''
    ;(careRoot.children || []).filter(n => n.id?.startsWith('zone_')).forEach(zone => {
      ;(zone.children || []).filter(n => n.id?.startsWith('species_')).forEach(species => {
        if (species.id !== targetSpeciesId) return
        ;(species.children || []).filter(c => c.id?.startsWith('chk_')).forEach(chk => {
          const linked = (chk.animal || '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
          if (linked.length === 0 || linked.includes(name)) {
            count += (chk.children || []).length
          }
        })
      })
    })
    return count
  })()

  // Collect tagged tasks for each tab from the task tree (non-care tabs)
  const animalName = (profile?.name || animalNameOverrides[animal.uid] || animal.name || '')
  const getTaggedTasks = (tagName) => {
    if (!taskTree) return []
    const results = []
    const walk = (nodes) => {
      nodes.forEach(n => {
        const tags = (n.tags || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        const linkedAnimals = (n.animal || '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
        if (tags.includes(tagName.toLowerCase()) && linkedAnimals.includes(animalName.toLowerCase())) {
          results.push(n)
        }
        walk(n.children || [])
      })
    }
    walk(taskTree)
    return results
  }

  const tabTasks = {
    notes: getTaggedTasks('notes'),
    health: getTaggedTasks('health'),
    weight: getTaggedTasks('weight'),
    breeding: getTaggedTasks('breeding'),
    enrichment: getTaggedTasks('enrichment'),
  }

  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

  function flatten(nodes) {
    const flat = []
    nodes.forEach(n => { const { children, ...rest } = n; flat.push(rest); if (children) flatten(children).forEach(f => flat.push(f)) })
    return flat
  }

  async function saveTabTask(patch) {
    const now = new Date().toISOString()
    const cloned = JSON.parse(JSON.stringify(taskTree))
    if (taskModalId === '__new__') {
      const newId = 'task_' + genId()
      // Force tag and animal for new tasks created from a tab
      const row = { id: newId, parent_id: null, node_type: 'task', sort_order: 0, reset_daily: false, created_at: now, updated_at: now, ...patch, tags: patch.tags || tab, animal: patch.animal || animalName }
      cloned.unshift({ ...row, children: [] })
      update({ taskTree: cloned, taskNodes: flatten(cloned) })
      setTaskModalId(null)
      try { await db.from('task_nodes').upsert({ ...row }, { onConflict: 'id' }) } catch (err) { console.error('Failed to save task:', err) }
    } else {
      const node = findNode(cloned, taskModalId)
      if (node) Object.assign(node, { ...patch, updated_at: now })
      update({ taskTree: cloned, taskNodes: flatten(cloned) })
      setTaskModalId(null)
      try { await db.from('task_nodes').update({ ...patch, updated_at: now }).eq('id', taskModalId) } catch (err) { console.error('Failed to update task:', err) }
    }
  }

  async function deleteTabTask(id) {
    const cloned = JSON.parse(JSON.stringify(taskTree))
    const removeFromTree = (nodes) => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) { nodes.splice(i, 1); return true }
        if (removeFromTree(nodes[i].children || [])) return true
      }
      return false
    }
    removeFromTree(cloned)
    update({ taskTree: cloned, taskNodes: flatten(cloned) })
    setTaskModalId(null)
    try { await db.from('task_nodes').delete().eq('id', id) } catch (err) { console.error('Failed to delete task:', err) }
  }

  async function cycleTaskStatus(id) {
    const order = ['todo', 'in-progress', 'done']
    const cloned = JSON.parse(JSON.stringify(taskTree))
    const node = findNode(cloned, id)
    if (!node) return
    const idx = order.indexOf(node.status || 'todo')
    const next = order[(idx + 1) % order.length]
    node.status = next
    node.updated_at = new Date().toISOString()
    update({ taskTree: cloned, taskNodes: flatten(cloned) })
    try { await db.from('task_nodes').update({ status: next, updated_at: node.updated_at }).eq('id', id) } catch (err) { console.error('Failed to cycle status:', err) }
  }

  const urgColor = { critical: 'var(--redLight)', high: 'var(--redLight)', medium: 'var(--orange)', low: 'var(--green)' }
  const SM = {
    'todo': { label: 'To Do', color: 'var(--silver)', bg: 'var(--dark4)' },
    'in-progress': { label: 'In Progress', color: '#42a5f5', bg: 'rgba(66,165,245,.15)' },
    'done': { label: 'Done', color: 'var(--green)', bg: 'rgba(102,187,106,.15)' },
  }

  function renderTabTasks(tabName) {
    const tasks = tabTasks[tabName] || []
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {tabName.charAt(0).toUpperCase() + tabName.slice(1)} Tasks{tasks.length > 0 ? ` (${tasks.length})` : ''}
          </div>
          {sup && (
            <button onClick={() => setTaskModalId('__new__')} style={{ padding: '5px 12px', borderRadius: 7, background: 'var(--red)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ Task</button>
          )}
        </div>
        {tasks.length > 0 ? tasks.map(t => {
          const sm = SM[t.status] || SM['todo']
          return (
            <div key={t.id} className="card" style={{ marginBottom: 6, borderLeft: `3px solid ${urgColor[t.urgency] || 'var(--dark4)'}`, opacity: t.status === 'done' ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.status === 'done' ? 'var(--dimmed)' : 'var(--white)', textDecoration: t.status === 'done' ? 'line-through' : 'none', flex: 1, wordBreak: 'break-word' }}>{t.title}</span>
                <button onClick={() => cycleTaskStatus(t.id)} style={{ padding: '2px 8px', borderRadius: 20, border: 'none', background: sm.bg, color: sm.color, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'uppercase', flexShrink: 0 }}>{sm.label}</button>
              </div>
              {t.notes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.notes}</div>}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, color: 'var(--muted)', marginTop: 6, alignItems: 'center' }}>
                {t.assigned_to && <span style={{ background: 'var(--dark4)', padding: '1px 6px', borderRadius: 10 }}>{t.assigned_to}</span>}
                {t.urgency && t.urgency !== 'low' && <span style={{ fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: (urgColor[t.urgency] || 'var(--orange)') + '22', color: urgColor[t.urgency] || 'var(--orange)', textTransform: 'uppercase' }}>{t.urgency}</span>}
                {t.created_at && <span>{new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  {sup && <button onClick={() => setTaskModalId(t.id)} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 10, cursor: 'pointer' }}>Edit</button>}
                </div>
              </div>
            </div>
          )
        }) : (
          <div style={{ color: 'var(--dimmed)', fontSize: 11, textAlign: 'center', padding: '10px 0' }}>No {tabName} tasks yet</div>
        )}
      </div>
    )
  }

  // Species expandable: shows common name, expands to full taxonomy
  const speciesDisplay = profile?.common_name || animalSpeciesOverrides[animal.uid] || animal.species
  const taxonomyFields = [
    ['Species', animalSpeciesOverrides[animal.uid] || animal.species],
    ['Subspecies', animalSubspeciesOverrides[animal.uid] || profile?.subspecies],
    ['Family', animalFamilyOverrides[animal.uid] || profile?.family],
    ['Class', profile?.tax_class || animal.animal_class],
    ['Order', profile?.tax_order],
    ['Genus', profile?.tax_genus],
    ['Type', animalTypeOverrides[animal.uid]],
  ]

  // Location expandable: shows location, expands to zone + enclosure
  const locationDisplay = animal.location || animal.zone || animal.enclosure_id
  const locationFields = [
    ['Zone', animal.zone],
    ['Enclosure', animal.enclosure_id],
    ['Location', animal.location],
  ]

  // Flat detail fields (everything not in expandable groups)
  const details = [
    ['ID', animal.uid],
    ['Cage', profile?.cage || animal.cage_slot],
    ['DOB', profile?.dob || animal.dob],
    ['Sex', profile?.sex || animal.sex],
    ['Genes', profile?.genes || animal.genes],
    ['Marks', profile?.marks || animal.marks],
    ['Behaviors', profile?.behaviors || animal.behaviors],
    ['Food Type', animal.food_type],
    ['Feeding Qty', animal.feeding_qty],
    ['Feeding Freq', animal.feeding_freq],
    ['Status', profile?.status],
  ].filter(([, v]) => v && String(v).trim() !== '')

  return (
    <div style={{ paddingTop: 16 }}>
      <button onClick={onBack} aria-label="Back to Animals" style={{ background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{display:'inline-flex'}}>{Icons.arrowLeft}</span> Back to Animals
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {imgSrc
            ? <img src={imgSrc} style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} alt={displayName} />
            : <div style={{ width: 80, height: 80, borderRadius: 12, background: 'var(--dark3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}><span style={{color:'var(--silverDark)'}}>{Icons.paw}</span></div>
          }
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--white)', marginBottom: 4 }}>{displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{animalSpeciesOverrides[animal.uid] || animal.species}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {animal.zone && <span className="pill pill-blue">{animal.zone}</span>}
              {profile?.status && <span className="pill pill-orange">{profile.status}</span>}
              {(profile?.sex || animal.sex) && <span className="pill pill-silver">{profile?.sex || animal.sex}</span>}
            </div>
          </div>
        </div>

        {/* All details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 16 }}>
          {speciesDisplay && (
            <ExpandableCell label="Species" value={speciesDisplay} subFields={taxonomyFields} open={speciesOpen} onToggle={() => setSpeciesOpen(o => !o)} />
          )}
          {locationDisplay && (
            <ExpandableCell label="Location" value={locationDisplay} subFields={locationFields} open={locationOpen} onToggle={() => setLocationOpen(o => !o)} />
          )}
          {details.map(([l, v]) => (
            <DetailCell key={l} label={l} value={String(v)} />
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {TABS.map(t => {
          const counts = {
            notes: notes.length + (tabTasks.notes?.length || 0),
            health: health.length + (tabTasks.health?.length || 0),
            weight: weightLog.length + (tabTasks.weight?.length || 0),
            breeding: breeding.length + (tabTasks.breeding?.length || 0),
            enrichment: enrichment.length + (tabTasks.enrichment?.length || 0),
            care: careTaskCount,
          }
          return (
            <button key={t} onClick={() => { setTab(t); setTaskModalId(null) }} role="tab" aria-selected={tab === t} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              background: tab === t ? 'var(--redGlow)' : 'var(--dark3)',
              border: tab === t ? '1px solid rgba(227,30,36,.3)' : '1px solid var(--dark4)',
              color: tab === t ? 'var(--red)' : 'var(--silverDark)',
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}{counts[t] > 0 ? ` (${counts[t]})` : ''}
            </button>
          )
        })}
      </div>

      {/* Notes tab */}
      {tab === 'notes' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." className="config-input" style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && addNote()} />
            <button onClick={addNote} style={{ padding: '8px 16px', background: 'var(--red)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Add</button>
          </div>
          {notes.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No notes yet</div>
            : notes.slice().reverse().map((n, i) => (
              <div key={i} className="card" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{n.date} · {n.addedBy}</div>
                <div style={{ fontSize: 13, color: 'var(--silverLight)' }}>{n.text}</div>
              </div>
            ))
          }
          {renderTabTasks('notes')}
        </div>
      )}

      {tab === 'health' && (
        <div>
          {health.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No health records</div>
            : health.slice().reverse().map((h, i) => (
              <div key={i} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)' }}>{h.type || 'Note'}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{h.date}</span>
                </div>
                <div style={{ fontSize: 13 }}>{h.text}</div>
                {h.addedBy && <div style={{ fontSize: 10, color: 'var(--dimmed)', marginTop: 4 }}>By {h.addedBy}</div>}
              </div>
            ))
          }
          {renderTabTasks('health')}
        </div>
      )}

      {tab === 'weight' && (
        <div>
          {weightLog.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No weight records</div>
            : weightLog.slice().reverse().map((w, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--dark3)', borderRadius: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: 'var(--white)' }}>{w.value}g</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{w.date}</div>
                  {w.addedBy && <div style={{ fontSize: 10, color: 'var(--dimmed)' }}>{w.addedBy}</div>}
                </div>
              </div>
            ))
          }
          {renderTabTasks('weight')}
        </div>
      )}

      {tab === 'breeding' && (
        <div>
          {breeding.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No breeding records</div>
            : breeding.slice().reverse().map((b, i) => (
              <div key={i} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>{b.type || 'Record'}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{b.date}</span>
                </div>
                {b.notes && <div style={{ fontSize: 13, color: 'var(--silverLight)', marginBottom: 4 }}>{b.notes}</div>}
                {b.count != null && <div style={{ fontSize: 11, color: 'var(--muted)' }}>Count: {b.count}</div>}
                {b.added_by && <div style={{ fontSize: 10, color: 'var(--dimmed)', marginTop: 4 }}>By {b.added_by}</div>}
              </div>
            ))
          }
          {renderTabTasks('breeding')}
        </div>
      )}

      {tab === 'enrichment' && (
        <div>
          {enrichment.length === 0
            ? <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No enrichment records</div>
            : enrichment.slice().reverse().map((e, i) => (
              <div key={i} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>{e.type || 'Activity'}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>{e.date}</span>
                </div>
                {e.activity && <div style={{ fontSize: 13, color: 'var(--silverLight)', marginBottom: 4 }}>{e.activity}</div>}
                {e.response && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Response: {e.response}</div>}
                {e.added_by && <div style={{ fontSize: 10, color: 'var(--dimmed)', marginTop: 4 }}>By {e.added_by}</div>}
              </div>
            ))
          }
          {renderTabTasks('enrichment')}
        </div>
      )}

      {tab === 'care' && (() => {
        const animalName = displayName
        const speciesName = animal.species
        const todayStr = todayET()
        const urgColor = { critical: 'var(--redLight)', high: 'var(--redLight)', medium: 'var(--orange)', low: 'var(--green)' }

        // Collect care schedule tasks linked to this animal from the task tree
        // Match by UID prefix: animal.uid "ACK2_0" → species node "species_ACK2"
        const animalUidPrefix = animal.uid ? animal.uid.split('_').slice(0, -1).join('_') : ''
        const speciesNodeId = animalUidPrefix ? 'species_' + animalUidPrefix : ''
        const animalChecklists = []
        const animalTasks = []
        if (taskTree) {
          const careRoot = taskTree.find(n => n.id === 'care_schedule')
          const careZones = careRoot ? (careRoot.children || []).filter(n => n.id?.startsWith('zone_')) : []
          careZones.forEach(zone => {
            ;(zone.children || []).filter(n => n.id?.startsWith('species_')).forEach(species => {
              // Only look at species nodes that match this animal's UID prefix
              if (species.id !== speciesNodeId) return
              ;(species.children || []).filter(c => c.id?.startsWith('chk_')).forEach(chk => {
                // If checklist has an animal field, verify this animal is listed; otherwise include all
                const linkedAnimals = (chk.animal || '').split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
                const isLinked = linkedAnimals.length === 0 || linkedAnimals.includes(animalName.toLowerCase())
                if (isLinked) {
                  animalChecklists.push({ ...chk, _zone: zone.title })
                  ;(chk.children || []).forEach(task => {
                    animalTasks.push({ ...task, _checklistTitle: chk.title, _zone: zone.title, _opens_at: chk.opens_at, _due_by: chk.due_by, _urgency: chk.urgency })
                  })
                }
              })
            })
          })
        }

        const isDoneToday = (t) => {
          if (t.status !== 'done') return false
          if (!t.schedule_days) return true
          return t.updated_at && toETDate(t.updated_at) === todayStr
        }

        // Group tasks by checklist
        const byChecklist = {}
        animalTasks.forEach(t => {
          const key = t._checklistTitle || 'Other'
          if (!byChecklist[key]) byChecklist[key] = []
          byChecklist[key].push(t)
        })
        const checklistNames = Object.keys(byChecklist)

        return (
          <div>
            {/* Assigned Care Tasks */}
            {animalTasks.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Care Tasks ({animalTasks.length})</div>
                {checklistNames.map(chkName => {
                  const tasks = byChecklist[chkName]
                  const doneCount = tasks.filter(isDoneToday).length
                  const total = tasks.length
                  const allDone = total > 0 && doneCount === total
                  const pct = total > 0 ? Math.round(doneCount / total * 100) : 0
                  const first = tasks[0]
                  const timeLabel = first._opens_at ? fmtTime12(first._opens_at.slice(0, 5)) : null
                  const urg = first._urgency

                  return (
                    <div key={chkName} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: allDone ? 'var(--green)' : 'var(--silver)' }}>{chkName}</span>
                        {urg && urg !== 'low' && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: (urgColor[urg] || 'var(--orange)') + '22', color: urgColor[urg] || 'var(--orange)', textTransform: 'uppercase' }}>{urg}</span>}
                        {timeLabel && <span style={{ fontSize: 9, color: 'var(--muted)', background: 'var(--dark4)', padding: '1px 6px', borderRadius: 10 }}>{timeLabel}</span>}
                        <span style={{ fontSize: 10, fontWeight: 600, color: allDone ? 'var(--green)' : 'var(--muted)', marginLeft: 'auto' }}>{doneCount}/{total}</span>
                      </div>
                      {tasks.map(t => {
                        const done = isDoneToday(t)
                        return (
                          <div key={t.id} className="card" style={{ marginBottom: 6, borderLeft: `3px solid ${done ? 'var(--green)' : urgColor[t._urgency] || 'var(--dark4)'}`, opacity: done ? 0.6 : 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${done ? 'var(--green)' : 'var(--dark4)'}`, background: done ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--dimmed)' : 'var(--white)', textDecoration: done ? 'line-through' : 'none', flex: 1 }}>{t.emoji ? `${t.emoji} ` : ''}{t.title}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                              {t.assigned_to && <span style={{ background: 'var(--dark4)', padding: '1px 6px', borderRadius: 10 }}>{t.assigned_to}</span>}
                              {t._zone && <span style={{ background: 'var(--dark4)', padding: '1px 6px', borderRadius: 10 }}>{t._zone}</span>}
                              {done && t.completed_by && <span style={{ color: 'var(--green)' }}>✓ {t.completed_by}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: '12px 0', background: 'var(--dark3)', borderRadius: 10, marginBottom: 16 }}>No care schedule tasks linked to this animal</div>
            )}

            {animalTasks.length === 0 && (
              <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No care records</div>
            )}
          </div>
        )
      })()}

      {/* Task Detail Modal for tab tasks */}
      {taskModalId && (() => {
        const isNew = taskModalId === '__new__'
        const taskObj = isNew
          ? { tags: tab, animal: animalName, status: 'todo', urgency: 'low' }
          : (() => { const found = (tabTasks[tab] || []).find(t => t.id === taskModalId); return found || {} })()
        return (
          <TaskDetailModal
            task={taskObj}
            isNew={isNew}
            taskTree={taskTree}
            animalInventory={storeAnimals}
            animalNotes={storeAnimalNotes}
            animalFamilyOverrides={animalFamilyOverrides}
            onClose={() => setTaskModalId(null)}
            onSave={saveTabTask}
            onDelete={isNew ? undefined : () => deleteTabTask(taskModalId)}
          />
        )
      })()}
    </div>
  )
}

const STATUS_OPTS = ['', 'Healthy', 'Sick', 'Injured', 'Quarantine', 'Deceased', 'Monitoring']
const SEX_OPTS = ['', 'M', 'F', 'Unknown']

const thStyle = { padding: '6px 8px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid var(--dark4)', textTransform: 'uppercase', letterSpacing: 0.5 }
const cellStyle = (editable) => ({ padding: '5px 8px', fontSize: 11, color: editable ? 'var(--white)' : 'var(--muted)', verticalAlign: 'middle', borderBottom: '1px solid var(--dark4)', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 140, textOverflow: 'ellipsis' })
const inputStyle = { width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--white)', fontSize: 11, fontFamily: 'inherit', padding: 0 }

function SheetCell({ value, editable, type, opts, onChange }) {
  const v = value || ''
  if (!editable) return <td style={cellStyle(false)}>{v || '—'}</td>
  if (type === 'select') return (
    <td style={cellStyle(true)}>
      <select value={v} onChange={e => onChange(e.target.value)} className="sheet-input" style={{ ...inputStyle, cursor: 'pointer' }}>
        {opts.map(o => <option key={o} value={o}>{o || '—'}</option>)}
      </select>
    </td>
  )
  if (type === 'date') return (
    <td style={cellStyle(true)}>
      <input type="date" value={v} onChange={e => onChange(e.target.value)} className="sheet-input" style={inputStyle} />
    </td>
  )
  return (
    <td style={cellStyle(true)}>
      <input type="text" defaultValue={v} placeholder="—" className="sheet-input" style={inputStyle} onBlur={e => { if (e.target.value !== v) onChange(e.target.value) }} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} />
    </td>
  )
}

function AnimalSpreadsheet({ animals, animalNotes, update }) {
  const { animalSheetTaxExpanded: taxExp, animalSheetLocExpanded: locExp } = useStore(useShallow(s => ({
    animalSheetTaxExpanded: s.animalSheetTaxExpanded,
    animalSheetLocExpanded: s.animalSheetLocExpanded,
  })))

  function saveField(uid, field, value) {
    const cur = animalNotes[uid] || {}
    const updated = { ...cur, [field]: value }
    update({ animalNotes: { ...animalNotes, [uid]: updated } })
    apiPost({ action: 'updateProfile', uid, status: updated.status, sex: updated.sex, dob: updated.dob, genes: updated.genes, marks: updated.marks, behaviors: updated.behaviors, cage: updated.cage })
  }

  if (animals.length === 0) return <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 20px' }}>No animals match your filters</div>

  const locColor = '#80cbc4'

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 10, border: '1px solid var(--dark4)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: 'var(--dark3)' }}>
            <th style={thStyle}>Name</th>
            {/* Species / Taxonomy group header */}
            {taxExp
              ? <th colSpan={7} style={{ ...thStyle, color: '#42a5f5', cursor: 'pointer' }} onClick={() => update({ animalSheetTaxExpanded: false })}>Taxonomy &#9650;</th>
              : <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => update({ animalSheetTaxExpanded: true })} title="Click to expand taxonomy">Species &#9654;</th>
            }
            {/* Location group header */}
            {locExp
              ? <th colSpan={3} style={{ ...thStyle, color: locColor, cursor: 'pointer' }} onClick={() => update({ animalSheetLocExpanded: false })}>Location &#9650;</th>
              : <th style={{ ...thStyle, cursor: 'pointer' }} onClick={() => update({ animalSheetLocExpanded: true })} title="Click to expand location">Location &#9654;</th>
            }
            <th style={thStyle}>Sex</th>
            <th style={thStyle}>DOB</th>
            <th style={thStyle}>Genetics</th>
            <th style={thStyle}>Marks/ID</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Behaviors</th>
          </tr>
          {/* Sub-headers when expanded */}
          {(taxExp || locExp) && (
            <tr style={{ background: 'var(--dark3)', borderTop: '1px solid rgba(128,203,196,.15)' }}>
              <th style={{ borderBottom: '1px solid var(--dark4)' }} />
              {taxExp
                ? ['Common Name', 'Class', 'Order', 'Family', 'Genus', 'Species', 'Subspecies'].map(l => (
                    <th key={l} style={{ ...thStyle, color: '#42a5f5' }}>{l}</th>
                  ))
                : <th style={{ borderBottom: '1px solid var(--dark4)' }} />
              }
              {locExp
                ? ['Zone', 'Cage', 'Enclosure'].map(l => (
                    <th key={l} style={{ ...thStyle, color: locColor }}>{l}</th>
                  ))
                : <th style={{ borderBottom: '1px solid var(--dark4)' }} />
              }
              {['Sex', 'DOB', 'Genetics', 'Marks/ID', 'Status', 'Behaviors'].map(l => (
                <th key={l} style={{ borderBottom: '1px solid var(--dark4)' }} />
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {animals.map(a => {
            const prof = animalNotes[a.uid] || {}
            const name = prof.name || a.name
            const val = (key) => prof[key] || a[key] || ''

            return (
              <tr key={a.uid} style={{ background: 'var(--dark2)' }} onMouseOver={e => e.currentTarget.style.background = 'var(--dark3)'} onMouseOut={e => e.currentTarget.style.background = 'var(--dark2)'}>
                <td style={{ ...cellStyle(false), cursor: 'pointer', color: 'var(--white)', fontWeight: 600 }} onClick={() => update({ selectedAnimal: a.uid })}>{name}</td>
                {taxExp ? (
                  <>
                    <td style={{ ...cellStyle(false), color: '#42a5f5' }}>{prof.common_name || '—'}</td>
                    <td style={{ ...cellStyle(false), color: '#42a5f5' }}>{prof.tax_class || '—'}</td>
                    <td style={{ ...cellStyle(false), color: '#42a5f5' }}>{prof.tax_order || '—'}</td>
                    <td style={{ ...cellStyle(false), color: '#42a5f5' }}>{prof.family || '—'}</td>
                    <td style={{ ...cellStyle(false), color: '#42a5f5' }}>{prof.tax_genus || '—'}</td>
                    <td style={{ ...cellStyle(false), color: '#42a5f5' }}>{prof.species || a.species || '—'}</td>
                    <td style={{ ...cellStyle(false), color: '#42a5f5' }}>{prof.subspecies || '—'}</td>
                  </>
                ) : (
                  <td style={cellStyle(false)}>{prof.common_name || prof.species || a.species || '—'}</td>
                )}
                {locExp ? (
                  <>
                    <td style={{ ...cellStyle(false), color: locColor }}>{a.zone || '—'}</td>
                    <td style={{ ...cellStyle(false), color: locColor }}>{prof.cage || a.cage_slot || '—'}</td>
                    <td style={{ ...cellStyle(false), color: locColor }}>{a.enclosure_id || '—'}</td>
                  </>
                ) : (
                  <td style={cellStyle(false)}>{a.zone || '—'}</td>
                )}
                <SheetCell value={val('sex')} editable type="select" opts={SEX_OPTS} onChange={v => saveField(a.uid, 'sex', v)} />
                <SheetCell value={val('dob')} editable type="date" onChange={v => saveField(a.uid, 'dob', v)} />
                <SheetCell value={val('genes')} editable onChange={v => saveField(a.uid, 'genes', v)} />
                <SheetCell value={val('marks')} editable onChange={v => saveField(a.uid, 'marks', v)} />
                <SheetCell value={val('status')} editable type="select" opts={STATUS_OPTS} onChange={v => saveField(a.uid, 'status', v)} />
                <SheetCell value={val('behaviors')} editable onChange={v => saveField(a.uid, 'behaviors', v)} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function Animals() {
  const {
    animalInventory, deletedAnimals, animalNotes, animalNameOverrides,
    animalSpeciesOverrides, animalFamilyOverrides, animalTypeOverrides,
    animalSearch, animalZoneF, animalClassF, animalFamilyF, animalSpeciesF,
    selectedAnimal, animalSpreadsheetView, update
  } = useStore(useShallow(s => ({
    animalInventory: s.animalInventory, deletedAnimals: s.deletedAnimals,
    animalNotes: s.animalNotes, animalNameOverrides: s.animalNameOverrides,
    animalSpeciesOverrides: s.animalSpeciesOverrides, animalFamilyOverrides: s.animalFamilyOverrides,
    animalTypeOverrides: s.animalTypeOverrides,
    animalSearch: s.animalSearch, animalZoneF: s.animalZoneF, animalClassF: s.animalClassF,
    animalFamilyF: s.animalFamilyF, animalSpeciesF: s.animalSpeciesF,
    selectedAnimal: s.selectedAnimal, animalSpreadsheetView: s.animalSpreadsheetView,
    update: s.update,
  })))

  const deletedSet = new Set(deletedAnimals || [])
  const allAnimals = (animalInventory || []).filter(a => !deletedSet.has(a.uid))

  // If viewing a profile
  if (selectedAnimal) {
    const animal = allAnimals.find(a => a.uid === selectedAnimal)
    if (!animal) return <div style={{ padding: 20, color: 'var(--muted)' }}>Animal not found</div>
    const profile = animalNotes[animal.uid] || {}
    return <AnimalProfile animal={animal} profile={profile} onBack={() => update({ selectedAnimal: null })} />
  }

  const getFamily  = a => animalFamilyOverrides[a.uid] || ''
  const getSpecies = a => animalSpeciesOverrides[a.uid] || a.species || ''

  // Apply filters
  const filtered = allAnimals.filter(a => {
    if (animalClassF !== 'All' && getAnimalClass(a) !== animalClassF) return false
    if (animalFamilyF !== 'All' && getFamily(a) !== animalFamilyF) return false
    if (animalSpeciesF !== 'All' && getSpecies(a) !== animalSpeciesF) return false
    if (animalZoneF !== 'All' && a.zone !== animalZoneF) return false
    if (animalSearch) {
      const s = animalSearch.toLowerCase()
      const prof = animalNotes[a.uid] || {}
      const haystack = [a.name, animalNameOverrides[a.uid], a.species, a.zone, a.location, getAnimalClass(a), a.sex, a.dob, a.genes, a.marks, prof.status].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(s)
    }
    return true
  })

  // Build filter options
  const allZones = [...new Set(allAnimals.map(a => a.zone).filter(Boolean))].sort()
  const allClasses = [...new Set(allAnimals.map(a => getAnimalClass(a)).filter(Boolean))].sort()

  // Group by class then species
  const groups = {}
  filtered.forEach(a => {
    const cls = getAnimalClass(a)
    const sp = getSpecies(a) || 'Unknown'
    const key = `${cls}__${sp}`
    if (!groups[key]) groups[key] = { cls, sp, animals: [] }
    groups[key].animals.push(a)
  })

  const selectStyle = { padding: '6px 10px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 12, cursor: 'pointer' }

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>Animals</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => update({ animalSpreadsheetView: !animalSpreadsheetView, animalSheetTaxExpanded: false, animalSheetLocExpanded: false })} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: animalSpreadsheetView ? 'rgba(66,165,245,.15)' : 'var(--dark2)',
            border: `1px solid ${animalSpreadsheetView ? '#42a5f5' : 'var(--dark4)'}`,
            color: animalSpreadsheetView ? '#42a5f5' : 'var(--silver)',
          }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{Icons.trendingUp} Spreadsheet</span></button>
          <button onClick={() => update({ page: 'care' })} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ color: 'var(--silver)' }}>{Icons.clipboard}</span> Care Schedule</span></button>
        </div>
      </div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={animalSearch}
          onChange={e => update({ animalSearch: e.target.value })}
          placeholder="Search animals..."
          className="config-input"
          style={{ flex: 1, minWidth: 160, padding: '6px 12px', fontSize: '13px !important' }}
        />
        <select value={animalClassF} onChange={e => update({ animalClassF: e.target.value })} style={selectStyle}>
          <option value="All">All Classes</option>
          {allClasses.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={animalZoneF} onChange={e => update({ animalZoneF: e.target.value })} style={selectStyle}>
          <option value="All">All Zones</option>
          {allZones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </div>

      {/* Animal count */}
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        {filtered.length} of {allAnimals.length} animals
      </div>

      {/* Spreadsheet or Card view */}
      {animalSpreadsheetView
        ? <AnimalSpreadsheet animals={filtered} animalNotes={animalNotes} update={update} />
        : (Object.values(groups).length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 20px' }}>No animals match your filters</div>
          : Object.values(groups).map(({ cls, sp, animals }) => (
            <div key={`${cls}__${sp}`} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {sp} <span style={{ color: 'var(--dimmed)', fontWeight: 400 }}>({cls})</span>
              </div>
              <div className="animal-grid">
                {animals.map(a => (
                  <AnimalCard
                    key={a.uid}
                    animal={a}
                    profile={animalNotes[a.uid] || {}}
                    onClick={() => update({ selectedAnimal: a.uid })}
                  />
                ))}
              </div>
            </div>
          ))
        )
      }
    </div>
  )
}
