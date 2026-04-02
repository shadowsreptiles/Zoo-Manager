import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { NAV } from '../constants/team'
import { isSupervisor, getNavRestrictions, getEmployeePermissions } from '../utils/permissions'
import { Icons } from './Icons'
import { apiGet, apiPost } from '../lib/api'

const TC_QR_CODE = 'SHADOWS_REPTILES_TIMECLOCK_AUTH_2026'

function tcTodayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function tcFormatTime(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── Timeclock QR Scanner Overlay ─────────────────────────────────────────────
function TimeclockOverlay({ action, userName, onDismiss, onSuccess }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const [status, setStatus] = useState('Starting camera…')
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }, [])

  const dismiss = useCallback(() => { stopCamera(); onDismiss() }, [stopCamera, onDismiss])

  const recordPunch = useCallback(async () => {
    const today = tcTodayStr()
    const now = new Date().toISOString()
    const id = userName.toLowerCase().replace(/\s+/g, '_') + '_' + today
    try {
      if (action === 'clockin') {
        await apiPost({ action: 'clockIn', id, employee: userName, date: today, clock_in: now })
        const msg = `Clocked in at ${tcFormatTime(now)}!`
        setSuccessMsg(msg)
        onSuccess({ action, now })
      } else {
        await apiPost({ action: 'clockOut', employee: userName, date: today, clock_out: now })
        const msg = `Clocked out at ${tcFormatTime(now)}. Have a great day!`
        setSuccessMsg(msg)
        onSuccess({ action, now })
      }
      setTimeout(() => dismiss(), 2400)
    } catch {
      setStatus('❌ Error saving — please try again.')
    }
  }, [action, userName, onSuccess, dismiss])

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !streamRef.current) return
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = typeof window.jsQR !== 'undefined' ? window.jsQR(imageData.data, imageData.width, imageData.height) : null
        if (code && code.data === TC_QR_CODE) {
          stopCamera()
          recordPunch()
          return
        }
      } catch {}
    }
    rafRef.current = requestAnimationFrame(scanFrame)
  }, [stopCamera, recordPunch])

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } })
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        setStatus('Scanning…')
        rafRef.current = requestAnimationFrame(scanFrame)
      } catch (e) {
        setStatus('Camera unavailable — ' + (e.message || 'permission denied'))
      }
    }
    startCamera()
    return () => stopCamera()
  }, [scanFrame, stopCamera])

  const icon = action === 'clockin' ? <span style={{color:'var(--green)', width:36, height:36, display:'inline-block'}}>{Icons.clock}</span> : <span style={{color:'var(--blue)', width:36, height:36, display:'inline-block'}}>{Icons.moon}</span>
  const title = action === 'clockin' ? 'Clock In' : 'Clock Out'
  const desc = action === 'clockin'
    ? 'Point your camera at the Clock In QR code posted on the wall.'
    : 'Point your camera at the QR code posted on the wall.'

  return (
    <div role="dialog" aria-label={title} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.96)', zIndex: 9000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 28, textAlign: 'center' }}>
      <div style={{ fontSize: 36 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#aaa', maxWidth: 300 }}>{desc}</div>
      {/* Camera viewfinder */}
      <div style={{ position: 'relative', width: 260, height: 260, borderRadius: 16, overflow: 'hidden', background: '#000', border: '2px solid #333' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {/* Corner brackets */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 14, left: 14, width: 30, height: 30, borderTop: '3px solid #4CAF50', borderLeft: '3px solid #4CAF50', borderRadius: '3px 0 0 0' }} />
          <div style={{ position: 'absolute', top: 14, right: 14, width: 30, height: 30, borderTop: '3px solid #4CAF50', borderRight: '3px solid #4CAF50', borderRadius: '0 3px 0 0' }} />
          <div style={{ position: 'absolute', bottom: 14, left: 14, width: 30, height: 30, borderBottom: '3px solid #4CAF50', borderLeft: '3px solid #4CAF50', borderRadius: '0 0 0 3px' }} />
          <div style={{ position: 'absolute', bottom: 14, right: 14, width: 30, height: 30, borderBottom: '3px solid #4CAF50', borderRight: '3px solid #4CAF50', borderRadius: '0 0 3px 0' }} />
        </div>
      </div>
      {!successMsg && <div style={{ fontSize: 12, color: '#666' }}>{status}</div>}
      {error && <div style={{ fontSize: 13, color: '#e53935' }}>{error}</div>}
      {successMsg && <div style={{ fontSize: 16, fontWeight: 700, color: '#4CAF50' }}>{successMsg}</div>}
      {!successMsg && (
        <button onClick={dismiss} style={{ padding: '8px 22px', borderRadius: 8, border: '1px solid #444', background: 'transparent', color: '#777', cursor: 'pointer', fontSize: 12 }}>
          Skip (no camera)
        </button>
      )}
    </div>
  )
}

// Logo SVG (snake shield) — matches original dimensions and paths exactly
function LogoSVG() {
  return (
    <svg width="44" height="48" viewBox="0 0 44 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
      {/* Shield outline */}
      <path d="M22 2L4 9V24C4 34.5 12 43 22 46C32 43 40 34.5 40 24V9L22 2Z" fill="#1a0a0a" stroke="#c0392b" strokeWidth="1.5"/>
      {/* Scale row 1 (top) */}
      <path d="M14 13 Q18 9 22 13 Q18 17 14 13Z" fill="#c0392b" opacity="0.85"/>
      <path d="M22 13 Q26 9 30 13 Q26 17 22 13Z" fill="#c0392b" opacity="0.85"/>
      {/* Scale row 2 */}
      <path d="M10 20 Q14 16 18 20 Q14 24 10 20Z" fill="#c0392b" opacity="0.75"/>
      <path d="M18 20 Q22 16 26 20 Q22 24 18 20Z" fill="#c0392b" opacity="0.75"/>
      <path d="M26 20 Q30 16 34 20 Q30 24 26 20Z" fill="#c0392b" opacity="0.75"/>
      {/* Scale row 3 */}
      <path d="M13 27 Q17 23 21 27 Q17 31 13 27Z" fill="#c0392b" opacity="0.65"/>
      <path d="M21 27 Q25 23 29 27 Q25 31 21 27Z" fill="#c0392b" opacity="0.65"/>
      {/* Scale row 4 (bottom) */}
      <path d="M17 34 Q22 30 27 34 Q22 38 17 34Z" fill="#c0392b" opacity="0.55"/>
      {/* Shield highlight */}
      <path d="M22 2L4 9V24C4 34.5 12 43 22 46" stroke="#e74c3c" strokeWidth="0.5" opacity="0.4" fill="none"/>
    </svg>
  )
}

// Circular progress ring in header (matches original exactly)
function ProgressRing({ pct }) {
  const circumference = 125.6 // 2 * Math.PI * 20
  const offset = circumference * (1 - Math.min(pct, 100) / 100)
  const strokeColor = pct === 100 ? 'var(--green)' : pct >= 50 ? '#42a5f5' : 'var(--red)'

  return (
    <svg className="progress-ring" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="20" fill="none" stroke="var(--dark4)" strokeWidth="4" />
      <circle
        cx="22" cy="22" r="20" fill="none"
        stroke={strokeColor} strokeWidth="4"
        strokeDasharray="125.6"
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s' }}
      />
      <text x="22" y="26" textAnchor="middle" fill="var(--silverLight)" fontSize="14" fontWeight="700">
        {pct}%
      </text>
    </svg>
  )
}

function SyncBar({ onLogout, onShowClockOut }) {
  const { syncStatus, userName, supervisorOriginalUser, update } = useStore(useShallow(s => ({
    syncStatus: s.syncStatus,
    userName: s.userName,
    supervisorOriginalUser: s.supervisorOriginalUser,
    update: s.update,
  })))

  const sup = isSupervisor()
  const perms = userName ? getEmployeePermissions(userName) : {}
  const needsTimeClock = perms.requiresTimeClock && !sup

  function switchBack() {
    update({ userName: supervisorOriginalUser, supervisorOriginalUser: null })
    localStorage.setItem('userName', supervisorOriginalUser)
  }

  return (
    <div style={{ background: 'var(--dark)', borderBottom: '1px solid var(--dark3)', padding: '6px 20px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
      <div className={`sync-status ${syncStatus}`} title="Sync status" aria-label={`Sync status: ${syncStatus}`} />
      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>TEAM SYNC</span>
      {/* syncConfig: single flex-item matching the original's #syncConfig div layout */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--green)' }}>● Connected</span>
        <span style={{ color: 'var(--silverDark)', marginLeft: 6 }}>as <strong style={{ color: 'var(--white)' }}>{userName || 'Unknown'}</strong></span>
        <button aria-label="Refresh data" onClick={apiGet} style={{ marginLeft: 8, padding: '0px 5px', borderRadius: 4, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--silver)', fontSize: 11, cursor: 'pointer', lineHeight: '15px' }}>
          Refresh
        </button>
        {needsTimeClock && (
          <button aria-label="Clock out" onClick={onShowClockOut} style={{ marginLeft: 4, padding: '2px 10px', borderRadius: 6, background: 'rgba(255,152,0,.12)', border: '1px solid var(--orange)', color: 'var(--orange)', fontSize: 10, cursor: 'pointer' }}>
            Clock Out
          </button>
        )}
        <button aria-label="Logout" onClick={onLogout} style={{ marginLeft: 4, padding: '0px 5px', borderRadius: 4, background: 'var(--dark3)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 11, cursor: 'pointer', lineHeight: '15px' }}>
          Logout
        </button>
        {supervisorOriginalUser && (
          <button onClick={switchBack} style={{ marginLeft: 4, padding: '2px 10px', borderRadius: 6, background: 'rgba(66,165,245,.15)', border: '1px solid var(--blue)', color: 'var(--blue)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
            ↩ {supervisorOriginalUser}
          </button>
        )}
      </div>
    </div>
  )
}

function Nav() {
  const { page, setPage, userName } = useStore(useShallow(s => ({ page: s.page, setPage: s.setPage, userName: s.userName })))
  const sup = isSupervisor()
  const navR = !sup ? getNavRestrictions(userName) : null

  const visible = NAV.filter(n => {
    if (n.id === 'team' && !sup) return false
    if (navR && navR[n.id] === false) return false
    return true
  })

  // ── Nav order (drag-and-drop, per-user, localStorage) ──────
  const orderKey = 'navOrder_' + (userName || 'default')
  function getSavedOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(orderKey))
      if (Array.isArray(saved) && saved.length > 0) return saved
    } catch (e) {}
    return null
  }
  function getOrdered() {
    const saved = getSavedOrder()
    if (!saved) return visible
    const ordered = []
    saved.forEach(id => { const item = visible.find(n => n.id === id); if (item) ordered.push(item) })
    visible.forEach(n => { if (!ordered.find(o => o.id === n.id)) ordered.push(n) })
    return ordered
  }

  const [navItems, setNavItems] = useState(() => getOrdered())
  const [draggingIdx, setDraggingIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const touchSrcIdx = useRef(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchMoved = useRef(false)

  // Re-sync when userName or nav restrictions change
  useEffect(() => { setNavItems(getOrdered()) }, [userName])

  function reorder(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const next = [...navItems]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    localStorage.setItem(orderKey, JSON.stringify(next.map(n => n.id)))
    setNavItems(next)
  }

  // Mouse drag handlers
  function onDragStart(e, idx) {
    setDraggingIdx(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', idx)
  }
  function onDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }
  function onDragLeave() { setDragOverIdx(null) }
  function onDrop(e, idx) {
    e.preventDefault()
    reorder(draggingIdx, idx)
    setDraggingIdx(null)
    setDragOverIdx(null)
  }
  function onDragEnd() { setDraggingIdx(null); setDragOverIdx(null) }

  // Touch drag handlers (mobile)
  function onTouchStart(e, idx) {
    touchSrcIdx.current = idx
    touchMoved.current = false
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  function onTouchMove(e, idx) {
    if (touchSrcIdx.current === null) return
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current)
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current)
    if (dx > 10 || dy > 10) touchMoved.current = true
    if (!touchMoved.current) return
    e.preventDefault()
    const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY)
    if (el) {
      const navEl = el.closest('.nav-item')
      if (navEl) setDragOverIdx(parseInt(navEl.dataset.idx, 10))
    }
  }
  function onTouchEnd(e) {
    if (touchSrcIdx.current === null || !touchMoved.current) { touchSrcIdx.current = null; return }
    const el = document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
    if (el) {
      const navEl = el.closest('.nav-item')
      if (navEl) {
        const targetIdx = parseInt(navEl.dataset.idx, 10)
        if (!isNaN(targetIdx)) reorder(touchSrcIdx.current, targetIdx)
      }
    }
    touchSrcIdx.current = null
    touchMoved.current = false
    setDraggingIdx(null)
    setDragOverIdx(null)
  }

  return (
    <nav className="sidebar" role="navigation" aria-label="Main navigation">
      {navItems.map((n, i) => {
        let cls = 'nav-item'
        if (page === n.id) cls += ' active'
        if (draggingIdx === i) cls += ' dragging'
        if (dragOverIdx === i && draggingIdx !== i) cls += ' drag-over'
        return (
          <div
            key={n.id}
            className={cls}
            data-idx={i}
            draggable
            role="button"
            aria-label={n.label}
            aria-current={page === n.id ? 'page' : undefined}
            onClick={() => setPage(n.id)}
            onDragStart={e => onDragStart(e, i)}
            onDragOver={e => onDragOver(e, i)}
            onDragLeave={onDragLeave}
            onDrop={e => onDrop(e, i)}
            onDragEnd={onDragEnd}
            onTouchStart={e => onTouchStart(e, i)}
            onTouchMove={e => onTouchMove(e, i)}
            onTouchEnd={onTouchEnd}
          >
            <div className="nav-icon">{Icons[n.icon]}</div>
            <div className="nav-label">{n.label}</div>
          </div>
        )
      })}
    </nav>
  )
}

export default function Layout({ children }) {
  const { userName, setUserName, supervisorOriginalUser, update, taskTree, timeclockRecords, tcPendingClockIn } = useStore(useShallow(s => ({
    userName: s.userName,
    setUserName: s.setUserName,
    supervisorOriginalUser: s.supervisorOriginalUser,
    update: s.update,
    taskTree: s.taskTree,
    timeclockRecords: s.timeclockRecords,
    tcPendingClockIn: s.tcPendingClockIn,
  })))

  const [tcOverlay, setTcOverlay] = useState(null) // null | { action: 'clockin'|'clockout' }

  // Show clock-in scanner when Login sets the pending flag after a fresh login
  useEffect(() => {
    if (tcPendingClockIn && !tcOverlay) {
      update({ tcPendingClockIn: false })
      setTcOverlay({ action: 'clockin' })
    }
  }, [tcPendingClockIn])

  // Calculate progress percentage for the ring — matches original:
  // counts ALL tsk_ and task_ prefixed nodes, done vs total
  let total = 0, done = 0
  ;(function walk(nodes) {
    (nodes || []).forEach(n => {
      if (n.id && (n.id.startsWith('tsk_') || n.id.startsWith('task_'))) {
        total++
        if (n.status === 'done') done++
      }
      walk(n.children || [])
    })
  })(taskTree)
  const pct = total > 0 ? Math.round(done / total * 100) : 0

  function handleLogout() {
    if (supervisorOriginalUser) {
      update({ userName: supervisorOriginalUser, supervisorOriginalUser: null })
      localStorage.setItem('userName', supervisorOriginalUser)
    } else {
      localStorage.removeItem('userName')
      setUserName('')
    }
  }

  function handleTcSuccess({ action, now }) {
    // Update local state — overlay auto-dismisses after 2.4s via its own timer
    const today = tcTodayStr()
    const records = [...(timeclockRecords || [])]
    const idx = records.findIndex(r => r.employee === userName && r.date === today)
    if (action === 'clockin') {
      const id = userName.toLowerCase().replace(/\s+/g, '_') + '_' + today
      const rec = { id, employee: userName, date: today, clock_in: now, clock_out: null }
      if (idx >= 0) records[idx] = rec; else records.push(rec)
    } else {
      if (idx >= 0) records[idx] = { ...records[idx], clock_out: now }
    }
    update({ timeclockRecords: records })
    // Note: overlay closes itself after showing success for 2.4s (via onDismiss callback)
  }

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="header">
        <div className="header-left">
          <LogoSVG />
          <div>
            <div className="logo-text">Shadow<span>'</span>s Reptiles</div>
            <div className="logo-sub">Zoo Manager</div>
          </div>
        </div>
        <div className="header-right">
          <ProgressRing pct={pct} />
        </div>
      </header>

      <SyncBar
        onLogout={handleLogout}
        onShowClockOut={() => setTcOverlay({ action: 'clockout' })}
      />

      <div className="main-container">
        <Nav />
        <main id="main-content" className="content">
          {children}
        </main>
      </div>

      {tcOverlay && (
        <TimeclockOverlay
          action={tcOverlay.action}
          userName={userName}
          onDismiss={() => setTcOverlay(null)}
          onSuccess={handleTcSuccess}
        />
      )}
    </>
  )
}
