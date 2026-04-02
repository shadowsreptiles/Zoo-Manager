import { useState, useRef } from 'react'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { isSupervisor, hasPermission } from '../utils/permissions'
import { todayET, toETDate, nowET } from '../utils/dates'
import { db } from '../lib/supabase'
import { apiPost } from '../lib/api'
import { Icons } from '../components/Icons'
import { TaskDetailModal, findNode } from './Tasks'

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return h12 + ':' + String(m).padStart(2, '0') + ' ' + ampm
}

function hasTag(node, tag) {
  return node.tags && node.tags.split(',').map(s => s.trim()).includes(tag)
}

const urgColor = { critical: '#d32f2f', high: '#e53935', medium: '#ff9800', low: '#4caf50' }
const urgOrder = { critical: 0, high: 1, medium: 2, low: 3 }

function isDoneToday(t, today) {
  if (t.status !== 'done') return false
  if (!t.schedule_days && !t.reset_daily) return true
  return t.updated_at && toETDate(t.updated_at) === today
}

// Zone color palette for badges
const zoneColors = {
  zone_exotics: { bg: 'rgba(156,39,176,.15)', color: '#ce93d8' },
  zone_birds: { bg: 'rgba(33,150,243,.15)', color: '#64b5f6' },
  zone_petshop: { bg: 'rgba(255,152,0,.15)', color: '#ffb74d' },
  zone_quarantine: { bg: 'rgba(244,67,54,.15)', color: '#ef9a9a' },
  zone_garage: { bg: 'rgba(158,158,158,.15)', color: '#bdbdbd' },
  zone_outdoor: { bg: 'rgba(76,175,80,.15)', color: '#81c784' },
  zone_tortoises: { bg: 'rgba(121,85,72,.15)', color: '#bcaaa4' },
}

function ZoneBadge({ zoneId, zoneTitle }) {
  const c = zoneColors[zoneId] || { bg: 'rgba(255,255,255,.08)', color: 'var(--muted)' }
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
      background: c.bg, color: c.color, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{zoneTitle}</span>
  )
}

