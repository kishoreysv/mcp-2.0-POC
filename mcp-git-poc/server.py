import os
import time
import subprocess
import threading
import urllib.request
import random
import string
from flask import Flask, request, jsonify, render_template_string

# Create Flask application
app = Flask(__name__)

# ==========================================
# 1. HELPER TO EXECUTE REAL GIT COMMANDS
# ==========================================
def run_git_command(args: str) -> str:
    """
    Helper function to run Git commands from the command line.
    It runs inside the root of the repository (one level up from mcp-git-poc).
    """
    # The parent directory of the current file is the repository root
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Run the git command using subprocess
    result = subprocess.run(
        f"git {args}",
        cwd=repo_root,
        shell=True,
        capture_output=True,
        text=True
    )
    
    # If the git command returns a non-zero exit code, raise an exception with the error
    if result.returncode != 0:
        error_msg = result.stderr.strip() or result.stdout.strip()
        raise Exception(error_msg)
        
    return result.stdout.strip()

# ==========================================
# 2. REAL SIMULATION INITIALIZER
# ==========================================
def init_real_git_simulation():
    """
    Initializes a real 'feature' branch in the local repository
    and commits a mock change to demonstrate merging.
    """
    try:
        # Detect the current checked-out branch (e.g. main)
        curr_branch = run_git_command("branch --show-current") or "main"
        
        # Check if the 'feature' branch already exists locally
        branches = run_git_command("branch")
        has_feature = any(b.strip().replace("*", "").strip() == "feature" for b in branches.split("\n"))
        
        if not has_feature:
            print("Initializing 'feature' branch locally...")
            
            # Stash any uncommitted local changes to avoid conflicts when switching branches
            stashed = False
            status = run_git_command("status --porcelain")
            if status:
                run_git_command("stash")
                stashed = True
                
            # Create the local 'feature' branch
            run_git_command("checkout -b feature")
            
            # Retrieve the current content of local/document.txt from your main branch (fallback to default if file doesn't exist yet)
            base_content = "[Commit 1] Initial remote text."
            try:
                base_content = run_git_command(f"show {curr_branch}:mcp-git-poc/git_simulation/local/document.txt")
            except Exception:
                pass
                
            # Define file paths in the local workspace
            sim_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "git_simulation")
            local_dir = os.path.join(sim_dir, "local")
            os.makedirs(local_dir, exist_ok=True)
            local_file = os.path.join(local_dir, "document.txt")
            
            # Write a new commit statement to the file on the feature branch
            with open(local_file, "w", encoding="utf-8") as f:
                f.write(base_content + "\n[Commit 3] New feature details written locally.")
                
            # Stage and commit this change on the feature branch
            run_git_command("add mcp-git-poc/git_simulation/local/document.txt")
            run_git_command('commit -m "Commit 3: Feature branch updates"')
            
            # Switch back to the original active branch
            run_git_command(f"checkout {curr_branch}")
            
            # Restore any stashed changes
            if stashed:
                try:
                    run_git_command("stash pop")
                except Exception:
                    pass
                
            print("Feature branch initialized successfully.")
    except Exception as e:
        print(f"Failed to initialize feature branch: {e}")

# Initialize the simulation files/branches on startup
init_real_git_simulation()

# ==========================================
# 3. TTL-BASED MEMORY CACHE CONFIGURATION
# ==========================================
fetch_cache = None          # Stores cached content of the fetched file
cache_expires_at = 0.0      # Timestamp when cache expires
CACHE_TTL_SEC = 15          # 15 seconds Cache TTL

# ==========================================
# 4. BACKGROUND TASK WORKER (TASKS EXTENSION)
# ==========================================
tasks = {}  # In-memory dictionary to store active background tasks

