import { useState, useEffect } from 'react'
import { Icons } from '../components/Icons'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { isSupervisor } from '../utils/permissions'
import { todayET } from '../utils/dates'
import { db } from '../lib/supabase'
import { TEAM } from '../constants/team'
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10)
}
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0,10)
}
function fmtDate(dateStr, opts) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...opts }).format(new Date(dateStr + 'T12:00:00'))
}
function fmtWeekRange(start) {
  const end = addDays(start, 6)
  return fmtDate(start, { month: 'short', day: 'numeric' }) + ' – ' + fmtDate(end, { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtMonth(dateStr) {
  return fmtDate(dateStr, { month: 'long', year: 'numeric' })
}
function monthStart(dateStr) { return dateStr.slice(0,7) + '-01' }
function monthEnd(dateStr) {
  const d = new Date(dateStr.slice(0,7) + '-01T12:00:00'); d.setMonth(d.getMonth()+1); d.setDate(0); return d.toISOString().slice(0,10)
}

function getCompletionsByDate(taskTree, taskCompletions, rangeCompletions) {
  const byDate = {}
  const nodeMap = {}
  // Build node lookup from tree
  function indexNodes(nodes) {
    nodes.forEach(n => { nodeMap[n.id] = n; indexNodes(n.children || []) })
  }
  indexNodes(taskTree || [])

  // Include today's store completions (most fresh)
  Object.entries(taskCompletions || {}).forEach(([taskId, comp]) => {
    if (comp && comp.at) {
      const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(comp.at))
      const node = nodeMap[taskId]
      if (!byDate[d]) byDate[d] = []
      byDate[d].push({ title: node?.title || taskId, by: comp.by, emoji: node?.emoji })
    }
  })

  // Include range completions from DB (past/future dates)
  ;(rangeCompletions || []).forEach(c => {
    const d = c.date // already a YYYY-MM-DD string (stored in ET)
    if (!byDate[d]) byDate[d] = []
    // Avoid duplicates with store data
    if (!byDate[d].some(e => e._taskId === c.task_id)) {
      const node = nodeMap[c.task_id]
      byDate[d].push({ title: node?.title || c.task_id, by: c.completed_by, emoji: node?.emoji, _taskId: c.task_id })
    }
  })

  return byDate
}

function DayCell({ dateStr, today, byDate }) {
  const entries = byDate[dateStr] || []
  const isToday = dateStr === today
  const d = new Date(dateStr + 'T12:00:00')
  const dayNum = d.getDate()
  return (
    <div style={{ minHeight: 80, padding: '6px 8px', background: isToday ? 'rgba(66,165,245,.08)' : 'var(--dark3)', border: `1px solid ${isToday ? 'var(--blue)' : 'var(--dark4)'}`, borderRadius: 8 }}>
      <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--blue)' : 'var(--silverDark)', marginBottom: 4 }}>{dayNum}</div>
      {entries.slice(0,3).map((e, i) => (
        <div key={i} style={{ fontSize: 9, color: 'var(--green)', background: 'rgba(76,175,80,.1)', borderRadius: 3, padding: '1px 4px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {e.emoji ? `${e.emoji} ` : <>{Icons.check} </>}{e.title}
        </div>
      ))}
      {entries.length > 3 && <div style={{ fontSize: 9, color: 'var(--dimmed)' }}>+{entries.length - 3} more</div>}
    </div>
  )
}

function WeekView({ anchor, today, byDate }) {
  const ws = weekStart(anchor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--muted)', padding: '4px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {days.map(d => <DayCell key={d} dateStr={d} today={today} byDate={byDate} />)}
      </div>
    </div>
  )
}

function MonthView({ anchor, today, byDate }) {
  const ms = monthStart(anchor)
  const me = monthEnd(anchor)
  const firstDow = new Date(ms + 'T12:00:00').getDay()
  const days = []
  for (let i = 0; i < firstDow; i++) days.push(null)
  let cur = ms
  while (cur <= me) { days.push(cur); cur = addDays(cur, 1) }
  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--muted)', padding: '4px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {days.map((d, i) => d ? <DayCell key={d} dateStr={d} today={today} byDate={byDate} /> : <div key={`e${i}`} />)}
      </div>
    </div>
  )
}

