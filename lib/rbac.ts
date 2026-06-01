// lib/rbac.ts
// Single source of truth for all role-based permissions.
// Import `can` anywhere — pages, components, API routes.

export type AppRole =
  | 'GP'
  | 'LP'  
  | 'Associate'
  | 'Analyst'
  | 'Finance'
  | 'LP Manager'
  | 'Viewer';

// ─── Permission checks ────────────────────────────────────────

export const can = {
  // Funds
  createFund:          (r?: AppRole) => r === 'GP',
  deleteFund:          (r?: AppRole) => r === 'GP',
  editFund:            (r?: AppRole) => r === 'GP',

  // Companies / Portfolio
  editCompany:         (r?: AppRole) => !!r && ['GP', 'Associate'].includes(r),
  addTransaction:      (r?: AppRole) => !!r && ['GP', 'Associate', 'Finance'].includes(r),
  approveInvestment:   (r?: AppRole) => r === 'GP',
  addCompanyUpdate:    (r?: AppRole) => !!r && ['GP', 'Associate', 'Analyst'].includes(r),
  deleteCompanyUpdate: (r?: AppRole) => !!r && ['GP', 'Associate'].includes(r),

  // Data Room
  uploadDocument:      (r?: AppRole) => !!r && ['GP', 'Associate'].includes(r),
  deleteDocument:      (r?: AppRole) => r === 'GP',
  viewDocument:        (r?: AppRole) => !!r && ['GP', 'Associate', 'Analyst', 'Finance', 'LP Manager'].includes(r),
  downloadDocument:    (r?: AppRole) => !!r && ['GP', 'Associate', 'Analyst', 'Finance', 'LP Manager'].includes(r),

  // LP Data
  viewLPData:          (r?: AppRole) => !!r && ['GP', 'Finance', 'LP Manager'].includes(r),
  editLPData:          (r?: AppRole) => !!r && ['GP', 'Finance'].includes(r),
  manageCapitalCalls:  (r?: AppRole) => !!r && ['GP', 'Finance', 'LP Manager'].includes(r),
  viewLPContact:       (r?: AppRole) => !!r && ['GP', 'Finance', 'LP Manager'].includes(r),

  // Team / Settings
  manageTeam:          (r?: AppRole) => r === 'GP',
  viewSettings:        (r?: AppRole) => r === 'GP',
  inviteUser:          (r?: AppRole) => r === 'GP',

  // Analytics / Reports
  viewAnalytics:       (r?: AppRole) => !!r,
  exportData:          (r?: AppRole) => !!r && ['GP', 'Associate', 'Finance'].includes(r),
} as const;

// ─── Role metadata (for UI display) ──────────────────────────

export const ROLE_META: Record<AppRole, { label: string; description: string; color: string }> = {
  'GP': {
    label: 'GP',
    description: 'Full access — create funds, approve investments, manage team',
    color: 'bg-purple-100 text-purple-800',
  },
  'LP': {
    label: 'LP',
    description: 'Limited Partner — read-only access to own investment data',
    color: 'bg-indigo-100 text-indigo-800',
  },
  'Associate': {
    label: 'Associate',
    description: 'Edit portfolio companies, add transactions, no fund creation',
    color: 'bg-blue-100 text-blue-800',
  },
  'Analyst': {
    label: 'Analyst',
    description: 'Read-only on portfolio & metrics, can add company updates',
    color: 'bg-sky-100 text-sky-800',
  },
  'Finance': {
    label: 'Finance',
    description: 'Full LP data, capital calls, expenses & distributions',
    color: 'bg-green-100 text-green-800',
  },
  'LP Manager': {
    label: 'LP Manager',
    description: 'LP communication, capital call scheduling, read-only portfolio',
    color: 'bg-amber-100 text-amber-800',
  },
  'Viewer': {
    label: 'Viewer',
    description: 'Read-only dashboard, no sensitive LP data',
    color: 'bg-gray-100 text-gray-600',
  },
};

export const ALL_ROLES = Object.keys(ROLE_META) as AppRole[];