def start_background_task(task_id: str, operation: str):
    """
    Spins off a background thread to execute Git operations asynchronously.
    """
    task = {
        'id': task_id,
        'name': operation,
        'status': 'running',
        'progress': 0,
        'logs': ['[Task Init] Connecting to local repository directory...']
    }
    tasks[task_id] = task

    def worker():
        try:
            # Simulate work progression increments
            for p in [25, 50, 75]:
                time.sleep(0.5)
                task['progress'] = p
                task['logs'].append(f"[Progress {p}%] Simulating command-line Git operations on files...")

            time.sleep(0.5)
            task['progress'] = 100
            task['status'] = 'completed'

            # --- PHYSICAL GIT OPERATIONS ---
            if operation == 'git_fetch':
                task['logs'].append('[Git] Running: git fetch origin...')
                run_git_command('fetch origin')
                task['logs'].append('[Git] Fetch completed successfully.')

                # Fetch tracking file content
                curr_branch = run_git_command('branch --show-current') or 'main'
                content = run_git_command(f'show origin/{curr_branch}:mcp-git-poc/git_simulation/local/document.txt')

                # Update local cache
                global fetch_cache, cache_expires_at
                fetch_cache = content
                cache_expires_at = time.time() + CACHE_TTL_SEC
                task['logs'].append('[Git] Reference tracking origin branch updated.')

            elif operation == 'git_pull':
                task['logs'].append('[Git] Running: git pull origin...')
                curr_branch = run_git_command('branch --show-current') or 'main'
                pull_output = run_git_command(f'pull origin {curr_branch}')
                task['logs'].append(f'[Git] Pull output:\n{pull_output}')
                task['logs'].append('[Git] Pull completed successfully.')

            elif operation == 'git_merge':
                task['logs'].append('[Git] Running: git merge feature...')
                merge_output = run_git_command('merge feature -m "Merge branch \'feature\'"')
                task['logs'].append(f'[Git] Merge output:\n{merge_output}')
                task['logs'].append('[Git] Merge completed successfully.')

            elif operation == 'git_push':
                task['logs'].append('[Git] Checking for local uncommitted changes...')
                status_output = run_git_command('status --porcelain mcp-git-poc/git_simulation/local/document.txt')
                
                # If there are local changes, commit them first
                if status_output:
                    task['logs'].append('[Git] Uncommitted local changes found. Committing changes...')
                    run_git_command('add mcp-git-poc/git_simulation/local/document.txt')
                    run_git_command('commit -m "Update document.txt via MCP 2.0 Dashboard"')
                    task['logs'].append('[Git] Committed local changes successfully.')
                else:
                    task['logs'].append('[Git] No uncommitted local changes to commit.')

                # Perform actual Git push
                task['logs'].append('[Git] Running: git push origin...')
                curr_branch = run_git_command('branch --show-current') or 'main'
                push_output = run_git_command(f'push origin {curr_branch}')
                task['logs'].append(f'[Git] Push output:\n{push_output}')
                task['logs'].append('[Git] Push completed successfully.')

        except Exception as e:
            task['logs'].append(f'[Git Error] Action failed: {str(e)}')
            task['status'] = 'failed'

    # Start the daemon worker thread
    threading.Thread(target=worker, daemon=True).start()

# ==========================================
# 5. STATELESS JSON-RPC ROUTER
# ==========================================
@app.route('/api/mcp', methods=['POST'])
def mcp_router():
    """
    Handles JSON-RPC 2.0 requests from the client.
    Includes stateless authorization check, TTL caching check, and task creation.
    """
    data = request.json
    if not data:
        return jsonify({
            'jsonrpc': '2.0',
            'error': {'code': -32700, 'message': 'Parse error'},
            'id': None
        }), 400

    jsonrpc = data.get('jsonrpc')
    method = data.get('method')
    params = data.get('params') or {}
    req_id = data.get('id')

    traceparent = params.get('traceparent', 'no-trace')

    # Validate JSON-RPC 2.0 format
    if jsonrpc != '2.0' or not method or req_id is None:
        return jsonify({
            'jsonrpc': '2.0',
            'error': {'code': -32600, 'message': 'Invalid Request'},
            'id': req_id if req_id is not None else None
        }), 400

    # Extract Distributed Tracing TraceId
    trace_parts = traceparent.split('-')
    trace_id = trace_parts[1] if len(trace_parts) > 1 else 't_unknown'
    
    spans = []
    start_time = time.time()

    def record_span(name, status, desc):
        duration_ms = int((time.time() - start_time) * 1000)
        spans.append({
            'name': name,
            'status': status,
            'description': desc,
            'durationMs': duration_ms
        })

    # Auth Token check
    auth_header = request.headers.get('Authorization')
    is_authorized = auth_header == 'Bearer secret-mcp-token-123'
    record_span(
        'Auth-Check',
        'success' if is_authorized else 'failed',
        'Verified secret token' if is_authorized else 'Unrecognized token'
    )

    if not is_authorized:
        return jsonify({
            'jsonrpc': '2.0',
            'error': {'code': -32001, 'message': 'Unauthorized'},
            'id': req_id
        }), 401

    if method == 'tools/call':
        tool_name = params.get('name')

        # Caching logic for Fetch tool
        if tool_name == 'git_fetch':
            global fetch_cache, cache_expires_at
            is_cache_valid = fetch_cache is not None and time.time() < cache_expires_at
            record_span(
                'Cache-Check',
                'hit' if is_cache_valid else 'miss',
                'Served from TTL memory cache' if is_cache_valid else 'Memory cache miss'
            )

            if is_cache_valid:
                ttl_remaining = max(0, int(cache_expires_at - time.time()))
                return jsonify({
                    'jsonrpc': '2.0',
                    'result': {
                        'message': 'Fetch completed instantly from Cache (Cache Hit).',
                        'cached': True,
                        'ttlRemaining': ttl_remaining,
                        'traceInfo': {'traceId': trace_id, 'spans': spans}
                    },
                    'id': req_id
                })

        # Git operations queueing (fetch, pull, merge, push)
        if tool_name in ['git_fetch', 'git_pull', 'git_merge', 'git_push']:
            # Create a unique random task ID
            rand_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=5))
            task_id = f"task_{tool_name.replace('git_', '')}_{rand_str}"
            
            # Start background async execution
            start_background_task(task_id, tool_name)
            record_span('Task-Creation', 'success', f'Spawning async filesystem task: {task_id}')

            return jsonify({
                'jsonrpc': '2.0',
                'result': {
                    'taskHandle': task_id,
                    'status': 'running',
                    'message': 'Operation queued.',
                    'traceInfo': {'traceId': trace_id, 'spans': spans}
                },
                'id': req_id
            })

        return jsonify({
            'jsonrpc': '2.0',
            'error': {'code': -32601, 'message': 'Tool not found'},
            'id': req_id
        }), 404

    return jsonify({
        'jsonrpc': '2.0',
        'error': {'code': -32601, 'message': 'Method not found'},
        'id': req_id
    }), 400

