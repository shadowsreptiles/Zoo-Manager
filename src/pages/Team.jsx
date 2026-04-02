import { useState } from 'react'
import { Icons } from '../components/Icons'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { TEAM, DEFAULT_NAV_RESTRICTIONS, DEFAULT_PERMISSIONS } from '../constants/team'
import { getEmployeePermissions, getNavRestrictions, getMemberPin, isSupervisor } from '../utils/permissions'
import { apiPost, apiGet } from '../lib/api'

function PermToggle({ label, desc, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--dark3)', border: `1px solid ${checked ? 'rgba(76,175,80,.3)' : 'var(--dark4)'}`, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: 'var(--green)', width: 15, height: 15, cursor: 'pointer' }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: checked ? 'var(--silverLight)' : 'var(--dimmed)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{desc}</div>
      </div>
    </label>
  )
}

function EmployeeCard({ emp, onRemove }) {
  const { teamPermissions, navRestrictions, update, userName } = useStore(useShallow(s => ({
    teamPermissions: s.teamPermissions, navRestrictions: s.navRestrictions, update: s.update, userName: s.userName
  })))
  const [permOpen, setPermOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [pin, setPin] = useState(getMemberPin(emp.name))
  const [pinVisible, setPinVisible] = useState(false)

  const navR = getNavRestrictions(emp.name)
  const perms = getEmployeePermissions(emp.name)

  function savePerm(key, value) {
    const cur = { ...DEFAULT_PERMISSIONS, ...(teamPermissions[emp.name] || {}), [key]: value }
    const updated = { ...teamPermissions, [emp.name]: cur }
    update({ teamPermissions: updated })
    apiPost({ action: 'saveTeamPermissions', employee: emp.name, permissions: cur })
  }

  function saveNavRestriction(pageId, enabled) {
    const cur = { ...DEFAULT_NAV_RESTRICTIONS, ...(navRestrictions[emp.name] || {}) }
    cur[pageId] = enabled
    const updated = { ...navRestrictions, [emp.name]: cur }
    update({ navRestrictions: updated })
    apiPost({ action: 'saveNavRestrictions', employee: emp.name, restrictions: cur })
  }

  function savePin() {
    if (pin.length < 4) return
    const pins = JSON.parse(localStorage.getItem('teamPins') || '{}')
    pins[emp.name] = pin
    localStorage.setItem('teamPins', JSON.stringify(pins))
    apiPost({ action: 'saveTeamPin', name: emp.name, pin })
    alert(`PIN saved for ${emp.name}`)
  }

  function switchTo() {
    update({ supervisorOriginalUser: userName, userName: emp.name })
    localStorage.setItem('userName', emp.name)
  }

  const navPages = [
    { id: 'home',     label: 'Home',     desc: 'Dashboard & daily overview',     emoji: '🏠' },
    { id: 'animals',  label: 'Animals',  desc: 'Animal profiles & care schedule', emoji: '🐾' },
    { id: 'care',     label: 'Care',     desc: 'Daily care check-off schedule',   emoji: '📋' },
    { id: 'projects', label: 'Tasks',    desc: 'Task management & assignments',   emoji: '✅' },
    { id: 'feedback', label: 'Feedback', desc: 'Team feedback & submissions',     emoji: '💬' },
  ]

  const enabledCount = navPages.filter(p => navR[p.id] !== false).length

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      {/* Employee header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,var(--red),var(--redDark))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16 }}>
          {emp.name[0]}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: 14 }}>{emp.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{emp.role === 'supervisor' ? 'Supervisor' : 'Employee'} · {enabledCount} pages enabled</div>
        </div>
        {onRemove && (
          <button onClick={onRemove} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(244,67,54,.3)', background: 'rgba(244,67,54,.08)', color: '#f44336', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>Remove</button>
        )}
      </div>

      {/* Nav Customization */}
      <div className="perm-header" onClick={() => setNavOpen(o => !o)} aria-expanded={navOpen}>
        <div className="perm-label" style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase' }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.compass} Nav Customization</span></div>
        <span className="perm-chevron" style={{ transform: navOpen ? 'rotate(180deg)' : '' }}>{Icons.chevronDown}</span>
      </div>
      <div className={`perm-drawer${navOpen ? ' open' : ''}`}>
        <div style={{ display: 'grid', gap: 8, paddingTop: 10 }}>
          {navPages.map(p => (
            <PermToggle
              key={p.id}
              label={p.label}
              desc={p.desc}
              checked={navR[p.id] !== false}
              onChange={v => saveNavRestriction(p.id, v)}
            />
          ))}
        </div>
      </div>

      {/* Permissions */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--dark4)' }}>
        <div className="perm-header" onClick={() => setPermOpen(o => !o)} aria-expanded={permOpen}>
          <div className="perm-label" style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase' }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.shield} Permissions</span></div>
          <span className="perm-chevron" style={{ transform: permOpen ? 'rotate(180deg)' : '' }}>{Icons.chevronDown}</span>
        </div>
        <div className={`perm-drawer${permOpen ? ' open' : ''}`}>
          <div style={{ display: 'grid', gap: 8, paddingTop: 10 }}>
            {[
              { key: 'editAnimals',       label: 'Edit Animals',          desc: 'Can edit animal profiles & health records' },
              { key: 'editTasks',         label: 'Edit Tasks',            desc: 'Can complete & manage daily tasks' },
              { key: 'editEnclosures',    label: 'Edit Enclosures',       desc: 'Can complete enclosure care tasks' },
              { key: 'submitPhotos',      label: 'Submit Photos',         desc: 'Photos auto-approved on submission' },
              { key: 'requiresTimeClock', label: 'Requires Time Clock', desc: 'Must scan QR code to clock in/out each day' },
            ].map(p => (
              <PermToggle
                key={p.key}
                label={p.label}
                desc={p.desc}
                checked={perms[p.key] !== false}
                onChange={v => savePerm(p.key, v)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* PIN Management */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--dark4)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', marginBottom: 8 }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.key} PIN Management</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type={pinVisible ? 'text' : 'password'}
            maxLength={4}
            inputMode="numeric"
            placeholder="New 4-digit PIN"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/,''))}
            className="config-input"
            style={{ width: 140, letterSpacing: 4, textAlign: 'center' }}
          />
          <button onClick={() => setPinVisible(v => !v)} aria-label={pinVisible ? 'Hide PIN' : 'Show PIN'} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'var(--dark3)', color: 'var(--silver)', cursor: 'pointer', fontSize: 11 }}>{pinVisible ? Icons.eyeOff : Icons.eye}</button>
          <button onClick={savePin} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--green)', background: 'rgba(76,175,80,.1)', color: 'var(--green)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Save</button>
          <button onClick={switchTo} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--blue)', background: 'rgba(66,165,245,.1)', color: 'var(--blue)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Switch To</button>
        </div>
      </div>
    </div>
  )
}

