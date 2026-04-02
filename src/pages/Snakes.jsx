import { useState } from 'react'
import { useStore } from '../lib/store'
import { useShallow } from 'zustand/shallow'
import { isSupervisor } from '../utils/permissions'
import { apiPost } from '../lib/api'
import { Icons } from '../components/Icons'

const PREY_SIZES = [
  { label: 'Pinky',       grams: '3-5g'    },
  { label: 'Fuzzy',       grams: '6-9g'    },
  { label: 'Hopper',      grams: '10-15g'  },
  { label: 'Small Mouse', grams: '16-20g'  },
  { label: 'Adult Mouse', grams: '21-28g'  },
  { label: 'Jumbo Mouse', grams: '29-35g'  },
  { label: 'Small Rat',   grams: '60-100g' },
  { label: 'Medium Rat',  grams: '100-200g'},
  { label: 'Large Rat',   grams: '200-300g'},
  { label: 'ASF Small',   grams: '15-30g'  },
  { label: 'ASF Adult',   grams: '40-60g'  },
]

const QUAL_META = {
  excellent: { icon: <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--green)"/></svg>, color: 'var(--green)',  label: 'Excellent', desc: 'Struck immediately, strong feed response' },
  good:      { icon: <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--blue)"/></svg>, color: 'var(--blue)',   label: 'Good',      desc: 'Ate well, normal response' },
  fair:      { icon: <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--orange)"/></svg>, color: 'var(--orange)', label: 'Fair',      desc: 'Hesitant but ate' },
  poor:      { icon: <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="var(--red)"/></svg>, color: 'var(--red)',    label: 'Poor',      desc: 'Refused or barely fed' },
}

function SnakeCard({ animal, snakeInfo, snakeLog, snakePreyOverrides, userName, sup, update }) {
  const uid = animal.uid
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [quality, setQuality] = useState('good')

  const meals = Array.isArray(snakeLog[uid]) ? snakeLog[uid] : []
  const lastDate = meals.length > 0 ? meals[0].date : null
  const days = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 864e5) : null
  const max = parseInt(snakeInfo.freq?.split('-')[1]) || parseInt(snakeInfo.freq) || 14
  const min = parseInt(snakeInfo.freq) || 7
  const overdue = days !== null && days >= max
  const due = days !== null && days >= min

  const currentPrey = snakePreyOverrides[uid] || snakeInfo.prey || 'Adult Mouse'
  const preyInfo = PREY_SIZES.find(p => p.label === currentPrey)

  let statusStyle = { color: 'var(--silver)', background: 'var(--dark3)', border: '1px solid var(--dark4)' }
  let statusText = 'No meals logged'
  if (days !== null) {
    if (overdue) { statusStyle = { color: 'var(--red)', background: 'rgba(227,30,36,.12)', border: '1px solid rgba(227,30,36,.3)' }; statusText = `${days}d — OVERDUE` }
    else if (due) { statusStyle = { color: 'var(--orange)', background: 'rgba(255,152,0,.12)', border: '1px solid rgba(255,152,0,.3)' }; statusText = `${days}d — DUE` }
    else { statusStyle = { color: 'var(--green)', background: 'rgba(76,175,80,.12)', border: '1px solid rgba(76,175,80,.3)' }; statusText = `${days}d ago` }
  }

  function logMeal() {
    if (!date) return
    const entry = { date, quality, by: userName, timestamp: new Date().toISOString() }
    const newMeals = [entry, ...meals]
    const updated = { ...snakeLog, [uid]: newMeals }
    update({ snakeLog: updated })
    apiPost({ action: 'saveSnakeMeal', snake_name: animal.name, last_fed: newMeals[0]?.date || '', meals_json: JSON.stringify(newMeals) })
  }

  function deleteMeal(idx) {
    const newMeals = meals.filter((_, i) => i !== idx)
    const updated = { ...snakeLog, [uid]: newMeals }
    update({ snakeLog: updated })
    apiPost({ action: 'saveSnakeMeal', snake_name: animal.name, last_fed: newMeals[0]?.date || '', meals_json: JSON.stringify(newMeals) })
  }

  function updatePrey(val) {
    update({ snakePreyOverrides: { ...snakePreyOverrides, [uid]: val } })
    apiPost({ action: 'savePreyOverride', snake_index: uid, prey: val })
  }

  return (
    <div className="card" style={{ border: `1px solid ${overdue ? 'rgba(227,30,36,.3)' : due ? 'rgba(255,152,0,.25)' : 'var(--dark4)'}` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ color: 'var(--green)', display: 'flex', width: 28, height: 28 }}>{Icons.snake}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--white)' }}>{animal.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {snakeInfo.cage} · <span style={{ color: 'var(--orange)' }}>{snakeInfo.qty}× {currentPrey}</span>
            {preyInfo && <span style={{ color: 'var(--dimmed)', fontSize: 9 }}> ({preyInfo.grams})</span>}
            {snakeInfo.freq && ` · every ${snakeInfo.freq}`}
          </div>
        </div>
        <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, ...statusStyle }}>{statusText}</span>
      </div>

      {/* Prey selector (supervisor only) */}
      {sup && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label htmlFor={`prey-${uid}`} style={{ fontSize: 10, color: 'var(--dimmed)', fontWeight: 600 }}>Feeder:</label>
          <select id={`prey-${uid}`} value={currentPrey} onChange={e => updatePrey(e.target.value)} className="config-input" style={{ width: 160, padding: '4px 8px', fontSize: 11 }}>
            {PREY_SIZES.map(p => <option key={p.label} value={p.label}>{p.label} ({p.grams})</option>)}
          </select>
          {snakePreyOverrides[uid] && <span style={{ fontSize: 9, color: 'var(--orange)' }}>edited</span>}
        </div>
      )}

      {/* Log meal form */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label htmlFor={`meal-date-${uid}`} className="sr-only">Meal date</label>
        <input id={`meal-date-${uid}`} type="date" value={date} onChange={e => setDate(e.target.value)} className="config-input" style={{ width: 140, padding: '5px 8px', fontSize: 12 }} />
        <label htmlFor={`meal-quality-${uid}`} className="sr-only">Meal quality</label>
        <select id={`meal-quality-${uid}`} value={quality} onChange={e => setQuality(e.target.value)} className="config-input" style={{ width: 130, padding: '5px 8px', fontSize: 12 }}>
          {Object.entries(QUAL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={logMeal} style={{ padding: '6px 14px', background: 'var(--green)', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>Log Meal</button>
      </div>

      {/* Meal history */}
      {meals.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--dimmed)', fontSize: 12, background: 'var(--dark3)', borderRadius: 8 }}>No meals logged yet</div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {meals.slice(0, 5).map((m, mi) => {
            const q = QUAL_META[m.quality] || QUAL_META.good
            const mDate = new Date(m.date + 'T00:00:00')
            const dateStr = mDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            const daysAgo = Math.floor((Date.now() - mDate.getTime()) / 864e5)
            return (
              <div key={mi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--dark3)', borderRadius: 8, border: '1px solid var(--dark4)' }}>
                <span style={{ fontSize: 14 }}>{q.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--silverLight)' }}>{dateStr} <span style={{ color: 'var(--dimmed)', fontSize: 10 }}>({daysAgo}d ago)</span></div>
                  <div style={{ fontSize: 10, color: q.color, fontWeight: 600 }}>{q.label} — {q.desc}</div>
                </div>
                {m.by && <span style={{ fontSize: 9, color: 'var(--dimmed)' }}>{m.by}</span>}
                <button aria-label="Delete meal" onClick={() => { if (window.confirm('Delete this meal entry?')) deleteMeal(mi) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dimmed)', fontSize: 14, padding: '4px 8px', minWidth: 44, minHeight: 44 }}>×</button>
              </div>
            )
          })}
          {meals.length > 5 && <div style={{ textAlign: 'center', padding: 4, color: 'var(--dimmed)', fontSize: 10 }}>+{meals.length - 5} older meals stored</div>}
        </div>
      )}
    </div>
  )
}