# ==========================================
# 6. TASKS STATUS ENDPOINT
# ==========================================
@app.route('/api/tasks/<task_id>', methods=['GET'])
def get_task_status(task_id):
    """
    Returns the logs and status of a running background task.
    """
    task = tasks.get(task_id)
    if not task:
        return jsonify({'error': 'Task not found'}), 404
    return jsonify(task)

# ==========================================
# 7. REPOSITORY STATE ENDPOINT
# ==========================================
@app.route('/api/repo', methods=['GET'])
def get_repository_state():
    """
    Dynamically loads the content of document.txt from the 4 states:
    1. Remote (GitHub Raw Content URL)
    2. Local Tracking (origin/main branch via 'git show')
    3. Workspace File (local filesystem)
    4. Feature branch (via 'git show')
    """
    text_remote = 'Unable to fetch remote file.'
    text_local = 'File not found.'
    text_feature = 'Feature branch not initialized.'
    text_origin = 'Run Fetch to show tracking branch.'

    # Read local workspace file
    try:
        sim_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'git_simulation')
        local_file = os.path.join(sim_dir, 'local', 'document.txt')
        if os.path.exists(local_file):
            with open(local_file, 'r', encoding='utf-8') as f:
                text_local = f.read()
    except Exception as e:
        text_local = f"Error reading local file: {str(e)}"

    # Read remote tracking branch
    try:
        curr_branch = run_git_command('branch --show-current') or 'main'
        text_origin = run_git_command(f'show origin/{curr_branch}:mcp-git-poc/git_simulation/local/document.txt')
    except Exception:
        text_origin = 'Tracking branch file not cached. Run Fetch first.'

    # Read feature branch
    try:
        text_feature = run_git_command('show feature:mcp-git-poc/git_simulation/local/document.txt')
    except Exception:
        text_feature = 'Feature branch file not found or branch does not exist.'

    # Read remote file from GitHub raw URL dynamically
    try:
        origin_url = run_git_command('config --get remote.origin.url')
        raw_url = ''
        if origin_url:
            repo_path = ''
            if origin_url.startswith('http'):
                # Extract repo path from https URL
                repo_path = origin_url.replace('https://github.com/', '').replace('.git', '')
            elif origin_url.startswith('git@'):
                # Extract repo path from SSH URL
                parts = origin_url.split(':')
                if len(parts) > 1:
                    repo_path = parts[1].replace('.git', '')
            
            if repo_path:
                curr_branch = run_git_command('branch --show-current') or 'main'
                raw_url = f'https://raw.githubusercontent.com/{repo_path}/{curr_branch}/mcp-git-poc/git_simulation/local/document.txt'
        
        if raw_url:
            # Perform HTTP request
            req = urllib.request.Request(raw_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as response:
                text_remote = response.read().decode('utf-8')
        else:
            text_remote = 'Could not parse remote URL.'
    except Exception as e:
        text_remote = f"Error fetching from GitHub: {str(e)}"

    # Determine TTL Cache states
    global fetch_cache, cache_expires_at
    is_cached = fetch_cache is not None and time.time() < cache_expires_at
    ttl_sec = max(0, int(cache_expires_at - time.time())) if fetch_cache else 0

    return jsonify({
        'remote': text_remote,
        'local': text_local,
        'feature': text_feature,
        'origin': text_origin,
        'isCached': is_cached,
        'cacheTtlSec': ttl_sec
    })

# ==========================================
# 8. RESET SIMULATION ENDPOINT
# ==========================================
@app.route('/api/repo/reset', methods=['POST'])
def reset_repository_state():
    """
    Discards local workspace changes to the simulation file,
    deletes the feature branch, and recreates the simulation environment.
    """
    try:
        curr_branch = run_git_command('branch --show-current') or 'main'
        
        # Discard changes to local/document.txt
        try:
            run_git_command('checkout HEAD -- mcp-git-poc/git_simulation/local/document.txt')
        except Exception:
            pass
            
        # Delete local feature branch if it exists
        branches = run_git_command('branch')
        has_feature = any(b.strip().replace('*', '').strip() == 'feature' for b in branches.split('\n'))
        if has_feature:
            if curr_branch == 'feature':
                run_git_command('checkout main')
            run_git_command('branch -D feature')
            
        # Re-initialize simulation
        init_real_git_simulation()
        
        global fetch_cache, cache_expires_at
        fetch_cache = None
        cache_expires_at = 0
        tasks.clear()
        
        return jsonify({'message': 'Files successfully reset.'})
    except Exception as e:
        return jsonify({'error': f'Reset failed: {str(e)}'}), 500

# ==========================================
# 9. FRONTEND HTML DASHBOARD TEMPLATE
# ==========================================
HTML_CONTENT = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MCP 2.0 Git Physical POC (Python)</title>
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
    <h1>📋 MCP 2.0 Real Git POC (Python Flask)</h1>
    <div>
      <label><input type="checkbox" id="auth-check" checked onchange="updateAuthBadge()"> Send Auth Token</label>
      <span id="auth-badge" class="badge badge-ok">Authorized</span>
    </div>
  </header>

  <main class="dashboard">
    <!-- LEFT: FILES WORKSPACE -->
    <div class="panel">
      <h2>📂 Real Git Repository Files</h2>
      <p style="font-size:0.8rem; color:#6b7280; margin-bottom: 15px">The content below represents the actual contents of files inside the repository. Watch them change dynamically as you trigger actions!</p>
      
      <div class="btn-group">
        <button onclick="runTool('git_fetch')">Fetch (Remote ➔ Tracking)</button>
        <button onclick="runTool('git_pull')">Pull (Tracking ➔ Local)</button>
        <button onclick="runTool('git_merge')">Merge (Feature ➔ Local)</button>
        <button onclick="runTool('git_push')">Push (Local ➔ Remote)</button>
        <button class="btn-reset" onclick="resetRepo()">Reset Files</button>
      </div>

      <div class="file-box remote-box">
        <span class="file-content-label">GitHub Server File (fetched directly via Raw GitHub URL)</span>
        <div id="remote-txt-content" class="file-content">Loading...</div>
      </div>
      <div class="file-box origin-box">
        <span class="file-content-label">Local Tracking Branch File (origin/main via 'git show')</span>
        <div id="origin-txt-content" class="file-content">Loading...</div>
      </div>
      <div class="file-box local-box">
        <span class="file-content-label">Local Developer Workspace File (git_simulation/local/document.txt)</span>
        <div id="local-txt-content" class="file-content">Loading...</div>
      </div>
      <div class="file-box feature-box">
        <span class="file-content-label">Feature Workspace Branch File (feature branch via 'git show')</span>
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

      logRpc('REQUEST:\\\\n' + JSON.stringify(rpcRequest, null, 2));

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
        logRpc('RESPONSE:\\\\n' + JSON.stringify(data, null, 2));

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
        document.getElementById('task-logs').innerText = task.logs.join('\\\\n');

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
      box.innerText += text + '\\\\n\\\\n';
      box.scrollTop = box.scrollHeight;
    }

    loadFilesState();
  </script>
</body>
</html>
"""

# Serve dashboard index page
@app.route('/')
def home():
    return render_template_string(HTML_CONTENT)

# Start Python server
if __name__ == '__main__':
    print("\n======================================================")
    print("Python Flask server starting on http://127.0.0.1:3000")
    print("======================================================\n")
    app.run(host='0.0.0.0', port=3000, debug=False)
