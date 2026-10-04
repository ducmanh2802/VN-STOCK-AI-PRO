# OPENCODE — LEARNING-09→15 AUTONOMOUS BUILD + FULL CERTIFICATION

## 0. MISSION

You are the **Learning/Product Agent** for `VN-STOCK-AI-PRO`.

Your mission is to take the existing certified Learning MVP through:

- LEARNING-09 — Adaptive Learning
- LEARNING-10 — Applied / Project Learning
- LEARNING-11 — Assessment & Certification
- LEARNING-12 — Knowledge Graph
- LEARNING-13 — AI Tutor Foundation
- LEARNING-14 — Instructor / Admin Studio
- LEARNING-15 — Customer Training / Community Foundation

Then perform **one comprehensive final evidence audit and certification pass for LEARNING-09→15**.

Do not stop merely because individual phases appear complete.

The final state must be:

> LEARNING-09→15 implemented → tested → integrated → audited → remediated → re-tested → certified.

Do not fabricate completion.

---

# 1. CURRENT BASELINE

The Learning MVP LEARNING-01→08 is already considered certified historically.

Existing Learning capabilities are expected to include some or all of:

- Learning types
- Learning catalog
- learning paths
- lessons
- exercises
- practice lab
- exercise scoring
- mastery engine
- recommendation engine
- progress store
- system knowledge links
- LearningService
- learning schemas
- Learning UI/dashboard/path/lesson/practice components
- learning tests

However:

> NEVER TRUST THE HISTORICAL CERTIFICATION BLINDLY.

Inspect the actual repository.

There may also be a completed:

`docs/LEARNING_FOUNDATION_AUDIT.md`

If present, read it first.

The Foundation Audit is authoritative evidence for identifying foundation gaps.

---

# 2. GOVERNANCE — READ FIRST

Before touching implementation, read:

- `docs/AGENT_PARALLEL_EXECUTION.md`
- `docs/LEARNING_FOUNDATION_AUDIT.md` if present
- `docs/prompts/LEARNING_PLATFORM_AUTONOMOUS_ROADMAP.md` if present
- all existing Learning certification/audit documents
- relevant Phase 24–29 architecture/certification documents only when needed to understand system integration

Inspect:

```text
git status
git branch
git log --oneline -20
```

Determine the actual current state.

Do NOT assume the working tree is clean.

---

# 3. OWNERSHIP

You own:

```text
src/lib/learning/**
src/services/learning/**
src/lib/db/LearningRepository.ts
tests/learning/**
docs/learning/**
docs/LEARNING_*.md
Learning-related UI/components/routes
Learning-related schemas
Learning-related persistence
```

You may add new Learning-owned directories when justified.

You must NOT casually modify:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
market-data providers
execution
paper broker
ledger
macro engines
portfolio engines
multi-asset engines
strategy factory
fundamental engines
valuation engines
Phase 27/28/29 core logic
```

Do not modify another agent's lane.

If integration requires a shared boundary change, make the smallest possible compatible change and document it.

---

# 4. NON-DESTRUCTIVE GIT RULE

NEVER execute:

```bash
git reset --hard
git clean -fd
git clean -fdx
git restore .
git checkout -- .
git push --force
```

Never delete unrelated work.

Never blanket-stage:

```bash
git add .
git add -A
```

Stage only explicit Learning files.

Do not stash unrelated work.

Do not overwrite another agent's changes.

---

# 5. CRITICAL DATA RULE

The Learning system must distinguish:

### REAL SYSTEM DATA

Data originating from actual VN-STOCK-AI-PRO analytical engines.

### EDUCATIONAL DATA

Content intentionally created for teaching.

### TEST FIXTURE DATA

Deterministic test-only data.

### SYNTHETIC / SIMULATED DATA

Clearly labelled simulations.

Never silently present educational/test/synthetic values as real market facts.

Learning exercises may use simulated examples, but they must be explicitly identified.

---

# 6. CORE DESIGN PRINCIPLE

Learning is not a static course viewer.

The target loop is:

```text
LEARN
  ↓
