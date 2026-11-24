# Operation HQ — executive operating system requirements

Owner-requested expansion, 25 November 2026 (Sydney). This is a requirements and architecture addendum, not implemented functionality or a completed release. Preserve the canonical v3 roadmap and its historical evidence; this addendum extends it without silently changing old completion claims. No private project context, account details, email contents or personal memories belong in this public source document.

## Product outcome

Operation HQ should combine a personal executive assistant, one connected second brain with project-specific workspaces, an updating command dashboard, and a supervised execution team. The owner should primarily provide initial connections, important preferences and decisions; receive useful completed artifacts and a short daily brief; and approve consequential actions. Optimise for school commitments, project delivery, clarity and measurable value, including business usefulness—not agent count, decorative activity or guaranteed revenue.

The chief-of-staff is an orchestration role, not a legal company officer or an unrestricted authority. Internal reviewer approval never substitutes for a required owner decision. The future Jarvis system should be able to reuse these records, policies and adapters; desktop powers remain a separate explicit capability.

## Fresh source-backed starting point

Baseline main `bf340372`, Site version 13, pending companion PR 17 at `84e3b895`. Installed-device state is unverified. Prior automated test results are evidence for their exact source/scenarios, not acceptance of this expansion.

| Goal | Existing foundation | Missing for this requirement |
|---|---|---|
| Personal executive assistance | Tasks, events, notes, focus, study views, deadline/priority-based day brief, reviewed planning actions | General cross-project execution, deliverable management, broader permissions/capability coverage and workload-aware delegation |
| One project-aware second brain | Notes, captures/research records in the companion, bounded local retrieval and source-labelled context assembly | Shared project registry, durable facts/decisions/preferences, source versions, contradiction handling, scoped cross-project retrieval and project health |
| Chief-of-staff and specialist team | Typed/deterministic command routing; optional local-model advisory functions | Persistent orchestrator, delegated jobs, specialist/reviewer separation, budgets, retries, escalation and independent acceptance |
| Updating daily dashboard | Explicit saved tasks/events/timetable projections, day brief and supported refresh/sync paths | Event-driven project/activity rollups, background job status, unified approval/deliverable inbox and stale-data indicators across all integrations |
| Email/calendar awareness | Companion read-only Gmail metadata/lanes/follow-ups; dashboard calendar and explicit account-paired planning | Verified live-provider acceptance, unattended approved ingestion, source-specific freshness, provider write policies and broader interoperability |
| Minimal owner work | Previews, confirmations, recovery, some automatic browser queue behavior and tests | Approval batching, policy delegation, concise evidence/impact packets, dependable notifications and an organised owner acceptance campaign |
| Continuous improvement | GitHub branches/PRs, regression tests, research logs and builder-run review cycles | In-app evaluation/experiment registry, measured improvement promotion, controlled model/tool updates and feedback-to-policy learning |
| Future Jarvis portability | Split web/extension design, typed state and permission boundaries | Stable versioned agent/job/memory/tool schemas, export/import, adapter compatibility tests and migration rehearsal |

`dashboard/lib/command-router.ts` routes supported commands; `dashboard/lib/study-commands.ts` provides bounded literal retrieval and a factual brief. These are not a general autonomous planner. `extension/js/hq-intelligence.js` collects selected local sources only on request, capped at 8,800 characters; it is not an unlimited global memory or always-running agent. Existing builder automations in this conversation are not the in-app employee team. ChatGPT connector availability does not automatically give the deployed dashboard those integrations or all conversation memories.

## Unified architecture

1. **Command dashboard:** Today, Projects, Work in progress, Deliverables, Approvals and Health. Normal view stays calm. Every card exposes provenance, freshness and the next useful action; technical traces are expandable.
2. **Chief-of-staff orchestrator:** resolves the request, retrieves only relevant context, proposes a bounded plan, delegates jobs, watches dependencies, consolidates reviewed results and escalates genuine blockers. It must distinguish drafted, locally verified, provider-verified, approved and applied.
3. **Shared memory service:** one logical brain, with isolated project workspaces and explicitly shareable global preferences. Store evidence-linked facts, decisions and their rationale, goals, constraints, risks, tasks, artifacts and lessons. Separate confirmed facts, model suggestions and unresolved assumptions. Retain source timestamps, owner corrections, supersession and contradiction records; support correction, export and deletion.
4. **Typed tool/adaptor registry:** each tool declares inputs/outputs, project/account scope, read/write authority, cost, confirmation, timeout, retries, idempotency and recovery. The extension owns browser-only operations; server adapters own explicitly connected background services. Absence of a tool is a visible limitation, not a fabricated success.
5. **Durable execution queue:** jobs persist across tab closure and worker restart. Use leases, idempotency keys, bounded retries/backoff, cancellation, dependency checks, a dead-letter/escalation path and observable job state. Closing a tab cannot quietly discard accepted work; reopening cannot duplicate an external action.
6. **Approval and artifact ledger:** approved changes reference the exact reviewed payload/version, affected records, evidence, risks, cost and rollback. Reject stale approvals after source changes. Deliverables include editable outputs and acceptance results, not merely a status message.
7. **Evaluation/evolution pipeline:** failures and owner corrections become candidate improvements. Research and experiment offline/in a sandbox, compare against a pinned baseline and frozen acceptance cases, independently review, then promote through existing release gates. Retain rollback. Do not self-modify production prompts, code, permissions or models because a candidate is newer.

