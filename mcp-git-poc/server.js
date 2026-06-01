import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. MOCK GIT WORKSPACE DATA
// ==========================================
let localCommits = [
  { sha: 'a1b2c3d', message: 'Initial commit' },
  { sha: 'e5f6g7h', message: 'Add README.md' }
];

let remoteCommits = [
  { sha: 'a1b2c3d', message: 'Initial commit' },
  { sha: 'e5f6g7h', message: 'Add README.md' },
  { sha: 'i9j0k1l', message: 'feat: add database helper' } // remote has 1 extra commit
];

let featureCommits = [
  { sha: 'a1b2c3d', message: 'Initial commit' },
  { sha: 'e5f6g7h', message: 'Add README.md' },
  { sha: 'm3n4o5p', message: 'docs: update setup instructions' }
];

let hasFetched = false;
let fetchCache = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15000; // 15 seconds Cache window

// ==========================================
// 2. MOCK TASKS EXECUTION
// ==========================================
const tasks = new Map();

function startBackgroundTask(taskId, operation) {
  const task = {
    id: taskId,
    name: operation,
    status: 'running',
    progress: 0,
    logs: ['[Task Init] Connecting to remote Git...']
  };
  tasks.set(taskId, task);

  // Background timer increments progress by 25% every 800ms
  let timer = setInterval(() => {
    task.progress += 25;
    task.logs.push(`[Progress ${task.progress}%] Processing Git syncing...`);
    
    if (task.progress >= 100) {
      task.progress = 100;
      task.status = 'completed';
      task.logs.push('[Success] Git sync completed.');
      
      // Perform final memory-based Git merges/pushes
      if (operation === 'git_fetch') {
        hasFetched = true;
        fetchCache = [...remoteCommits];
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      } else if (operation === 'git_pull') {
        hasFetched = true;
        localCommits = [...remoteCommits];
      } else if (operation === 'git_merge') {
        const feat = featureCommits.find(c => c.sha === 'm3n4o5p');
        if (feat && !localCommits.some(c => c.sha === 'm3n4o5p')) {
          localCommits.push(feat);
        }
      } else if (operation === 'git_push') {
        remoteCommits = [...localCommits];
      }
      
      clearInterval(timer);
    }
  }, 800);
}

// ==========================================
// 3. STATELESS JSON-RPC ROUTER (MCP 2.0)
// ==========================================
app.post('/api/mcp', (req, res) => {
  const { jsonrpc, method, params, id } = req.body;
  const traceparent = params?.traceparent || 'no-trace';

  // Basic check for JSON-RPC
  if (jsonrpc !== '2.0' || !method || id === undefined) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid RPC' }, id: id || null });
  }

  // Set up simple tracing spans to return in the metadata
  const traceId = traceparent.split('-')[1] || 't_unknown';
  const spans = [];
  const start = Date.now();
  const recordSpan = (name, status, desc) => {
    spans.push({ name, status, description: desc, durationMs: Date.now() - start });
  };

  // Stateless check: reads authorization directly from the header
  const isAuthorized = req.headers.authorization === 'Bearer secret-mcp-token-123';
  recordSpan('Auth-Check', isAuthorized ? 'success' : 'failed', isAuthorized ? 'Bearer Token Verified' : 'Missing Token');

  if (!isAuthorized) {
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;

    if (toolName === 'git_fetch') {
      const isCacheValid = fetchCache && Date.now() < cacheExpiresAt;
      recordSpan('Cache-Check', isCacheValid ? 'hit' : 'miss', isCacheValid ? 'Loaded from memory cache' : 'Cache miss');

      if (isCacheValid) {
        return res.json({
          jsonrpc: '2.0',
          result: {
            message: 'Fetch loaded from Cache (Cache Hit).',
            remoteCommits: fetchCache,
            cached: true,
            ttlRemaining: Math.max(0, Math.round((cacheExpiresAt - Date.now()) / 1000)),
            traceInfo: { traceId, spans }
          },
          id
        });
      }
    }

    if (['git_fetch', 'git_pull', 'git_merge', 'git_push'].includes(toolName)) {
      const taskId = `task_${toolName.replace('git_', '')}_` + Math.random().toString(36).substr(2, 5);
      startBackgroundTask(taskId, toolName);
      recordSpan('Task-Creation', 'success', `Async task created: ${taskId}`);

      return res.json({
        jsonrpc: '2.0',
        result: {
          taskHandle: taskId,
          status: 'running',
          message: 'Operation scheduled asynchronously.',
          traceInfo: { traceId, spans }
        },
        id
      });
    }

    return res.status(404).json({ jsonrpc: '2.0', error: { code: -32601, message: 'Tool not found' }, id });
  }

  return res.status(400).json({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id });
});

