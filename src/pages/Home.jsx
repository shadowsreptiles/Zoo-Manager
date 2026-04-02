import { useState } from 'react'
import { Icons } from '../components/Icons'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { isSupervisor, hasPermission } from '../utils/permissions'
import { apiPost } from '../lib/api'
import { db } from '../lib/supabase'
import { todayET } from '../utils/dates'
import { TaskNode, countDeep } from './Tasks'

const isCareNode = id => /^(chk_|tsk_|zone_|care_schedule)/.test(id || '')

function countMyTasks(taskTree, userName, taskCompletions) {
  let remaining = 0, done = 0
  const isMine = at => userName && at && at.split(',').map(s => s.trim()).includes(userName)
  function walk(nodes) {
    nodes.forEach(n => {
      if (!isCareNode(n.id) && isMine(n.assigned_to)) {
        if (n.status === 'done') done++
        else remaining++
      }
      walk(n.children || [])
    })
  }
  walk(taskTree || [])
  return { remaining, done }
}

function MyTaskCard({ userName, taskTree, taskCompletions, onToggle, sup }) {
  const [open, setOpen] = useState(true)
  const isMine = at => userName && at && at.split(',').map(s => s.trim()).includes(userName)
  const today = todayET()

  // Collect tasks assigned to me (topmost in chain), excluding care schedule nodes
  const assignedMap = new Map()
  function collect(nodes, parentId) {
    nodes.forEach(n => {
      if (!isCareNode(n.id) && isMine(n.assigned_to)) assignedMap.set(n.id, { node: n, parentId })
      collect(n.children || [], n.id)
    })
  }
  collect(taskTree || [], null)

  const toRender = []
  assignedMap.forEach(({ node, parentId }) => {
    if (parentId === null || !assignedMap.has(parentId)) toRender.push(node)
  })

  // Count pending across all non-care assigned nodes
  let pending = 0
  ;(function countAll(nodes) {
    nodes.forEach(n => {
      if (!isCareNode(n.id) && isMine(n.assigned_to) && n.status !== 'done') pending++
      countAll(n.children || [])
    })
  })(taskTree || [])

  // Overdue: respects start_date (not yet started ≠ overdue) + deadline + due_by time
  const isOverdue = t => {
    if (t.status === 'done') return false
    if (t.start_date && t.start_date > today) return false
    if (t.deadline && t.deadline < today) return true
    if (t.due_by) {
      const [h, m] = t.due_by.split(':').map(Number)
      const dt = new Date(); dt.setHours(h, m, 0, 0)
      return new Date() > dt
    }
    return false
  }

  // Not yet open: has opens_at time that hasn't arrived yet
  const isNotYetOpen = t => !!(t.opens_at && (() => {
    const [h, m] = t.opens_at.split(':').map(Number)
    const ot = new Date(); ot.setHours(h, m, 0, 0)
    return new Date() < ot
  })())

  if (!toRender.length) return null

  // All done — celebration card
  if (pending === 0) {
    return (
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}><span style={{color:'var(--green)'}}>{Icons.party}</span></div>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>All Tasks Complete!</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Great work, {userName}!</div>
      </div>
    )
  }

  // Group: overdue → normal → not yet open
  const overdueNodes = toRender.filter(t => t.status !== 'done' && isOverdue(t))
  const futureNodes  = toRender.filter(t => t.status !== 'done' && !isOverdue(t) && isNotYetOpen(t))
  const normalNodes  = toRender.filter(t => t.status !== 'done' && !isOverdue(t) && !isNotYetOpen(t))

  const Divider = () => <div style={{ margin: '8px 0', borderTop: '1px solid var(--dark4)' }} />

  // A task should be open if: overdue, deadline is today, or start time has passed
  const shouldBeOpen = t => {
    if (isOverdue(t)) return true
    if (t.deadline && t.deadline === today) return true
    if (t.opens_at) {
      const [h, m] = t.opens_at.split(':').map(Number)
      const ot = new Date(); ot.setHours(h, m, 0, 0)
      if (new Date() >= ot) return true
    }
    return false
  }

  const renderGroup = nodes => nodes.map(n => (
    <TaskNode
      key={n.id}
      node={n}
      depth={0}
      taskCompletions={taskCompletions}
      userName={userName}
      onToggle={onToggle}
      onAdd={() => {}}
      onDelete={null}
      onOpenDetail={null}
      onCycleStatus={null}
      sup={sup}
      defaultOpen={shouldBeOpen(n)}
      hideAssignee
    />
  ))

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: open ? 12 : 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .2s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0, color: 'var(--muted)' }}><polyline points="6 9 12 15 18 9"/></svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--white)' }}><span style={{display:'inline-flex',alignItems:'center',gap:6}}><span style={{color:'var(--blue)'}}>{Icons.clipboard}</span> My Tasks</span></div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            {toRender.length} total{overdueNodes.length > 0 && <span style={{ color: 'var(--red)' }}> · {overdueNodes.length} overdue</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: pending > 0 ? '#42a5f5' : 'var(--green)', lineHeight: 1 }}>{pending}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>remaining</div>
          </div>
        </div>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {renderGroup(overdueNodes)}
          {overdueNodes.length > 0 && (normalNodes.length > 0 || futureNodes.length > 0) && <Divider />}
          {renderGroup(normalNodes)}
          {futureNodes.length > 0 && (normalNodes.length > 0 || overdueNodes.length > 0) && <Divider />}
          {renderGroup(futureNodes)}
        </div>
      )}
    </div>
  )
}

