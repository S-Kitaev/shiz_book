fetch('/api/health')
  .then(r => r.json())
  .then(data => {
    document.getElementById('api-status').textContent = 'Backend: ' + data.status;
  })
  .catch(() => {
    document.getElementById('api-status').textContent = 'Backend: недоступен';
  });