// Task status endpoint
app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Repository state endpoint
app.get('/api/repo', (req, res) => {
  res.json({
    local: localCommits,
    remote: remoteCommits,
    feature: featureCommits,
    hasFetched,
    isCached: fetchCache && Date.now() < cacheExpiresAt,
    cacheTtlSec: fetchCache ? Math.max(0, Math.round((cacheExpiresAt - Date.now()) / 1000)) : 0
  });
});

// Reset endpoint
app.post('/api/repo/reset', (req, res) => {
  localCommits = [{ sha: 'a1b2c3d', message: 'Initial commit' }, { sha: 'e5f6g7h', message: 'Add README.md' }];
  remoteCommits = [{ sha: 'a1b2c3d', message: 'Initial commit' }, { sha: 'e5f6g7h', message: 'Add README.md' }, { sha: 'i9j0k1l', message: 'feat: add database helper' }];
  hasFetched = false;
  fetchCache = null;
  cacheExpiresAt = 0;
  tasks.clear();
  res.json({ message: 'Reset done.' });
});

// ==========================================
// 4. EMBEDDED FRONTEND (HTML + CSS + JS)
// ==========================================
// We serve the entire frontend visual client on GET / directly from this string.
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MCP 2.0 Git POC</title>
  <style>
    body { font-family: sans-serif; background: #f3f4f6; color: #1f2937; margin: 0; padding: 20px; }
    header { background: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e5e7eb; }
    h1 { margin: 0; font-size: 1.25rem; }
    .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .panel { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
    h2 { margin-top: 0; font-size: 1.1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
    .btn-group { display: flex; gap: 10px; margin-bottom: 20px; }
    button { background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.8rem; }
    button:hover { background: #1d4ed8; }
    .btn-reset { background: #4b5563; }
    .commits-box { background: #f9fafb; border-left: 4px solid #cbd5e1; padding: 10px; margin-bottom: 10px; border-radius: 0 4px 4px 0; }
    .remote-box { border-left-color: #ef4444; }
    .local-box { border-left-color: #2563eb; }
    .feature-box { border-left-color: #10b981; }
    .commit { font-family: monospace; font-size: 0.75rem; background: white; border: 1px solid #e5e7eb; padding: 4px; margin-top: 4px; border-radius: 3px; }
    .telemetry { background: #f9fafb; border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; margin-bottom: 15px; }
    .telemetry h3 { margin: 0 0 8px 0; font-size: 0.9rem; color: #4b5563; }
    .progress-bar { background: #e5e7eb; height: 8px; border-radius: 4px; overflow: hidden; margin: 8px 0; }
    .progress-fill { background: #10b981; height: 100%; width: 0%; transition: width 0.2s; }
    pre { background: #111827; color: #10b981; padding: 10px; font-size: 0.75rem; border-radius: 4px; max-height: 150px; overflow-y: auto; white-space: pre-wrap; margin: 0; }
    .badge { padding: 3px 6px; font-size: 0.75rem; border-radius: 4px; font-weight: bold; }
    .badge-ok { background: #d1fae5; color: #065f46; }
    .badge-err { background: #fee2e2; color: #991b1b; }
    .trace-item { display: flex; justify-content: space-between; font-size: 0.75rem; padding: 4px 0; border-bottom: 1px dashed #e5e7eb; }
  </style>
</head>
<body>

  <header>
    <h1>📋 MCP 2.0 Git POC (Single File)</h1>
    <div>
      <label><input type="checkbox" id="auth-check" checked onchange="updateAuthBadge()"> Send Auth Token</label>
      <span id="auth-badge" class="badge badge-ok">Authorized</span>
    </div>
  </header>

  <main class="dashboard">
    <!-- LEFT: REPO WORKSPACE -->
    <div class="panel">
      <h2>📂 Git Repository Workspace</h2>
      <div class="btn-group">
        <button onclick="runTool('git_fetch')">Fetch</button>
        <button onclick="runTool('git_pull')">Pull</button>
        <button onclick="runTool('git_merge')">Merge</button>
        <button onclick="runTool('git_push')">Push</button>
        <button class="btn-reset" onclick="resetRepo()">Reset Repo</button>
      </div>

      <div class="commits-box remote-box">
        <strong>Remote Track Branch (origin/main)</strong>
        <div id="remote-list">Loading...</div>
      </div>
      <div class="commits-box local-box">
        <strong>Local Main Branch (main)</strong>
        <div id="local-list">Loading...</div>
      </div>
      <div class="commits-box feature-box">
        <strong>Local Feature Branch (feature-branch)</strong>
        <div id="feature-list">Loading...</div>
      </div>
    </div>

    <!-- RIGHT: PROTOCOL TELEMETRY -->
    <div class="panel">
      <h2>📡 MCP 2.0 Telemetry logs</h2>

      <!-- Cache details -->
      <div class="telemetry">
        <h3>💾 Cache Status (TTL Caching)</h3>
        <div id="cache-status" style="font-size: 0.8rem">No cache.</div>
      </div>

      <!-- Tasks progress -->
      <div class="telemetry">
        <h3>⏳ Tasks Extension (Background Async)</h3>
        <div id="task-card" style="font-size: 0.8rem; display: none;">
          <strong>Active Task ID:</strong> <span id="task-id-label"></span>
          <div class="progress-bar"><div class="progress-fill" id="task-bar"></div></div>
          <div style="font-size: 0.7rem; display: flex; justify-content: space-between; margin-bottom: 6px">
            <span id="task-status-label">Running</span>
            <span id="task-percent-label">0%</span>
          </div>
          <pre id="task-logs" style="background:#1f2937; color:#f9fafb; max-height:80px"></pre>
        </div>
        <div id="task-empty" class="empty-text" style="font-size: 0.8rem; color:#9ca3af; font-style:italic">No background tasks running.</div>
      </div>

      <!-- Tracing list -->
      <div class="telemetry">
        <h3>🌐 Distributed Tracing (Spans)</h3>
        <div id="trace-spans">
          <span style="font-size: 0.8rem; color:#9ca3af; font-style:italic">Perform an action to view traces.</span>
        </div>
      </div>

      <!-- Raw payload logs -->
      <div class="telemetry">
        <h3>💻 Raw JSON-RPC Frames</h3>
        <pre id="rpc-log">Waiting for RPC communication...</pre>
      </div>
    </div>
  </main>

  <script>
    // Visual Auth Checkbox handler
    function updateAuthBadge() {
      const checked = document.getElementById('auth-check').checked;
      const badge = document.getElementById('auth-badge');
      if (checked) {
        badge.innerText = "Authorized";
        badge.className = "badge badge-ok";
      } else {
        badge.innerText = "No Token";
        badge.className = "badge badge-danger";
      }
    }

    // Refresh visual branches
    async function loadRepoState() {
      const res = await fetch('/api/repo');
      const data = await res.json();
      
      const render = (list, boxId) => {
        const box = document.getElementById(boxId);
        box.innerHTML = '';
        list.forEach(c => {
          box.innerHTML += '<div class="commit">SHA: <b>' + c.sha + '</b> - ' + c.message + '</div>';
        });
      };

      render(data.remote, 'remote-list');
      render(data.local, 'local-list');
      render(data.feature, 'feature-list');

      // Update Cache Indicator
      const cacheStatus = document.getElementById('cache-status');
      if (data.isCached) {
        cacheStatus.innerHTML = '<span class="badge badge-ok">CACHE HIT</span> Fetch cached. Expires in ' + data.cacheTtlSec + ' seconds.';
      } else {
        cacheStatus.innerHTML = '<em style="color:#6b7280">Cache inactive. Perform a Fetch to create 15s cache.</em>';
      }
    }

    // Call stateless MCP 2.0 tool
    async function runTool(toolName) {
      const traceId = 't_' + Math.random().toString(36).substr(2, 5);
      const traceparent = '00-' + traceId + '-spanclient-01';

      const rpcRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: toolName, arguments: {}, traceparent: traceparent },
        id: Math.floor(Math.random() * 100)
      };

      logRpc('REQUEST:\\n' + JSON.stringify(rpcRequest, null, 2));

      const headers = { 'Content-Type': 'application/json' };
      if (document.getElementById('auth-check').checked) {
        headers['Authorization'] = 'Bearer secret-mcp-token-123';
      }

      try {
        const res = await fetch('/api/mcp', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(rpcRequest)
        });

        const data = await res.json();
        logRpc('RESPONSE:\\n' + JSON.stringify(data, null, 2));

        if (data.error) {
          alert('Error: ' + data.error.message);
          return;
        }

        const result = data.result;

        // Render Spans list
        if (result.traceInfo) {
          const spansBox = document.getElementById('trace-spans');
          spansBox.innerHTML = '';
          result.traceInfo.spans.forEach(s => {
            spansBox.innerHTML += '<div class="trace-item"><span><b>' + s.name + '</b> (' + s.description + ')</span> <span>' + s.status.toUpperCase() + ' - ' + s.durationMs + 'ms</span></div>';
          });
        }

        // Start Tasks Polling
        if (result.taskHandle) {
          pollTask(result.taskHandle);
        } else {
          loadRepoState();
        }

      } catch (err) {
        logRpc('ERROR: ' + err.message);
      }
    }

    // Poll background task progress
    let pollInterval = null;
    function pollTask(taskId) {
      if (pollInterval) clearInterval(pollInterval);
      
      document.getElementById('task-card').style.display = 'block';
      document.getElementById('task-empty').style.display = 'none';
      document.getElementById('task-id-label').innerText = taskId;
      
      pollInterval = setInterval(async () => {
        const res = await fetch('/api/tasks/' + taskId);
        const task = await res.json();

        document.getElementById('task-bar').style.width = task.progress + '%';
        document.getElementById('task-percent-label').innerText = task.progress + '%';
        document.getElementById('task-status-label').innerText = task.status;
        document.getElementById('task-logs').innerText = task.logs.join('\\n');

        if (task.status === 'completed' || task.status === 'failed') {
          clearInterval(pollInterval);
          setTimeout(() => {
            document.getElementById('task-card').style.display = 'none';
            document.getElementById('task-empty').style.display = 'block';
          }, 3000);
          loadRepoState();
        }
      }, 400);
    }

    // Reset repository state
    async function resetRepo() {
      const res = await fetch('/api/repo/reset', { method: 'POST' });
      await res.json();
      document.getElementById('rpc-log').innerText = 'State reset.';
      loadRepoState();
    }

    function logRpc(text) {
      const box = document.getElementById('rpc-log');
      if (box.innerText.startsWith('Waiting for')) box.innerText = '';
      box.innerText += text + '\\n\\n';
      box.scrollTop = box.scrollHeight;
    }

    // Run first load
    loadRepoState();
  </script>
</body>
</html>
`;

// GET / returns the entire HTML page
app.get('/', (req, res) => {
  res.send(htmlContent);
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Consolidated MCP 2.0 Server: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