function SupervisorCard() {
  const { userName } = useStore(useShallow(s => ({ userName: s.userName })))
  const [pin, setPin] = useState(getMemberPin(userName))
  const [visible, setVisible] = useState(false)

  function savePin() {
    if (pin.length < 4) return
    const pins = JSON.parse(localStorage.getItem('teamPins') || '{}')
    pins[userName] = pin
    localStorage.setItem('teamPins', JSON.stringify(pins))
    apiPost({ action: 'saveTeamPin', name: userName, pin })
    alert('PIN updated')
  }

  return (
    <div className="card" style={{ marginBottom: 14, border: '1px solid rgba(227,30,36,.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,var(--red),var(--redDark))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 16 }}>
          {userName[0]}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: 14 }}>{userName}</div>
          <div style={{ fontSize: 11, color: 'var(--red)' }}>Supervisor</div>
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', marginBottom: 8 }}><span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.key} My PIN</span></div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type={visible ? 'text' : 'password'} maxLength={4} inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/,''))} className="config-input" style={{ width: 140, letterSpacing: 4, textAlign: 'center' }} />
        <button onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide PIN' : 'Show PIN'} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--dark4)', background: 'var(--dark3)', color: 'var(--silver)', cursor: 'pointer', fontSize: 11 }}>{visible ? Icons.eyeOff : Icons.eye}</button>
        <button onClick={savePin} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--green)', background: 'rgba(76,175,80,.1)', color: 'var(--green)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Save</button>
      </div>
    </div>
  )
}

function AddMemberModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('employee')
  const [pin, setPin] = useState('')

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({ name: trimmed, role, pin: pin || null })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--dark2)', borderRadius: 14, border: '1px solid var(--dark4)', padding: 24, width: '100%', maxWidth: 360 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--white)', marginBottom: 16 }}>Add Team Member</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', marginBottom: 4 }}>Name *</div>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="config-input" style={{ width: '100%' }} autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', marginBottom: 4 }}>Role</div>
            <select value={role} onChange={e => setRole(e.target.value)} className="config-input" style={{ width: '100%', cursor: 'pointer' }}>
              <option value="employee">Employee</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', marginBottom: 4 }}>PIN (optional)</div>
            <input type="text" maxLength={4} inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4-digit PIN" className="config-input" style={{ width: 140, letterSpacing: 4, textAlign: 'center' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--dark4)', background: 'var(--dark3)', color: 'var(--silver)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={!name.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: name.trim() ? 'var(--red)' : 'var(--dark4)', color: '#fff', cursor: name.trim() ? 'pointer' : 'default', fontSize: 12, fontWeight: 700 }}>Add Member</button>
        </div>
      </div>
    </div>
  )
}

export default function Team() {
  const sup = isSupervisor()
  const { update, teamMembers, userName } = useStore(useShallow(s => ({ update: s.update, teamMembers: s.teamMembers, userName: s.userName })))
  const [addOpen, setAddOpen] = useState(false)

  // Merge hardcoded TEAM with DB teamMembers — DB wins for names that exist in both
  const dbNames = new Set((teamMembers || []).map(m => m.name))
  const merged = [
    ...(teamMembers || []).map(m => ({ name: m.name, role: m.role || (TEAM.find(t => t.name === m.name)?.role) || 'employee' })),
    ...TEAM.filter(t => !dbNames.has(t.name)).map(t => ({ name: t.name, role: t.role })),
  ]
  const supervisor = merged.find(m => m.name === userName) || { name: userName, role: 'supervisor' }
  const employees = merged.filter(m => m.name !== userName)

  if (!sup) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Access restricted</div>
  }

  async function handleAddMember({ name, role, pin }) {
    await apiPost({
      action: 'addTeamMember',
      name, role, pin,
      permissions_json: JSON.stringify(DEFAULT_PERMISSIONS),
      nav_restrictions_json: JSON.stringify(DEFAULT_NAV_RESTRICTIONS),
    })
    // Store pin locally
    if (pin) {
      const pins = JSON.parse(localStorage.getItem('teamPins') || '{}')
      pins[name] = pin
      localStorage.setItem('teamPins', JSON.stringify(pins))
    }
    // Refresh data from DB
    apiGet()
  }

  async function handleRemoveMember(name) {
    if (!confirm(`Remove ${name} from the team? This cannot be undone.`)) return
    await apiPost({ action: 'removeTeamMember', name })
    // Clear local pin
    const pins = JSON.parse(localStorage.getItem('teamPins') || '{}')
    delete pins[name]
    localStorage.setItem('teamPins', JSON.stringify(pins))
    // Clear from store
    const st = useStore.getState()
    const tp = { ...st.teamPermissions }
    const nr = { ...st.navRestrictions }
    delete tp[name]
    delete nr[name]
    update({
      teamMembers: (st.teamMembers || []).filter(m => m.name !== name),
      teamPermissions: tp,
      navRestrictions: nr,
    })
  }

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>Team Management</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAddOpen(true)} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--red)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.plus} Add Member</span>
          </button>
          <button onClick={() => update({ page: 'archive' })} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.clock} Archive</span>
          </button>
          <button onClick={() => update({ page: 'teamFeedback' })} style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--dark2)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            <span style={{display:'inline-flex',alignItems:'center',gap:4}}>{Icons.messageCircle} Feedback</span>
          </button>
        </div>
      </div>

      <SupervisorCard />

      {employees.map(emp => (
        <EmployeeCard key={emp.name} emp={emp} onRemove={emp.name !== userName ? () => handleRemoveMember(emp.name) : undefined} />
      ))}

      {addOpen && <AddMemberModal onClose={() => setAddOpen(false)} onAdd={handleAddMember} />}
    </div>
  )
}
