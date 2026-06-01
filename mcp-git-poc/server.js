import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ==========================================
// 1. RESOLVE SIMULATION PATHS
// ==========================================
// We create a physical directory structure on your disk to simulate Git repositories.
const simDir = path.join(__dirname, 'git_simulation');
const dirRemote = path.join(simDir, 'remote');
const dirLocal = path.join(simDir, 'local');
const dirFeature = path.join(simDir, 'feature');
const dirOrigin = path.join(simDir, 'origin_main');

// Helper to initialize target files and content
async function initSimulationFiles() {
  await fs.mkdir(dirRemote, { recursive: true });
  await fs.mkdir(dirLocal, { recursive: true });
  await fs.mkdir(dirFeature, { recursive: true });
  await fs.mkdir(dirOrigin, { recursive: true });

  const fileRemote = path.join(dirRemote, 'document.txt');
  const fileLocal = path.join(dirLocal, 'document.txt');
  const fileFeature = path.join(dirFeature, 'document.txt');

  // If files do not exist, write default content
  if (!existsSync(fileRemote)) {
    await fs.writeFile(fileRemote, '[Commit 1] Initial remote text.\n[Commit 2] Additional text on GitHub.');
  }
  if (!existsSync(fileLocal)) {
    await fs.writeFile(fileLocal, '[Commit 1] Initial remote text.');
  }
  if (!existsSync(fileFeature)) {
    await fs.writeFile(fileFeature, '[Commit 1] Initial remote text.\n[Commit 3] New feature details written locally.');
  }
}

// Ensure files are ready at startup
initSimulationFiles().catch(console.error);

// ==========================================
// 2. TTL-BASED CACHE CONFIG
// ==========================================
let fetchCache = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 15000; // 15 seconds

// ==========================================
// 3. BACKGROUND TASK WORKER (TASKS EXTENSION)
// ==========================================
const tasks = new Map();

function startBackgroundTask(taskId, operation) {
  const task = {
    id: taskId,
    name: operation,
    status: 'running',
    progress: 0,
    logs: ['[Task Init] Connecting to local repository directory...']
  };
  tasks.set(taskId, task);

  let timer = setInterval(async () => {
    task.progress += 25;
    task.logs.push(`[Progress ${task.progress}%] Simulating command-line Git operations on files...`);
    
    if (task.progress >= 100) {
      task.progress = 100;
      task.status = 'completed';
      
      try {
        // --- PHYSICAL FILE TRANSACTIONS ---
        if (operation === 'git_fetch') {
          task.logs.push('[Files] Copying remote/document.txt to local tracking origin_main/document.txt...');
          
          const remotePath = path.join(dirRemote, 'document.txt');
          const trackingPath = path.join(dirOrigin, 'document.txt');
          
          await fs.copyFile(remotePath, trackingPath);
          const content = await fs.readFile(trackingPath, 'utf8');
          
          // Cache the content
          fetchCache = content;
          cacheExpiresAt = Date.now() + CACHE_TTL_MS;
          
          task.logs.push('[Files] Reference tracking updated successfully.');
        } 
        
        else if (operation === 'git_pull') {
          task.logs.push('[Files] Merging origin_main/document.txt tracking file into local/document.txt workspace...');
          
          const trackingPath = path.join(dirOrigin, 'document.txt');
          const localPath = path.join(dirLocal, 'document.txt');
          
          if (existsSync(trackingPath)) {
            await fs.copyFile(trackingPath, localPath);
            task.logs.push('[Files] Fast-forward pull merged successfully.');
          } else {
            task.logs.push('[Files Warning] Tracking origin_main/document.txt not found. Fetch first!');
            task.status = 'failed';
          }
        } 
        
        else if (operation === 'git_merge') {
          task.logs.push('[Files] Merging unique lines from feature/document.txt into local/document.txt...');
          
          const localPath = path.join(dirLocal, 'document.txt');
          const featurePath = path.join(dirFeature, 'document.txt');
          
          if (existsSync(localPath) && existsSync(featurePath)) {
            const localContent = await fs.readFile(localPath, 'utf8');
            const featureContent = await fs.readFile(featurePath, 'utf8');
            
            // Clean up lines and merge them
            const localLines = localContent.split('\n').map(l => l.trim()).filter(Boolean);
            const featureLines = featureContent.split('\n').map(l => l.trim()).filter(Boolean);
            
            const mergedLines = [...localLines];
            for (const line of featureLines) {
              if (!mergedLines.includes(line)) {
                mergedLines.push(line);
              }
            }
            
            await fs.writeFile(localPath, mergedLines.join('\n'));
            task.logs.push('[Files] Recursive 3-way line merge completed.');
          } else {
            task.logs.push('[Files Error] Unable to find local or feature files.');
            task.status = 'failed';
          }
        } 
        
        else if (operation === 'git_push') {
          task.logs.push('[Files] Uploading local/document.txt changes to remote/document.txt repository...');
          
          const localPath = path.join(dirLocal, 'document.txt');
          const remotePath = path.join(dirRemote, 'document.txt');
          
          await fs.copyFile(localPath, remotePath);
          task.logs.push('[Files] Remote tracking branch matches local.');
        }
      } catch (err) {
        task.logs.push(`[File Error] Action failed: ${err.message}`);
        task.status = 'failed';
      }
      
      clearInterval(timer);
    }
  }, 800);
}