PRACTICE
  ↓
APPLY
  ↓
BUILD
  ↓
EXPLAIN
  ↓
DEFEND
  ↓
REVIEW
  ↓
MASTER
```

The platform should progressively move the user from:

```text
knowledge
→ skill
→ application
→ decision
→ evidence
→ mastery
```

---

# 7. EXECUTION MODEL

Execute phases sequentially:

```text
FOUNDATION CHECK
      ↓
LEARNING-09
      ↓
GATE
      ↓
LEARNING-10
      ↓
GATE
      ↓
LEARNING-11
      ↓
GATE
      ↓
LEARNING-12
      ↓
GATE
      ↓
LEARNING-13
      ↓
GATE
      ↓
LEARNING-14
      ↓
GATE
      ↓
LEARNING-15
      ↓
FULL INTEGRATION
      ↓
FULL TEST
      ↓
FULL EVIDENCE AUDIT
      ↓
REMEDIATION
      ↓
FINAL TEST
      ↓
FINAL CERTIFICATION
```

Do not implement all seven phases blindly in one giant unverified change.

Each phase must be internally complete before moving to the next.

---

# 8. FOUNDATION GATE

Before LEARNING-09:

Read:

`docs/LEARNING_FOUNDATION_AUDIT.md`

Classify findings:

```text
P0 BLOCKER
P1 REQUIRED
P2 IMPORTANT
P3 OPTIONAL
P4 FUTURE
```

If P0/P1 prevents a phase from functioning correctly:

> FIX THE FOUNDATION FIRST.

Do not bypass the problem with mocks.

Typical foundation requirements may include:

- persistent progress
- stable user identity
- content versioning
- backend ownership
- authorization
- repository abstraction
- learning event history
- mastery persistence
- assessment persistence
- project submission persistence

Only implement foundation work that is actually required by evidence.

Document all such work.

---

# 9. LEARNING-09 — ADAPTIVE LEARNING

## Goal

Transform the Learning Hub from a static path into a system that adapts to the learner.

Build an adaptive learning engine.

At minimum support:

```text
current mastery
+
recent performance
+
exercise difficulty
+
knowledge dependencies
+
learning history
+
failed concepts
+
review interval
=
next recommended learning activity
```

Use deterministic rules first.

Do NOT require an LLM for core adaptive decisions.

---

## 9.1 Adaptive capabilities

Implement where justified:

- learner profile
- competency state
- mastery by concept
- confidence
- recent performance
- difficulty estimation
- weak-topic detection
- review scheduling
- prerequisite checking
- next-best lesson
- next-best exercise
- remediation recommendation
- challenge recommendation
- learning streak/progress signals

Avoid gamification for its own sake.

---

## 9.2 Adaptive algorithm requirements

The engine must be:

- deterministic
- testable
- explainable
- bounded
- fail-safe

Given identical:

```text
learner state
content state
asOfDate
```

the recommendation must be reproducible.

No direct `Date.now()` inside pure engines.

Use explicit dates/timestamps passed into functions.

---

## 9.3 Explainability

Every recommendation should be able to answer:

```text
Why am I seeing this?
```

Examples:

```text
Weak mastery
Prerequisite incomplete
Recent exercise failures
Scheduled review
Ready for advanced challenge
```

Never produce unexplained recommendations.

---

## 9.4 Acceptance

Must have tests covering:

- mastery progression
- weak concept detection
- prerequisite handling
- review scheduling
- recommendation ranking
- tie-breaking
- deterministic output
- empty learner history
- missing data
- invalid state
- completed path
- conflicting recommendations

---

# 10. LEARNING-10 — APPLIED / PROJECT LEARNING

## Goal

Move from exercises to realistic projects.

Projects should connect Learning to actual VN-STOCK-AI-PRO capabilities without corrupting production financial systems.

---

## 10.1 Project model

Support:

```text
Project
Project Version
Project Brief
Objectives
Prerequisites
Dataset / Data Source
Tasks
Submission
Evidence
Evaluation
Feedback
Status
```

Possible statuses:

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
UNDER_REVIEW
PASSED
FAILED
REVISION_REQUIRED
COMPLETED
```