export default function Snakes() {
  const { animalInventory, deletedAnimals, snakeLog, snakePreyOverrides, userName, update } = useStore(useShallow(s => ({
    animalInventory: s.animalInventory,
    deletedAnimals: s.deletedAnimals,
    snakeLog: s.snakeLog,
    snakePreyOverrides: s.snakePreyOverrides,
    userName: s.userName,
    update: s.update,
  })))
  const sup = isSupervisor()

  const deletedSet = new Set(deletedAnimals || [])
  const snakes = (animalInventory || []).filter(a =>
    !deletedSet.has(a.uid) && a.cage_slot
  ).map(a => ({
    ...a,
    snakeInfo: {
      name: a.name,
      cage: a.cage_slot,
      qty: a.feeding_qty || 1,
      prey: a.food_type || 'Adult Mouse',
      freq: a.feeding_freq || '7-14 days',
      emoji: '🐍',
    }
  }))

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--white)' }}>Snake Feeding Log</div>
        <button onClick={() => update({ page: 'care' })} style={{ padding: '6px 14px', background: 'var(--dark3)', border: '1px solid var(--dark4)', color: 'var(--silver)', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{Icons.arrowLeft} Care Schedule</span></button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>Track each snake's meal history, schedule, and feeding quality.</div>

      {snakes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)', fontSize: 13 }}>
          No snakes with feeding schedules found. Animals need a cage slot set to appear here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {snakes.map(a => (
            <SnakeCard
              key={a.uid}
              animal={a}
              snakeInfo={a.snakeInfo}
              snakeLog={snakeLog || {}}
              snakePreyOverrides={snakePreyOverrides || {}}
              userName={userName}
              sup={sup}
              update={update}
            />
          ))}
        </div>
      )}
    </div>
  )
}
