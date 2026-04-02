import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // ── Navigation & UI ────────────────────────────────────────────
  page: 'home',
  syncStatus: 'offline',

  // ── Calendar ───────────────────────────────────────────────────
  calView: 'week',
  calDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()),
  calAssigneeF: '',

  // ── Auth ───────────────────────────────────────────────────────
  userName: localStorage.getItem('userName') || '',
  supervisorOriginalUser: null,

  // ── Animals ────────────────────────────────────────────────────
  animalInventory: [],
  animalNotes: {},
  animalNameOverrides: {},
  animalSpeciesOverrides: {},
  animalTypeOverrides: {},
  animalFamilyOverrides: {},
  animalSubspeciesOverrides: {},
  customAnimals: [],
  deletedAnimals: [],
  animalLayout: null,
  selectedAnimal: null,
  animalSearch: '',
  animalZoneF: 'All',
  animalClassF: 'All',
  animalFamilyF: 'All',
  animalSpeciesF: 'All',
  animalSpreadsheetView: false,
  animalSheetTaxExpanded: false,
  animalSheetLocExpanded: false,

  // ── Care / Tasks ───────────────────────────────────────────────
  taskNodes: [],
  taskCompletions: {},
  taskTree: null,
  taskLogView: 'time',
  taskLogPeriod: 'day',

  // ── Snake feeding ──────────────────────────────────────────────
  snakeLog: {},
  snakePreyOverrides: {},

  // ── Team ───────────────────────────────────────────────────────
  teamMembers: [],
  teamPermissions: {},
  navRestrictions: {},
  daysOff: [],
  timeclockRecords: [],
  tcPendingClockIn: false,

  // ── Feedback ───────────────────────────────────────────────────
  teamFeedback: [],
  photoSubmissions: [],

  // ── Setters ────────────────────────────────────────────────────
  setPage: (page) => set({ page }),
  setUserName: (userName) => {
    localStorage.setItem('userName', userName)
    set({ userName })
  },
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  update: (partial) => set(partial),
  updateDeep: (key, subKey, value) => set(state => ({
    [key]: { ...state[key], [subKey]: value }
  })),
}))