function DayView({ anchor, today, byDate }) {
  const entries = byDate[anchor] || []
  const label = fmtDate(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>{label}</div>
      {entries.length === 0
        ? <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--muted)', fontSize: 13 }}>No tasks completed this day</div>
        : (
          <div style={{ display: 'grid', gap: 6 }}>
            {entries.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--dark3)', borderRadius: 8, border: '1px solid var(--dark4)' }}>
                <span style={{ fontSize: 16 }}>{e.emoji || Icons.check}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--silverLight)', fontWeight: 600 }}>{e.title}</div>
                  {e.by && <div style={{ fontSize: 10, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>{Icons.user} {e.by}</div>}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

export default function TaskCalendar() {
  const { taskTree, taskCompletions, calView, calDate, calAssigneeF, update } = useStore(useShallow(s => ({
    taskTree: s.taskTree,
    taskCompletions: s.taskCompletions,
    calView: s.calView,
    calDate: s.calDate,
    calAssigneeF: s.calAssigneeF,
    update: s.update,
  })))

  const view = calView || 'week'
  const anchor = calDate || todayET()
  const today = todayET()

  // Compute visible date range for DB query
  const [rangeCompletions, setRangeCompletions] = useState([])
  const visibleRange = (() => {
    if (view === 'day') return { start: anchor, end: anchor }
    if (view === 'week') { const ws = weekStart(anchor); return { start: ws, end: addDays(ws, 6) } }
    return { start: monthStart(anchor), end: monthEnd(anchor) }
  })()

  useEffect(() => {
    let cancelled = false
    async function fetchRange() {
      try {
        const { data } = await db.from('task_completions').select('*')
          .gte('date', visibleRange.start)
          .lte('date', visibleRange.end)
          .order('completed_at', { ascending: false })
        if (!cancelled && data) setRangeCompletions(data)
      } catch (err) { console.error('Calendar fetch error:', err) }
    }
    fetchRange()
    return () => { cancelled = true }
  }, [visibleRange.start, visibleRange.end])

  let rangeLabel = '', prevAnchor = '', nextAnchor = ''
  if (view === 'day') {
    rangeLabel = fmtDate(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    prevAnchor = addDays(anchor, -1); nextAnchor = addDays(anchor, 1)
  } else if (view === 'week') {
    rangeLabel = fmtWeekRange(weekStart(anchor))
    prevAnchor = addDays(anchor, -7); nextAnchor = addDays(anchor, 7)
  } else {
    rangeLabel = fmtMonth(anchor)
    const ms = new Date(monthStart(anchor) + 'T12:00:00')
    const prev = new Date(ms); prev.setMonth(prev.getMonth()-1)
    const next = new Date(ms); next.setMonth(next.getMonth()+1)
    prevAnchor = prev.toISOString().slice(0,10)
    nextAnchor = next.toISOString().slice(0,10)
  }

  const byDate = getCompletionsByDate(taskTree, taskCompletions, rangeCompletions)

  const vBtn = (v, lbl) => (
    <button key={v} onClick={() => update({ calView: v })} style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${view === v ? 'var(--blue)' : 'var(--dark4)'}`, background: view === v ? 'rgba(66,165,245,.15)' : 'var(--dark2)', color: view === v ? 'var(--blue)' : 'var(--silver)', fontSize: 12, fontWeight: view === v ? 700 : 500, cursor: 'pointer' }}>{lbl}</button>
  )

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--dark)', margin: '0 -20px', padding: '0 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}><span style={{display:'inline-flex',alignItems:'center',gap:8}}><span style={{color:'var(--blue)'}}>{Icons.calendar}</span> Calendar</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {vBtn('day','Day')} {vBtn('week','Week')} {vBtn('month','Month')}
            <button onClick={() => update({ page: 'projects' })} style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid var(--dark4)', background: 'var(--dark2)', color: 'var(--silver)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.arrowLeft} Back</span></button>
          </div>
        </div>
        {/* Nav bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <button onClick={() => update({ calDate: prevAnchor })} aria-label="Previous" style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--dark4)', background: 'var(--dark2)', color: 'var(--silver)', fontSize: 14, cursor: 'pointer' }}>{Icons.chevronLeft}</button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>{rangeLabel}</div>
          <button onClick={() => update({ calDate: nextAnchor })} aria-label="Next" style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid var(--dark4)', background: 'var(--dark2)', color: 'var(--silver)', fontSize: 14, cursor: 'pointer' }}>{Icons.chevronRight}</button>
          {anchor !== today && <button onClick={() => update({ calDate: today })} style={{ padding: '4px 11px', borderRadius: 7, border: '1px solid var(--dark4)', background: 'var(--dark3)', color: 'var(--silver)', fontSize: 11, cursor: 'pointer' }}>Today</button>}
        </div>
      </div>

      {/* Calendar body */}
      <div style={{ paddingTop: 8 }}>
        {view === 'day'   && <DayView   anchor={anchor} today={today} byDate={byDate} />}
        {view === 'week'  && <WeekView  anchor={anchor} today={today} byDate={byDate} />}
        {view === 'month' && <MonthView anchor={anchor} today={today} byDate={byDate} />}
      </div>
    </div>
  )
}