---

## 10.2 Project types

Design extensibly for projects such as:

### Beginner

- understand OHLCV
- calculate basic return
- identify trend
- explain valuation concepts

### Intermediate

- analyze a stock
- compare companies
- construct a thesis
- evaluate risk

### Advanced

- design a strategy
- construct portfolio allocation
- perform scenario analysis
- defend an investment decision

Do not hard-code only these examples.

Build a reusable project framework.

---

## 10.3 Evidence-based submission

A project submission should contain evidence.

Examples:

```text
answer
calculation
chart
analysis
decision
reasoning
source references
system outputs
```

Avoid simply storing a "score".

---

## 10.4 Acceptance

Test:

- project lifecycle
- versioning
- submission
- resubmission
- evidence
- evaluation
- prerequisite enforcement
- invalid submission
- deterministic project state transitions

---

# 11. LEARNING-11 — ASSESSMENT & CERTIFICATION

## Goal

Create a serious assessment system.

Not merely:

```text
10 questions → percentage
```

It must measure competency.

---

## 11.1 Assessment model

Support:

```text
Assessment
Assessment Version
Question
Question Version
Question Type
Rubric
Attempt
Answer
Evidence
Score
Competency Result
```

Question types should be extensible.

Potential types:

```text
MCQ
MULTI_SELECT
NUMERIC
SHORT_ANSWER
EXPLANATION
CASE_ANALYSIS
PROJECT_DEFENSE
```

---

## 11.2 Assessment integrity

Support:

- immutable assessment versions
- immutable submitted attempts
- deterministic scoring where possible
- explicit rubric version
- pass threshold
- competency thresholds
- attempt history

Never mutate historical attempts when content changes.

---

## 11.3 Certification

Certification must be evidence-based.

Example:

```text
Learning completion
+
assessment pass
+
competency threshold
+
required projects
+
required practical evidence
=
certification eligibility
```

Certificate status should be deterministic.

Potential states:

```text
NOT_ELIGIBLE
ELIGIBLE
ISSUED
EXPIRED
REVOKED
```

Do not claim an official external accreditation unless one actually exists.

---

## 11.4 Acceptance

Test:

- scoring
- rubrics
- assessment versioning
- attempts
- retakes
- pass/fail
- competency thresholds
- certificate eligibility
- historical immutability
- invalid answers
- incomplete assessments

---

# 12. LEARNING-12 — KNOWLEDGE GRAPH

## Goal

Create a structured knowledge graph connecting:

```text
Concept
Skill
Lesson
Exercise
Project
Assessment
Strategy
Indicator
Financial Metric
Portfolio Concept
Risk Concept
Macro Concept
Industry Concept
System Capability
```

---

## 12.1 Graph model

Support nodes and typed relationships.

Examples:

```text
PREREQUISITE_OF
DEPENDS_ON
TEACHES
PRACTICES
ASSESSES
APPLIED_IN
RELATED_TO
EXPANDS
CONTRADICTS
```

Keep relationship types explicit.

---

## 12.2 Graph usage

The graph must power:

- prerequisites
- adaptive learning
- recommendations
- concept navigation
- assessment mapping
- project mapping
- system knowledge discovery
- future AI Tutor retrieval

Avoid building a graph that is only decorative UI.

---

## 12.3 Graph integrity

Detect:

- missing nodes
- dangling references
- cycles where prohibited
- duplicate relationships
- invalid relationship types
- orphan concepts

