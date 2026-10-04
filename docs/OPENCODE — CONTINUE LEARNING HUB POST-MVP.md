# OPENCODE — CONTINUE LEARNING HUB

## MISSION

Continue the Learning Hub autonomous roadmap.

Current certified baseline:

```text
LEARNING-01 → LEARNING-08
STATUS: CERTIFIED
CUSTOMER_TRAINING_FOUNDATION: READY
```

The objective is to continue:

```text
LEARNING-09
→ LEARNING-10
→ LEARNING-11
→ LEARNING-12
→ LEARNING-13
→ LEARNING-14
→ LEARNING-15
```

toward a complete Learning & Training Platform.

---

# 1. FIRST RULE — DO NOT ASSUME

Before implementing LEARNING-09:

Perform a complete:

> POST-MVP DISCOVERY + ARCHITECTURE RE-AUDIT

The previous MVP certification only proves LEARNING-01→08.

Do not assume the post-MVP architecture is production-ready.

Inspect the actual repository.

---

# 2. READ FIRST

Read:

```text
docs/AGENT_PARALLEL_EXECUTION.md
docs/prompts/LEARNING_PLATFORM_AUTONOMOUS_ROADMAP.md
docs/LEARNING_PLATFORM_DISCOVERY_REPORT.md
docs/LEARNING_PLATFORM_ROADMAP.md
```

Then inspect the actual implementation:

```text
src/lib/learning/**
src/services/learning/**
src/schemas/learningSchema.ts
tests/learning/**
```

Also inspect:

```text
schema
migrations
Firebase authentication
existing user/profile architecture
existing API architecture
existing repositories
existing authorization patterns
```

Do not rely solely on documentation.

---

# 3. OWNERSHIP

You are the:

> LEARNING / PRODUCT AGENT

You own:

```text
src/lib/learning/**
src/services/learning/**
src/lib/db/LearningRepository.ts
tests/learning/**
docs/learning/**
Learning-related documentation
```

You may add Learning-owned files where architecture requires them.

Do NOT modify:

```text
Phase 28
Phase 29
Portfolio Intelligence
Multi-Asset Quant
RiskGuard
TradingEngine
RiskManager
PositionSizer
MarketDataIntegrityGuard
TradingDataValidator
FinancialConservation
market-data providers
execution systems
```

Do NOT modify CodeGPT's Core Quant lane.

---

# 4. PARALLEL EXECUTION

CodeGPT is independently responsible for:

```text
Phase 28
Phase 29
Phase 30
```

Do not inspect, modify, stage, commit, or merge CodeGPT work.

Do not wait for CodeGPT unless a genuine shared dependency exists.

Do not use:

```text
git reset --hard
git clean
git restore .
git checkout -- .
git stash
```

Do not use blanket staging:

```text
git add .
git add -A
```

---

# 5. POST-MVP AUDIT

Determine the actual state of:

## Learning content

- domains
- topics
- concepts
- lessons
- examples
- exercises
- assessments
- projects
- labs

## Progress

- mastery
- exercise history
- prerequisites
- recommendations
- review scheduling
- persistence

## Backend

Determine whether Learning is currently:

```text
client-only
client + service
client + backend
client + backend + database
```

Do not assume.

---

# 6. MULTI-USER ARCHITECTURE

Inspect the existing authentication architecture.

Determine whether Learning can safely support:

```text
user
profile
learning progress
mastery
exercise attempts
certifications
projects
saved work
```

with strict user isolation.

Explicitly distinguish:

```text
authentication
authorization
ownership
tenant isolation
```

Do not assume Firebase authentication automatically provides authorization.

---

# 7. LEARNING-09 — ADAPTIVE LEARNING

Determine the correct architecture for:

```text
mastery-aware recommendations
prerequisite-aware sequencing
review scheduling
weak-topic detection
exercise difficulty
learning-path adaptation
```

The system must remain:

> deterministic + explainable + reproducible

where deterministic behavior is appropriate.

Every recommendation should eventually be explainable:

```text
WHY THIS LESSON
WHY THIS EXERCISE
WHY NOW
WHAT PREREQUISITE IS MISSING
WHAT EVIDENCE CAUSED THE RECOMMENDATION
```

Do not build opaque AI recommendations as the foundation.

---

# 8. LEARNING-10 — PROJECT LEARNING

Design project-based learning around:

```text
Learn
→ Practice
→ Apply
→ Build
→ Explain
→ Defend
→ Review
→ Master
```

Projects should be isolated from production trading.

Possible project categories:

