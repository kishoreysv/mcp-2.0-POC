# Model Context Protocol (MCP) 2.0 - Git POC

This repository contains a Proof of Concept (POC) demonstrating the core pillars of the **Model Context Protocol (MCP) 2.0** specification, showing Git operations (`fetch`, `pull`, `merge`, `push`). 

It also includes a detailed comparative analysis between Traditional (Stateful) MCP and the updated MCP 2.0 (Stateless) standard.

---

## 🚀 Key MCP 2.0 Features Demonstrated
1. **Stateless Core**: Each JSON-RPC 2.0 tool invocation carries its own Auth token and Tracing context. The server does not maintain connection sessions.
2. **Tasks Extension**: Long-running Git operations (like fetch, pull) run in the background. The server returns a `taskHandle` instantly, and the client polls the status endpoint to stream logs.
3. **TTL Caching**: Read-only actions (like fetch status) are cached in memory for 15 seconds, returning results instantly on consecutive requests.
4. **Distributed Tracing**: Spans are recorded at each execution hop (Auth verification ➔ Cache Check ➔ Task Creation) and returned to verify performance metrics.
5. **Authorization Scopes**: Secure tokens validate whether the client has read (`git:read`) or write (`git:write`) scopes before executing tools.

---

## 📁 Repository Structure
* **`mcp-git-poc/`** — The Node.js application directory.
  * **[`server.js`](mcp-git-poc/server.js)** — The self-contained codebase containing the Express backend APIs and the inline HTML/CSS/JS dashboard.
  * **[`package.json`](mcp-git-poc/package.json)** — Node metadata and dependencies (`express`, `cors`).
* **[`MCP_Evolution_Traditional_vs_MCP_2.0.txt`](MCP_Evolution_Traditional_vs_MCP_2.0.txt)** — A plain-text comparative report describing the technical differences and advantages.
* **[`MCP_Evolution_Traditional_vs_MCP_2.0.docx`](MCP_Evolution_Traditional_vs_MCP_2.0.docx)** — A styled Microsoft Word format of the comparison report.
* **[`MCP 2.0 – Detailed Technical Report.txt`](MCP%202.0%20–%20Detailed%20Technical%20Report.txt)** — The original theoretical background document.

---

## ⚙️ How to Run the POC
1. Navigate to the app directory:
   ```bash
   cd mcp-git-poc
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open your browser and go to: **`http://localhost:3000`**
