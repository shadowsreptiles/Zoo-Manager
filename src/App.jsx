import { useEffect } from 'react'
import { useStore } from './lib/store'
import { apiGet } from './lib/api'
import { isSupervisor, getNavRestrictions } from './utils/permissions'
import { PAGE_PARENT_MAP } from './constants/team'
import Login from './components/Login'
import Layout from './components/Layout'
import Obsidia from './obsidia/Obsidia'

// Pages
import Home from './pages/Home'
import Animals from './pages/Animals'
import Tasks from './pages/Tasks'
import Feedback from './pages/Feedback'
import Team from './pages/Team'
import TaskLog from './pages/TaskLog'
import TaskCalendar from './pages/TaskCalendar'
import Care from './pages/Care'
import Snakes from './pages/Snakes'
import TeamFeedback from './pages/Team Feedback Submissions'
import Archive from './pages/Archive'

const PAGES = {
  home:           <Home />,
  animals:        <Animals />,
  projects:       <Tasks />,
  feedback:       <Feedback />,
  team:           <Team />,
  teamFeedback:   <TeamFeedback />,
  archive:        <Archive />,
  tasklog:        <TaskLog />,
  taskcalendar:   <TaskCalendar />,
  care:           <Care />,
  snakes:         <Snakes />,
}

// Check if a user has access to a given page.
// Supervisors always have access. For employees, check nav restrictions
// for both the page itself and its parent page (for sub-pages).
function canAccessPage(page, userName) {
  if (isSupervisor()) return true

  // 'team' page is always supervisor-only (handled inside Team.jsx too)
  const parentPage = PAGE_PARENT_MAP[page]
  if (parentPage === 'team' || page === 'team') return false

  const navR = getNavRestrictions(userName)

  // If this is a sub-page, check the parent page's restriction
  if (parentPage) {
    return navR[parentPage] !== false
  }

  // Direct page — check its own restriction
  if (navR[page] === false) return false
  return true
}

const ACCESS_DENIED = (
  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
    Access restricted
  </div>
)

export default function App() {
  const userName = useStore(s => s.userName)
  const page = useStore(s => s.page)

  useEffect(() => {
    if (userName) {
      apiGet()
      const interval = setInterval(apiGet, 30000)
      return () => clearInterval(interval)
    }
  }, [userName])

  if (!userName) return <Login />

  // Obsidia gets the full viewport — no Layout wrapper
  if (page === 'canvas') {
    return <Obsidia onBackToZoo={() => useStore.getState().setPage('home')} />
  }

  const allowed = canAccessPage(page, userName)

  return (
    <Layout>
      {allowed ? (PAGES[page] || <Home />) : ACCESS_DENIED}
    </Layout>
  )
}
