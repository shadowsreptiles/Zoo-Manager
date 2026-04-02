import { useState } from 'react'
import { Icons } from '../components/Icons'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { TEAM } from '../constants/team'
import { apiPost } from '../lib/api'

const TYPES = [
  'Idea / Improvement Suggestion',
  'Complaint / Problem Report',
  'Bug Fix / App Issue',
  'Gratitude / Praise',
  'General Feedback',
]

const AREAS = [
  'Team Processes / Workflow',
  'Communication',
  'Specific Project / Task',
  'Team Culture / Environment',
  'Leadership / Management',
  'Tools / Resources',
  'Animals',
  'Other',
]

const URGENCY_OPTS = [
  'Low (Can wait)',
  'Medium (Needs attention soon)',
  'High (Needs immediate attention)',
]

const COLLAB_ROWS = ['Sharing information', 'Providing constructive criticism', 'Supporting team goals', 'Respecting deadlines']
const COLLAB_COLS = ['Poorly', 'Fairly', 'Well', 'Excellent']

const TYPE_MAP = {
  'Idea / Improvement Suggestion': 'improvement',
  'Complaint / Problem Report':    'warning',
  'Bug Fix / App Issue':           'bug',
  'Gratitude / Praise':            'praise',
  'General Feedback':              'note',
}

const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--silverDark)', textTransform: 'uppercase', letterSpacing: 0.5 }

function RadioGroup({ name, options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, background: 'var(--dark3)', border: '1px solid var(--dark4)', cursor: 'pointer', fontSize: 11, color: 'var(--silver)' }}>
          <input type="radio" name={name} value={opt} checked={value === opt} onChange={() => onChange(opt)} style={{ accentColor: 'var(--red)' }} />
          {opt}
        </label>
      ))}
    </div>
  )
}

