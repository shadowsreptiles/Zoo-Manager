import { useState, useRef, useEffect } from 'react'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { db } from '../lib/supabase'
import { apiPost } from '../lib/api'
import { isSupervisor } from '../utils/permissions'
import { todayET, toETDate, nowET } from '../utils/dates'
import { TEAM } from '../constants/team'
import { Icons } from '../components/Icons'

// ── Shared helpers (exported for Home.jsx, TaskLog.jsx) ──────────────────

export function formatTime(t) {
  if (!t) return ''
  const parts = String(t).slice(0, 5).split(':')
  let h = parseInt(parts[0]), m = parseInt(parts[1] || '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

export function countDeep(nodes, taskCompletions) {
  let total = 0, done = 0
  nodes.forEach(n => {
    if (!n.children || n.children.length === 0) { total++; if (taskCompletions[n.id]) done++ }
    const sub = countDeep(n.children || [], taskCompletions)
    total += sub.total; done += sub.done
  })
  return { total, done }
}

export function pill(text, color, bg) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 600, color, background: bg, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

// ── Internal helpers ──────────────────────────────────────────────────────

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

export function findNode(tree, id) {
  for (const t of tree) {
    if (t.id === id) return t
    const found = findNode(t.children || [], id)
    if (found) return found
  }
  return null
}

function findParentOf(tree, id, parent = null) {
  for (const t of tree) {
    if (t.id === id) return parent
    const r = findParentOf(t.children || [], id, t)
    if (r !== undefined) return r
  }
  return undefined
}

function collectIds(task) {
  const ids = [task.id]
  ;(task.children || []).forEach(c => ids.push(...collectIds(c)))
  return ids
}

function isDescOf(task, targetId) {
  for (const c of (task.children || [])) {
    if (c.id === targetId || isDescOf(c, targetId)) return true
  }
  return false
}

const SM = {
  'todo':        { label: 'To Do',       color: 'var(--silver)', bg: 'var(--dark4)' },
  'in-progress': { label: 'In Progress', color: '#42a5f5',       bg: 'rgba(66,165,245,.15)' },
  'done':        { label: 'Done',        color: 'var(--green)',  bg: 'rgba(102,187,106,.15)' },
}

const URG_COLOR = { critical: 'var(--redLight)', high: 'var(--redLight)', medium: 'var(--orange)', low: 'var(--green)' }

// ── Shared styles & components ───────────────────────────────────────────

const FORM_STYLE = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }

function Lbl({ t }) { return <label style={{ display: 'block', fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{t}</label> }

function formatDuration(m) { return m < 60 ? m + 'm' : m % 60 === 0 ? (m / 60) + 'h' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm' }

// ── TaskNode — exported for Home.jsx (read-only view) ────────────────────

export function TaskNode({ node, depth = 0, taskCompletions, userName, onToggle, onAdd, onDelete, onOpenDetail, onCycleStatus, sup, defaultOpen, hideAssignee }) {
  const [open, setOpen] = useState(defaultOpen !== undefined ? defaultOpen : depth < 2)
  const children = node.children || []
  const today = todayET()
  const isDone = !!taskCompletions[node.id]
  const isOverdue = !isDone && node.deadline && node.deadline < today
  let progressBadge = null
  if (children.length > 0) {
    const { total, done } = countDeep(children, taskCompletions)
    if (total > 0) {
      const pct = Math.round(done / total * 100)
      const pc = pct === 100 ? 'var(--green)' : pct > 0 ? '#42a5f5' : 'var(--muted)'
      progressBadge = <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: pc + '18', padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{done}/{total} · {pct}%</span>
    }
  }
  const accentColor = isDone ? 'var(--green)' : isOverdue ? 'var(--red)' : node.color || '#42a5f5'
  const cardBorder = isDone && depth === 0 ? 'rgba(102,187,106,.4)' : isOverdue ? 'rgba(229,57,53,.5)' : depth === 0 ? 'var(--dark4)' : 'rgba(255,255,255,.06)'
  const cardBg = isDone && depth === 0 ? 'rgba(102,187,106,.07)' : isOverdue && depth === 0 ? 'rgba(229,57,53,.05)' : depth === 0 ? 'var(--dark2)' : 'var(--dark3)'
  const indent = depth * 16
  const isAssigned = node.assigned_to?.split(',').map(s => s.trim()).includes(userName)
  const canCheck = children.length === 0 && (isAssigned || sup)
  const sm = SM[node.status] || SM['todo']
  const animals = node.animal ? node.animal.split(',').map(a => a.trim()).filter(Boolean) : []

  return (
    <div style={{ marginLeft: indent, marginBottom: depth === 0 ? 6 : 3 }}>
      <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10, borderLeft: `3px solid ${accentColor}`, paddingLeft: 11, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 14px 10px 11px', opacity: isDone ? 0.55 : 1, transition: 'border .15s,background .15s' }}>
        <div style={{ width: 18, flexShrink: 0, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {children.length > 0
            ? <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={open ? 'Collapse' : 'Expand'} style={{ background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: 22, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }}>{Icons.chevronDown}</button>
            : canCheck
              ? <div onClick={e => { e.stopPropagation(); onToggle(node.id) }} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isDone ? accentColor : 'rgba(255,255,255,.25)'}`, background: isDone ? accentColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s' }}>{isDone && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}</div>
              : null}
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div onClick={() => onOpenDetail && onOpenDetail(node.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', cursor: onOpenDetail ? 'pointer' : 'default' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: isDone ? 'var(--dimmed)' : 'var(--white)', textDecoration: isDone ? 'line-through' : 'none', wordBreak: 'break-word' }}>
              {node.emoji ? `${node.emoji} ` : ''}{node.title}
              {isOverdue && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(229,57,53,.15)', marginLeft: 5 }}>OVERDUE</span>}
            </span>
            {progressBadge}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flexShrink: 1 }}>
          {!hideAssignee && (() => {
            let displayAssignee = node.assigned_to
            if (children.length > 0) {
              const allAssignees = new Set()
              ;(function gatherAssignees(nodes) {
                nodes.forEach(n => {
                  if (n.assigned_to) n.assigned_to.split(',').map(s => s.trim()).filter(Boolean).forEach(a => allAssignees.add(a))
                  gatherAssignees(n.children || [])
                })
              })(children)
              if (node.assigned_to) node.assigned_to.split(',').map(s => s.trim()).filter(Boolean).forEach(a => allAssignees.add(a))
              if (allAssignees.size > 1) displayAssignee = 'Team'
            }
            return displayAssignee ? pill(<><span style={{ display: 'inline-flex', alignItems: 'center' }}>{Icons.user}</span>{' ' + displayAssignee}</>, 'var(--silver)', 'var(--dark4)') : null
          })()}
          {node.location && pill('📍 ' + node.location, '#80cbc4', 'rgba(128,203,196,.12)')}
          {animals.length === 1 && pill('🐾 ' + animals[0], '#ce93d8', 'rgba(206,147,216,.12)')}
          {animals.length > 1 && pill(`🐾 ${animals.length} animals`, '#ce93d8', 'rgba(206,147,216,.12)')}
          {node.duration_min && pill('⏲ ' + formatDuration(node.duration_min), 'var(--muted)', 'var(--dark4)')}
          {node.start_date && pill('▶ ' + node.start_date, 'var(--muted)', 'var(--dark4)')}
          {node.deadline && pill('📅 ' + node.deadline, isOverdue ? '#e53935' : 'var(--muted)', isOverdue ? 'rgba(229,57,53,.15)' : 'var(--dark4)')}
          {node.opens_at && pill('⏰ ' + formatTime(node.opens_at), 'var(--muted)', 'var(--dark4)')}
          {node.tags && node.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
            <span key={t}>{pill('🏷 ' + t, '#90caf9', 'rgba(144,202,249,.12)')}</span>
          ))}
          {node.department && pill(node.department, '#a5d6a7', 'rgba(165,214,167,.12)')}
          {onCycleStatus && <button onClick={e => { e.stopPropagation(); onCycleStatus(node.id) }} style={{ padding: '2px 8px', borderRadius: 20, border: 'none', background: sm.bg, color: sm.color, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{sm.label}</button>}
          {sup && onAdd && <button onClick={e => { e.stopPropagation(); onAdd(node.id) }} aria-label="Add subtask" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>+ Sub</button>}
          {sup && onDelete && <button onClick={e => { e.stopPropagation(); onDelete(node.id) }} aria-label="Delete task" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(229,57,53,.3)', background: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>×</button>}
        </div>
      </div>
      {open && children.length > 0 && (
        <div style={{ marginTop: 3 }}>
          {children.map(child => (
            <TaskNode key={child.id} node={child} depth={depth + 1} taskCompletions={taskCompletions} userName={userName} onToggle={onToggle} onAdd={onAdd} onDelete={onDelete} onOpenDetail={onOpenDetail} onCycleStatus={onCycleStatus} sup={sup} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── TimeSelect ────────────────────────────────────────────────────────────

function TimeSelect({ value, onChange }) {
  const cur = (value || '').slice(0, 5)
  const onSlot = cur && parseInt(cur.split(':')[1]) % 30 === 0
  const opts = [{ val: '', lbl: '— Not set —' }]
  if (cur && !onSlot) {
    const [h, m] = cur.split(':').map(Number)
    opts.push({ val: cur, lbl: new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' (current)' })
  }
  for (let h = 8; h <= 20; h++) {
    for (const m of (h === 20 ? [0] : [0, 30])) {
      const hh = String(h).padStart(2, '0'), mm = String(m).padStart(2, '0')
      opts.push({ val: `${hh}:${mm}`, lbl: new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) })
    }
  }
  return (
    <select value={cur} onChange={e => onChange(e.target.value)} style={{ ...FORM_STYLE, cursor: 'pointer' }}>
      {opts.map(o => <option key={o.val} value={o.val}>{o.lbl}</option>)}
    </select>
  )
}

// ── TaskDetailModal ───────────────────────────────────────────────────────

const CLASS_COMMON = { 'Reptilia': 'Reptiles', 'Amphibia': 'Amphibians', 'Mammalia': 'Mammals', 'Aves': 'Birds', 'Arachnida': 'Arachnids', 'Insecta': 'Insects', 'Diplopoda': 'Myriapods', 'reptile': 'Reptiles', 'snake': 'Reptiles', 'lizard': 'Reptiles', 'tortoise': 'Reptiles', 'turtle': 'Reptiles', 'frog': 'Amphibians' }
const FAMILY_COMMON = { 'Pythonidae': 'Pythons', 'Boidae': 'Boas', 'Colubridae': 'Colubrids', 'Elapidae': 'Elapids', 'Viperidae': 'Vipers', 'Gekkonidae': 'Geckos', 'Eublepharidae': 'Geckos', 'Diplodactylidae': 'Geckos', 'Scincidae': 'Skinks', 'Agamidae': 'Dragons', 'Chamaeleonidae': 'Chameleons', 'Varanidae': 'Monitors', 'Testudinidae': 'Tortoises', 'Emydidae': 'Turtles', 'Geoemydidae': 'Turtles', 'Ceratophryidae': 'Frogs', 'Hylidae': 'Frogs', 'Dendrobatidae': 'Frogs', 'Pyxicephalidae': 'Frogs', 'Iguanidae': 'Iguanas', 'Teiidae': 'Tegus', 'Cacatuidae': 'Cockatoos', 'Phasianidae': 'Fowl', 'Psittacidae': 'Parrots', 'Spirostreptidae': 'Millipedes', 'Blaberidae': 'Roaches', 'Tenebrionidae': 'Beetles', 'Callitrichidae': 'Marmosets', 'Canidae': 'Foxes', 'Cebidae': 'Monkeys', 'Chlamyphoridae': 'Armadillos', 'Leporidae': 'Rabbits', 'Macropodidae': 'Kangaroos', 'Mephitidae': 'Skunks', 'Muridae': 'Rodents', 'Petauridae': 'Gliders' }

export function TaskDetailModal({ task, isNew, taskTree, animalInventory, animalNotes, animalFamilyOverrides, onClose, onSave, onDelete, isBulk, bulkCount }) {
  const today = todayET()
  const [title, setTitle] = useState(task.title || '')
  const [who, setWho] = useState(task.assigned_to || '')
  const [status, setStatus] = useState(task.status || 'todo')
  const [location, setLocation] = useState(task.location || '')
  const [urgency, setUrgency] = useState(task.urgency || 'low')
  const [startDate, setStartDate] = useState(task.start_date || '')
  const [dueDate, setDueDate] = useState(task.deadline || '')
  const [startTime, setStartTime] = useState(task.opens_at || '')
  const [dueTime, setDueTime] = useState(task.due_by || '')
  const [schedDays, setSchedDays] = useState(() => (task.schedule_days || '').split(',').map(s => s.trim()).filter(Boolean))
  const [duration, setDuration] = useState(task.duration_min ? String(task.duration_min) : '')
  const [notes, setNotes] = useState(task.notes || '')
  const [dept, setDept] = useState(task.department || '')
  const [color, setColor] = useState(task.color || '')
  const [selAnimals, setSelAnimals] = useState(() => (task.animal || '').split(',').map(s => s.trim()).filter(Boolean))
  const [tags, setTags] = useState(task.tags || '')
  const [timeOpen, setTimeOpen] = useState(!!(task.start_date || task.deadline || task.opens_at || task.due_by || task.schedule_days))
  const sup = isSupervisor()
  const isOverdue = !isNew && task.deadline && task.deadline < today && task.status !== 'done'
  const parent = isNew ? null : findParentOf(taskTree, task.id, null)
  const subtaskCount = isNew ? 0 : (task.children || []).length
  const totalDesc = isNew ? 0 : collectIds(task).length - 1
  const createdStr = (!isNew && task.created_at) ? new Date(task.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const locationList = [...new Set((animalInventory || []).map(a => a.location || a.loc).filter(Boolean))]
  const allAnimals = [...new Set((animalInventory || []).map(a => a.name))].filter(Boolean).sort()
  const [animalSectionOpen, setAnimalSectionOpen] = useState(selAnimals.length > 0)
  const [openClasses, setOpenClasses] = useState({})
  const [openFamilies, setOpenFamilies] = useState({})
  const [openSpecies, setOpenSpecies] = useState({})

  // Build grouped animal tree: class -> family -> species -> individuals
  const animalTree = (() => {
    const tree = {}
    ;(animalInventory || []).forEach(a => {
      if (!a.name) return
      const prof = (animalNotes || {})[a.uid] || {}
      const speciesName = a.species || 'Unknown'
      const rawClass = prof.tax_class || a.animal_class || ''
      const cls = CLASS_COMMON[rawClass] || (rawClass ? rawClass.charAt(0).toUpperCase() + rawClass.slice(1) + 's' : 'Other')
      const rawFamily = (animalFamilyOverrides || {})[a.uid] || prof.family || ''
      const fam = FAMILY_COMMON[rawFamily] || rawFamily || speciesName
      // Common species = the species field itself (already common names like "Ball Python")
      const sp = speciesName
      const displayName = prof.name || a.name
      if (!tree[cls]) tree[cls] = {}
      if (!tree[cls][fam]) tree[cls][fam] = {}
      if (!tree[cls][fam][sp]) tree[cls][fam][sp] = []
      if (!tree[cls][fam][sp].some(x => x.name === a.name)) {
        tree[cls][fam][sp].push({ name: a.name, displayName })
      }
    })
    // Sort at each level
    for (const cls of Object.keys(tree)) {
      for (const fam of Object.keys(tree[cls])) {
        for (const sp of Object.keys(tree[cls][fam])) {
          tree[cls][fam][sp].sort((a, b) => a.displayName.localeCompare(b.displayName))
        }
      }
    }
    return tree
  })()
  const SWATCHES = [['', '#666', 'None'], ['#e53935', '#e53935', 'Red'], ['#fb8c00', '#fb8c00', 'Orange'], ['#fdd835', '#fdd835', 'Yellow'], ['#43a047', '#43a047', 'Green'], ['#1e88e5', '#1e88e5', 'Blue'], ['#8e24aa', '#8e24aa', 'Purple'], ['#e91e63', '#e91e63', 'Pink'], ['#00897b', '#00897b', 'Teal']]
  const DURS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480]
  const toggleDay = i => { const s = new Set(schedDays.map(Number)); s.has(i) ? s.delete(i) : s.add(i); setSchedDays([...s].map(String)) }
  const toggleAnimal = a => setSelAnimals(p => p.includes(a) ? p.filter(x => x !== a) : [...p, a])

  function handleSave() {
    if (!isNew && !title.trim()) return
    onSave({
      title: title.trim(), assigned_to: who || null, status,
      location: location || null, urgency: urgency || 'low',
      start_date: startDate || null, deadline: dueDate || null,
      opens_at: startTime || null, due_by: dueTime || null,
      schedule_days: schedDays.length > 0 ? schedDays.join(',') : null,
      duration_min: duration ? parseInt(duration) : null,
      notes: notes || null, department: dept || null, color: color || null,
      animal: selAnimals.length > 0 ? selAnimals.join(',') : null,
      tags: tags.trim() || null,
    })
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-label="Task details" onMouseDown={e => e.stopPropagation()} style={{ background: '#1e1e24', border: '1px solid #42a5f5', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.6)' }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '20px 20px 16px', borderBottom: '1px solid var(--dark4)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Lbl t="Task Title" />
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...FORM_STYLE, fontSize: 15, fontWeight: 700 }} placeholder="Task title *" />
          </div>
          <button onClick={onClose} style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer', marginTop: 18 }}>×</button>
        </div>
        {/* Main fields */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderBottom: '1px solid var(--dark4)' }}>
          <div><Lbl t="Who" /><select value={who} onChange={e => setWho(e.target.value)} style={{ ...FORM_STYLE, cursor: 'pointer' }}><option value="">Unassigned</option>{TEAM.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
          <div><Lbl t="Status" /><select value={status} onChange={e => setStatus(e.target.value)} style={{ ...FORM_STYLE, cursor: 'pointer' }}><option value="todo">To Do</option><option value="in-progress">In Progress</option><option value="done">Done</option></select></div>
          <div><Lbl t="Location" /><input list="td-loc" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Garage…" style={FORM_STYLE} /><datalist id="td-loc">{locationList.map(l => <option key={l} value={l} />)}</datalist></div>
          <div><Lbl t="Urgency" /><select value={urgency} onChange={e => setUrgency(e.target.value)} style={{ ...FORM_STYLE, cursor: 'pointer' }}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          {allAnimals.length > 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div onClick={() => setAnimalSectionOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                <Lbl t={`Animals${selAnimals.length > 0 ? ` (${selAnimals.length})` : ''}`} />
                <span style={{ fontSize: 11, color: 'var(--dimmed)' }}>{animalSectionOpen ? '▼' : '▶'}</span>
              </div>
              {/* Selected animals pills */}
              {selAnimals.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, marginBottom: animalSectionOpen ? 8 : 0 }}>
                  {selAnimals.map(a => (
                    <div key={a} onClick={() => toggleAnimal(a)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(206,147,216,.25)', border: '1px solid #ce93d8', color: '#ce93d8' }}>{a} ×</div>
                  ))}
                </div>
              )}
              {/* Grouped dropdown: Class → Family → Species → Individual */}
              {animalSectionOpen && (
                <div style={{ marginTop: 6, border: '1px solid var(--dark4)', borderRadius: 10, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                  {Object.keys(animalTree).sort().map(cls => {
                    const clsOpen = !!openClasses[cls]
                    const families = animalTree[cls]
                    const clsCount = Object.values(families).flatMap(f => Object.values(f).flat()).filter(a => selAnimals.includes(a.name)).length
                    return (
                      <div key={cls}>
                        <div onClick={() => setOpenClasses(p => ({ ...p, [cls]: !p[cls] }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--dark3)', cursor: 'pointer', borderBottom: '1px solid var(--dark4)', userSelect: 'none' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)' }}>{cls}{clsCount > 0 ? ` (${clsCount})` : ''}</span>
                          <span style={{ fontSize: 10, color: 'var(--dimmed)' }}>{clsOpen ? '▲' : '▼'}</span>
                        </div>
                        {clsOpen && Object.keys(families).sort().map(fam => {
                          const famKey = `${cls}__${fam}`
                          const famOpen = !!openFamilies[famKey]
                          const speciesMap = families[fam]
                          const famCount = Object.values(speciesMap).flat().filter(a => selAnimals.includes(a.name)).length
                          return (
                            <div key={famKey}>
                              <div onClick={() => setOpenFamilies(p => ({ ...p, [famKey]: !p[famKey] }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 6px 24px', background: 'var(--dark2)', cursor: 'pointer', borderBottom: '1px solid var(--dark4)', userSelect: 'none' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--silverLight)' }}>{fam}{famCount > 0 ? ` (${famCount})` : ''}</span>
                                <span style={{ fontSize: 10, color: 'var(--dimmed)' }}>{famOpen ? '▲' : '▼'}</span>
                              </div>
                              {famOpen && Object.keys(speciesMap).sort().map(sp => {
                                const spKey = `${famKey}__${sp}`
                                const spOpen = !!openSpecies[spKey]
                                const individuals = speciesMap[sp]
                                const spCount = individuals.filter(a => selAnimals.includes(a.name)).length
                                // If only one individual, show directly without expanding
                                if (individuals.length === 1) {
                                  const a = individuals[0]
                                  const sel = selAnimals.includes(a.name)
                                  return (
                                    <div key={spKey} onClick={() => toggleAnimal(a.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px 5px 40px', background: sel ? 'rgba(206,147,216,.08)' : 'var(--dark)', cursor: 'pointer', borderBottom: '1px solid var(--dark4)' }}>
                                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? '#ce93d8' : 'var(--dark4)'}`, background: sel ? '#ce93d8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {sel && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>&#10003;</span>}
                                      </div>
                                      <span style={{ fontSize: 11, color: sel ? '#ce93d8' : 'var(--silverLight)' }}>{a.displayName}</span>
                                      <span style={{ fontSize: 9, color: 'var(--dimmed)', marginLeft: 'auto' }}>{sp}</span>
                                    </div>
                                  )
                                }
                                return (
                                  <div key={spKey}>
                                    <div onClick={() => setOpenSpecies(p => ({ ...p, [spKey]: !p[spKey] }))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px 5px 40px', background: 'var(--dark)', cursor: 'pointer', borderBottom: '1px solid var(--dark4)', userSelect: 'none' }}>
                                      <span style={{ fontSize: 11, color: 'var(--silver)' }}>{sp}{spCount > 0 ? ` (${spCount})` : ''} <span style={{ fontSize: 9, color: 'var(--dimmed)' }}>— {individuals.length}</span></span>
                                      <span style={{ fontSize: 10, color: 'var(--dimmed)' }}>{spOpen ? '▲' : '▼'}</span>
                                    </div>
                                    {spOpen && individuals.map(a => {
                                      const sel = selAnimals.includes(a.name)
                                      return (
                                        <div key={a.name} onClick={() => toggleAnimal(a.name)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 56px', background: sel ? 'rgba(206,147,216,.08)' : 'var(--black)', cursor: 'pointer', borderBottom: '1px solid var(--dark4)' }}>
                                          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? '#ce93d8' : 'var(--dark4)'}`, background: sel ? '#ce93d8' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {sel && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>&#10003;</span>}
                                          </div>
                                          <span style={{ fontSize: 11, color: sel ? '#ce93d8' : 'var(--silverLight)' }}>{a.displayName}</span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Time section */}
        <div style={{ borderBottom: '1px solid var(--dark4)' }}>
          <div onClick={() => setTimeOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '13px 20px', userSelect: 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)' }}>⏱ Time</span>
            <span style={{ fontSize: 11, color: 'var(--dark4)' }}>{timeOpen ? '▼' : '▶'}</span>
          </div>
          {timeOpen && (
            <div style={{ padding: '4px 20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div><Lbl t="Start Date" /><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={FORM_STYLE} /></div>
                <div><Lbl t="Due Date" /><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...FORM_STYLE, borderColor: isOverdue ? '#e53935' : 'var(--dark4)', color: isOverdue ? '#e53935' : 'var(--white)' }} />{isOverdue && <div style={{ fontSize: 10, color: '#e53935', marginTop: 3 }}>⚠ Overdue</div>}</div>
                <div><Lbl t="Start Time" /><TimeSelect value={startTime} onChange={setStartTime} /></div>
                <div><Lbl t="Due Time" /><TimeSelect value={dueTime} onChange={setDueTime} /></div>
              </div>
              <div>
                <Lbl t="Repeat On" />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
                    const on = schedDays.map(Number).includes(i)
                    return (
                      <div key={d} onClick={() => toggleDay(i)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', background: on ? 'rgba(102,187,106,.12)' : 'var(--dark3)', border: `1px solid ${on ? 'var(--green)' : 'var(--dark4)'}`, borderRadius: 8, padding: '6px 10px', minWidth: 36, textAlign: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: on ? 'var(--green)' : 'var(--silver)' }}>{d}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div><Lbl t="Expected Duration" /><select value={duration} onChange={e => setDuration(e.target.value)} style={{ ...FORM_STYLE, cursor: 'pointer' }}><option value="">— Not set —</option>{DURS.map(m => <option key={m} value={m}>{formatDuration(m)}</option>)}</select></div>
            </div>
          )}
        </div>
        {/* Notes */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--dark4)' }}>
          <Lbl t="Notes" />
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Add notes, context, or links…" style={{ ...FORM_STYLE, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        {/* Supervisor fields */}
        {sup && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--dark4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div><Lbl t="Department" /><select value={dept} onChange={e => setDept(e.target.value)} style={{ ...FORM_STYLE, cursor: 'pointer' }}><option value="">None</option>{['Keeper', 'Construction', 'Customer Service', 'Marketing', 'Finance', 'Operations'].map(d => <option key={d} value={d}>{d}</option>)}</select></div>
              <div>
                <Lbl t="Card Color" />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                  {SWATCHES.map(([val, bg, label]) => (
                    <div key={val} onClick={() => setColor(val)} title={label} style={{ width: 22, height: 22, borderRadius: '50%', background: bg, cursor: 'pointer', flexShrink: 0, outline: color === val ? '2px solid #fff' : 'none', outlineOffset: 2, border: '1px solid rgba(255,255,255,.15)' }} />
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><Lbl t="Tags" /><input value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. care, feeding" style={FORM_STYLE} /></div>
            </div>
          </div>
        )}
        {/* Metadata */}
        {!isNew && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--dark4)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Parent</div><div style={{ fontSize: 12, color: 'var(--silver)' }}>{parent ? parent.title : <span style={{ color: 'var(--dimmed)' }}>Root task</span>}</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Subtasks</div><div style={{ fontSize: 12, color: 'var(--silver)' }}>{subtaskCount} direct · {totalDesc} total</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>Created</div><div style={{ fontSize: 12, color: 'var(--silver)' }}>{createdStr}</div></div>
          </div>
        )}
        {/* Subtask list */}
        {!isNew && subtaskCount > 0 && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--dark4)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Direct Subtasks</div>
            <div style={{ display: 'grid', gap: 4 }}>
              {(task.children || []).map(c => {
                const cc = { todo: 'var(--silver)', 'in-progress': '#42a5f5', done: 'var(--green)' }[c.status] || 'var(--silver)'
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'var(--dark3)' }}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--white)', ...(c.status === 'done' ? { textDecoration: 'line-through', opacity: .6 } : {}) }}>{c.title}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: cc }}>{SM[c.status]?.label || 'To Do'}</span>
                    {c.children?.length > 0 && <span style={{ fontSize: 10, color: 'var(--dimmed)' }}>{c.children.length} sub</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
          {isNew ? <div /> : <button onClick={onDelete} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(229,57,53,.4)', background: 'none', color: '#e53935', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete{totalDesc > 0 ? ` & ${totalDesc} subtasks` : ''}</button>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'none', color: 'var(--silver)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--green)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {isNew ? 'Create Task' : isBulk ? `Save to ${bulkCount} Tasks` : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BulkEditModal ─────────────────────────────────────────────────────────

function BulkEditModal({ ids, onSave, onClose }) {
  const [who, setWho] = useState('')
  const [status, setStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dept, setDept] = useState('')
  function handleSave() {
    const patch = {}
    if (who) patch.assigned_to = who === '__unassigned__' ? null : who
    if (status) patch.status = status
    if (dueDate) patch.deadline = dueDate
    if (startDate) patch.start_date = startDate
    if (dept) patch.department = dept === '__none__' ? null : dept
    onSave(patch)
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1e1e24', border: '1px solid #42a5f5', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,.7)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--dark4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--white)' }}>Edit {ids.length} Task{ids.length > 1 ? 's' : ''}</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Only filled-in fields will be updated.</div></div>
          <button onClick={onClose} style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><Lbl t="Assigned To" /><select value={who} onChange={e => setWho(e.target.value)} style={FORM_STYLE}><option value="">— No change —</option><option value="__unassigned__">Unassigned</option>{TEAM.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select></div>
            <div><Lbl t="Status" /><select value={status} onChange={e => setStatus(e.target.value)} style={FORM_STYLE}><option value="">— No change —</option><option value="todo">To Do</option><option value="in-progress">In Progress</option><option value="done">Done</option></select></div>
            <div><Lbl t="Start Date" /><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={FORM_STYLE} /></div>
            <div><Lbl t="Due Date" /><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={FORM_STYLE} /></div>
          </div>
          <div><Lbl t="Department" /><select value={dept} onChange={e => setDept(e.target.value)} style={FORM_STYLE}><option value="">— No change —</option><option value="__none__">None (clear)</option>{['Keeper', 'Construction', 'Customer Service', 'Marketing', 'Finance', 'Operations'].map(d => <option key={d} value={d}>{d}</option>)}</select></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--dark4)' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'none', color: 'var(--silver)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: '8px 22px', borderRadius: 8, background: '#42a5f5', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Apply to {ids.length} Task{ids.length > 1 ? 's' : ''}</button>
        </div>
      </div>
    </div>
  )
}

// ── BulkMoveModal ─────────────────────────────────────────────────────────

function BulkMoveModal({ ids, tree, onMove, onClose }) {
  const [search, setSearch] = useState('')
  const [selectedTarget, setSelectedTarget] = useState(null)

  // Collect all possible destinations (any node that isn't being moved)
  const movingSet = new Set(ids)
  const destinations = []
  function collect(nodes, depth) {
    nodes.forEach(n => {
      if (movingSet.has(n.id)) return
      destinations.push({ id: n.id, title: n.title, emoji: n.emoji, depth })
      collect(n.children || [], depth + 1)
    })
  }
  collect(tree, 0)

  const q = search.toLowerCase().trim()
  const filtered = q ? destinations.filter(d => (d.title || '').toLowerCase().includes(q)) : destinations

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1e1e24', border: '1px solid #42a5f5', borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.7)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--dark4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--white)' }}>Move {ids.length} Task{ids.length > 1 ? 's' : ''}</div><div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Choose a destination parent</div></div>
          <button onClick={onClose} style={{ padding: '5px 9px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 15, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '10px 20px' }}>
          <input type="text" placeholder="Search destinations..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 10px' }}>
          {/* Root level option */}
          <div
            onClick={() => setSelectedTarget('__root__')}
            style={{
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selectedTarget === '__root__' ? 'rgba(66,165,245,.15)' : 'var(--dark3)',
              border: `1px solid ${selectedTarget === '__root__' ? '#42a5f5' : 'var(--dark4)'}`,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: selectedTarget === '__root__' ? '#42a5f5' : 'var(--silver)' }}>Top Level (no parent)</span>
          </div>
          {filtered.map(d => (
            <div
              key={d.id}
              onClick={() => setSelectedTarget(d.id)}
              style={{
                padding: '8px 12px', paddingLeft: 12 + d.depth * 12, borderRadius: 8, cursor: 'pointer', marginBottom: 4,
                background: selectedTarget === d.id ? 'rgba(66,165,245,.15)' : 'var(--dark3)',
                border: `1px solid ${selectedTarget === d.id ? '#42a5f5' : 'var(--dark4)'}`,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: selectedTarget === d.id ? '#42a5f5' : 'var(--white)' }}>
                {d.emoji ? `${d.emoji} ` : ''}{d.title}
              </span>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 12 }}>No matching destinations</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid var(--dark4)' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'none', color: 'var(--silver)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => { if (selectedTarget) onMove(selectedTarget) }} disabled={!selectedTarget} style={{ padding: '8px 22px', borderRadius: 8, background: selectedTarget ? '#42a5f5' : 'var(--dark4)', border: 'none', color: selectedTarget ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: 700, cursor: selectedTarget ? 'pointer' : 'default' }}>Move {ids.length} Task{ids.length > 1 ? 's' : ''}</button>
        </div>
      </div>
    </div>
  )
}

// ── SelectBar ─────────────────────────────────────────────────────────────

function SelectBar({ selCount, selectedIds, onEdit, onMove, onCancel }) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300, background: '#1a1a22', borderTop: '2px solid #42a5f5', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 -6px 28px rgba(0,0,0,.65)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--white)' }}>{selCount} selected</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Tap cards to select · Hold to start</div>
      </div>
      {selCount > 0 && <button onClick={onMove} style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>↕ Move</button>}
      {selCount > 0 && <button onClick={() => onEdit(selectedIds[0])} style={{ padding: '9px 18px', borderRadius: 9, background: '#42a5f5', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>✎ Edit</button>}
      <button onClick={onCancel} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--dark4)', background: 'none', color: 'var(--silver)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
    </div>
  )
}

// ── StatsBar ──────────────────────────────────────────────────────────────

function StatsBar({ tree }) {
  const today = todayET()
  let cOver = 0, cTodo = 0, cIn = 0, cDone = 0
  ;(function walk(nodes) {
    nodes.forEach(n => {
      if (n.id && n.id.startsWith('task_')) {
        if (n.status === 'done') cDone++
        else if (n.deadline && n.deadline < today && !(n.start_date && n.start_date > today)) cOver++
        else if (n.status === 'in-progress') cIn++
        else cTodo++
      }
      walk(n.children || [])
    })
  })(tree)
  const total = cOver + cTodo + cIn + cDone
  if (!total) return null
  const C = ({ val, label, color }) => (
    <div style={{ flex: 1, background: 'var(--dark2)', border: '1px solid var(--dark4)', borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{val}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      {cOver > 0 && <C val={cOver} label="Overdue" color="var(--red)" />}
      <C val={cTodo} label="To Do" color="var(--silver)" />
      <C val={cIn} label="In Progress" color="#42a5f5" />
      <C val={cDone} label="Done" color="var(--green)" />
    </div>
  )
}

// ── AddTaskForm ───────────────────────────────────────────────────────────

function AddTaskForm({ parentId, parentTask, onSubmit, onCancel }) {
  const [title, setTitle] = useState('')
  const [who, setWho] = useState(parentTask?.assigned_to?.split(',')[0]?.trim() || '')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState('todo')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const sel = { width: '100%', padding: '6px 8px', borderRadius: 6, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 12, outline: 'none' }
  function handleSubmit() {
    if (!title.trim()) { inputRef.current?.focus(); return }
    onSubmit({ title: title.trim(), assigned_to: who || null, start_date: startDate || null, deadline: dueDate || null, status })
  }
  return (
    <div style={{ margin: `6px 0 6px ${parentId ? '24px' : '0'}`, padding: '14px 16px 14px 13px', background: 'var(--dark3)', border: '1px solid var(--dark4)', borderLeft: '3px solid #42a5f5', borderRadius: 10, display: 'grid', gap: 8 }}>
      <input ref={inputRef} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} placeholder="What needs to be done? *" style={{ width: '100%', padding: '7px 10px', borderRadius: 7, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 13, outline: 'none' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        {[
          ['Who', <select key="who" value={who} onChange={e => setWho(e.target.value)} style={sel}><option value="">Unassigned</option>{TEAM.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}</select>],
          ['Start', <input key="start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={sel} />],
          ['Due', <input key="due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={sel} />],
          ['Status', <select key="status" value={status} onChange={e => setStatus(e.target.value)} style={sel}><option value="todo">To Do</option><option value="in-progress">In Progress</option><option value="done">Done</option></select>],
        ].map(([label, el]) => (
          <div key={label}><div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>{el}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSubmit} style={{ padding: '6px 18px', borderRadius: 7, background: 'var(--green)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
        <button onClick={onCancel} style={{ padding: '6px 12px', borderRadius: 7, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}

// ── EnclosureCard (chk_ nodes) ────────────────────────────────────────────

function EnclosureCard({ task, depth, canEdit, selectMode, selectedIds, taskOpenIds, onToggleOpen, onOpenDetail, onDelete, onAddChild, onSelectToggle, getDragProps, renderNode }) {
  const today = todayET()
  const isSelected = selectMode && selectedIds.includes(task.id)
  const children = task.children || []
  const isOpen = !!(taskOpenIds[task.id])
  const isOverdue = !!(task.deadline && task.deadline < today && task.status !== 'done')
  const etNow = nowET()
  const opensLater = !!(task.opens_at && (() => { const [h, m] = task.opens_at.split(':').map(Number); return etNow.hours < h || (etNow.hours === h && etNow.minutes < m) })())
  const isLocked = opensLater && !isSupervisor()
  const chkDone = children.filter(t => t.status === 'done' && (!t.schedule_days && !t.reset_daily || (t.updated_at && toETDate(t.updated_at) === today))).length
  const allDone = children.length > 0 && chkDone === children.length
  const pct = children.length > 0 ? Math.round(chkDone / children.length * 100) : 0
  const pctColor = pct === 100 ? 'var(--green)' : pct > 0 ? '#42a5f5' : 'var(--muted)'
  const urgTag = task.urgency && task.urgency !== 'low'
    ? <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: (URG_COLOR[task.urgency] || '#FF9800') + '22', color: URG_COLOR[task.urgency] || '#FF9800', textTransform: 'uppercase', marginLeft: 5 }}>{task.urgency.toUpperCase()}</span>
    : null
  const animalNames = (task.animal || '').split(',').map(s => s.trim()).filter(Boolean)
  const sublabel = [task.location, animalNames.slice(0, 3).join(', ')].filter(Boolean).join(' · ')
  const cardBorder = isSelected ? '#42a5f5' : allDone ? 'var(--green)' : isOverdue ? 'rgba(229,57,53,.8)' : 'var(--dark4)'
  const cardBg = isSelected ? 'rgba(66,165,245,.1)' : allDone ? 'rgba(76,175,80,.07)' : isOverdue ? 'rgba(229,57,53,.05)' : 'var(--dark2)'
  const dragProps = canEdit && !selectMode && !isLocked ? getDragProps(task.id) : {}

  return (
    <div
      id={`tm_row_${task.id}`}
      draggable={canEdit && !selectMode && !isLocked}
      {...dragProps}
      onClick={selectMode ? () => onSelectToggle(task.id) : undefined}
      style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 14, marginBottom: 8, overflow: 'hidden', opacity: isLocked ? 0.55 : 1, transition: 'border-color .4s,background .4s', cursor: selectMode ? 'pointer' : undefined, userSelect: selectMode ? 'none' : undefined }}
    >
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: isLocked ? 'default' : 'pointer' }}
        onClick={!isLocked && !selectMode ? () => onToggleOpen(task.id) : undefined}
      >
        {selectMode
          ? <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? '#42a5f5' : 'rgba(255,255,255,.25)'}`, background: isSelected ? '#42a5f5' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{isSelected && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}</div>
          : canEdit && !isLocked && <div draggable={false} style={{ cursor: 'grab', color: 'var(--dark4)', fontSize: 14, flexShrink: 0, userSelect: 'none', letterSpacing: -2 }} onMouseEnter={e => e.currentTarget.style.color = 'var(--silver)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--dark4)'}>⋮⋮</div>
        }
        <span style={{ fontSize: 24 }}>{task.emoji || '🐾'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div onClick={canEdit && !selectMode ? e => { e.stopPropagation(); onOpenDetail(task.id) } : undefined} style={{ fontWeight: 700, fontSize: 14, color: 'var(--white)', cursor: canEdit && !selectMode ? 'pointer' : 'default' }}>{task.title}{urgTag}</div>
          {sublabel && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{sublabel}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
          {children.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: pctColor, background: pctColor + '18', padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>{chkDone}/{children.length} · {pct}%</span>}
          {canEdit && !selectMode && <button onClick={e => { e.stopPropagation(); onAddChild(task.id) }} aria-label="Add subtask" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>+ Sub</button>}
          {canEdit && !selectMode && <button onClick={e => { e.stopPropagation(); onDelete(task.id) }} aria-label="Delete task" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(229,57,53,.3)', background: 'none', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>×</button>}
          {allDone && <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg></div>}
          {isLocked && <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, flexShrink: 0 }}>UPCOMING</span>}
          {!isLocked && !selectMode && <button aria-expanded={isOpen} aria-label={isOpen ? 'Collapse' : 'Expand'} style={{ background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }} onClick={e => { e.stopPropagation(); onToggleOpen(task.id) }}>{Icons.chevronDown}</button>}
        </div>
      </div>
      {isOpen && children.length > 0 && (
        <div style={{ borderTop: '1px solid var(--dark3)', padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {children.map(c => renderNode(c, depth + 1, canEdit))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TaskCard (standard task_ / tsk_ nodes) ────────────────────────────────

function TaskCard({ task, depth, canEdit, selectMode, selectedIds, taskOpenIds, taskAddingTo, onToggleOpen, onCheckToggle, onOpenDetail, onCycleStatus, onDelete, onAddChild, onCancelForm, onSubmitForm, onSelectToggle, getDragProps, renderNode }) {
  const today = todayET()
  const isOpen = !!(taskOpenIds[task.id])
  const isSelected = selectMode && selectedIds.includes(task.id)
  const isAddingHere = taskAddingTo === task.id
  const children = task.children || []
  const hasChildren = children.length > 0
  const isDone = task.status === 'done' && (!task.schedule_days && !task.reset_daily || (task.updated_at && toETDate(task.updated_at) === today))
  const etTime = nowET()
  const isOverdue = !isDone && (() => {
    if (task.start_date && task.start_date > today) return false
    if (task.deadline && task.deadline < today) return true
    if (task.due_by) { const [h, m] = task.due_by.split(':').map(Number); return etTime.hours > h || (etTime.hours === h && etTime.minutes > m) }
    return false
  })()
  const opensLater = !isDone && task.opens_at && (() => { const [h, m] = task.opens_at.split(':').map(Number); return etTime.hours < h || (etTime.hours === h && etTime.minutes < m) })()
  const sm = SM[task.status] || SM['todo']
  const animals = task.animal ? task.animal.split(',').map(a => a.trim()).filter(Boolean) : []

  let progressBadge = null
  if (hasChildren) {
    let tot = 0, dn = 0
    ;(function cp(nodes) { nodes.forEach(n => { tot++; if (n.status === 'done') dn++; cp(n.children || []) }) })(children)
    if (tot > 0) {
      const pct = Math.round(dn / tot * 100)
      const pc = pct === 100 ? 'var(--green)' : pct > 0 ? '#42a5f5' : 'var(--muted)'
      progressBadge = <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: pc + '18', padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{dn}/{tot} · {pct}%</span>
    }
  }

  const cardBorder = isSelected ? '#42a5f5' : isDone && depth === 0 ? 'rgba(102,187,106,.4)' : isOverdue ? 'rgba(229,57,53,.5)' : depth === 0 ? 'var(--dark4)' : 'rgba(255,255,255,.06)'
  const cardBg = isSelected ? 'rgba(66,165,245,.1)' : isDone && depth === 0 ? 'rgba(102,187,106,.07)' : isOverdue && depth === 0 ? 'rgba(229,57,53,.05)' : depth === 0 ? 'var(--dark2)' : 'var(--dark3)'
  const accentColor = isSelected ? '#42a5f5' : isDone ? 'var(--green)' : isOverdue ? 'var(--red)' : task.color || '#42a5f5'
  const checkColor = isSelected ? '#42a5f5' : isDone ? 'var(--green)' : isOverdue ? 'var(--red)' : task.color || '#42a5f5'
  const dragProps = canEdit && !selectMode ? getDragProps(task.id) : {}

  return (
    <div style={{ marginBottom: depth === 0 ? 8 : 0 }}>
      <div
        id={`tm_row_${task.id}`}
        draggable={canEdit && !selectMode}
        {...dragProps}
        onClick={selectMode ? () => onSelectToggle(task.id) : undefined}
        style={{ background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: 10, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderLeft: `3px solid ${accentColor}`, paddingLeft: 11, opacity: isDone && !isSelected ? 0.55 : opensLater && !isSelected ? 0.5 : 1, transition: 'border .15s,background .15s', cursor: selectMode ? 'pointer' : undefined, userSelect: selectMode ? 'none' : undefined }}
      >
        {/* Select box or drag handle */}
        {selectMode
          ? <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? '#42a5f5' : 'rgba(255,255,255,.25)'}`, background: isSelected ? '#42a5f5' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{isSelected && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}</div>
          : canEdit && <div draggable={false} style={{ cursor: 'grab', color: 'var(--dark4)', fontSize: 14, letterSpacing: -2, flexShrink: 0, padding: '0 2px', userSelect: 'none', display: 'flex', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--silver)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--dark4)'}>⋮⋮</div>
        }
        {/* Expand / check */}
        <div style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!selectMode && (hasChildren
            ? <button onClick={e => { e.stopPropagation(); onToggleOpen(task.id) }} aria-expanded={isOpen} aria-label={isOpen ? 'Collapse' : 'Expand'} style={{ background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: 22, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s' }}>{Icons.chevronDown}</button>
            : <div onClick={e => { e.stopPropagation(); onCheckToggle(task.id) }} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checkColor}`, background: isDone ? checkColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all .15s' }}>{isDone && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 700 }}>✓</span>}</div>
          )}
        </div>
        {/* Title */}
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          {selectMode
            ? <span style={{ fontSize: 13, fontWeight: 600, color: isDone ? 'var(--dimmed)' : 'var(--white)', textDecoration: isDone ? 'line-through' : undefined, overflowWrap: 'anywhere' }}>{task.title}{isOverdue && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(229,57,53,.15)', marginLeft: 5 }}>OVERDUE</span>}</span>
            : <div onClick={() => onOpenDetail(task.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', cursor: 'pointer' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', wordBreak: 'break-word' }}>{task.title}{isOverdue && <span style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(229,57,53,.15)', marginLeft: 5 }}>OVERDUE</span>}</span>
              {progressBadge}
            </div>
          }
        </div>
        {/* Pills + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', flexShrink: 1 }}>
          {opensLater && pill(`⏰ Opens ${formatTime(task.opens_at)}`, 'var(--muted)', 'var(--dark4)')}
          {task.assigned_to && pill(<><span style={{ display: 'inline-flex', alignItems: 'center' }}>{Icons.user}</span>{' ' + task.assigned_to}</>, 'var(--silver)', 'var(--dark4)')}
          {task.location && pill('📍 ' + task.location, '#80cbc4', 'rgba(128,203,196,.12)')}
          {animals.length === 1 && pill('🐾 ' + animals[0], '#ce93d8', 'rgba(206,147,216,.12)')}
          {animals.length > 1 && pill(`🐾 ${animals.length} animals`, '#ce93d8', 'rgba(206,147,216,.12)')}
          {task.duration_min && pill('⏲ ' + formatDuration(task.duration_min), 'var(--muted)', 'var(--dark4)')}
          {task.start_date && pill('▶ ' + task.start_date, 'var(--muted)', 'var(--dark4)')}
          {task.deadline && pill('📅 ' + task.deadline, isOverdue ? '#e53935' : 'var(--muted)', isOverdue ? 'rgba(229,57,53,.15)' : 'var(--dark4)')}
          {!selectMode && <button onClick={e => { e.stopPropagation(); onCycleStatus(task.id) }} style={{ padding: '2px 8px', borderRadius: 20, border: 'none', background: sm.bg, color: sm.color, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.3px', textTransform: 'uppercase' }}>{sm.label}</button>}
          {!selectMode && canEdit && <button onClick={e => { e.stopPropagation(); onAddChild(task.id) }} aria-label="Add subtask" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>+ Sub</button>}
          {!selectMode && canEdit && <button onClick={e => { e.stopPropagation(); onDelete(task.id) }} aria-label="Delete task" style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(229,57,53,.3)', background: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>×</button>}
        </div>
      </div>
      {isAddingHere && <AddTaskForm parentId={task.id} parentTask={task} onSubmit={d => onSubmitForm(task.id, d)} onCancel={onCancelForm} />}
      {(isOpen || isAddingHere) && hasChildren && (
        <div style={{ marginLeft: 16, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {children.map(c => renderNode(c, depth + 1, canEdit))}
        </div>
      )}
    </div>
  )
}

// ── TaskManager (default export) ──────────────────────────────────────────

export default function TaskManager() {
  const { taskTree, animalInventory, animalNotes, animalFamilyOverrides, userName, taskCompletions, update } = useStore(useShallow(s => ({
    taskTree: s.taskTree,
    animalInventory: s.animalInventory,
    animalNotes: s.animalNotes || {},
    animalFamilyOverrides: s.animalFamilyOverrides || {},
    userName: s.userName,
    taskCompletions: s.taskCompletions,
    update: s.update,
  })))
  const sup = isSupervisor()
  const tree = taskTree || []

  // ── Local UI state ──────────────────────────────────────────────────────
  const [taskOpenIds, setTaskOpenIds] = useState({})
  const [taskDetailId, setTaskDetailId] = useState(null)
  const [creatingParent, setCreatingParent] = useState(null)
  const [taskAddingTo, setTaskAddingTo] = useState(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false)

  // ── Drag refs ───────────────────────────────────────────────────────────
  const dragIdRef = useRef(null)
  const dropIdRef = useRef(null)
  const dropPosRef = useRef(null)
  const dragYRef = useRef(0)
  const scrollRAF = useRef(null)
  const selectTimer = useRef(null)
  const selectDeepTimer = useRef(null)

  useEffect(() => {
    const h = e => { dragYRef.current = e.clientY }
    document.addEventListener('dragover', h)
    return () => document.removeEventListener('dragover', h)
  }, [])

  // ── Helpers ─────────────────────────────────────────────────────────────
  function mutate(fn) {
    const cloned = JSON.parse(JSON.stringify(tree))
    fn(cloned)
    // Also update taskNodes so apiGet delta merges don't revert optimistic changes
    const flat = []
    const flatten = nodes => nodes.forEach(n => { const { children, ...rest } = n; flat.push(rest); if (children) flatten(children) })
    flatten(cloned)
    update({ taskTree: cloned, taskNodes: flat })
    return cloned
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  function toggleOpen(id) { setTaskOpenIds(p => ({ ...p, [id]: !p[id] })) }

  async function checkToggle(id) {
    const task = findNode(tree, id)
    if (!task || !task.title) return
    const et = todayET()
    const wasDone = task.status === 'done' && (!task.schedule_days && !task.reset_daily || (task.updated_at && toETDate(task.updated_at) === et))
    const next = wasDone ? 'todo' : 'done'
    const now = new Date().toISOString()
    mutate(c => {
      const t = findNode(c, id)
      if (!t) return
      t.status = next; t.updated_at = now
      t.completed_by = next === 'done' ? userName : null
      if (next === 'todo') { t.unchecked_by = userName; t.unchecked_at = now } else { t.unchecked_by = null; t.unchecked_at = null }
    })
    // Keep taskCompletions in sync so Home page reflects the change immediately
    const updatedCompletions = { ...taskCompletions }
    if (next === 'done') {
      updatedCompletions[id] = { by: userName, at: now }
    } else {
      delete updatedCompletions[id]
    }
    update({ taskCompletions: updatedCompletions })
    try {
      await Promise.all([
        db.from('task_nodes').upsert({ id, parent_id: task.parent_id || null, title: task.title, node_type: task.node_type || 'task', sort_order: task.sort_order || 0, reset_daily: task.reset_daily || false, status: next, updated_at: now, completed_by: next === 'done' ? userName : null, unchecked_by: next === 'todo' ? userName : null, unchecked_at: next === 'todo' ? now : null }, { onConflict: 'id' }),
        apiPost({ action: 'toggleTaskCompletion', taskId: id, date: et, completedBy: userName, completedAt: now, undo: next === 'todo' }),
      ])
      await autoCompleteParents(id)
    } catch (err) { console.error('Failed to save task toggle:', err) }
  }

  async function autoCompleteParents(childId) {
    const currentTree = useStore.getState().taskTree || []
    const parent = findParentOf(currentTree, childId, null)
    if (!parent) return
    const kids = parent.children || []
    if (!kids.length) return
    const allDone = kids.every(c => c.status === 'done')
    const anyDone = kids.some(c => c.status === 'done')
    const next = allDone ? 'done' : anyDone ? 'in-progress' : 'todo'
    if (parent.status === next) return
    mutate(c => { const p = findNode(c, parent.id); if (p) p.status = next })
    await db.from('task_nodes').update({ status: next, updated_at: new Date().toISOString() }).eq('id', parent.id)
    await autoCompleteParents(parent.id)
  }

  async function cycleStatus(id) {
    const cycle = { todo: 'in-progress', 'in-progress': 'done', done: 'todo' }
    const task = findNode(tree, id)
    if (!task) return
    const next = cycle[task.status] || 'todo'
    mutate(c => { const t = findNode(c, id); if (t) t.status = next })
    try {
      await db.from('task_nodes').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id)
      await autoCompleteParents(id)
    } catch (err) { console.error('Failed to cycle status:', err) }
  }

  function openDetail(id) { setTaskDetailId(id) }
  function closeDetail() { setTaskDetailId(null); setCreatingParent(null) }
  function openNewTask(parentId) { setCreatingParent(parentId || null); setTaskDetailId('__new__') }

  async function saveDetail(patch) {
    const now = new Date().toISOString()
    try {
      if (taskDetailId === '__new__') {
        const pId = creatingParent || null
        const siblings = pId ? ((findNode(tree, pId) || {}).children || []) : tree
        const sortOrder = pId ? siblings.length : (siblings.length > 0 ? Math.min(...siblings.map(s => s.sort_order ?? 0)) - 1 : -1)
        const newId = 'task_' + genId()
        const row = { id: newId, parent_id: pId, node_type: 'task', sort_order: sortOrder, reset_daily: false, created_at: now, updated_at: now, ...patch }
        const newNode = { ...row, children: [] }
        mutate(c => {
          if (!pId) c.unshift(newNode)
          else { const p = findNode(c, pId); if (p) { p.children = p.children || []; p.children.push(newNode) } }
        })
        if (pId) setTaskOpenIds(p => ({ ...p, [pId]: true }))
        closeDetail()
        await db.from('task_nodes').insert(row)
      } else if (selectMode && selectedIds.length > 1) {
        const { title: _t, ...bulkPatch } = patch
        bulkPatch.updated_at = now
        const idsToUpdate = [...selectedIds]
        mutate(c => { idsToUpdate.forEach(bid => { const t = findNode(c, bid); if (t) Object.assign(t, bulkPatch) }) })
        setTaskDetailId(null); setSelectMode(false); setSelectedIds([])
        await db.from('task_nodes').update(bulkPatch).in('id', idsToUpdate)
      } else {
        const full = { ...patch, updated_at: now }
        mutate(c => { const t = findNode(c, taskDetailId); if (t) Object.assign(t, full) })
        closeDetail()
        await db.from('task_nodes').update(full).eq('id', taskDetailId)
      }
    } catch (err) { console.error('Failed to save task detail:', err) }
  }

  async function deleteTask(id) {
    const task = findNode(tree, id)
    if (!task) return
    const ids = collectIds(task)
    mutate(c => {
      function rem(nodes) { const i = nodes.findIndex(n => n.id === id); if (i !== -1) { nodes.splice(i, 1); return true }; for (const n of nodes) { if (rem(n.children || [])) return true }; return false }
      rem(c)
    })
    if (taskDetailId === id) closeDetail()
    try {
      const { data } = await db.from('task_nodes').select('*').in('id', ids)
      if (data?.length > 0) {
        await db.from('archive').insert(data.map(d => ({ original_id: d.id, table_name: 'task_nodes', data_json: d, deleted_by: userName, deleted_at: new Date().toISOString() })))
      }
      await db.from('task_nodes').delete().in('id', ids)
    } catch (err) { console.error('Failed to delete task:', err) }
  }

  async function submitAddForm(parentId, data) {
    const now = new Date().toISOString()
    const pId = parentId || null
    const siblings = pId ? ((findNode(tree, pId) || {}).children || []) : tree
    const sortOrder = pId ? siblings.length : (siblings.length > 0 ? Math.min(...siblings.map(s => s.sort_order ?? 0)) - 1 : -1)
    const newId = 'task_' + genId()
    const row = { id: newId, parent_id: pId, node_type: 'task', sort_order: sortOrder, reset_daily: false, created_at: now, updated_at: now, ...data }
    const newNode = { ...row, children: [] }
    mutate(c => {
      if (!pId) c.unshift(newNode)
      else { const p = findNode(c, pId); if (p) { p.children = p.children || []; p.children.push(newNode) } }
    })
    if (pId) setTaskOpenIds(p => ({ ...p, [pId]: true }))
    setTaskAddingTo(null)
    try { await db.from('task_nodes').insert(row) }
    catch (err) { console.error('Failed to add task:', err) }
  }

  async function saveBulkEdit(patch) {
    const now = new Date().toISOString()
    const full = { ...patch, updated_at: now }
    const idsToUpdate = [...selectedIds]
    mutate(c => { idsToUpdate.forEach(id => { const t = findNode(c, id); if (t) Object.assign(t, full) }) })
    setBulkEditOpen(false); setSelectMode(false); setSelectedIds([])
    try { await db.from('task_nodes').update(full).in('id', idsToUpdate) }
    catch (err) { console.error('Failed to bulk edit tasks:', err) }
  }

  async function bulkMove(targetId) {
    const now = new Date().toISOString()
    const idsToMove = [...selectedIds]
    const newParentId = targetId === '__root__' ? null : targetId

    mutate(c => {
      // Extract all selected nodes
      const extracted = []
      function extract(nodes) {
        for (let i = nodes.length - 1; i >= 0; i--) {
          if (idsToMove.includes(nodes[i].id)) {
            extracted.push(nodes.splice(i, 1)[0])
          } else {
            extract(nodes[i].children || [])
          }
        }
      }
      extract(c)

      // Insert into destination
      if (!newParentId) {
        extracted.forEach(n => { n.parent_id = null; c.push(n) })
      } else {
        const dest = findNode(c, newParentId)
        if (dest) {
          dest.children = dest.children || []
          extracted.forEach(n => { n.parent_id = newParentId; dest.children.push(n) })
        }
      }

      // Reorder
      function reorder(nodes) { nodes.forEach((n, i) => { n.sort_order = i }); nodes.forEach(n => reorder(n.children || [])) }
      reorder(c)
    })

    setBulkMoveOpen(false); setSelectMode(false); setSelectedIds([])
    if (newParentId) setTaskOpenIds(p => ({ ...p, [newParentId]: true }))

    try {
      const updates = idsToMove.map(id => ({ id, parent_id: newParentId, updated_at: now }))
      for (const u of updates) {
        await db.from('task_nodes').update({ parent_id: u.parent_id, updated_at: u.updated_at }).eq('id', u.id)
      }
    } catch (err) { console.error('Failed to bulk move tasks:', err) }
  }

  // ── Long press (select mode) ────────────────────────────────────────────
  function startLongPress(id) {
    selectTimer.current = setTimeout(() => {
      selectTimer.current = null
      setSelectMode(true)
      setSelectedIds(p => [...new Set([...p, id])])
      selectDeepTimer.current = setTimeout(() => {
        selectDeepTimer.current = null
        const task = findNode(tree, id)
        if (task) setSelectedIds(p => [...new Set([...p, ...collectIds(task)])])
      }, 400)
    }, 600)
  }
  function endLongPress() {
    if (selectTimer.current) { clearTimeout(selectTimer.current); selectTimer.current = null }
    if (selectDeepTimer.current) { clearTimeout(selectDeepTimer.current); selectDeepTimer.current = null }
  }
  function toggleSelect(id) { setSelectedIds(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return [...s] }) }
  function exitSelectMode() { setSelectMode(false); setSelectedIds([]); setBulkEditOpen(false); setBulkMoveOpen(false) }

  // ── Drag & drop ─────────────────────────────────────────────────────────
  function clearDragInd() {
    document.querySelectorAll('[data-drag-ind]').forEach(el => { el.style.borderTop = ''; el.style.borderBottom = ''; el.style.outline = ''; el.removeAttribute('data-drag-ind') })
  }
  function showDragInd(id, pos) {
    const el = document.getElementById(`tm_row_${id}`)
    if (!el) return
    el.setAttribute('data-drag-ind', pos)
    if (pos === 'onto') el.style.outline = '2px solid #42a5f5'
    else if (pos === 'above') el.style.borderTop = '2px solid #42a5f5'
    else el.style.borderBottom = '2px solid #42a5f5'
  }
  function scrollLoop() {
    if (!dragIdRef.current) return
    const vh = window.innerHeight, y = dragYRef.current, z = 80, mx = 14
    if (y < z) window.scrollBy(0, -Math.round((z - y) / z * mx))
    else if (y > vh - z) window.scrollBy(0, Math.round((y - (vh - z)) / z * mx))
    scrollRAF.current = requestAnimationFrame(scrollLoop)
  }

  function getDragProps(id) {
    return {
      onDragStart: e => {
        endLongPress()
        dragIdRef.current = id
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        setTimeout(() => { const el = document.getElementById(`tm_row_${id}`); if (el) el.style.opacity = '0.35' }, 0)
        scrollRAF.current = requestAnimationFrame(scrollLoop)
      },
      onDragEnd: () => {
        dragIdRef.current = null; dropIdRef.current = null; dropPosRef.current = null
        clearDragInd()
        const el = document.getElementById(`tm_row_${id}`); if (el) el.style.opacity = ''
        if (scrollRAF.current) { cancelAnimationFrame(scrollRAF.current); scrollRAF.current = null }
      },
      onDragOver: e => {
        e.preventDefault()
        if (!dragIdRef.current || dragIdRef.current === id) return
        const dragTask = findNode(tree, dragIdRef.current)
        if (dragTask && isDescOf(dragTask, id)) return
        const el = document.getElementById(`tm_row_${id}`); if (!el) return
        const rect = el.getBoundingClientRect()
        const pct = (e.clientY - rect.top) / rect.height
        const pos = pct < 0.28 ? 'above' : pct > 0.72 ? 'below' : 'onto'
        if (dropIdRef.current !== id || dropPosRef.current !== pos) { clearDragInd(); dropIdRef.current = id; dropPosRef.current = pos; showDragInd(id, pos) }
        e.dataTransfer.dropEffect = 'move'
      },
      onDragLeave: e => {
        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget)) {
          if (dropIdRef.current === id) { clearDragInd(); dropIdRef.current = null; dropPosRef.current = null }
        }
      },
      onDrop: e => {
        e.preventDefault()
        const dId = dragIdRef.current || e.dataTransfer.getData('text/plain')
        const pos = dropPosRef.current || 'below'
        clearDragInd(); dropIdRef.current = null; dropPosRef.current = null
        if (!dId || dId === id) return
        performMove(dId, id, pos)
      },
      onMouseDown: () => startLongPress(id),
      onMouseUp: endLongPress,
      onMouseLeave: endLongPress,
    }
  }

  async function performMove(dId, targetId, pos) {
    const dragTask = findNode(tree, dId)
    if (!dragTask || isDescOf(dragTask, targetId)) return
    let moved = null
    const newTree = JSON.parse(JSON.stringify(tree))
    function extract(nodes) { const i = nodes.findIndex(n => n.id === dId); if (i !== -1) { [moved] = nodes.splice(i, 1); return true }; for (const n of nodes) { if (extract(n.children || [])) return true }; return false }
    extract(newTree)
    if (!moved) return
    function ins(nodes, par) {
      const i = nodes.findIndex(n => n.id === targetId)
      if (i !== -1) {
        if (pos === 'onto') { nodes[i].children = nodes[i].children || []; nodes[i].children.push(moved); moved.parent_id = targetId; setTaskOpenIds(p => ({ ...p, [targetId]: true })) }
        else if (pos === 'above') { nodes.splice(i, 0, moved); moved.parent_id = par ? par.id : null }
        else { nodes.splice(i + 1, 0, moved); moved.parent_id = par ? par.id : null }
        return true
      }
      for (const n of nodes) { if (ins(n.children || [], n)) return true }
      return false
    }
    ins(newTree, null)
    function reorder(nodes) { nodes.forEach((n, i) => { n.sort_order = i }); nodes.forEach(n => reorder(n.children || [])) }
    reorder(newTree)
    update({ taskTree: newTree })
    try {
      await db.from('task_nodes').update({ parent_id: moved.parent_id || null, sort_order: moved.sort_order, updated_at: new Date().toISOString() }).eq('id', dId)
      function getSibs(nodes, id) { if (nodes.some(n => n.id === id)) return nodes; for (const n of nodes) { const r = getSibs(n.children || [], id); if (r) return r }; return null }
      const sibs = getSibs(newTree, dId) || []
      if (sibs.length > 1) {
        const ups = sibs.filter(n => n.title).map(n => ({ id: n.id, parent_id: n.parent_id || null, sort_order: n.sort_order, title: n.title, node_type: n.node_type || 'task', status: n.status || 'todo', reset_daily: n.reset_daily || false, updated_at: new Date().toISOString() }))
        if (ups.length > 0) await db.from('task_nodes').upsert(ups, { onConflict: 'id' })
      }
    } catch (err) { console.error('Failed to move task:', err) }
  }

  // ── Render node ─────────────────────────────────────────────────────────
  function renderNode(task, depth, canEdit) {
    const shared = {
      key: task.id, task, depth, canEdit,
      selectMode, selectedIds, taskOpenIds,
      onToggleOpen: toggleOpen, onOpenDetail: openDetail,
      onDelete: deleteTask, onAddChild: openNewTask,
      onSelectToggle: toggleSelect, getDragProps, renderNode,
    }
    if (task.id && task.id.startsWith('chk_')) {
      return <EnclosureCard {...shared} />
    }
    return (
      <TaskCard
        {...shared}
        taskAddingTo={taskAddingTo}
        onCheckToggle={checkToggle}
        onCycleStatus={cycleStatus}
        onCancelForm={() => setTaskAddingTo(null)}
        onSubmitForm={submitAddForm}
      />
    )
  }

  // ── Detail task ─────────────────────────────────────────────────────────
  let detailTask = null, detailIsNew = false
  if (taskDetailId === '__new__') { detailTask = { id: '__new__', title: '', status: 'todo', children: [] }; detailIsNew = true }
  else if (taskDetailId) detailTask = findNode(tree, taskDetailId)
  const isBulkEdit = !detailIsNew && selectMode && selectedIds.length > 1

  // ── Filters ─────────────────────────────────────────────────────────────
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterTag, setFilterTag] = useState('all')
  const [filterSearch, setFilterSearch] = useState('')

  // Collect all unique assignees and tags from tree
  const allAssignees = (() => {
    const s = new Set()
    function walk(nodes) { nodes.forEach(n => { if (n.assigned_to) n.assigned_to.split(',').map(a => a.trim()).filter(Boolean).forEach(a => s.add(a)); walk(n.children || []) }) }
    walk(tree)
    return [...s].sort()
  })()
  const allTags = (() => {
    const s = new Set()
    function walk(nodes) { nodes.forEach(n => { if (n.tags) n.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => s.add(t)); if (n.department) s.add(n.department); walk(n.children || []) }) }
    walk(tree)
    return [...s].sort()
  })()

  // Filter logic: check if a root task (or any descendant) matches
  function matchesFilters(node) {
    const q = filterSearch.toLowerCase().trim()
    function nodeOrChildMatches(n) {
      let selfMatch = true
      if (filterStatus !== 'all') {
        if (filterStatus === 'overdue') { selfMatch = n.status !== 'done' && n.deadline && n.deadline < todayET() }
        else { selfMatch = n.status === filterStatus }
      }
      if (selfMatch && filterAssignee !== 'all') {
        const assignees = (n.assigned_to || '').split(',').map(a => a.trim())
        selfMatch = assignees.includes(filterAssignee)
      }
      if (selfMatch && filterTag !== 'all') {
        const nodeTags = (n.tags || '').split(',').map(t => t.trim())
        selfMatch = nodeTags.includes(filterTag) || n.department === filterTag
      }
      if (selfMatch && q) {
        selfMatch = (n.title || '').toLowerCase().includes(q) || (n.location || '').toLowerCase().includes(q) || (n.animal || '').toLowerCase().includes(q)
      }
      if (selfMatch) return true
      return (n.children || []).some(c => nodeOrChildMatches(c))
    }
    return nodeOrChildMatches(node)
  }

  const filtered = tree.filter(matchesFilters)
  const hasActiveFilters = filterStatus !== 'all' || filterAssignee !== 'all' || filterTag !== 'all' || filterSearch !== ''

  // ── Tree grouping ───────────────────────────────────────────────────────
  const today = todayET()
  const overdueRoots = filtered.filter(t => t.status !== 'done' && t.deadline && t.deadline < today)
  const doneRoots = filtered.filter(t => t.status === 'done')
  const normalRoots = filtered.filter(t => t.status !== 'done' && !(t.deadline && t.deadline < today))

  if (!taskTree) return <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>Loading…</div>

  return (
    <div style={{ paddingBottom: selectMode ? 72 : 0 }}>
      {/* Modals */}
      {detailTask && (
        <TaskDetailModal
          task={detailTask} isNew={detailIsNew} taskTree={tree}
          animalInventory={animalInventory || []}
          animalNotes={animalNotes} animalFamilyOverrides={animalFamilyOverrides}
          onClose={closeDetail} onSave={saveDetail}
          onDelete={() => deleteTask(taskDetailId)}
          isBulk={isBulkEdit} bulkCount={selectedIds.length}
        />
      )}
      {bulkEditOpen && <BulkEditModal ids={selectedIds} onSave={saveBulkEdit} onClose={() => setBulkEditOpen(false)} />}
      {bulkMoveOpen && <BulkMoveModal ids={selectedIds} tree={tree} onMove={bulkMove} onClose={() => setBulkMoveOpen(false)} />}
      {selectMode && <SelectBar selCount={selectedIds.length} selectedIds={selectedIds} onEdit={openDetail} onMove={() => setBulkMoveOpen(true)} onCancel={exitSelectMode} />}

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--dark)', margin: '0 -20px', padding: '14px 20px 12px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={() => update({ page: 'tasklog' })} style={{ flex: 1, padding: '7px 14px', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.clipboard} Task Log</span>
          </button>
          <button onClick={() => update({ page: 'taskcalendar' })} style={{ flex: 1, padding: '7px 14px', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.calendar} Calendar</span>
          </button>
        </div>
        <StatsBar tree={tree} />
        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 120px', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none', display: 'flex', width: 14, height: 14 }}>{Icons.search}</span>
            <input
              type="text"
              placeholder="Search tasks..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              style={{ width: '100%', padding: '6px 8px 6px 28px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--dark3)', border: `1px solid ${filterStatus !== 'all' ? 'rgba(66,165,245,.5)' : 'var(--dark4)'}`, color: filterStatus !== 'all' ? '#42a5f5' : 'var(--silver)', fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
            <option value="all">All Status</option>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="done">Done</option>
            <option value="overdue">Overdue</option>
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--dark3)', border: `1px solid ${filterAssignee !== 'all' ? 'rgba(66,165,245,.5)' : 'var(--dark4)'}`, color: filterAssignee !== 'all' ? '#42a5f5' : 'var(--silver)', fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
            <option value="all">All Assignees</option>
            {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--dark3)', border: `1px solid ${filterTag !== 'all' ? 'rgba(66,165,245,.5)' : 'var(--dark4)'}`, color: filterTag !== 'all' ? '#42a5f5' : 'var(--silver)', fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
            <option value="all">All Tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {hasActiveFilters && (
            <button onClick={() => { setFilterStatus('all'); setFilterAssignee('all'); setFilterTag('all'); setFilterSearch('') }} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(229,57,53,.12)', border: '1px solid rgba(229,57,53,.3)', color: 'var(--red)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clear</button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)' }}>
            {selectMode ? <span style={{ color: '#42a5f5' }}>▶ Select mode</span> : hasActiveFilters ? `Filtered (${filtered.length})` : 'All Tasks'}
          </div>
          {!selectMode && sup && (
            <button onClick={() => openNewTask(null)} style={{ padding: '7px 16px', borderRadius: 8, background: 'var(--red)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New Task</button>
          )}
        </div>
      </div>

      {/* Root add form */}
      {taskAddingTo === '__root__' && (
        <div style={{ marginBottom: 8 }}>
          <AddTaskForm parentId={null} parentTask={null} onSubmit={d => submitAddForm(null, d)} onCancel={() => setTaskAddingTo(null)} />
        </div>
      )}

      {/* Task tree */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: 10 }}>
        {filtered.length === 0 && taskAddingTo !== '__root__' && (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{Icons.clipboard}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--silver)', marginBottom: 4 }}>{hasActiveFilters ? 'No tasks match filters' : 'No tasks yet'}</div>
            {hasActiveFilters ? <div style={{ fontSize: 12 }}>Try adjusting your filters</div> : sup && <div style={{ fontSize: 12 }}>Hit "+ New Task" to get started</div>}
          </div>
        )}
        {overdueRoots.length > 0 && (
          <>
            <div style={{ marginBottom: 10, padding: '6px 10px', background: 'rgba(229,57,53,.08)', border: '1px solid rgba(229,57,53,.3)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12 }}>🔴</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Overdue — {overdueRoots.length} task{overdueRoots.length > 1 ? 's' : ''}</span>
            </div>
            {overdueRoots.map(t => renderNode(t, 0, sup))}
            {(normalRoots.length > 0 || doneRoots.length > 0) && <div style={{ margin: '10px 0 8px', borderTop: '1px solid var(--dark4)' }} />}
          </>
        )}
        {normalRoots.map(t => renderNode(t, 0, sup))}
        {doneRoots.length > 0 && (
          <>
            {(normalRoots.length > 0 || overdueRoots.length > 0) && <div style={{ margin: '10px 0 8px', borderTop: '1px solid var(--dark4)' }} />}
            {doneRoots.map(t => renderNode(t, 0, sup))}
          </>
        )}
      </div>
    </div>
  )
}
