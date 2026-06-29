import { formatDate, formatFriendlyDate, getLevelClass, getHourlyLevelClass } from './utils.js';

let selectedDateStr = formatDate(new Date());

export async function renderStats() {
  const data = await chrome.storage.local.get('history');
  const history = data.history || [];

  renderCalendarGrid(history);
  renderHourlyGrid(history, selectedDateStr);
}

function renderCalendarGrid(history) {
  const contributionGrid = document.getElementById('contribution-grid');
  const selectedDayStats = document.getElementById('selected-day-stats');
  if (!contributionGrid || !selectedDayStats) return;

  contributionGrid.innerHTML = '';

  const dates = [];
  const today = new Date();

  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d);
  }

  const dailyTotals = {};
  history.forEach((session) => {
    const dStr = formatDate(new Date(session.timestamp));
    dailyTotals[dStr] = (dailyTotals[dStr] || 0) + session.durationMinutes;
  });

  dates.forEach((date) => {
    const dStr = formatDate(date);
    const totalMins = dailyTotals[dStr] || 0;

    const cell = document.createElement('div');
    cell.className = `contrib-cell ${getLevelClass(totalMins)}`;
    cell.dataset.date = dStr;
    cell.dataset.mins = totalMins;

    if (dStr === selectedDateStr) {
      cell.classList.add('selected');
    }

    cell.addEventListener('mouseenter', () => {
      selectedDayStats.textContent = `${totalMins} min on ${formatFriendlyDate(date)}`;
    });

    cell.addEventListener('mouseleave', () => {
      const selectedDate = new Date(selectedDateStr + 'T00:00:00');
      const selectedMins = dailyTotals[selectedDateStr] || 0;
      selectedDayStats.textContent = `${selectedMins} min on ${formatFriendlyDate(selectedDate)}`;
    });

    cell.addEventListener('click', () => {
      document.querySelectorAll('.contrib-cell').forEach((c) => c.classList.remove('selected'));
      cell.classList.add('selected');
      selectedDateStr = dStr;
      renderHourlyGrid(history, dStr);
      selectedDayStats.textContent = `${totalMins} min on ${formatFriendlyDate(date)}`;
    });

    contributionGrid.appendChild(cell);
  });

  const selDate = new Date(selectedDateStr + 'T00:00:00');
  const selMins = dailyTotals[selectedDateStr] || 0;
  selectedDayStats.textContent = `${selMins} min on ${formatFriendlyDate(selDate)}`;
}

function renderHourlyGrid(history, targetDateStr) {
  const hourlyGrid = document.getElementById('hourly-grid');
  const hourlyViewTitle = document.getElementById('hourly-view-title');
  const hourlyCellStats = document.getElementById('hourly-cell-stats');
  if (!hourlyGrid || !hourlyViewTitle || !hourlyCellStats) return;

  hourlyGrid.innerHTML = '';
  hourlyViewTitle.textContent = `Hourly Breakdown (${formatFriendlyDate(new Date(targetDateStr + 'T00:00:00'))})`;

  const hourlyMins = Array(24).fill(0);
  history.forEach((session) => {
    const dateObj = new Date(session.timestamp);
    const dStr = formatDate(dateObj);
    if (dStr === targetDateStr) {
      const hour = dateObj.getHours();
      hourlyMins[hour] += session.durationMinutes;
    }
  });

  for (let hour = 0; hour < 24; hour++) {
    const mins = hourlyMins[hour];
    const cell = document.createElement('div');
    cell.className = `hour-cell ${getHourlyLevelClass(mins)}`;
    if (mins > 0) cell.classList.add('has-work');

    cell.textContent = `${String(hour).padStart(2, '0')}h`;

    cell.addEventListener('mouseenter', () => {
      hourlyCellStats.textContent = `${mins} min of work completed during ${hour}:00 - ${hour + 1}:00`;
    });
    cell.addEventListener('mouseleave', () => {
      hourlyCellStats.textContent = 'Hover over an hour cell';
    });

    hourlyGrid.appendChild(cell);
  }
}