Tests must validate graph consistency.

---

# 13. LEARNING-13 — AI TUTOR FOUNDATION

## Goal

Create the foundation for an AI tutor.

IMPORTANT:

The AI Tutor must NOT become the source of truth for financial facts.

---

## 13.1 Tutor responsibilities

The tutor may:

- explain concepts
- ask questions
- provide hints
- generate practice prompts
- review reasoning
- challenge assumptions
- explain mistakes
- guide project work
- reference Learning content
- reference approved system knowledge

---

## 13.2 Tutor boundaries

The tutor must not:

- fabricate market data
- invent system capabilities
- silently invent sources
- override RiskGuard
- override TradingEngine
- override financial safety rules
- represent educational examples as live data
- make autonomous trades

For financial questions:

```text
REAL SYSTEM DATA
vs
EDUCATIONAL EXPLANATION
vs
SIMULATION
```

must remain distinguishable.

---

## 13.3 Tutor architecture

Prefer:

```text
Tutor Orchestrator
      ↓
Context Builder
      ↓
Knowledge Retrieval
      ↓
Learning State
      ↓
Tutor Policy
      ↓
LLM Adapter
      ↓
Response Validator
```

Do not tightly couple the core Learning engine to a specific LLM provider.

---

## 13.4 Deterministic safety layer

The tutor policy must enforce:

```text
allowed context
+
allowed tools
+
allowed actions
+
data provenance
+
output constraints
```

AI should enhance learning.

AI must not define authoritative financial calculations.

---

## 13.5 Acceptance

Test:

- context selection
- knowledge retrieval
- missing context
- unsupported questions
- provenance
- hallucination-risk boundaries
- refusal/fallback
- deterministic tutor policy
- LLM adapter isolation

Do not require a live paid LLM API merely to pass core tests.

Use explicit test adapters.

---

# 14. LEARNING-14 — INSTRUCTOR / ADMIN STUDIO

## Goal

Create the foundation for managing Learning content.

This is NOT a generic admin dashboard.

It is a Learning content management system.

---

## 14.1 Content management

Support where appropriate:

```text
Course
Path
Module
Lesson
Concept
Exercise
Project
Assessment
Question
Rubric
Certification
```

---

## 14.2 Content lifecycle

Support:

```text
DRAFT
REVIEW
PUBLISHED
ARCHIVED
```

Published versions must remain immutable.

Editing published content creates a new version.

---

## 14.3 Instructor capabilities

Design for:

- create
- edit
- review
- preview
- publish
- archive
- version
- duplicate
- dependency inspection
- learner analytics

Do not implement unnecessary enterprise functionality.

---

## 14.4 Validation

Before publishing, validate:

```text
required fields
references
prerequisites
graph links
assessment mappings
project mappings
broken links
version consistency
```

Publishing invalid content must fail closed.

---

# 15. LEARNING-15 — CUSTOMER TRAINING / COMMUNITY FOUNDATION

## Goal

Prepare Learning for real users and future monetization.

Do NOT build a giant social network.

Build the foundation.

---

## 15.1 Customer learning model

Support concepts such as:

```text
Organization
Learning Cohort
Enrollment
Learner
Instructor
Mentor
Course Access
Progress
Certification
```

If multi-user infrastructure does not yet exist, create clean domain boundaries without pretending full production authentication is complete.

---

## 15.2 Cohorts

Support:

- cohort
- enrollment
- start/end date
- assigned curriculum
- progress
- completion
- instructor association

---

## 15.3 Community foundation

Design for future:

```text
discussion
questions
peer review
project showcase
mentor feedback
leaderboard
```

But only implement functionality justified by the actual platform foundation.

Do not build a fake social network.

---

## 15.4 Product readiness

Identify where future monetization can attach:

```text
FREE
PRO
COURSE
CERTIFICATION
COHORT
MENTORING
B2B
```

