# Jayson: JSON Git-Native CMS - Alpha Release Documentation

Welcome to the Alpha Release of **Jayson**, a revolutionary Git-Native JSON-based Content Management System (CMS). Jayson challenges the traditional CMS paradigm by replacing heavy database infrastructure with lightweight, file-based JSON storage, versioned natively via Git.

This document serves as an in-depth technical dive into Jayson's architecture, security engineering, performance profile, and roadmap.

---

## 1. Philosophy: Why a JSON Git-Native CMS?

For years, Headless CMS platforms have relied on traditional relational or NoSQL databases. While robust, this approach introduces significant friction points:

- **Environment Synchronization:** Moving content from "Staging" to "Production" often requires painful database dumps or fragile API syncs.
- **Infrastructure Overhead:** Databases require hosting, maintenance, scaling, and backups.
- **Auditability & Revisions:** Native database revisions rarely match the granular power and developer familiarity of Git.

### The "Content-as-Code" Paradigm

By storing all schemas, configurations, and content as JSON files, Jayson turns your file system into your database and **Git into your database engine**.

**What Problems Does It Solve?**
1. **Zero Database Infrastructure:** No PostgreSQL, no MongoDB. Only a file system.
2. **Native Branching & Merging:** Stage massive campaigns on Git branches; merge to launch.
3. **Perfect Audit Trails:** Every update is a Git commit tied to a specific author and timestamp.
4. **Seamless CI/CD:** Frontend builds (Next.js/Astro) read from the local file system at build time for massive performance gains.

---

## 2. Technical Profile & Performance

Jayson is engineered for high performance and reliability, targeting the following metrics:

| Metric | Target | Description |
| :--- | :--- | :--- |
| **Boot Time** | < 3s | Full in-memory index rebuild for 10k entries |
| **Read Latency** | < 50ms | Average response time for content retrieval |
| **Write Latency** | < 200ms | P95 latency for atomic write + Git commit |
| **Concurrent Reads** | 200 | Simultaneous read operations supported |
| **Concurrent Writes** | 20 | Simultaneous write operations (global limit) |

### 2.1. Concurrency Control (FileEngine)
Reliability is managed via the [FileEngine](file:///home/wizard/wizard-dev/jayson/packages/core/src/engines/file-engine.ts#72-513) using a custom **AsyncMutex** implementation:
- **Write Serialization:** Ensures only one operation holds the lock per content-type at a time using a FIFO queue.
- **Global Throttle:** Enforces a hard limit of 20 concurrent writes across the entire system to prevent I/O saturation.
- **Atomicity:** Uses a "temp file + fsync + rename" pattern. Data is never written directly to the target file, preventing corruption even during process crashes.

---

## 3. Security Architecture

Security is built into the engine layer, ensuring data protection even if the API layer is exposed.

### 3.1. Authentication (AuthEngine)
- **User Persistence:** Users are stored as JSON files in `.cms/users/`.
- **Credential Safety:** Uses **bcryptjs** with 10 salt rounds for secure password hashing.
- **Tokenization:** Issues **JWT (JSON Web Tokens)** containing user ID and Role for stateless session management.

### 3.2. Role-Based Access Control (RBACEngine)
- **Granular Permissions:** Configured via `rbac.json` with four default roles (`Admin`, `Editor`, `Authenticated`, `Public`).
- **Conditional Logic:** Supports dynamic templates (e.g., `createdBy: '${user.id}'`), enabling ownership-based access.
- **Field-Level Security:** Automatically filters JSON payloads at the engine level based on role-restricted fields.

---

## 4. Architecture Deep Dive

### 4.1. GitEngine & Worktree Architecture
To prevent commit pollution, Jayson utilizes **Git Worktrees**:
- **Data Branch:** Content lives on an orphan branch named `cms-data`.
- **Hybrid Mapping:** The `content/` directory is mapped to `cms-data` using `git worktree add`, while code/config remains on the `main` branch.

### 4.2. QueryEngine & Real-time Sync
Querying a file system directly is slow, so Jayson maintains a high-performance **In-Memory Index**.
- **Index Sync:** Uses **Chokidar** to watch the file system. External modifications (like a `git pull`) trigger instant index refreshes without requiring a system restart.
- **Population:** Inherently resolves deep relationships and dynamic zones during the query phase.

---

## 5. Technology Stack

- **Runtime:** Node.js >= 20.0.0
- **Framework:** Next.js 14 (App Router)
- **State/Build:** Turborepo, TypeScript (Strict Mode)
- **UI:** Tailwind CSS, Radix UI, Lucide Icons
- **Validation:** AJV (JSON Schema)
- **Testing:** Vitest, fast-check (Property-Based Testing)

---

## 6. Roadmap & Future Plans

Jayson is currently in Alpha. Planned features include:

- [ ] **Infrastructure Hooks:** Build triggers for Vercel/Netlify via MetadataEngine webhooks.
- [ ] **Cloud Media Providers:** Support for S3, Cloudflare R2, and Cloudinary.
- [ ] **Visual Content Builder:** Enhanced Dynamic Zone editor with live block previews.
- [ ] **Version Diffing UI:** A visual "Git Diff" interface for content authors.
- [ ] **Deep Relational Optimization:** Enhanced caching for massive, deeply-nested content structures.

---

## 7. Conclusion

Jayson CMS bridges the gap between the speed of local development and the power of enterprise CMS platforms. By treating **Content-as-Code**, it provides infinite history and zero-cost environment synchronization for modern production teams.
