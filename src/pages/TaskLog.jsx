import { useState, useEffect } from 'react'
import { Icons } from '../components/Icons'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { todayET } from '../utils/dates'
import { findNode } from './Tasks'
import { TEAM } from '../constants/team'
import { db } from '../lib/supabase'

const PERIODS = [
  { key: 'day',   label: 'Day'   },
  { key: 'week',  label: 'Week'  },
  { key: 'month', label: 'Month' },
  { key: 'year',  label: 'Year'  },
]

function etDate(isoStr) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(isoStr))
}

function dateRange(period) {
  const todayStr = todayET()
  let daysBack = 0
  if (period === 'week')  daysBack = 6
  if (period === 'month') daysBack = 29
  if (period === 'year')  daysBack = 364
  const d = new Date(todayStr + 'T12:00:00')
  d.setDate(d.getDate() - daysBack)
  return { start: d.toISOString().slice(0,10), end: todayStr }
}

function getTaskLabel(taskId, taskTree) {
  const node = findNode(taskTree, taskId)
  if (!node) return { label: taskId, sub: '' }
  const parent = node.parent_id ? findNode(taskTree, node.parent_id) : null
  const grandparent = parent?.parent_id ? findNode(taskTree, parent.parent_id) : null
  if (taskId.startsWith('tsk_') || taskId.startsWith('chk_') || taskId.startsWith('eod_')) {
    const label = `${grandparent ? (grandparent.emoji || '🐾') + ' ' + grandparent.title + ' — ' : ''}${node.title}`
    const sub = parent ? parent.title : 'Care'
    return { label, sub }
  }
  return { label: node.title, sub: parent ? parent.title : '' }
}

function collectAllLeafTaskIds(taskTree) {
  const ids = []
  function walk(nodes) {
    nodes.forEach(n => {
      if (!n.children || n.children.length === 0) ids.push(n.id)
      else walk(n.children)
    })
  }
  walk(taskTree || [])
  return ids
}

