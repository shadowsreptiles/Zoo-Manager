import { useState } from "react"
import { useStore } from "../lib/store"
import { useShallow } from "zustand/shallow"
import { db } from "../lib/supabase"
import { apiPost } from "../lib/api"
import { TEAM } from "../constants/team"
import { Icons } from "../components/Icons"

const TEAM_NAMES = TEAM.map(t => t.name)
const TYPE_META = {
  praise:      { label: "Praise",      icon: "\u2B50",     color: "#FFD600" },
  note:        { label: "Note",        icon: "\uD83D\uDCDD", color: "#42A5F5" },
  improvement: { label: "Improvement", icon: "\uD83D\uDCC8", color: "#FF9800" },
  warning:     { label: "Warning",     icon: "\u26A0\uFE0F", color: "#E31E24" },
  bug:         { label: "Bug Fix",     icon: "\uD83D\uDC1B", color: "#9C27B0" },
}

const genId = () => "fb_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// ── Sub-components ─────────────────────────────────────────

function FilterBar({ filter, setFilter }) {
  const all = ["All", ...TEAM_NAMES]
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
      {all.map((n) => (
        <button
          key={n}
          onClick={() => setFilter(n)}
          style={{
            padding: "5px 12px", borderRadius: 6, border: `1px solid ${filter === n ? 'var(--blue)' : 'var(--dark4)'}`,
            background: filter === n ? 'var(--blue)' : 'var(--dark2)', color: filter === n ? "#fff" : 'var(--silver)',
            fontSize: 11, fontWeight: 600, cursor: "pointer",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function NewFeedbackForm({ userName, onSave, onCancel }) {
  const [to, setTo] = useState("")
  const [type, setType] = useState("praise")
  const [text, setText] = useState("")

  const handleSave = () => {
    if (!to || !text.trim()) { alert("Please select a member and write feedback."); return }
    onSave({ to, type, text: text.trim() })
    setText(""); setTo(""); setType("praise")
  }

  return (
    <div style={{ background: 'var(--dark2)', border: '1px solid var(--blue)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white)', marginBottom: 12 }}>New Feedback</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--silverDark)', marginBottom: 3, textTransform: "uppercase" }}>To</div>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="config-input" style={{ width: "100%", padding: "7px 10px", fontSize: 12 }}>
            <option value="">— Select member —</option>
            {TEAM_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--silverDark)', marginBottom: 3, textTransform: "uppercase" }}>Type</div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="config-input" style={{ width: "100%", padding: "7px 10px", fontSize: 12 }}>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your feedback..." rows={3}
        className="config-input" style={{ width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 10, fontSize: 12, boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={handleSave} style={{ padding: "7px 20px", borderRadius: 7, background: 'var(--green)', border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
        <button onClick={onCancel} style={{ padding: "7px 12px", borderRadius: 7, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 12, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  )
}

function RichDetails({ f }) {
  if (!f.feedbackType) return null
  const rows = []
  if (f.area) rows.push(["Area", f.area, null])
  if (f.impact) rows.push(["Impact", "\u2605".repeat(parseInt(f.impact)) + "\u2606".repeat(5 - parseInt(f.impact)), 'var(--orange)'])
  if (f.urgency) {
    const uc = f.urgency.startsWith("High") ? 'var(--red)' : f.urgency.startsWith("Medium") ? 'var(--orange)' : 'var(--green)'
    rows.push(["Urgency", f.urgency, uc])
  }
  if (f.concern) rows.push(["Concerns", f.concern, null])
  if (f.wantsContact) rows.push(["Contact?", f.wantsContact, null])

  const collabs = (f.collaboration || []).filter((c) => c.rating)
  const ratingColor = (r) => r === "Excellent" ? 'var(--green)' : r === "Well" ? 'var(--blue)' : r === "Fairly" ? 'var(--orange)' : 'var(--red)'

  return (
    <div style={{ display: "grid", gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--dark4)' }}>
      {rows.map(([label, val, color], i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 80 }}>{label}</span>
          <span style={{ fontSize: 11, color: color || 'var(--silver)' }}>{val}</span>
        </div>
      ))}
      {collabs.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5 }}>Team Collaboration Ratings</div>
          <div style={{ display: "grid", gap: 3 }}>
            {collabs.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 6px", borderRadius: 5, background: 'var(--dark3)' }}>
                <span style={{ fontSize: 10, color: 'var(--silver)' }}>{c.dimension}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: ratingColor(c.rating) }}>{c.rating}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskPanel({ f, onCreateTask, onCancel }) {
  const [desc, setDesc] = useState(f.description || f.text || "")
  const [assignTo, setAssignTo] = useState(f.to || "")
  const [priority, setPriority] = useState(f.urgency && f.urgency.startsWith("High") ? "high" : f.urgency && f.urgency.startsWith("Low") ? "low" : "medium")
  const [deadline, setDeadline] = useState("")

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(51,51,51,.25)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--white)', marginBottom: 10 }}>{Icons.clipboard} Create Task from Feedback</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Assign To</div>
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="config-input" style={{ width: "100%", padding: "6px 8px", fontSize: 11 }}>
            <option value="">— Select —</option>
            {TEAM_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Priority</div>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="config-input" style={{ width: "100%", padding: "6px 8px", fontSize: 11 }}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Deadline</div>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="config-input" style={{ width: "100%", padding: "6px 8px", fontSize: 11 }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Status</div>
          <select className="config-input" style={{ width: "100%", padding: "6px 8px", fontSize: 11 }}><option>To Do</option></select>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>Task Description</div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
          className="config-input" style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 11, boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { if (!desc.trim()) return; onCreateTask({ desc: desc.trim(), assignTo, priority, deadline }) }}
          style={{ padding: "6px 16px", borderRadius: 7, background: 'var(--blue)', border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{Icons.check} Create Task</button>
        <button onClick={onCancel} style={{ padding: "6px 10px", borderRadius: 7, background: "none", border: '1px solid var(--dark4)', color: 'var(--muted)', fontSize: 11, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  )
}

function FeedbackCard({ f, taskOpen, onToggleAck, onToggleTask, onDelete, onCreateTask, onCancelTask }) {
  const tm = TYPE_META[f.type] || TYPE_META.note
  const dateStr = new Date(f.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  const border = f.acknowledged ? 'var(--dark4)' : tm.color + "50"

  const actionBtn = (style, onClick, children, title) => (
    <button onClick={onClick} title={title} style={{ padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", border: "1px solid", background: "none", ...style }}>{children}</button>
  )

  return (
    <div style={{ background: 'var(--dark2)', border: `1px solid ${border}`, borderLeft: `3px solid ${tm.color}`, borderRadius: 10, padding: "14px 16px", opacity: f.acknowledged ? 0.65 : 1, transition: "opacity .2s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{tm.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: tm.color, background: tm.color + "20", padding: "2px 8px", borderRadius: 6 }}>{f.feedbackType || tm.label}</span>
            <span style={{ fontSize: 10, color: 'var(--dimmed)', marginLeft: "auto" }}>{dateStr}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--silverLight)', lineHeight: 1.6 }}>{f.description || f.text}</div>
          <div style={{ fontSize: 10, color: 'var(--dimmed)', marginTop: 5 }}>
            submitted by <strong style={{ color: 'var(--silver)' }}>{f.from}</strong>
            {f.to && f.to !== "Team" && <> {"\u00B7"} regarding <strong style={{ color: 'var(--silver)' }}>{f.to}</strong></>}
          </div>
          <RichDetails f={f} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {actionBtn(
            f.acknowledged
              ? { borderColor: 'var(--dark4)', background: "transparent", color: 'var(--dimmed)' }
              : { borderColor: "rgba(76,175,80,.4)", background: "rgba(76,175,80,.08)", color: 'var(--green)' },
            () => onToggleAck(f.id),
            f.acknowledged ? "\u21A9" : "\u2713",
            f.acknowledged ? "Mark unread" : "Mark read"
          )}
          {f.linkedTaskId
            ? <span style={{ padding: "3px 9px", borderRadius: 6, fontSize: 10, fontWeight: 700, borderColor: "rgba(76,175,80,.4)", background: "rgba(76,175,80,.08)", color: 'var(--green)', whiteSpace: "nowrap", border: "1px solid rgba(76,175,80,.4)" }}>{"\u2713"} Task</span>
            : actionBtn(
                taskOpen
                  ? { background: 'var(--blue)', color: "#fff", borderColor: 'var(--blue)' }
                  : { borderColor: "rgba(66,165,245,.4)", background: "rgba(66,165,245,.08)", color: 'var(--blue)' },
                () => onToggleTask(f.id),
                "\u2192 Task"
              )
          }
          {actionBtn({ borderColor: "rgba(227,30,36,.25)", color: 'var(--red)' }, () => onDelete(f.id), "\u2715")}
        </div>
      </div>
      {taskOpen && <TaskPanel f={f} onCreateTask={onCreateTask} onCancel={onCancelTask} />}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────
export default function TeamFeedback() {
  const { teamFeedback, userName, update } = useStore(useShallow(s => ({
    teamFeedback: s.teamFeedback,
    userName: s.userName,
    update: s.update,
  })))
  const [filter, setFilter] = useState("All")
  const [showNew, setShowNew] = useState(false)
  const [taskOpenId, setTaskOpenId] = useState(null)

  const feedback = teamFeedback || []

  const handleAddFeedback = ({ to, type, text }) => {
    const id = genId()
    const entry = { id, to, type, text, from: userName, date: new Date().toISOString(), acknowledged: false }
    update({ teamFeedback: [entry, ...feedback] })
    setShowNew(false)
    apiPost({ action: 'saveFeedback', id, data: entry })
  }

  const handleToggleAck = (id) => {
    const item = feedback.find(f => f.id === id)
    if (!item) return
    const newVal = !item.acknowledged
    update({ teamFeedback: feedback.map(f => f.id === id ? { ...f, acknowledged: newVal } : f) })
    apiPost({ action: 'acknowledgeFeedback', id, acknowledged: newVal })
  }

  const handleDelete = async (id) => {
    if (!confirm("Delete this feedback entry? It will be archived.")) return
    const item = feedback.find(f => f.id === id)
    update({ teamFeedback: feedback.filter(f => f.id !== id) })
    // Archive then delete
    if (item) {
      try {
        await db.from('archive').insert({ original_id: String(id), table_name: "team_feedback", data_json: item, deleted_by: userName, deleted_at: new Date().toISOString() })
      } catch (e) { console.error('Archive insert error:', e) }
    }
    apiPost({ action: 'deleteFeedback', id })
  }

  const handleCreateTask = async (feedbackId, { desc, assignTo, priority, deadline }) => {
    const newId = "task_" + genId()
    const now = new Date().toISOString()
    update({ teamFeedback: feedback.map(f => f.id === feedbackId ? { ...f, linkedTaskId: newId, linkedTaskTitle: desc } : f) })
    setTaskOpenId(null)
    // Update the feedback entry with the linked task
    const updated = feedback.find(f => f.id === feedbackId)
    if (updated) {
      const stamped = { ...updated, linkedTaskId: newId, linkedTaskTitle: desc }
      apiPost({ action: 'saveFeedback', id: feedbackId, data: stamped })
    }
    // Create the task node
    apiPost({ action: 'saveTaskNode', node: {
      id: newId, parent_id: null, title: desc, assigned_to: assignTo || null,
      deadline: deadline || null, priority, node_type: "task", status: "todo",
      sort_order: -1, reset_daily: false, created_by: userName, created_at: now, updated_at: now,
    }})
  }

  const visible = filter === "All" ? feedback : feedback.filter((f) => f.to === filter)

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Title */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--blue)' }}>{Icons.messageCircle}</span> Team Feedback Submissions
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!showNew && (
            <button onClick={() => setShowNew(true)}
              style={{ padding: "8px 16px", borderRadius: 8, background: 'var(--red)', border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              + New Feedback
            </button>
          )}
          <button onClick={() => update({ page: 'team' })} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{Icons.arrowLeft} Back</span>
          </button>
        </div>
      </div>

      {showNew && <NewFeedbackForm userName={userName} onSave={handleAddFeedback} onCancel={() => setShowNew(false)} />}

      <FilterBar filter={filter} setFilter={setFilter} />

      {visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          No feedback yet{filter !== "All" ? ` for ${filter}` : ""}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {visible.map((f) => (
            <FeedbackCard
              key={f.id}
              f={f}
              taskOpen={taskOpenId === f.id}
              onToggleAck={handleToggleAck}
              onToggleTask={(id) => setTaskOpenId(taskOpenId === id ? null : id)}
              onDelete={handleDelete}
              onCreateTask={(data) => handleCreateTask(f.id, data)}
              onCancelTask={() => setTaskOpenId(null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
