export const SLA_HOURS = { High: 4, Medium: 24, Low: 72 };
export const CATEGORIES = ['IT', 'HR', 'Facility'];
export const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

export const dueAt = (priority, from = new Date()) => new Date(from.getTime() + SLA_HOURS[priority] * 3600000);

export function validateRequest(b) {
  const errs = [];
  if (typeof b.title !== 'string' || b.title.trim().length < 5 || b.title.length > 80) errs.push('Title must be 5-80 characters.');
  if (typeof b.description !== 'string' || b.description.trim().length < 10 || b.description.length > 500) errs.push('Description must be 10-500 characters.');
  if (!CATEGORIES.includes(b.category)) errs.push('Category must be IT, HR or Facility.');
  if (!(b.priority in SLA_HOURS)) errs.push('Priority must be Low, Medium or High.');
  return errs;
}