```text
market analysis
fundamental analysis
valuation
portfolio analysis
risk analysis
strategy design
backtesting
quant engineering
system debugging
```

A learner must not be able to modify real trading execution through a Learning project.

Use:

```text
sandbox
paper
educational
simulation
```

boundaries explicitly.

---

# 9. LEARNING-11 — CERTIFICATION

Design a real certification system.

Do NOT equate:

```text
course completed
```

with:

```text
mastered
```

Distinguish:

```text
COMPLETION
UNDERSTANDING
MASTERY
ASSESSMENT
PROJECT
CERTIFICATION
```

Certification should eventually support:

```text
domain certification
path certification
project certification
system certification
```

Define:

- requirements
- evidence
- scoring
- expiration/review
- versioning
- assessment integrity
- certificate identity
- audit trail

---

# 10. LEARNING-12 — KNOWLEDGE GRAPH

Design a first-class Knowledge Graph.

Minimum conceptual nodes:

```text
Domain
Topic
Concept
Lesson
Exercise
Assessment
Project
Skill
System Capability
Prerequisite
```

Required relationships:

```text
REQUIRES
PREREQUISITE_OF
TEACHES
PRACTICES
ASSESSES
APPLIES
RELATED_TO
```

The graph must support:

```text
prerequisite traversal
mastery dependency
learning recommendations
gap detection
learning-path generation
AI Tutor context
```

Do not build a decorative graph.

It must have actual product utility.

---

# 11. LEARNING-13 — AI TUTOR

Design AI Tutor around verified system context.

The Tutor context should eventually include:

```text
Knowledge Graph
Learning Context
User Mastery
Current Lesson
Exercise History
Project Progress
System Evidence
Relevant System Documentation
Provenance
```

Strictly distinguish:

```text
VERIFIED SYSTEM KNOWLEDGE
EDUCATIONAL EXPLANATION
USER PROGRESS
REAL FINANCIAL DATA
AI-GENERATED EXPLANATION
```

AI must never fabricate:

```text
prices
financial metrics
portfolio values
risk metrics
market facts
system capabilities
certification results
```

When evidence is unavailable:

```text
UNKNOWN
INSUFFICIENT_DATA
NOT_VERIFIED
```

must remain valid outcomes.

---

# 12. LEARNING-14 — INSTRUCTOR / ADMIN STUDIO

Design the future authoring platform.

Potential capabilities:

```text
create domain
create topic
create concept
create lesson
create exercise
create assessment
create project
define prerequisite
define mastery criteria
publish
version
archive
```

Content must be versioned.

Do not let an instructor edit published learning material in-place without version/audit semantics.

---

# 13. LEARNING-15 — CUSTOMER TRAINING / COMMUNITY FOUNDATION

Design for future:

```text
customer training
organization
cohort
instructor
learner
course
enrollment
progress
certification
community
```

Community architecture must consider:

```text
privacy
moderation
reporting
roles
content ownership
abuse prevention
```

Do not build a full social network unless roadmap evidence requires it.

---

# 14. DATABASE DECISION

Determine when Learning should move from:

```text
localStorage
```

to:

```text
backend
database
```

Use evidence.

The likely transition is required once Learning needs:

```text
multi-device progress
multi-user accounts
certification
projects
instructor content
customer training
community
```

But verify the actual architecture before deciding.

If persistence is required, define:

```text
entities
ownership
indexes
versioning
audit trail
migration strategy
```

Do not create migrations during discovery.

---

# 15. CONTENT MODEL

Evolve the content model toward:

```text
KnowledgeDomain
Topic
Concept
Lesson
Example
Exercise
Assessment
Project
Certification
Skill
Prerequisite
```

Every learning object should have:

```text
id
version
status
difficulty
prerequisites
learning objectives
content
evidence/provenance
```

Do not duplicate content unnecessarily.

---

# 16. PRACTICE ENGINE

Expand the existing exercise system to support:

```text
knowledge
calculation
interpretation
system navigation
decision
debugging
build
defend
```

Every exercise should have:

```text
prompt
expected reasoning
answer
scoring
feedback
explanation
mastery impact
difficulty
prerequisites
```

Do not make everything multiple-choice.

---

# 17. MASTERY ENGINE

Audit the existing:

```text
MasteryEngine
ExerciseScoringEngine
LearningRecommendationEngine
ProgressStore
```

Determine what must change.

Mastery must be evidence-based.

Do not award MASTERED solely because:

```text
lesson opened
lesson completed
button clicked
```

Require appropriate evidence.

---

# 18. LEARNING SAFETY