Do not implement payments unless the repository already has the required platform foundation and it is genuinely within this phase.

---

# 16. CROSS-PHASE INTEGRATION

After LEARNING-09→15, the final Learning architecture should conceptually be:

```text
CONTENT
  ↓
KNOWLEDGE GRAPH
  ↓
LEARNING PATH
  ↓
ADAPTIVE ENGINE
  ↓
PRACTICE
  ↓
PROJECT
  ↓
ASSESSMENT
  ↓
MASTERY
  ↓
CERTIFICATION
  ↓
CUSTOMER / COHORT
  ↓
AI TUTOR
```

With supporting layers:

```text
CONTENT VERSIONING
PERSISTENCE
AUTHORIZATION
PROVENANCE
AUDIT
ANALYTICS
```

---

# 17. SYSTEM KNOWLEDGE INTEGRATION

Learning should expose the actual platform's capabilities.

Examples:

```text
Market Data
Fundamentals
Earnings
Valuation
Macro Regime
Industry Cycle
Strategy Factory
Portfolio Intelligence
Multi-Asset Quant
Risk
Scenario Analysis
```

But Learning must consume these through stable interfaces.

Do not import deep implementation details unnecessarily.

Prefer:

```text
Learning
  ↓
Knowledge Adapter / System Link
  ↓
Approved Domain Capability
```

---

# 18. DATABASE / PERSISTENCE

If persistence is required:

1. inspect current schema
2. inspect migration history
3. reserve migration ID
4. avoid collisions
5. implement repository abstraction
6. test persistence
7. verify rollback/recovery assumptions
8. document migration

Never assume an unused migration ID.

Never modify unrelated tables without justification.

---

# 19. MULTI-USER

The Learning domain must not rely permanently on:

```text
localStorage-only global state
```

If authentication/user infrastructure is not yet production-ready:

- create explicit learner identity boundaries
- keep interfaces ready for user IDs
- avoid fake authentication
- do not pretend local-only state is multi-user production state

Clearly document what is:

```text
READY
PARTIAL
DEFERRED
```

---

# 20. SECURITY

Audit:

- authorization boundaries
- content publishing permissions
- learner access
- instructor access
- assessment access
- certificate integrity
- prompt/tool boundaries
- user input validation
- injection risk
- unsafe dynamic evaluation

Never allow arbitrary user content to execute as code.

---

# 21. TESTING REQUIREMENTS

Every phase must add appropriate tests.

At minimum test:

### Domain

- deterministic engines
- state transitions
- invalid inputs
- edge cases

### Persistence

- repository operations
- versioning
- constraints

### Integration

- service boundaries
- cross-domain Learning integration

### UI

Where practical:

- primary user flow
- empty states
- error states
- loading states
- version states
- authorization states

---

# 22. FULL LEARNING TEST GATE

After LEARNING-15:

Run:

```bash
npm test
npm run typecheck
npm run build
```

Use the project's actual commands if they differ.

Do not claim success without actual exit codes.

Capture:

```text
test count
suite count
typecheck result
build result
```

---

# 23. FAILURE SEMANTICS

Learning must fail explicitly.

Examples:

```text
CONTENT_UNAVAILABLE
CONTENT_INVALID
PREREQUISITE_UNAVAILABLE
LEARNER_STATE_UNAVAILABLE
ASSESSMENT_INVALID
PROJECT_INVALID
KNOWLEDGE_GRAPH_INVALID
TUTOR_CONTEXT_UNAVAILABLE
UNAUTHORIZED
FORBIDDEN
```

Do not silently:

```text
return empty success
invent mastery
invent recommendation
invent assessment result
invent certification
invent knowledge
```

---

# 24. PERFORMANCE

Do not prematurely optimize.

But identify:

- expensive graph traversals
- recommendation complexity
- repeated DB reads
- large content payloads
- tutor context size
- assessment query cost

Use bounded algorithms.

