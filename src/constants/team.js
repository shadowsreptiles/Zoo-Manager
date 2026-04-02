export const TEAM = [
  { name: 'Anthony',  role: 'supervisor', pin: '1129', assignedEnclosures: [] },
  { name: 'Ailanys',  role: 'employee',   pin: '2024', assignedEnclosures: [] },
  { name: 'Inely',    role: 'employee',   pin: '3030', assignedEnclosures: [] },
]

export const NAV = [
  { id: 'home',     icon: 'home',          label: 'Home'     },
  { id: 'animals',  icon: 'paw',           label: 'Animals'  },
  { id: 'care',     icon: 'clipboard',     label: 'Care'     },
  { id: 'projects', icon: 'list',          label: 'Tasks'    },
  { id: 'feedback', icon: 'messageCircle', label: 'Feedback' },
  { id: 'canvas',   icon: 'sparkles',      label: 'Obsidia'  },
  { id: 'team',     icon: 'users',         label: 'Team'     },
]

export const DEFAULT_NAV_RESTRICTIONS = {
  home: true, animals: true, care: true, projects: true, feedback: true, canvas: true,
}

// Maps sub-pages to their parent nav page for access control.
// If a parent page is restricted, all its sub-pages are too.
export const PAGE_PARENT_MAP = {
  tasklog:      'projects',
  taskcalendar: 'projects',
  snakes:       'care',
  archive:      'team',
  teamFeedback: 'team',
}

export const DEFAULT_PERMISSIONS = {
  editAnimals: true,
  editTasks: true,
  editEnclosures: true,
  submitPhotos: true,
  requiresTimeClock: false,
}