function EntryCard({ entry }) {
  const todayStr = todayET()
  const checked = entry.checked !== false
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: checked ? 'var(--dark2)' : 'rgba(244,67,54,.06)', borderRadius: 8, border: `1px solid ${checked ? 'var(--dark4)' : 'rgba(244,67,54,.2)'}` }}>
      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? 'var(--green)' : 'var(--dark4)'}`, background: checked ? 'rgba(76,175,80,.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: 'var(--green)' }}>
        {checked && '✓'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: checked ? 'var(--silverLight)' : 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.label}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{entry.sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {entry.by && <div style={{ fontSize: 10, color: 'var(--silverDark)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>{Icons.user} {entry.by}</div>}
        <div style={{ fontSize: 9, color: 'var(--dimmed)' }}>
          {entry.etDate && entry.etDate !== todayStr ? entry.etDate + ' · ' : ''}{entry.at || (checked ? '' : 'Not done')}
        </div>
      </div>
    </div>
  )
}

function ByTimeView({ entries, period }) {
  const checked = entries.filter(e => e.checked !== false)
  const unchecked = entries.filter(e => e.checked === false)

  if (!entries.length) {
    const labels = { day: 'today', week: 'this week', month: 'this month', year: 'this year' }
    return <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>No tasks {labels[period] || 'in this period'}</div>
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--dimmed)', marginBottom: 12 }}>
        {checked.length} completed{unchecked.length > 0 ? ` · ${unchecked.length} remaining` : ''} · {period} view
      </div>
      <div style={{ display: 'grid', gap: 5 }}>
        {entries.map((e, idx) => <EntryCard key={idx} entry={e} />)}
      </div>
    </div>
  )
}

function ByPersonView({ entries, period }) {
  const [openPeople, setOpenPeople] = useState({})
  const teamNames = TEAM.map(t => t.name)
  const log = {}
  teamNames.forEach(n => { log[n] = [] })
  entries.filter(e => e.checked !== false).forEach(e => {
    const who = e.by || '?'
    if (!log[who]) log[who] = []
    log[who].push(e)
  })
  const totalDone = entries.filter(e => e.checked !== false).length
  const periodLabels = { day: "Today's", week: "This week's", month: "This month's", year: "This year's" }

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--dimmed)' }}>{periodLabels[period] || ''} completed tasks across the team</div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: 'rgba(76,175,80,.12)', padding: '2px 10px', borderRadius: 10 }}>{totalDone} total</span>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {teamNames.map(name => {
          const items = log[name] || []
          const isOpen = name in openPeople ? openPeople[name] : true
          if (!items.length) return (
            <div key={name} style={{ background: 'var(--dark2)', border: '1px solid var(--dark4)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--silver)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{Icons.user} {name}</div>
              <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--dark3)', padding: '1px 8px', borderRadius: 10 }}>0 done</span>
            </div>
          )
          return (
            <div key={name} style={{ background: 'var(--dark2)', border: '1px solid var(--dark4)', borderLeft: '3px solid var(--green)', borderRadius: 10, overflow: 'hidden' }}>
              <div onClick={() => setOpenPeople(o => ({ ...o, [name]: !isOpen }))} aria-expanded={isOpen} style={{ padding: '10px 14px', background: 'var(--dark3)', borderBottom: isOpen ? '1px solid var(--dark4)' : 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                <span style={{ color: 'var(--muted)', display: 'inline-flex', transform: isOpen ? 'rotate(0)' : 'rotate(180deg)' }}>{Icons.chevronDown}</span>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--white)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{Icons.user} {name}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'rgba(76,175,80,.12)', padding: '1px 8px', borderRadius: 10 }}>{items.length} done</span>
              </div>
              {isOpen && (
                <div style={{ display: 'grid', gap: 4, padding: '8px 10px' }}>
                  {items.map((e, idx) => <EntryCard key={idx} entry={e} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function TaskLog() {
  const { taskTree, taskLogView, taskLogPeriod, update } = useStore(useShallow(s => ({
    taskTree: s.taskTree,
    taskLogView: s.taskLogView,
    taskLogPeriod: s.taskLogPeriod,
    update: s.update,
  })))

  const period = taskLogPeriod || 'day'
  const byTime = taskLogView === 'time'
  const todayStr = todayET()
  const [completions, setCompletions] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch task_completions from Supabase for the selected period
  useEffect(() => {
    async function load() {
      setLoading(true)
      const { start, end } = dateRange(period)
      const { data } = await db.from('task_completions').select('*').gte('date', start).lte('date', end).order('completed_at', { ascending: false })
      setCompletions(data || [])
      setLoading(false)
    }
    load()
  }, [period])

  // Build entries from completions + unchecked tasks for today
  const entries = []
  const completedTodayIds = new Set()

  completions.forEach(c => {
    const { label, sub } = getTaskLabel(c.task_id, taskTree || [])
    const etD = c.completed_at ? etDate(c.completed_at) : c.date
    entries.push({
      label, sub,
      by: c.completed_by || '?',
      at: c.completed_at ? new Date(c.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '',
      atRaw: c.completed_at || c.date + 'T23:59:59Z',
      etDate: etD,
      taskId: c.task_id,
      checked: true,
    })
    if (c.date === todayStr) completedTodayIds.add(c.task_id)
  })

  // For Day view, show unchecked leaf tasks too
  if (period === 'day' && taskTree) {
    const allLeafIds = collectAllLeafTaskIds(taskTree)
    allLeafIds.forEach(id => {
      if (completedTodayIds.has(id)) return
      const node = findNode(taskTree, id)
      if (!node) return
      // Only show care/checklist tasks (not project tasks) as unchecked
      if (!id.startsWith('tsk_') && !id.startsWith('chk_') && !id.startsWith('eod_')) return
      const { label, sub } = getTaskLabel(id, taskTree)
      entries.push({
        label, sub,
        by: node.assigned_to || '',
        at: '',
        atRaw: '9999',
        etDate: todayStr,
        taskId: id,
        checked: false,
      })
    })
  }

  // Sort: checked entries by time (newest first), unchecked at the bottom
  entries.sort((a, b) => {
    if (a.checked !== false && b.checked === false) return -1
    if (a.checked === false && b.checked !== false) return 1
    if (a.checked === false && b.checked === false) return a.label.localeCompare(b.label)
    return new Date(b.atRaw) - new Date(a.atRaw)
  })

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--dark)', margin: '0 -20px', padding: '0 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}><span style={{display:'inline-flex',alignItems:'center',gap:8}}><span style={{color:'var(--blue)'}}>{Icons.clipboard}</span> Task Log</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => update({ taskLogView: byTime ? 'assignee' : 'time' })} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'var(--dark2)', color: 'var(--silver)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {byTime ? <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.users} By Member</span> : <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.clock} By Time</span>}
            </button>
            <button onClick={() => update({ page: 'projects' })} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'var(--dark2)', color: 'var(--silver)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.arrowLeft} Back</span></button>
          </div>
        </div>
        {/* Period tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => update({ taskLogPeriod: p.key })} style={{ padding: '5px 14px', borderRadius: 7, border: `1px solid ${period === p.key ? 'var(--blue)' : 'var(--dark4)'}`, background: period === p.key ? 'rgba(66,165,245,.15)' : 'var(--dark2)', color: period === p.key ? 'var(--blue)' : 'var(--silver)', fontSize: 12, fontWeight: period === p.key ? 700 : 500, cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading
        ? <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>Loading...</div>
        : byTime
          ? <ByTimeView entries={entries} period={period} />
          : <ByPersonView entries={entries} period={period} />
      }
    </div>
  )
}
