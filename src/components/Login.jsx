import { useState } from 'react'
import { TEAM, DEFAULT_PERMISSIONS } from '../constants/team'
import { useStore } from '../lib/store'
import { getMemberPin } from '../utils/permissions'
import { apiGet } from '../lib/api'
import { Icons } from './Icons'

export default function Login() {
  const setUserName = useStore(s => s.setUserName)
  const update = useStore(s => s.update)
  const [selected, setSelected] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const employees = TEAM.filter(m => m.role === 'employee').map(m => m.name)
  const allNames = TEAM.map(m => m.name)

  function doLogin() {
    if (!selected || pin.length < 4) return
    const correctPin = getMemberPin(selected)
    if (pin !== correctPin) {
      setError('Incorrect PIN. Try again.')
      setPin('')
      return
    }
    setError('')
    setUserName(selected)
    apiGet().then(() => {
      const st = useStore.getState()
      const member = TEAM.find(m => m.name === selected)
      const isSup = member?.role === 'supervisor'
      if (!isSup) {
        const perms = Object.assign({}, DEFAULT_PERMISSIONS, (st.teamPermissions || {})[selected] || {})
        if (perms.requiresTimeClock) {
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
          const rec = (st.timeclockRecords || []).find(r => r.employee === selected && r.date === today)
          if (!rec || !rec.clock_in) update({ tcPendingClockIn: true })
        }
      }
    })
  }

  const ready = selected && pin.length === 4

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'linear-gradient(135deg,#0a0a0a 0%,#1a0a0a 50%,#0a0a0a 100%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
    }}>
      <div style={{
        background: 'var(--dark)', border: '2px solid var(--red)', borderRadius: 16,
        padding: 40, width: 340, textAlign: 'center', boxShadow: '0 0 40px rgba(227,30,36,.2)'
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}><span style={{width:48, height:48, color:'var(--red)', display:'inline-block'}}>{Icons.snake}</span></div>
        <h1 style={{ fontSize: 22, color: 'var(--white)', marginBottom: 4, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
          Zoo <span style={{ color: 'var(--red)' }}>Manager</span>
        </h1>
        <div style={{ fontSize: 10, color: 'var(--silverDark)', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 24 }}>
          Shadow's Reptiles
        </div>

        <label htmlFor="login-name" className="sr-only">Select your name</label>
        <select
          id="login-name"
          value={selected}
          onChange={e => { setSelected(e.target.value); setError('') }}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: selected ? 'var(--white)' : 'var(--muted)', marginBottom: 12 }}
        >
          <option value="">-- Select Your Name --</option>
          {allNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        <label htmlFor="login-pin" className="sr-only">Enter PIN</label>
        <input
          id="login-pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="Enter PIN..."
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g,'')); setError('') }}
          onKeyDown={e => e.key === 'Enter' && ready && doLogin()}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--white)', marginBottom: 12, letterSpacing: 4, textAlign: 'center' }}
        />

        {error && <div role="alert" style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{error}</div>}

        <button
          aria-label="Sign in"
          onClick={doLogin}
          disabled={!ready}
          style={{
            width: '100%', padding: 12, borderRadius: 8,
            background: ready ? 'linear-gradient(135deg,var(--red),var(--redDark))' : 'var(--dark4)',
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: ready ? 'pointer' : 'default', textTransform: 'uppercase', letterSpacing: 1, opacity: ready ? 1 : 0.4
          }}
        >
          Sign In
        </button>
      </div>
    </div>
  )
}
