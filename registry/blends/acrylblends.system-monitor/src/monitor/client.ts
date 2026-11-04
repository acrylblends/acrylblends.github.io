/** The page's script: it asks for a snapshot every few seconds and redraws the numbers, and ends a process the person confirmed. Plain JavaScript in a string, so the page needs no build. */

/** The two formatters, the same as `format.ts`. */
export const CLIENT_FORMAT = `
function formatBytes(bytes) {
  var units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var value = Math.max(0, bytes);
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return (value >= 100 || unit === 0 ? String(Math.round(value)) : value.toFixed(1)) + ' ' + units[unit];
}
function formatDuration(seconds) {
  var days = Math.floor(seconds / 86400);
  var hours = Math.floor((seconds % 86400) / 3600);
  var minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return days + 'd ' + hours + 'h';
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  return minutes + 'm';
}
`

export const CLIENT_SCRIPT = `${CLIENT_FORMAT}
(function () {
  var REFRESH_MS = 2000;
  var sort = document.body.dataset.sortBy || 'memory';
  var asking = null;
  var timer = null;
  var live = document.getElementById('live');
  var note = document.getElementById('note');

  function setBar(id, text, percent) {
    var bar = document.getElementById(id);
    if (!bar) return;
    bar.querySelector('[data-text]').textContent = text;
    var fill = bar.querySelector('[data-fill]');
    fill.style.width = Math.min(100, percent) + '%';
    fill.dataset.level = percent >= 90 ? 'high' : percent >= 75 ? 'warn' : 'ok';
  }

  function draw(data) {
    document.getElementById('uptime').textContent = formatDuration(data.uptimeSeconds);
    document.getElementById('load').textContent = data.load.map(function (n) { return n.toFixed(2); }).join('  ');
    setBar('memory', formatBytes(data.memory.usedBytes) + ' of ' + formatBytes(data.memory.totalBytes) + ' (' + data.memory.usedPercent + '%)', data.memory.usedPercent);
    data.disks.forEach(function (disk, index) {
      setBar('disk-' + index, formatBytes(disk.freeBytes) + ' free of ' + formatBytes(disk.totalBytes) + ' (' + disk.usedPercent + '% used)', disk.usedPercent);
    });
    var body = document.getElementById('rows');
    body.textContent = '';
    data.heaviest.forEach(function (process) {
      var row = document.createElement('tr');
      row.dataset.pid = String(process.pid);
      [process.name, String(process.pid), process.cpu.toFixed(1) + '%', formatBytes(process.memoryBytes), process.user].forEach(function (text, column) {
        var cell = document.createElement('td');
        cell.textContent = text;
        if (column > 0 && column < 4) cell.className = 'num';
        row.appendChild(cell);
      });
      var action = document.createElement('td');
      action.className = 'action';
      if (process.protectedReason) {
        action.textContent = process.protectedReason;
        action.className = 'action muted';
      } else if (asking === process.pid) {
        [['SIGTERM', 'Stop'], ['SIGKILL', 'Force stop']].forEach(function (choice) {
          var button = document.createElement('button');
          button.type = 'button';
          button.textContent = choice[1];
          button.className = 'danger';
          button.onclick = function () { end(process, choice[0]); };
          action.appendChild(button);
        });
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.onclick = function () { asking = null; refresh(); };
        action.appendChild(cancel);
      } else {
        var kill = document.createElement('button');
        kill.type = 'button';
        kill.textContent = 'End...';
        kill.onclick = function () { asking = process.pid; refresh(); };
        action.appendChild(kill);
      }
      row.appendChild(action);
      body.appendChild(row);
    });
    live.textContent = 'Live - updated ' + new Date(data.at).toLocaleTimeString();
    live.dataset.state = 'on';
  }

  function refresh() {
    clearTimeout(timer);
    return fetch('/api/snapshot?sort=' + sort + '&limit=10', { cache: 'no-store' })
      .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
      .then(draw)
      .catch(function () { live.textContent = 'Not updating - the app is not answering'; live.dataset.state = 'off'; })
      .then(function () { if (document.visibilityState === 'visible') timer = setTimeout(refresh, REFRESH_MS); });
  }

  function end(process, signal) {
    asking = null;
    fetch('/api/kill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: process.pid, name: process.name, signal: signal }) })
      .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
      .then(function (result) { note.textContent = result.ok ? process.name + ' (' + process.pid + ') was sent ' + (signal === 'SIGKILL' ? 'a forced stop.' : 'a stop request.') : result.body.error; note.dataset.state = result.ok ? 'ok' : 'error'; })
      .catch(function () { note.textContent = 'The request did not reach the app.'; note.dataset.state = 'error'; })
      .then(refresh);
  }

  document.querySelectorAll('[data-sort]').forEach(function (button) {
    button.onclick = function () {
      sort = button.dataset.sort;
      document.body.dataset.sortBy = sort;
      document.querySelectorAll('[data-sort]').forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
      refresh();
    };
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  refresh();
})();
`
