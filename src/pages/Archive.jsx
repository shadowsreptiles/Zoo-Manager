import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { Icons } from '../components/Icons'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'

const TABLE_LABELS = {
  task_nodes: 'Deleted Tasks',
  team_feedback: 'Deleted Feedback',
  task_edit: 'Task Edits',
  task_bulk_edit: 'Bulk Task Edits',
  snake_log: 'Snake Log',
}
const TABLE_COLORS = {
  task_nodes: '#42a5f5',
  team_feedback: '#ab47bc',
  task_edit: '#ff9800',
  task_bulk_edit: '#ff9800',
  snake_log: '#66bb6a',
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function summarize(tableName, data) {
  if (!data) return ''
  if (tableName === 'task_nodes') return data.title || data.id || ''
  if (tableName === 'team_feedback') return data.text || data.feedback || data.description || ''
  if (tableName === 'task_edit' || tableName === 'task_bulk_edit') {
    const parts = []
    if (data.task_title) parts.push(data.task_title)
    if (data.field) parts.push(data.field + ': ' + (data.old_value || '(empty)') + ' \u2192 ' + (data.new_value || '(empty)'))
    if (data.changes) {
      const changes = typeof data.changes === 'string' ? JSON.parse(data.changes) : data.changes
      if (Array.isArray(changes)) changes.forEach(c => parts.push((c.field || '') + ': ' + (c.old || '(empty)') + ' \u2192 ' + (c.new || '(empty)')))
      else Object.entries(changes).forEach(([k, v]) => parts.push(k + ': ' + JSON.stringify(v)))
    }
    if (data.count) parts.push(data.count + ' tasks')
    return parts.join(' \u00b7 ') || JSON.stringify(data).slice(0, 120)
  }
  if (tableName === 'snake_log') {
    const parts = []
    if (data.snakeUid) parts.push(data.snakeUid)
    if (data.date) parts.push(data.date)
    if (data.quality) parts.push(data.quality)
    return parts.join(' \u00b7 ') || ''
  }
  return JSON.stringify(data).slice(0, 120)
}

function ArchiveRow({ row, expanded, onToggle }) {
  const color = TABLE_COLORS[row.table_name] || 'var(--silver)'
  const label = TABLE_LABELS[row.table_name] || row.table_name
  const summary = summarize(row.table_name, row.data_json)

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--dark4)', borderLeft: `3px solid ${color}`, background: 'var(--dark2)', marginBottom: 8, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {summary || '(no details)'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: color + '22', color }}>{label}</span>
            {row.deleted_by && <span style={{ fontSize: 10, color: 'var(--muted)' }}>by {row.deleted_by}</span>}
            <span style={{ fontSize: 10, color: 'var(--dimmed)' }}>{formatDate(row.deleted_at)}</span>
          </div>
        </div>
        <span style={{ fontSize: 14, color: 'var(--dimmed)', transition: 'transform .15s', transform: expanded ? 'rotate(180deg)' : '' }}>{Icons.chevronDown}</span>
      </div>
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--dark4)' }}>
          <pre style={{ fontSize: 11, color: 'var(--silver)', background: 'var(--dark3)', padding: 12, borderRadius: 8, overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '10px 0 0' }}>
            {JSON.stringify(row.data_json, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default function Archive() {
  const { update } = useStore(useShallow(s => ({ update: s.update })))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await db.from('archive').select('*').order('deleted_at', { ascending: false })
      if (data) setRows(data)
      setLoading(false)
    }
    load()
  }, [])

  const tableNames = [...new Set(rows.map(r => r.table_name))].sort()
  const filtered = filter === 'all' ? rows : rows.filter(r => r.table_name === filter)

  const counts = {}
  rows.forEach(r => { counts[r.table_name] = (counts[r.table_name] || 0) + 1 })

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button onClick={() => update({ page: 'team' })} style={{ background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-flex' }}>{Icons.arrowLeft}</span> Team
        </button>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>Archive</div>
        <span style={{ fontSize: 11, color: 'var(--dimmed)', marginLeft: 'auto' }}>{filtered.length} records</span>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilter('all')} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: filter === 'all' ? '1px solid var(--silver)' : '1px solid var(--dark4)', background: filter === 'all' ? 'rgba(255,255,255,.08)' : 'var(--dark3)', color: filter === 'all' ? 'var(--white)' : 'var(--muted)' }}>
          All ({rows.length})
        </button>
        {tableNames.map(t => {
          const c = TABLE_COLORS[t] || 'var(--silver)'
          const active = filter === t
          return (
            <button key={t} onClick={() => setFilter(t)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: active ? `1px solid ${c}` : '1px solid var(--dark4)', background: active ? c + '18' : 'var(--dark3)', color: active ? c : 'var(--muted)' }}>
              {TABLE_LABELS[t] || t} ({counts[t]})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>Loading archive...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>No archived records found.</div>
      ) : (
        filtered.map(r => (
          <ArchiveRow key={r.id} row={r} expanded={expandedId === r.id} onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)} />
        ))
      )}
    </div>
  )
}
