import { useStore } from '../lib/store'
import { TEAM, DEFAULT_PERMISSIONS, DEFAULT_NAV_RESTRICTIONS } from '../constants/team'

export function isSupervisor() {
  const userName = useStore.getState().userName
  const member = TEAM.find(m => m.name === userName)
  return member?.role === 'supervisor'
}

export function getCurrentUser() {
  const userName = useStore.getState().userName
  return TEAM.find(m => m.name === userName) || null
}

export function getEmployeePermissions(empName) {
  const teamPermissions = useStore.getState().teamPermissions
  return Object.assign({}, DEFAULT_PERMISSIONS, teamPermissions[empName] || {})
}

export function hasPermission(permKey) {
  if (isSupervisor()) return true
  const { userName } = useStore.getState()
  const perms = getEmployeePermissions(userName)
  return perms[permKey] !== false
}

export function getNavRestrictions(empName) {
  const { navRestrictions } = useStore.getState()
  return Object.assign({}, DEFAULT_NAV_RESTRICTIONS, navRestrictions[empName] || {})
}

export function getMemberPin(name) {
  try {
    const pins = JSON.parse(localStorage.getItem('teamPins') || '{}')
    if (pins[name]) return pins[name]
  } catch {}
  return TEAM.find(m => m.name === name)?.pin || ''
}

export function getTeamPins() {
  try { return JSON.parse(localStorage.getItem('teamPins') || '{}') } catch { return {} }
}