// ==========================================
// 4. STATELESS JSON-RPC ROUTER
// ==========================================
app.post('/api/mcp', (req, res) => {
  const { jsonrpc, method, params, id } = req.body;
  const traceparent = params?.traceparent || 'no-trace';

  if (jsonrpc !== '2.0' || !method || id === undefined) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid RPC' }, id: id || null });
  }

  const traceId = traceparent.split('-')[1] || 't_unknown';
  const spans = [];
  const start = Date.now();
  const recordSpan = (name, status, desc) => {
    spans.push({ name, status, description: desc, durationMs: Date.now() - start });
  };

  // Stateless verification
  const isAuthorized = req.headers.authorization === 'Bearer secret-mcp-token-123';
  recordSpan('Auth-Check', isAuthorized ? 'success' : 'failed', isAuthorized ? 'Verified secret token' : 'Unrecognized token');

  if (!isAuthorized) {
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;

    // Fetch Cache Check
    if (toolName === 'git_fetch') {
      const isCacheValid = fetchCache && Date.now() < cacheExpiresAt;
      recordSpan('Cache-Check', isCacheValid ? 'hit' : 'miss', isCacheValid ? 'Served from TTL file cache' : 'File cache miss');

      if (isCacheValid) {
        return res.json({
          jsonrpc: '2.0',
          result: {
            message: 'Fetch completed instantly from Cache (Cache Hit).',
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
      recordSpan('Task-Creation', 'success', `Spawning async filesystem task: ${taskId}`);

      return res.json({
        jsonrpc: '2.0',
        result: {
          taskHandle: taskId,
          status: 'running',
          message: 'Operation queued.',
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

// Repository state endpoint (Physically reads files from disk)
app.get('/api/repo', async (req, res) => {
  let textRemote = 'File not found. Run initialize.';
  let textLocal = 'File not found.';
  let textFeature = 'File not found.';
  let textOrigin = 'File not found (Run Fetch to generate).';

  try { textRemote = await fs.readFile(path.join(dirRemote, 'document.txt'), 'utf8'); } catch(e) {}
  try { textLocal = await fs.readFile(path.join(dirLocal, 'document.txt'), 'utf8'); } catch(e) {}
  try { textFeature = await fs.readFile(path.join(dirFeature, 'document.txt'), 'utf8'); } catch(e) {}
  try { textOrigin = await fs.readFile(path.join(dirOrigin, 'document.txt'), 'utf8'); } catch(e) {}

  res.json({
    remote: textRemote,
    local: textLocal,
    feature: textFeature,
    origin: textOrigin,
    isCached: fetchCache && Date.now() < cacheExpiresAt,
    cacheTtlSec: fetchCache ? Math.max(0, Math.round((cacheExpiresAt - Date.now()) / 1000)) : 0
  });
});

// Reset endpoint (Physically resets file contents)
app.post('/api/repo/reset', async (req, res) => {
  try {
    await fs.writeFile(path.join(dirRemote, 'document.txt'), '[Commit 1] Initial remote text.\n[Commit 2] Additional text on GitHub.');
    await fs.writeFile(path.join(dirLocal, 'document.txt'), '[Commit 1] Initial remote text.');
    await fs.writeFile(path.join(dirFeature, 'document.txt'), '[Commit 1] Initial remote text.\n[Commit 3] New feature details written locally.');
    
    const trackingPath = path.join(dirOrigin, 'document.txt');
    if (existsSync(trackingPath)) {
      await fs.unlink(trackingPath);
    }
    
    hasFetched = false;
    fetchCache = null;
    cacheExpiresAt = 0;
    tasks.clear();
    
    res.json({ message: 'Files successfully reset.' });
  } catch (err) {
    res.status(500).json({ error: `Reset failed: ${err.message}` });
  }
});

// ==========================================
// 5. INLINE FRONTEND DASHBOARD
// ==========================================
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MCP 2.0 Git File-Based POC</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f3f4f6; color: #1f2937; margin: 0; padding: 20px; }
    header { background: white; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #e5e7eb; }
    h1 { margin: 0; font-size: 1.25rem; }
    .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .panel { background: white; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb; }
    h2 { margin-top: 0; font-size: 1.1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
    .btn-group { display: flex; gap: 10px; margin-bottom: 20px; }
    button { background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 0.8rem; }
    button:hover { background: #1d4ed8; }
    .btn-reset { background: #4b5563; }
    .file-box { background: #f9fafb; border-left: 4px solid #cbd5e1; padding: 12px; margin-bottom: 15px; border-radius: 0 4px 4px 0; }
    .remote-box { border-left-color: #ef4444; }
    .local-box { border-left-color: #2563eb; }
    .feature-box { border-left-color: #10b981; }
    .origin-box { border-left-color: #f59e0b; }
    .file-content-label { font-size: 0.7rem; text-transform: uppercase; color: #6b7280; margin-bottom: 4px; font-weight: bold; display: block; }
    .file-content { font-family: monospace; font-size: 0.8rem; background: white; border: 1px solid #e5e7eb; padding: 8px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; min-height: 40px; }
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
    <h1>📋 MCP 2.0 Physical File-Based POC</h1>
    <div>
      <label><input type="checkbox" id="auth-check" checked onchange="updateAuthBadge()"> Send Auth Token</label>
      <span id="auth-badge" class="badge badge-ok">Authorized</span>
    </div>
  </header>

  <main class="dashboard">
    <!-- LEFT: FILES WORKSPACE -->
    <div class="panel">
      <h2>📂 Physical Git Files on Disk</h2>
      <p style="font-size:0.8rem; color:#6b7280; margin-bottom: 15px">The content below represents the actual contents of text files inside the <code>git_simulation/</code> folder. Watch them change dynamically as you trigger actions!</p>
      
      <div class="btn-group">
        <button onclick="runTool('git_fetch')">Fetch (Remote ➔ Tracking)</button>
        <button onclick="runTool('git_pull')">Pull (Tracking ➔ Local)</button>
        <button onclick="runTool('git_merge')">Merge (Feature ➔ Local)</button>
        <button onclick="runTool('git_push')">Push (Local ➔ Remote)</button>
        <button class="btn-reset" onclick="resetRepo()">Reset Files</button>
      </div>

      <div class="file-box remote-box">
        <span class="file-content-label">GitHub Server File (remote/document.txt)</span>
        <div id="remote-txt-content" class="file-content">Loading...</div>
      </div>
      <div class="file-box origin-box">
        <span class="file-content-label">Local Tracking Branch File (origin_main/document.txt)</span>
        <div id="origin-txt-content" class="file-content">Loading...</div>
      </div>
      <div class="file-box local-box">
        <span class="file-content-label">Local Developer Workspace File (local/document.txt)</span>
        <div id="local-txt-content" class="file-content">Loading...</div>
      </div>
      <div class="file-box feature-box">
        <span class="file-content-label">Feature Workspace Branch File (feature/document.txt)</span>
        <div id="feature-txt-content" class="file-content">Loading...</div>
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
        <div id="task-empty" style="font-size: 0.8rem; color:#9ca3af; font-style:italic">No active background tasks.</div>
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
    function updateAuthBadge() {
      const checked = document.getElementById('auth-check').checked;
      const badge = document.getElementById('auth-badge');
      if (checked) {
        badge.innerText = "Authorized";
        badge.className = "badge badge-ok";
      } else {
        badge.innerText = "No Token";
        badge.className = "badge badge-err";
      }
    }

    async function loadFilesState() {
      const res = await fetch('/api/repo');
      const data = await res.json();
      
      document.getElementById('remote-txt-content').innerText = data.remote;
      document.getElementById('origin-txt-content').innerText = data.origin;
      document.getElementById('local-txt-content').innerText = data.local;
      document.getElementById('feature-txt-content').innerText = data.feature;

      const cacheStatus = document.getElementById('cache-status');
      if (data.isCached) {
        cacheStatus.innerHTML = '<span class="badge badge-ok">CACHE HIT</span> Fetch cached. Expires in ' + data.cacheTtlSec + ' seconds.';
      } else {
        cacheStatus.innerHTML = '<em style="color:#6b7280">Cache inactive. Perform a Fetch to create 15s cache.</em>';
      }
    }

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

        // Render Tracing Spans
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
          loadFilesState();
        }

      } catch (err) {
        logRpc('ERROR: ' + err.message);
      }
    }

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
          loadFilesState();
        }
      }, 400);
    }

    async function resetRepo() {
      if (confirm('Reset files back to default starting text?')) {
        const res = await fetch('/api/repo/reset', { method: 'POST' });
        await res.json();
        document.getElementById('rpc-log').innerText = 'Simulation files reset.';
        loadFilesState();
      }
    }

    function logRpc(text) {
      const box = document.getElementById('rpc-log');
      if (box.innerText.startsWith('Waiting for')) box.innerText = '';
      box.innerText += text + '\\n\\n';
      box.scrollTop = box.scrollHeight;
    }

    loadFilesState();
  </script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.send(htmlContent);
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Consolidated File-Based Server: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