No unbounded recursive graph traversal.

---

# 25. DOCUMENTATION

Update/create documentation as implementation progresses.

At minimum final documentation should include:

```text
docs/LEARNING_09_CERTIFICATION.md
docs/LEARNING_10_CERTIFICATION.md
docs/LEARNING_11_CERTIFICATION.md
docs/LEARNING_12_CERTIFICATION.md
docs/LEARNING_13_CERTIFICATION.md
docs/LEARNING_14_CERTIFICATION.md
docs/LEARNING_15_CERTIFICATION.md
```

And:

```text
docs/LEARNING_09_15_FULL_AUDIT.md
```

If architecture substantially changed:

```text
docs/LEARNING_PLATFORM_ARCHITECTURE.md
```

Do not create documentation that falsely claims production readiness.

---

# 26. FINAL EVIDENCE AUDIT

After implementation, perform a READ-ONLY style audit of the resulting implementation.

Check:

## Architecture

- domain boundaries
- services
- repositories
- schemas
- UI boundaries
- dependency direction

## Data

- persistence
- versioning
- provenance
- learner ownership
- content ownership

## Adaptive Learning

- deterministic recommendations
- explainability
- mastery integration

## Projects

- lifecycle
- evidence
- evaluation

## Assessment

- immutable attempts
- versioning
- certification logic

## Knowledge Graph

- graph integrity
- dependencies
- recommendation integration

## AI Tutor

- safety boundary
- provenance
- adapter isolation
- no financial authority

## Instructor

- content lifecycle
- publishing validation
- versioning

## Customer Training

- enrollment
- cohort
- learner boundaries
- community foundation

## Security

- authorization
- input validation
- AI tool boundaries

## Testing

- unit
- integration
- regression
- full suite

## Product Readiness

Classify:

```text
PRODUCTION READY
PARTIALLY READY
FOUNDATION READY
DEFERRED
```

Do not use vague language.

---

# 27. FINAL GAP CLASSIFICATION

Every finding must be classified:

### P0 — BLOCKER

Prevents safe/correct operation.

### P1 — REQUIRED

Must be fixed before certification.

### P2 — IMPORTANT

Should be fixed but does not invalidate core certification.

### P3 — OPTIONAL

Useful enhancement.

### P4 — FUTURE PRODUCT

Business/product/infrastructure expansion.

---

# 28. REMEDIATION LOOP

If final audit finds P0/P1:

```text
AUDIT
↓
REMEDIATION
↓
TEST
↓
RE-AUDIT
```

Repeat until:

```text
P0 = 0
P1 = 0
```

Do not certify while P0/P1 remain.

---

# 29. FINAL CERTIFICATION CRITERIA

LEARNING-09→15 may be certified only if:

```text
[ ] Foundation requirements satisfied
[ ] LEARNING-09 implemented
[ ] LEARNING-10 implemented
[ ] LEARNING-11 implemented
[ ] LEARNING-12 implemented
[ ] LEARNING-13 implemented
[ ] LEARNING-14 implemented
[ ] LEARNING-15 implemented

[ ] Architecture coherent
[ ] Persistence verified
[ ] Versioning verified
[ ] Multi-user boundary explicit
[ ] Adaptive engine deterministic
[ ] Project lifecycle verified
[ ] Assessment integrity verified
[ ] Certification logic verified
[ ] Knowledge graph integrity verified
[ ] AI Tutor safety boundary verified
[ ] Instructor publishing boundary verified
[ ] Customer training boundary verified

[ ] No fabricated financial data
[ ] No silent mocks
[ ] No hidden fallback
[ ] No protected-system corruption
[ ] No unauthorized cross-lane changes

[ ] Tests pass
[ ] Typecheck passes
[ ] Build passes
[ ] P0 = 0
[ ] P1 = 0
[ ] Final evidence audit complete
[ ] Final remediation complete
```

---

# 30. GIT DISCIPLINE