function VCGrid({ vcNode, today, onToggle }) {
  const animals = vcNode.children || []
  if (!animals.length) return null
  const doneCount = animals.filter(a => isDoneToday(a, today)).length

  return (
    <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--dark2)', borderRadius: 8, border: '1px solid var(--dark4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--silver)' }}>Visual Check</span>
        <span style={{
          fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '1px 7px',
          color: doneCount === animals.length ? 'var(--green)' : '#42a5f5',
          background: (doneCount === animals.length ? 'var(--green)' : '#42a5f5') + '18',
        }}>{doneCount}/{animals.length}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {animals.map(a => {
          const done = isDoneToday(a, today)
          return (
            <div
              key={a.id}
              onClick={() => onToggle(a)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                background: done ? 'rgba(76,175,80,.1)' : 'var(--dark3)',
                border: `1px solid ${done ? 'rgba(76,175,80,.3)' : 'var(--dark4)'}`,
                borderRadius: 6, cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                border: `2px solid ${done ? 'var(--green)' : 'rgba(255,255,255,.2)'}`,
                background: done ? 'var(--green)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {done && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                color: done ? 'var(--dimmed)' : 'var(--silver)',
                textDecoration: done ? 'line-through' : 'none',
              }}>{a.title}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskRow({ node, today, userName, onToggle, sup, onEdit, onDragStart, onDragOver, onDrop, dragOverId }) {
  const done = isDoneToday(node, today)
  // Show checkbox if: leaf node AND (supervisor OR has editEnclosures permission)
  // assigned_to is informational — it shows who's responsible, not who's allowed
  const canCheck = !node.children?.length && (sup || hasPermission('editEnclosures'))
  const accentColor = done ? 'var(--green)' : (node.urgency && node.urgency !== 'low') ? (urgColor[node.urgency] || 'var(--red)') : 'var(--red)'
  const isDragOver = dragOverId === node.id

  return (
    <div
      draggable={sup}
      onDragStart={e => { if (sup && onDragStart) onDragStart(e, node) }}
      onDragOver={e => { e.preventDefault(); if (onDragOver) onDragOver(e, node) }}
      onDrop={e => { e.preventDefault(); if (onDrop) onDrop(e, node) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: done ? 'rgba(76,175,80,.06)' : isDragOver ? 'rgba(66,165,245,.08)' : 'var(--dark3)',
        borderRadius: 10, border: `1px solid ${isDragOver ? '#42a5f5' : done ? 'rgba(76,175,80,.25)' : 'var(--dark4)'}`,
        borderLeft: `3px solid ${accentColor}`,
        opacity: done ? 0.55 : 1,
        transition: 'all .15s',
        cursor: sup ? 'grab' : 'default',
      }}
    >
      {sup && (
        <div style={{ color: 'var(--dark4)', fontSize: 12, flexShrink: 0, cursor: 'grab', userSelect: 'none' }}>{Icons.gripVertical}</div>
      )}
      {canCheck && (
        <div
          onClick={e => { e.stopPropagation(); onToggle(node) }}
          style={{
            width: 18, height: 18, borderRadius: 4,
            border: `2px solid ${done ? 'var(--green)' : 'rgba(255,255,255,.25)'}`,
            background: done ? 'var(--green)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer', transition: 'all .15s',
          }}
        >
          {done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }} onClick={() => { if (sup && onEdit) onEdit(node) }}>
        <div style={{
          fontSize: 13, fontWeight: 600,
          color: done ? 'var(--dimmed)' : 'var(--white)',
          textDecoration: done ? 'line-through' : 'none',
          cursor: sup ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
        }}>
          {node.emoji ? `${node.emoji} ` : ''}{node.title}
          {node.urgency && node.urgency !== 'low' && (
            <span style={{
              fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
              background: (urgColor[node.urgency] || '#ff9800') + '22',
              color: urgColor[node.urgency] || '#ff9800',
              textTransform: 'uppercase',
            }}>{node.urgency.toUpperCase()}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap' }}>
          {node.assigned_to && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--silver)', background: 'var(--dark4)', padding: '2px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 12, height: 12, display: 'inline-flex' }}>{Icons.user}</span> {node.assigned_to}</span>}
          {node.opens_at && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', background: 'var(--dark4)', padding: '2px 8px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 12, height: 12, display: 'inline-flex' }}>{Icons.clock}</span> {fmtTime(node.opens_at.slice(0,5))}</span>}
          {done && node.completed_by && <span style={{ fontSize: 10, color: 'var(--green)' }}>✓ {node.completed_by}</span>}
        </div>
      </div>
      {sup && onEdit && (
        <button onClick={e => { e.stopPropagation(); onEdit(node) }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}>Edit</button>
      )}
    </div>
  )
}

function EnclosureCard({ chk, today, userName, onToggle, sup, zoneId, zoneTitle, speciesNotes, speciesUrgency, onEditTask, onEditChk, onAddNote, onDeleteNote, onDragStart, onDragOver, onDrop, dragOverId, dragProps }) {
  const [open, setOpen] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [noteText, setNoteText] = useState('')
  const noteInputRef = useRef(null)
  const tasks = chk.children || []

  // Separate regular tasks from VC parent nodes
  const regularTasks = []
  const vcNodes = []
  tasks.forEach(t => {
    if (t.title === 'Visual Check' && t.children?.length > 0) {
      vcNodes.push(t)
    } else {
      regularTasks.push(t)
    }
  })

  // Sort: active tasks first, completed at bottom
  const activeTasks = regularTasks.filter(t => !isDoneToday(t, today))
  const doneTasks = regularTasks.filter(t => isDoneToday(t, today))
  const sortedTasks = [...activeTasks, ...doneTasks]

  // Count all leaf tasks for progress (regular + VC children)
  const allLeaves = [...regularTasks]
  vcNodes.forEach(vc => { allLeaves.push(...(vc.children || [])) })
  const doneCount = allLeaves.filter(t => isDoneToday(t, today)).length
  const total = allLeaves.length
  const allDone = total > 0 && doneCount === total
  const pct = total > 0 ? Math.round(doneCount / total * 100) : 0
  const pctColor = pct === 100 ? 'var(--green)' : pct > 0 ? '#42a5f5' : 'var(--muted)'

  const etNow = nowET()
  const isOverdue = !allDone && chk.due_by && (() => {
    const [h, m] = chk.due_by.split(':').map(Number)
    return etNow.hours > h || (etNow.hours === h && etNow.minutes > m)
  })()

  // Use species-level urgency if chk doesn't have its own
  const urg = chk.urgency || speciesUrgency
  const urgTag = urg && urg !== 'low' ? (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
      background: (urgColor[urg] || '#ff9800') + '22',
      color: urgColor[urg] || '#ff9800',
      textTransform: 'uppercase', marginLeft: 5,
    }}>{urg.toUpperCase()}</span>
  ) : null

  const animalNames = (chk.animal || '').split(',').map(s => s.trim()).filter(Boolean)
  const sublabel = [chk.location, animalNames.slice(0, 3).join(', ')].filter(Boolean).join(' · ')

  // Merge notes from species + chk level
  const notesList = [speciesNotes, chk.notes].filter(Boolean)
  const noteCount = notesList.reduce((sum, n) => sum + n.split('\n').filter(Boolean).length, 0)
  const cardBorder = allDone ? 'rgba(76,175,80,.4)' : isOverdue ? 'rgba(229,57,53,.5)' : 'var(--dark4)'
  const cardBg = allDone ? 'rgba(76,175,80,.04)' : isOverdue ? 'rgba(229,57,53,.04)' : undefined

  return (
    <div
      className="enclosure-card"
      style={{ borderColor: cardBorder, background: cardBg }}
      {...(dragProps || {})}
    >
      <div
        className="enclosure-header"
        aria-expanded={open}
        style={{ gap: 8, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        {sup && (
          <div aria-label="Drag to reorder" style={{ cursor: 'grab', color: 'var(--dark4)', fontSize: 14, letterSpacing: -2, flexShrink: 0, padding: '0 2px', userSelect: 'none' }}>{Icons.gripVertical}</div>
        )}
        <span className="enclosure-emoji"><span style={{ color: 'var(--silverDark)' }}>{Icons.paw}</span></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="enclosure-name" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span>{chk.title}</span>
            {urgTag}
            {isOverdue && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)', background: 'rgba(229,57,53,.15)', padding: '2px 6px', borderRadius: 4 }}>OVERDUE</span>}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
            {zoneTitle && <ZoneBadge zoneId={zoneId} zoneTitle={zoneTitle} />}
            {sublabel && <span className="enclosure-location" style={{ fontSize: 11 }}>{sublabel}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginLeft: 'auto', flexShrink: 0 }}>
          <button
            onClick={e => {
              e.stopPropagation()
              if (!open) setOpen(true)
              setShowNoteInput(true)
              setTimeout(() => noteInputRef.current?.focus(), 80)
            }}
            aria-label={'Add note to ' + chk.title}
            title="Add note"
            style={{ padding: '4px 7px', borderRadius: 6, border: '1px solid var(--dark4)', background: showNoteInput ? 'rgba(255,152,0,.12)' : 'none', color: showNoteInput ? '#ffb74d' : 'var(--muted)', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, lineHeight: 1, transition: 'all .15s' }}
          >
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}>{Icons.messageCircle}</span>
            {noteCount > 0 && <span style={{ fontSize: 9, fontWeight: 700, minWidth: 14, textAlign: 'center' }}>{noteCount}</span>}
          </button>
          {sup && onEditChk && (
            <button onClick={e => { e.stopPropagation(); onEditChk(chk) }} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'none', color: 'var(--muted)', fontSize: 10, cursor: 'pointer' }}>Edit</button>
          )}
          {total > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: pctColor, background: pctColor + '18', padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {doneCount}/{total} · {pct}%
            </span>
          )}
        </div>
        {allDone && (
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        )}
        <button
          aria-label={'Toggle ' + chk.title}
          onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
          style={{ background: 'none', border: 'none', color: 'var(--silver)', cursor: 'pointer', fontSize: 18, padding: '0 2px', lineHeight: 1, flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          {Icons.chevronDown}
        </button>
      </div>
      {open && (
        <div className="enclosure-content">
          {/* Notes */}
          {notesList.length > 0 && (() => {
            // Build display entries: species notes are not deletable, chk notes are
            const entries = []
            if (speciesNotes) {
              speciesNotes.split('\n').filter(Boolean).forEach(line => {
                entries.push({ line, deletable: false })
              })
            }
            if (chk.notes) {
              chk.notes.split('\n').filter(Boolean).forEach((line, lineIdx) => {
                const author = line.includes(' (') ? line.split(' (')[0] : null
                const canDelete = author && (author === userName || sup)
                entries.push({ line, deletable: canDelete, lineIdx })
              })
            }
            return (
              <div style={{ padding: '6px 10px', marginBottom: 6, background: 'rgba(255,152,0,.06)', border: '1px solid rgba(255,152,0,.15)', borderRadius: 8 }}>
                {entries.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#ffb74d', padding: '2px 0', display: 'flex', gap: 4, alignItems: 'center', group: 'note' }}>
                    <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'baseline' }}>
                      {e.line.includes('): ') ? (
                        <>
                          <span style={{ fontSize: 10, color: 'rgba(255,152,0,.6)', fontWeight: 600, flexShrink: 0 }}>{e.line.split('): ')[0]}):</span>
                          <span>{e.line.split('): ').slice(1).join('): ')}</span>
                        </>
                      ) : (
                        <span style={{ fontStyle: 'italic' }}>{e.line}</span>
                      )}
                    </div>
                    {e.deletable && (
                      <button
                        onClick={() => onDeleteNote(chk.id, e.lineIdx, chk.notes)}
                        aria-label="Delete note"
                        title="Delete note"
                        style={{
                          background: 'none', border: 'none', color: 'rgba(255,152,0,.35)',
                          cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px',
                          flexShrink: 0, transition: 'color .15s',
                        }}
                        onMouseEnter={ev => ev.currentTarget.style.color = '#ef5350'}
                        onMouseLeave={ev => ev.currentTarget.style.color = 'rgba(255,152,0,.35)'}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            )
          })()}
          {/* Add note input */}
          {showNoteInput && (
            <div style={{ marginBottom: 8, background: 'rgba(255,152,0,.04)', border: '1px solid rgba(255,152,0,.2)', borderRadius: 8, padding: '8px 10px', transition: 'all .15s' }}>
              <label style={{ fontSize: 9, fontWeight: 700, color: '#ffb74d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' }}>Add Note</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <textarea
                  ref={noteInputRef}
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && noteText.trim()) {
                      e.preventDefault()
                      onAddNote(chk.id, noteText.trim(), chk.notes)
                      setNoteText('')
                      setShowNoteInput(false)
                    }
                    if (e.key === 'Escape') { setNoteText(''); setShowNoteInput(false) }
                  }}
                  placeholder="Type a note... (Enter to save, Esc to cancel)"
                  rows={2}
                  style={{
                    flex: 1, resize: 'vertical', minHeight: 36, maxHeight: 120,
                    background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,152,0,.15)',
                    borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--silver)',
                    fontFamily: 'inherit', lineHeight: 1.5, outline: 'none',
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(255,152,0,.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,152,0,.15)'}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      if (noteText.trim()) {
                        onAddNote(chk.id, noteText.trim(), chk.notes)
                        setNoteText('')
                        setShowNoteInput(false)
                      }
                    }}
                    disabled={!noteText.trim()}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700,
                      background: noteText.trim() ? 'rgba(255,152,0,.2)' : 'rgba(255,255,255,.04)',
                      color: noteText.trim() ? '#ffb74d' : 'var(--dimmed)',
                      cursor: noteText.trim() ? 'pointer' : 'default',
                      transition: 'all .15s',
                    }}
                  >Save</button>
                  <button
                    onClick={() => { setNoteText(''); setShowNoteInput(false) }}
                    style={{ padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 10, background: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                  >Cancel</button>
                </div>
              </div>
              <div style={{ fontSize: 9, color: 'var(--dimmed)', marginTop: 4 }}>Shift+Enter for new line</div>
            </div>
          )}
          {/* Tasks: active first, then completed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedTasks.map(t => (
              <TaskRow key={t.id} node={t} today={today} userName={userName} onToggle={onToggle} sup={sup} onEdit={onEditTask} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} dragOverId={dragOverId} />
            ))}
          </div>
          {/* Completed divider */}
          {doneTasks.length > 0 && activeTasks.length > 0 && (
            <div style={{ fontSize: 9, color: 'var(--dimmed)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 0 0', textAlign: 'center' }}>
              {doneTasks.length} completed
            </div>
          )}
          {/* Visual check grids */}
          {vcNodes.map(vc => (
            <VCGrid key={vc.id} vcNode={vc} today={today} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Care() {
  const { taskTree, userName, update, animalInventory, animalNotes, animalNameOverrides, animalFamilyOverrides } = useStore(useShallow(s => ({
    taskTree: s.taskTree,
    userName: s.userName,
    update: s.update,
    animalInventory: s.animalInventory,
    animalNotes: s.animalNotes,
    animalNameOverrides: s.animalNameOverrides,
    animalFamilyOverrides: s.animalFamilyOverrides,
  })))
  const sup = isSupervisor()
  const today = todayET()

  // State for edit modal
  const [editTaskId, setEditTaskId] = useState(null)
  // State for collapsible time blocks
  const [collapsedTimes, setCollapsedTimes] = useState({})
  // State for drag-and-drop
  const [dragOverId, setDragOverId] = useState(null)
  const dragItemRef = useRef(null)

  if (!taskTree) {
    return <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>Loading care schedule...</div>
  }

  const careRoot = taskTree.find(n => n.id === 'care_schedule' || hasTag(n, 'care'))
  const careZones = careRoot ? (careRoot.children || []).filter(n => n.id?.startsWith('zone_') || hasTag(n, 'care')) : []

  if (!careZones.length) {
    return (
      <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}><span style={{ color: 'var(--green)' }}>{Icons.leaf}</span></div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--silver)', marginBottom: 4 }}>No care schedule found</div>
        <div style={{ fontSize: 12 }}>Care schedule nodes have not been set up in the database yet.</div>
      </div>
    )
  }

  // ── Shared tree mutation helper ──────────────────────────────────────────
  function mutateTree(fn) {
    const cloned = JSON.parse(JSON.stringify(taskTree))
    fn(cloned)
    const flat = []
    const flatten = nodes => nodes.forEach(n => { const { children, ...rest } = n; flat.push(rest); if (n.children) flatten(n.children) })
    flatten(cloned)
    update({ taskTree: cloned, taskNodes: flat })
    return cloned
  }

  // Collect all chk_ cards with zone and species metadata
  const allChks = []
  careZones.forEach(zone => {
    ;(zone.children || []).filter(n => n.id?.startsWith('species_') || hasTag(n, 'care')).forEach(species => {
      ;(species.children || []).filter(c => c.id?.startsWith('chk_') || hasTag(c, 'care')).forEach(chk => {
        allChks.push({
          chk,
          zoneId: zone.id,
          zoneTitle: zone.title,
          speciesNotes: species.notes,
          speciesUrgency: species.urgency,
        })
      })
    })
  })

  // Group by time slot
  const timeGroups = {}
  allChks.forEach(item => {
    const key = item.chk.opens_at ? item.chk.opens_at.slice(0, 5) : '00:00'
    if (!timeGroups[key]) timeGroups[key] = []
    timeGroups[key].push(item)
  })

  // Sort each group by urgency: critical → high → medium → low → none
  Object.values(timeGroups).forEach(group => {
    group.sort((a, b) => {
      const ua = urgOrder[a.chk.urgency || a.speciesUrgency] ?? 4
      const ub = urgOrder[b.chk.urgency || b.speciesUrgency] ?? 4
      if (ua !== ub) return ua - ub
      return (a.chk.sort_order || 0) - (b.chk.sort_order || 0)
    })
  })

  const sortedTimes = Object.keys(timeGroups).sort()

  // ── Toggle task ─────────────────────────────────────────────────────────
  async function toggleTask(task) {
    if (!hasPermission('editEnclosures')) return
    const isCurrentlyDone = isDoneToday(task, today)
    const next = isCurrentlyDone ? 'todo' : 'done'
    const nowIso = new Date().toISOString()
    const currentUser = userName || 'Team'

    mutateTree(tree => {
      const node = findNode(tree, task.id)
      if (!node) return
      node.status = next
      node.updated_at = nowIso
      node.completed_by = next === 'done' ? currentUser : null
      node.unchecked_by = next === 'todo' ? currentUser : null
      node.unchecked_at = next === 'todo' ? nowIso : null
      if (next === 'done') { node.unchecked_by = null; node.unchecked_at = null }
    })

    // Update taskCompletions in store for Calendar/Home consistency
    const st = useStore.getState()
    const updatedCompletions = { ...st.taskCompletions }
    if (next === 'done') {
      updatedCompletions[task.id] = { by: currentUser, at: nowIso }
    } else {
      delete updatedCompletions[task.id]
    }
    update({ taskCompletions: updatedCompletions })

    try {
      await Promise.all([
        db.from('task_nodes').update({
          status: next,
          updated_at: nowIso,
          completed_by: next === 'done' ? currentUser : null,
          unchecked_by: next === 'todo' ? currentUser : null,
          unchecked_at: next === 'todo' ? nowIso : null,
        }).eq('id', task.id),
        apiPost({ action: 'toggleTaskCompletion', taskId: task.id, date: today, completedBy: currentUser, completedAt: nowIso, undo: next === 'todo' }),
      ])
    } catch (err) {
      console.error('Failed to toggle task:', err)
    }
  }

  // ── Save task from TaskDetailModal ──────────────────────────────────────
  async function saveTask(patch) {
    if (!editTaskId) return
    const now = new Date().toISOString()
    mutateTree(tree => {
      const node = findNode(tree, editTaskId)
      if (node) Object.assign(node, { ...patch, updated_at: now })
    })
    setEditTaskId(null)
    try {
      await db.from('task_nodes').update({ ...patch, updated_at: now }).eq('id', editTaskId)
    } catch (err) { console.error('Failed to save task:', err) }
  }

  // ── Delete task from TaskDetailModal ────────────────────────────────────
  async function deleteTask() {
    if (!editTaskId) return
    mutateTree(tree => {
      const remove = (nodes) => {
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].id === editTaskId) { nodes.splice(i, 1); return true }
          if (remove(nodes[i].children || [])) return true
        }
        return false
      }
      remove(tree)
    })
    setEditTaskId(null)
    try {
      await db.from('task_nodes').delete().eq('id', editTaskId)
    } catch (err) { console.error('Failed to delete task:', err) }
  }

  // ── Helper: resolve animal names to UIDs ────────────────────────────────
  function resolveAnimalUids(animalField) {
    if (!animalField) return []
    const names = animalField.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!names.length) return []
    return (animalInventory || []).filter(a => {
      const displayName = (animalNameOverrides?.[a.uid] || a.name || '').toLowerCase()
      return names.includes(displayName)
    })
  }

  // ── Add note to enclosure card + linked animals ────────────────────────
  async function addNote(chkId, text, existingNotes) {
    const now = new Date().toISOString()
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const entry = `${userName} (${timestamp}): ${text}`
    const newNotes = existingNotes ? existingNotes + '\n' + entry : entry

    // Update the task node
    mutateTree(tree => {
      const node = findNode(tree, chkId)
      if (node) { node.notes = newNotes; node.updated_at = now }
    })

    // Also link note to each animal on this enclosure card
    const chkNode = findNode(taskTree, chkId)
    const linkedAnimals = resolveAnimalUids(chkNode?.animal)
    const dateET = todayET()
    const encTitle = chkNode?.title || ''
    const animalNoteText = `[${encTitle}] ${text}`
    const updatedAnimalNotes = { ...useStore.getState().animalNotes }

    linkedAnimals.forEach(a => {
      const cur = updatedAnimalNotes[a.uid] || {}
      const notes = [...(cur.notes || []), { date: dateET, text: animalNoteText, addedBy: userName, timestamp: now }]
      updatedAnimalNotes[a.uid] = { ...cur, notes }
    })
    if (linkedAnimals.length > 0) {
      update({ animalNotes: updatedAnimalNotes })
    }

    try {
      await Promise.all([
        db.from('task_nodes').update({ notes: newNotes, updated_at: now }).eq('id', chkId),
        ...linkedAnimals.map(a =>
          db.from('notes').insert({ uid: a.uid, date: dateET, text: animalNoteText, added_by: userName, timestamp: now })
        ),
      ])
    } catch (err) { console.error('Failed to add note:', err) }
  }

  // ── Delete a note line from enclosure card ─────────────────────────────
  async function deleteNote(chkId, lineIndex, existingNotes) {
    const lines = (existingNotes || '').split('\n')
    const deletedLine = lines[lineIndex] || ''
    lines.splice(lineIndex, 1)
    const newNotes = lines.join('\n')
    const now = new Date().toISOString()

    mutateTree(tree => {
      const node = findNode(tree, chkId)
      if (node) { node.notes = newNotes || null; node.updated_at = now }
    })

    // Also remove from linked animals if it was a user note (has "): " format)
    if (deletedLine.includes('): ')) {
      const noteText = deletedLine.split('): ').slice(1).join('): ')
      const chkNode = findNode(taskTree, chkId)
      const linkedAnimals = resolveAnimalUids(chkNode?.animal)
      const encTitle = chkNode?.title || ''
      const animalNoteText = `[${encTitle}] ${noteText}`
      const updatedAnimalNotes = { ...useStore.getState().animalNotes }

      linkedAnimals.forEach(a => {
        const cur = updatedAnimalNotes[a.uid] || {}
        const notes = (cur.notes || []).filter(n => n.text !== animalNoteText)
        updatedAnimalNotes[a.uid] = { ...cur, notes }
      })
      if (linkedAnimals.length > 0) {
        update({ animalNotes: updatedAnimalNotes })
      }

      // Delete from DB
      try {
        await Promise.all([
          db.from('task_nodes').update({ notes: newNotes || null, updated_at: now }).eq('id', chkId),
          ...linkedAnimals.map(a =>
            db.from('notes').delete().eq('uid', a.uid).eq('text', animalNoteText).eq('added_by', deletedLine.split(' (')[0])
          ),
        ])
      } catch (err) { console.error('Failed to delete note:', err) }
    } else {
      try {
        await db.from('task_nodes').update({ notes: newNotes || null, updated_at: now }).eq('id', chkId)
      } catch (err) { console.error('Failed to delete note:', err) }
    }
  }

  // ── Drag and drop for tasks within enclosures ───────────────────────────
  function handleDragStart(e, node) {
    dragItemRef.current = node
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', node.id)
  }

  function handleDragOver(e, node) {
    e.preventDefault()
    if (dragItemRef.current && dragItemRef.current.id !== node.id) {
      setDragOverId(node.id)
    }
  }

  async function handleDrop(e, targetNode) {
    e.preventDefault()
    setDragOverId(null)
    const dragNode = dragItemRef.current
    dragItemRef.current = null
    if (!dragNode || dragNode.id === targetNode.id) return
    // Only reorder siblings (same parent)
    if (dragNode.parent_id !== targetNode.parent_id) return

    mutateTree(tree => {
      const parent = findNode(tree, dragNode.parent_id)
      if (!parent || !parent.children) return
      const children = parent.children
      const fromIdx = children.findIndex(c => c.id === dragNode.id)
      const toIdx = children.findIndex(c => c.id === targetNode.id)
      if (fromIdx === -1 || toIdx === -1) return
      children.splice(fromIdx, 1)
      children.splice(toIdx, 0, dragNode)
      // Update sort_order
      children.forEach((c, i) => { c.sort_order = i })
    })

    // Persist new sort orders
    try {
      const parent = findNode(taskTree, dragNode.parent_id)
      if (parent?.children) {
        const updates = parent.children.map((c, i) => ({ id: c.id, sort_order: i }))
        for (const u of updates) {
          await db.from('task_nodes').update({ sort_order: u.sort_order }).eq('id', u.id)
        }
      }
    } catch (err) { console.error('Failed to persist reorder:', err) }
  }

  function handleDragEnd() {
    dragItemRef.current = null
    setDragOverId(null)
  }

  // ── Section status ─────────────────────────────────────────────────────
  function sectionStatus(items) {
    const etTime = nowET()
    const cardDone = item => {
      const tasks = item.chk.children || []
      const leaves = []
      tasks.forEach(t => {
        if (t.title === 'Visual Check' && t.children?.length) {
          leaves.push(...t.children)
        } else {
          leaves.push(t)
        }
      })
      return leaves.length > 0 && leaves.every(t => isDoneToday(t, today))
    }
    const doneCount = items.filter(cardDone).length
    if (doneCount === items.length) return 'done'
    const cardOverdue = item => {
      if (cardDone(item)) return false
      if (!item.chk.due_by) return false
      const [h, m] = item.chk.due_by.split(':').map(Number)
      return etTime.hours > h || (etTime.hours === h && etTime.minutes > m)
    }
    if (items.some(cardOverdue)) return 'overdue'
    return 'active'
  }

  // Get the task object for the edit modal
  const editTask = editTaskId ? findNode(taskTree, editTaskId) : null

  return (
    <div onDragEnd={handleDragEnd}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--dark)', margin: '0 -20px', padding: '14px 20px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>Care Schedule</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => update({ page: 'snakes' })} style={{ padding: '6px 14px', background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--silver)', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ color: 'var(--silver)' }}>{Icons.snake}</span> Snake Feeding</span></button>
          </div>
        </div>
      </div>

      {sortedTimes.map(timeKey => {
        const items = timeGroups[timeKey]
        const status = sectionStatus(items)
        const isCollapsed = !!collapsedTimes[timeKey]
        const doneCount = items.filter(item => {
          const tasks = item.chk.children || []
          const leaves = []
          tasks.forEach(t => {
            if (t.title === 'Visual Check' && t.children?.length) leaves.push(...t.children)
            else leaves.push(t)
          })
          return leaves.length > 0 && leaves.every(t => isDoneToday(t, today))
        }).length
        const headerColor = status === 'done' ? 'var(--green)' : status === 'overdue' ? 'var(--red)' : 'var(--silver)'
        const headerBg = status === 'done' ? 'rgba(102,187,106,.08)' : status === 'overdue' ? 'rgba(229,57,53,.08)' : 'var(--dark2)'
        const headerBorder = status === 'done' ? 'rgba(102,187,106,.3)' : status === 'overdue' ? 'rgba(229,57,53,.3)' : 'var(--dark4)'
        const statusEmoji = status === 'done' ? <span style={{ color: 'var(--green)' }}>{Icons.checkCircle}</span> : status === 'overdue' ? <span style={{ color: 'var(--red)' }}>{Icons.alertTriangle}</span> : <span style={{ color: 'var(--silver)' }}>{Icons.clock}</span>

        return (
          <div key={timeKey} style={{ marginTop: 16 }}>
            <div
              onClick={() => setCollapsedTimes(p => ({ ...p, [timeKey]: !p[timeKey] }))}
              style={{ background: headerBg, border: `1px solid ${headerBorder}`, borderRadius: 10, padding: '12px 16px', marginBottom: isCollapsed ? 0 : 8, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', transition: 'margin .15s' }}
            >
              <span style={{ fontSize: 20 }}>{statusEmoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: headerColor }}>
                  {fmtTime(timeKey)}
                  {status === 'overdue' && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)', background: 'rgba(229,57,53,.15)', padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>OVERDUE</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{doneCount}/{items.length} enclosures complete</div>
              </div>
              {status === 'done' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              <span style={{ color: 'var(--muted)', fontSize: 18, transition: 'transform .15s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0, display: 'flex' }}>
                {Icons.chevronDown}
              </span>
            </div>
            {!isCollapsed && (
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map(item => (
                  <EnclosureCard
                    key={item.chk.id}
                    chk={item.chk}
                    today={today}
                    userName={userName}
                    onToggle={toggleTask}
                    sup={sup}
                    zoneId={item.zoneId}
                    zoneTitle={item.zoneTitle}
                    speciesNotes={item.speciesNotes}
                    speciesUrgency={item.speciesUrgency}
                    onEditTask={node => setEditTaskId(node.id)}
                    onEditChk={node => setEditTaskId(node.id)}
                    onAddNote={addNote}
                    onDeleteNote={deleteNote}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    dragOverId={dragOverId}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Task Detail Modal — reused from Task Management */}
      {editTask && (
        <TaskDetailModal
          task={editTask}
          isNew={false}
          taskTree={taskTree}
          animalInventory={animalInventory}
          animalNotes={animalNotes}
          animalFamilyOverrides={animalFamilyOverrides}
          onClose={() => setEditTaskId(null)}
          onSave={saveTask}
          onDelete={deleteTask}
        />
      )}
    </div>
  )
}