Learning must never bypass:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
MarketDataIntegrityGuard
FinancialConservation
```

Educational simulations must be clearly separated from real execution.

Every simulated example must remain clearly classified as:

```text
SIMULATED
EDUCATIONAL
TEST_FIXTURE
```

Do not present synthetic examples as real market evidence.

---

# 19. DISCOVERY OUTPUT

First create/update:

```text
docs/LEARNING_PLATFORM_POST_MVP_ARCHITECTURE_AUDIT.md
```

It must contain:

```text
Executive Summary
MVP Baseline
Current Architecture
Current Data Model
Current Persistence
Current Auth
Current APIs
Current Frontend
Current Learning Engines

LEARNING-09 Gap
LEARNING-10 Gap
LEARNING-11 Gap
LEARNING-12 Gap
LEARNING-13 Gap
LEARNING-14 Gap
LEARNING-15 Gap

Target Architecture
Data Model
API Model
Auth/Authz
Knowledge Graph
Adaptive Learning
Certification
Projects
AI Tutor
Instructor Studio
Customer Training

Security
Privacy
Provenance
Failure Modes
Testing
Performance
Migration Strategy

Implementation Dependencies
Acceptance Criteria
Deferred Scope

GO / NO-GO
```

---

# 20. IMPLEMENTATION DECISION

After the audit:

If architecture is clear:

```text
LEARNING-09 READY
```

Then implement LEARNING-09.

Do not implement LEARNING-10 before LEARNING-09 is tested and certified unless a dependency requires a different order.

---

# 21. AUTONOMOUS LOOP

After each phase:

```text
DISCOVERY
→ ARCHITECTURE
→ IMPLEMENTATION
→ TEST
→ EVIDENCE AUDIT
→ REMEDIATION
→ CERTIFICATION
→ NEXT PHASE
```

Continue autonomously.

Do not stop after writing the roadmap.

Do not ask for confirmation after every phase.

Stop only for a genuine blocker such as:

```text
security issue
ownership conflict
data unavailable
architecture contradiction
destructive migration risk
protected-system dependency
ambiguous financial semantics
```

---

# 22. TEST REQUIREMENTS

Every Learning phase must maintain:

```text
unit tests
determinism tests
persistence tests where applicable
authorization tests where applicable
isolation tests
regression tests
```

The existing regression baseline must remain green.

At minimum preserve:

```text
npx tsc --noEmit
npx vitest run
npm run build
```

Do not weaken existing tests.

---

# 23. CERTIFICATION STANDARD

A Learning phase is CERTIFIED only when:

```text
implementation exists
tests exist
tests pass
typecheck passes
build passes
acceptance criteria pass
evidence is documented
security boundary verified
no fabricated data
no protected-system bypass
```

Do not call an architectural proposal CERTIFIED.

Do not call a foundation READY and treat it as implemented.

---

# 24. GIT

Use focused commits.

Never:

```text
git add .
git add -A
```

Commit only Learning-owned files.

Do not commit:

```text
Phase 28
Phase 29
Phase 30
macro
strategy
portfolio
multi-asset
UI owned by another lane
```

If another lane has modified files in the working tree:

> leave them untouched.

---

# 25. FINAL STATUS FORMAT

After each completed phase report:

```text
LEARNING PHASE:
STATUS:

Objective:

Files changed:

Tests:
PASS / FAIL

Typecheck:
PASS / FAIL

Build:
PASS / FAIL

Acceptance:
PASS / FAIL

Security:
PASS / FAIL

Persistence:
N/A / PASS / FAIL

Certification:
CERTIFIED / BLOCKED

Commit:

Evidence:

Known limitations:

Next phase:
```

---

# 26. START NOW

Execute:

```text
POST-MVP DISCOVERY
→ ARCHITECTURE AUDIT
→ WRITE AUDIT
→ LEARNING-09 IMPLEMENTATION
→ TEST
→ EVIDENCE AUDIT
→ CERTIFICATION
→ LEARNING-10
→ ...
```

Continue through:

```text
LEARNING-15
```

where architecture and dependencies permit.

The goal is not merely to add screens.

The goal is:

> **Build a real Learning & Training Platform on top of VN-STOCK-AI-PRO's verified investment knowledge and deterministic analytical engines.**

Maintain strict separation between:

```text
LEARNING
INVESTMENT ANALYTICS
TRADING EXECUTION
REAL FINANCIAL DATA
SIMULATION
AI EXPLANATION
```

Never trade correctness for speed.

Never fabricate evidence.

Never silently bypass a safety boundary.

# END