export default function Feedback() {
  const { userName, teamFeedback, update } = useStore(useShallow(s => ({
    userName: s.userName,
    teamFeedback: s.teamFeedback,
    update: s.update,
  })))

  const teamNames = TEAM.map(t => t.name)

  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    feedbackType: '',
    area: '',
    description: '',
    impact: '',
    urgency: '',
    concern: '',
    wantsContact: '',
    collab: {},
  })

  const [descError, setDescError] = useState('')

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setCollab = (row, col) => setForm(f => ({ ...f, collab: { ...f.collab, [row]: col } }))

  function submit() {
    if (!form.description.trim()) {
      setDescError('Please describe your feedback before submitting.')
      return
    }
    setDescError('')
    const id = `fb_${Date.now()}`
    const collaboration = COLLAB_ROWS.map((row, i) => ({ dimension: row, rating: form.collab[i] || '' }))
    const entry = {
      id,
      from:          userName || 'Anonymous',
      date:          new Date().toISOString(),
      acknowledged:  false,
      // Rich form fields
      feedbackType:  form.feedbackType,
      area:          form.area,
      description:   form.description,
      impact:        form.impact,
      urgency:       form.urgency,
      concern:       form.concern,
      wantsContact:  form.wantsContact,
      collaboration,
      // Legacy fields for backward-compat display
      type:          TYPE_MAP[form.feedbackType] || 'note',
      to:            form.concern || 'Team',
      text:          form.description,
    }
    const updated = [entry, ...(teamFeedback || [])]
    update({ teamFeedback: updated })
    apiPost({ action: 'saveFeedback', id, data: entry })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{color:'var(--green)'}}>{Icons.checkCircle}</span></div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)' }}>Thank you!</div>
        <div style={{ fontSize: 13, color: 'var(--silver)', maxWidth: 280, lineHeight: 1.6 }}>Your feedback has been submitted. The team appreciates your input.</div>
        <button
          onClick={() => {
            setSubmitted(false)
            setForm({ feedbackType: '', area: '', description: '', impact: '', urgency: '', concern: '', wantsContact: '', collab: {} })
          }}
          style={{ marginTop: 8, padding: '10px 24px', borderRadius: 9, background: 'var(--red)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Submit Another
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--white)', marginBottom: 4 }}><span style={{display:'inline-flex',alignItems:'center',gap:8}}><span style={{color:'var(--blue)'}}>{Icons.messageCircle}</span> Team Feedback</span></div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Share your input, ideas, complaints, and praise to help us improve as a team.</div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>

        {/* Feedback type */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle} htmlFor="fbf_type">What type of feedback are you submitting?</label>
          <RadioGroup name="fbf_type" options={TYPES} value={form.feedbackType} onChange={v => setField('feedbackType', v)} />
        </div>

        {/* Area */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle} htmlFor="fbf_area">Which area does your feedback primarily concern?</label>
          <select
            id="fbf_area"
            value={form.area}
            onChange={e => setField('area', e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 12, outline: 'none' }}
          >
            <option value="">— Choose an area —</option>
            {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Description */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle} htmlFor="fbf_description">Please describe your feedback in detail. Be specific and include context.</label>
          <textarea
            id="fbf_description"
            value={form.description}
            onChange={e => { setField('description', e.target.value); if (descError) setDescError('') }}
            placeholder="Describe your feedback here…"
            rows={5}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--white)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
          {descError && <div role="alert" style={{ color: 'var(--red)', fontSize: 11, marginTop: 2 }}>{descError}</div>}
        </div>

        {/* Impact */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle} htmlFor="fbf_impact">If this is an idea or improvement — rate the potential impact (1 = Low, 5 = High)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Low</span>
            {[1, 2, 3, 4, 5].map(n => (
              <label key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                <input type="radio" name="fbf_impact" value={n} checked={form.impact === String(n)} onChange={() => setField('impact', String(n))} style={{ accentColor: 'var(--red)' }} />
                <span style={{ fontSize: 11, color: 'var(--silver)' }}>{n}</span>
              </label>
            ))}
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>High</span>
          </div>
        </div>

        {/* Urgency */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle} htmlFor="fbf_urgency">If this is a complaint or problem — how urgent is it?</label>
          <RadioGroup name="fbf_urgency" options={URGENCY_OPTS} value={form.urgency} onChange={v => setField('urgency', v)} />
        </div>

        {/* Who does this concern */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle} htmlFor="fbf_concern">Who does this concern?</label>
          <RadioGroup name="fbf_concern" options={teamNames} value={form.concern} onChange={v => setField('concern', v)} />
        </div>

        {/* Contact preference */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle} htmlFor="fbf_contact">Would you like to be contacted to discuss this further?</label>
          <RadioGroup name="fbf_contact" options={['Yes', 'No']} value={form.wantsContact} onChange={v => setField('wantsContact', v)} />
        </div>

        {/* Collaboration grid */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={labelStyle}>How well is the team currently collaborating across these dimensions?</label>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 8px', color: 'var(--muted)', fontWeight: 600, textAlign: 'left', minWidth: 160 }}></th>
                  {COLLAB_COLS.map(c => <th key={c} style={{ padding: '6px 8px', color: 'var(--silver)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {COLLAB_ROWS.map((row, ri) => (
                  <tr key={ri} style={{ borderTop: '1px solid var(--dark4)' }}>
                    <td style={{ padding: 8, color: 'var(--silver)', fontSize: 11 }}>{row}</td>
                    {COLLAB_COLS.map(col => (
                      <td key={col} style={{ padding: 8, textAlign: 'center' }}>
                        <input
                          type="radio"
                          name={`fbf_collab_${ri}`}
                          value={col}
                          checked={form.collab[ri] === col}
                          onChange={() => setCollab(ri, col)}
                          style={{ accentColor: 'var(--red)', width: 14, height: 14 }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          style={{ padding: '12px 24px', borderRadius: 9, background: 'var(--red)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', width: '100%', marginTop: 4 }}
        >
          Submit Feedback
        </button>

      </div>
    </div>
  )
}