Use one orchestrator with task-sized specialist roles rather than keeping many large models resident. Candidate roles: planner/chief-of-staff, researcher, builder, independent reviewer, project-memory curator and integration operator. A school coach assists learning and preparation; business/project specialists work only within their approved scopes. Schedule/model/service budgets, timeouts and concurrency are hard limits, not recommendations.

## Routine operating loop

Approved source events or an owner request → reconcile evidence and project state → identify the highest-value feasible work → prepare a bounded plan → execute permitted steps → independently verify → save deliverables and decisions → request only consequential approvals → apply approved changes → record outcomes and update the next brief.

A morning brief should show current fixed commitments, the next school/study action, realistic capacity, project changes since last visit, completed outputs ready to read, and decisions requiring attention. It should not fill the screen with every stored task. While the owner studies, permitted background work may continue within its budget; timetable/focus changes must respect protected commitments and the approved action policy.

## Authority and privacy

- Begin with source-specific read access; add write tools only where there is a real tested use and explicit authority. No blanket export of email, private notes, bookmarks or ChatGPT memories to a provider. Show what is sent, to whom, purpose, retention and revocation before opt-in.
- Read-only refresh, authorised research and private draft preparation can run under a standing policy. Reversible local changes can be delegated per action class with audit/undo. External messages, publishing, spending, destructive changes, credentials, audience changes and sensitive account actions retain specific approval and any legally required account-owner responsibility.
- Treat retrieved pages, repositories, emails and attachments as untrusted data—not instructions that can grant tools, change policies or approve actions. Validate tool arguments and isolate project/account contexts.
- The owner can pause all execution, cancel a job, inspect provenance, revoke an integration and export/recover records. Agents may propose a policy change but cannot enlarge their own permissions or bypass a denied workflow.
- A website/extension is not a persistent desktop worker. Browser-only work needs the browser/companion available; unattended cloud work needs an authorised durable runner, suitable APIs and secrets stored through the normal protected route. Free tiers and model quotas are finite. No 24/7 unlimited-compute or guaranteed-profit claim is permitted.

## Delivery stages and acceptance

Do not replace unfinished bookmark correctness, security and measured performance work with this expansion. Develop the following as an independently gated programme:

1. **Foundation and one vertical slice:** private project registry and decision/memory records; daily project brief; one read-only source; one requested research/draft job; reviewed artifact; owner approval; exact application/recovery. Demonstrate the whole loop with synthetic data before broader connections.
2. **Dependable chief-of-staff:** persistent jobs, dependency-aware planning, scope/budget limits, cancellation/restart, separate reviewer, approvals and failure notifications. Restart a worker mid-job and prove no duplicate consequence.
3. **Connected second brain:** authorised source ingestion, incremental refresh/deduplication, provenance, corrections, contradictions, project isolation, scoped retrieval, export and deletion. Prove one project's private context cannot leak into another by default.
4. **Useful executive operations:** email/calendar awareness, school/timetable planning, project status collection and editable outputs. Verify live-provider permissions, revocation and failure handling separately from mocked tests. Batch approvals without hiding material consequences.
5. **Measured evolution and Jarvis interchange:** evaluation ledger, controlled model/tool/prompt trials, tested promotion/rollback, versioned exports and a migration rehearsal into a separate Jarvis adapter. No production self-rewrite or self-authorised power expansion.

Freeze these nine capability groups before any completion percentage: executive brief; project registry; evidence-backed memory; durable orchestration; specialist execution/review; approvals/artifacts; integrations; controlled evolution; Jarvis interchange. For each, record source implementation, automated behavior, real-browser acceptance and device/provider acceptance separately. None is accepted merely by writing this document.

Minimum evidence includes correct citations and freshness; no invented completed jobs; worker restart/idempotency; cancellation; offline/conflict recovery; malicious source instructions; cross-project/account isolation; stale approvals; quota/provider failures; no unconfirmed external consequences; realistic timetable capacity; bounded normal-tab memory and model unload; and owner usability acceptance.

Track usefulness through verified job success, time saved with a stated baseline, correction/rollback rate, decision quality on frozen cases, cost per accepted deliverable, freshness and owner interruptions. Daily growth means a repeatable improvement process that retains only demonstrated gains—not a promise of daily intelligence increases, unattended business success or unlimited free resources.

## First implementation commitment

After the current reliability gates, ship one narrow integrated loop: register a project, attach approved source references, request a weekly-status/research brief, run a bounded job, independently check cited claims, show the completed editable artifact and approval packet, and preserve its job/memory/decision history across restart. Do not begin by granting every connector access or building a collection of disconnected chat windows.