Create commits logically.

Preferred structure:

```text
feat(learning): implement adaptive learning
feat(learning): implement applied projects
feat(learning): implement assessment and certification
feat(learning): implement knowledge graph
feat(learning): implement ai tutor foundation
feat(learning): implement instructor studio
feat(learning): implement customer training foundation
docs(learning): certify learning 09-15
```

Do NOT force exactly these commit boundaries if repository reality suggests better boundaries.

But every commit must be:

- logically coherent
- reviewable
- Learning-owned
- free from unrelated files

Before each commit:

```bash
git diff --cached --stat
git diff --cached --name-only
```

Verify no protected/foreign files are staged.

---

# 31. FINAL GIT VERIFICATION

After completion:

```bash
git status
git diff --stat
git diff --cached --stat
git log --oneline -15
```

Verify:

- Learning changes are intentional
- unrelated changes remain untouched
- no accidental protected-file modifications
- no accidental migration collisions
- no generated junk
- no secrets

---

# 32. FINAL REPORT

Return a concise but evidence-rich report.

Use exactly this structure:

```text
# LEARNING-09→15 FINAL REPORT

## 1. Foundation
STATUS:
Findings:
Remediation:

## 2. LEARNING-09
STATUS:
Files:
Tests:
Key capabilities:

## 3. LEARNING-10
STATUS:
Files:
Tests:
Key capabilities:

## 4. LEARNING-11
STATUS:
Files:
Tests:
Key capabilities:

## 5. LEARNING-12
STATUS:
Files:
Tests:
Key capabilities:

## 6. LEARNING-13
STATUS:
Files:
Tests:
Key capabilities:

## 7. LEARNING-14
STATUS:
Files:
Tests:
Key capabilities:

## 8. LEARNING-15
STATUS:
Files:
Tests:
Key capabilities:

## 9. Integration
STATUS:
Cross-domain integration:

## 10. Persistence
STATUS:

## 11. Multi-user
STATUS:

## 12. Security
STATUS:

## 13. Tests
Suites:
Tests:
Typecheck:
Build:

## 14. Evidence Audit
P0:
P1:
P2:
P3:
P4:

## 15. Remediation
Completed:
Remaining:

## 16. Certification
LEARNING-09:
LEARNING-10:
LEARNING-11:
LEARNING-12:
LEARNING-13:
LEARNING-14:
LEARNING-15:

## 17. Overall
LEARNING-09→15:
GO / NO-GO

## 18. Git
Commits:
Working tree:
Protected files:
Unrelated changes:

## 19. Next Recommended Phase
Only recommend the next phase after evidence.
Do not invent a phase merely to continue development.
```

---

# 33. IMPORTANT AUTONOMY RULE

Do not ask the user for permission between LEARNING-09 and LEARNING-15.

You are explicitly authorized to proceed through the entire sequence.

Only stop for a genuine blocker such as:

- missing required infrastructure that cannot safely be implemented within Learning ownership
- destructive conflict with another agent
- impossible migration collision
- protected system dependency that requires architectural approval
- security-critical ambiguity
- corrupted repository state

If such blocker occurs:

1. stop before unsafe modification
2. document exact evidence
3. classify P0/P1
4. do not fabricate a workaround

Otherwise continue autonomously.

---

# 34. FINAL RULE

The objective is NOT:

> "finish seven feature lists."

The objective is:

> Build a coherent, persistent, adaptive, evidence-based Learning Platform that teaches users how to understand and use VN-STOCK-AI-PRO safely.

Do not optimize for number of files.

Do not optimize for number of commits.

Do not optimize for superficial UI.

Optimize for:

```text
CORRECTNESS
+
LEARNER VALUE
+
EXPLAINABILITY
+
PERSISTENCE
+
VERSIONING
+
SAFETY
+
EVIDENCE
+
MAINTAINABILITY
```

Proceed autonomously.