function PhotoReviews({ photos, onReview }) {
  const [open, setOpen] = useState(false)
  const pending = photos.filter(p => p.status === 'pending')
  if (!pending.length) return null

  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid var(--orange)', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}><span style={{color:'var(--orange)'}}>{Icons.camera}</span></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--orange)' }}>Photo Reviews Pending</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pending.length} photo(s) awaiting your approval</div>
        </div>
        <span style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(255,152,0,.13)', color: 'var(--orange)', fontSize: 12, fontWeight: 700 }}>{pending.length}</span>
        <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }} onClick={e => e.stopPropagation()}>
          {pending.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--dark3)', borderRadius: 10, border: '1px solid rgba(255,152,0,.25)' }}>
              {p.photoData && <img src={p.photoData} style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} alt={p.animalName || 'Photo submission'} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)' }}>{p.animalName || 'Unknown Animal'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>by {p.submittedBy} · {new Date(p.submittedAt).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => onReview(p.id, 'approved')} aria-label="Approve photo" style={{ padding: '6px 12px', background: 'var(--green)', border: 'none', color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✓ Approve</button>
                <button onClick={() => onReview(p.id, 'rejected')} aria-label="Reject photo" style={{ padding: '6px 12px', background: 'var(--dark2)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>✗ Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const { userName, animalInventory, deletedAnimals, taskTree, taskCompletions, taskNodes, photoSubmissions, update } = useStore(useShallow(s => ({
    userName: s.userName,
    animalInventory: s.animalInventory,
    deletedAnimals: s.deletedAnimals,
    taskTree: s.taskTree,
    taskCompletions: s.taskCompletions,
    taskNodes: s.taskNodes,
    photoSubmissions: s.photoSubmissions,
    update: s.update,
  })))
  const sup = isSupervisor()
  const today = todayET()

  const deletedSet = new Set(deletedAnimals || [])
  const myAnimals = (animalInventory || []).filter(a => !deletedSet.has(a.uid))
  const enclosures = [...new Set(myAnimals.map(a => a.enclosure_id).filter(Boolean))]

  // Stat cards count ALL tasks (including care) using taskCompletions
  let allRemaining = 0, allDone = 0
  if (taskTree && userName) {
    const tc = taskCompletions || {}
    const isMineCheck = at => userName && at && at.split(',').map(s => s.trim()).includes(userName)
    ;(function walkAll(nodes) {
      nodes.forEach(n => {
        if (isMineCheck(n.assigned_to)) {
          if (tc[n.id]) allDone++
          else allRemaining++
        }
        walkAll(n.children || [])
      })
    })(taskTree)
  }
  const total = allRemaining + allDone
  const pct = total > 0 ? Math.round(allDone / total * 100) : 0
  const remainingColor = allRemaining === 0 ? 'var(--green)' : '#42a5f5'
  const barColor = pct >= 100 ? 'var(--green)' : pct > 60 ? 'var(--orange)' : 'var(--red)'

  function toggleNode(nodeId) {
    if (!hasPermission('editTasks')) return
    const isDone = !!taskCompletions[nodeId]
    const now = new Date().toISOString()
    const newStatus = isDone ? 'todo' : 'done'
    // Update taskCompletions
    const updatedCompletions = { ...taskCompletions }
    if (isDone) delete updatedCompletions[nodeId]
    else updatedCompletions[nodeId] = { by: userName, at: now }
    // Also sync taskTree node status so Tasks page reflects the change immediately
    let updatedTree = taskTree
    if (taskTree) {
      updatedTree = JSON.parse(JSON.stringify(taskTree))
      ;(function findAndSet(nodes) {
        for (const n of nodes) {
          if (n.id === nodeId) { n.status = newStatus; n.updated_at = now; return true }
          if (findAndSet(n.children || [])) return true
        }
        return false
      })(updatedTree)
    }
    // Also sync taskNodes so apiGet delta merges don't revert the change
    let updatedNodes
    if (updatedTree) {
      updatedNodes = []
      const flatten = nodes => nodes.forEach(n => { const { children, ...rest } = n; updatedNodes.push(rest); if (children) flatten(children) })
      flatten(updatedTree)
    }
    update({ taskCompletions: updatedCompletions, taskTree: updatedTree, ...(updatedNodes ? { taskNodes: updatedNodes } : {}) })
    // Write to both tables
    apiPost({ action: 'toggleTaskCompletion', taskId: nodeId, date: today, completedBy: userName, completedAt: now, undo: isDone })
    db.from('task_nodes').update({ status: newStatus, updated_at: now }).eq('id', nodeId)
  }

  function handleReview(photoId, status) {
    const photo = photoSubmissions.find(p => p.id === photoId)
    if (!photo) return
    const now = new Date().toISOString()
    const updated = photoSubmissions.map(p =>
      p.id === photoId ? { ...p, status, reviewedBy: userName, reviewedAt: now } : p
    )
    update({ photoSubmissions: updated })
    apiPost({ action: 'savePhotoSubmission', id: photoId, animal_uid: photo.animalUid, animal_name: photo.animalName, photo_data: photo.photoData, submitted_by: photo.submittedBy, submitted_at: photo.submittedAt, status, reviewed_by: userName, reviewed_at: now })
  }

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat-card clickable" onClick={() => update({ page: 'animals' })} role="button" aria-label="View enclosures">
          <div className="stat-label">{sup ? 'Enclosures' : 'My Enclosures'}</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{enclosures.length}</div>
        </div>
        <div className="stat-card clickable" onClick={() => update({ page: 'animals' })} role="button" aria-label="View animals">
          <div className="stat-label">Animals</div>
          <div className="stat-value" style={{ color: 'var(--orange)' }}>{myAnimals.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Remaining</div>
          <div className="stat-value" style={{ color: remainingColor }}>{allRemaining}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{allDone}</div>
        </div>
      </div>

      {/* Progress */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--white)', marginBottom: 10 }}>Today's Progress</div>
        <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's progress">
          <div className="progress-fill" style={{ width: `${pct}%`, background: barColor, boxShadow: pct > 0 ? `0 0 8px ${barColor}60` : 'none' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>{pct}% complete</div>
      </div>

      {/* My tasks - full TaskNode cards */}
      {taskTree && (
        <MyTaskCard userName={userName} taskTree={taskTree} taskCompletions={taskCompletions || {}} onToggle={toggleNode} sup={sup} />
      )}

      {/* Photo reviews (supervisor) */}
      {sup && <PhotoReviews photos={photoSubmissions || []} onReview={handleReview} />}
    </div>
  )
}
