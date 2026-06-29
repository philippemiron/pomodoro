export function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatFriendlyDate(date) {
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

export function getLevelClass(mins) {
  if (mins === 0) return 'level-0';
  if (mins <= 25) return 'level-1';
  if (mins <= 50) return 'level-2';
  if (mins <= 75) return 'level-3';
  return 'level-4';
}

export function getHourlyLevelClass(mins) {
  if (mins === 0) return 'level-0';
  if (mins <= 15) return 'level-1';
  if (mins <= 30) return 'level-2';
  if (mins <= 45) return 'level-3';
  return 'level-4';
}
