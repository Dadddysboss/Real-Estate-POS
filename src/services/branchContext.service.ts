const BRANCH_KEY = 'current_branch_id';
export const DEFAULT_BRANCH_ID = 'BRANCH_MAIN';

export function getCurrentBranchId(): string {
  try {
    const stored = localStorage.getItem(BRANCH_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch { /* storage unavailable */ }
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user?.branch_id) return String(user.branch_id);
  } catch { /* ignore */ }
  return DEFAULT_BRANCH_ID;
}

export function setCurrentBranchId(id: string): void {
  try { localStorage.setItem(BRANCH_KEY, id); } catch { /* best effort */ }
}
