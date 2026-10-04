# OPENCODE — LEARNING FOUNDATION AUDIT

## MISSION

You are the **OpenCode Learning/Product Agent** for:

```text
VN-STOCK-AI-PRO
```

Your immediate mission is:

> **Perform a complete LEARNING FOUNDATION AUDIT before implementing any new Learning phase.**

This is an:

```text
DISCOVERY
+
ARCHITECTURE AUDIT
+
GAP ANALYSIS
+
READINESS ASSESSMENT
```

task.

It is **NOT an implementation task**.

Do not start LEARNING-09 automatically.

Do not assume LEARNING-09 is the next implementation.

First determine whether the current Learning foundation is architecturally ready for the next generation of the platform.

---

# 1. CURRENT BASELINE

The current Learning MVP has previously been reported as:

```text
LEARNING-01 → LEARNING-08
STATUS: CERTIFIED
```

Existing Learning capabilities include, subject to actual repository verification:

```text
Learning catalog
Lessons
Exercises
ExerciseScoringEngine
MasteryEngine
LearningRecommendationEngine
ProgressStore
System links
Learning Service
Learning schemas
Learning dashboard
Learning path
Lesson UI
Practice Lab
Learning sidebar
```

However:

> Do NOT trust this list blindly.

Verify every item against the actual repository.

The audit must establish the real current state.

---

# 2. PRIMARY OBJECTIVE

Answer this question:

> **Is the current Learning MVP a sufficient foundation for a real multi-user Learning Platform, or is additional foundation work required before LEARNING-09?**

The target architecture is:

```text
CONTENT
    ↓
LEARNING PATH
    ↓
LESSON
    ↓
PRACTICE
    ↓
ASSESSMENT
    ↓
MASTERY
    ↓
PROJECT
    ↓
CERTIFICATION
    ↓
CONTINUOUS LEARNING
```

Eventually:

```text
USER
 ↓
LEARNING PROFILE
 ↓
PROGRESS
 ↓
MASTERY
 ↓
RECOMMENDATION
 ↓
PROJECTS
 ↓
CERTIFICATION
```

The audit must determine which parts already exist and which parts are missing.

---

# 3. ABSOLUTE RULE — READ ONLY

During this task:

### DO NOT:

- implement LEARNING-09;
- implement Adaptive Learning;
- implement AI Tutor;
- implement Knowledge Graph;
- implement Certification;
- implement Instructor Studio;
- implement Community;
- redesign Learning UI;
- create production migrations;
- modify Core Quant;
- modify Phase 28;
- modify Phase 29;
- modify Phase 27;
- modify protected financial systems.

You may create/update **only the audit documentation explicitly listed in this prompt**.

---

# 4. READ GOVERNANCE FIRST

Read:

```text
docs/AGENT_PARALLEL_EXECUTION.md
docs/prompts/LEARNING_PLATFORM_AUTONOMOUS_ROADMAP.md
```

If these files differ from the actual repository state:

> repository evidence wins.

Then inspect:

```text
git status --short
git branch --show-current
git worktree list
```

Do not clean or reset the worktree.

---

# 5. WORKTREE / OWNERSHIP

You are the:

```text
LEARNING / PRODUCT AGENT
```

Operate only in your assigned Learning worktree.

Classify every relevant file as:

```text
LEARNING-OWNED
SHARED
PROTECTED
FOREIGN
```

Learning-owned areas generally include:

```text
src/lib/learning/**
src/services/learning/**
src/schemas/learningSchema.ts
tests/learning/**
docs/learning/**
```

But verify actual ownership.

Do not modify:

```text
RiskGuard
TradingEngine
RiskManager
PositionSizer
MarketData providers
FinancialConservation
Phase 27
Phase 28
Phase 29
```

---

# 6. AUDIT THE ACTUAL MVP

Inspect every existing Learning component.

At minimum:

```text
src/lib/learning/**
src/services/learning/**
src/schemas/learningSchema.ts
tests related to Learning
Learning frontend components/pages
Learning routes
Learning state management
Learning persistence
```

For every component record:

```text
FILE
PURPOSE
DEPENDENCIES
INPUT
OUTPUT
PERSISTENCE
USER OWNERSHIP
TEST COVERAGE
STATUS
```

Classify:

```text
CERTIFIED
IMPLEMENTED
PARTIAL
PLACEHOLDER
DEAD CODE
DUPLICATED
MISSING
```

Do not infer implementation from filenames alone.

---

# 7. CONTENT MODEL AUDIT

Determine how learning content is represented.

Audit:

```text
Domain
Topic
Concept
Lesson
Example
Exercise
Assessment
Project
Skill
Prerequisite
Learning Path
```

For each determine:

```text
exists?
versioned?
identifiable?
ordered?
prerequisite-aware?
difficulty-aware?
mastery-aware?
persisted?
testable?
```

Determine whether the current model can evolve without a major rewrite.

---

# 8. CONTENT VERSIONING

A real Learning Platform needs content versioning.

Determine whether the current system supports:

```text
draft
published
archived
version
effective date
content revision
backward compatibility
```

Answer:

> What happens to a learner's progress if Lesson v1 is replaced by Lesson v2?

Do NOT implement the solution.

Document the required architecture.

---

# 9. USER MODEL AUDIT

Determine whether Learning currently has a real user model.

Inspect authentication and user identity.

Distinguish:

```text
Authentication
Authorization
User identity
Learning profile
Ownership
Roles
Permissions
```

Determine whether Learning currently supports:

```text
User A
    ↓
Profile A
    ↓
Progress A
    ↓
Mastery A
```

without allowing User B to access it.

If it currently uses:

```text
localStorage
```

document exactly what this means for:

```text
multi-device
multi-browser
account recovery
data ownership
security
certification
```

---

# 10. PROGRESS PERSISTENCE AUDIT

Audit:

```text
ProgressStore
```

Determine:

```text
where progress is stored
what is stored
how it is keyed
whether it survives reload
whether it survives device change
whether it is user-specific
whether it is version-aware
whether it is auditable
```

Classify:

```text
LOCAL ONLY
BACKEND
DATABASE
HYBRID
```

Determine the minimum architecture needed for production Learning.

Do not create migrations.

---

# 11. MASTERY ENGINE AUDIT

Inspect:

```text
MasteryEngine
ExerciseScoringEngine
LearningRecommendationEngine
```

Determine whether mastery is based on meaningful evidence.

Audit:

```text
attempt
score
difficulty
recency
repetition
prerequisite
topic
concept
exercise type
failure
success
```

Ensure the architecture does not incorrectly treat:

```text
lesson opened
lesson viewed
button clicked
```

as mastery evidence.

Determine:

```text
deterministic?
reproducible?
explainable?
persistable?
version-aware?
```

---

# 12. RECOMMENDATION AUDIT

Inspect the current recommendation engine.

Determine whether it can answer:

```text
WHY THIS LESSON?
WHY THIS EXERCISE?
WHY NOW?
WHAT IS THE LEARNER WEAK AT?
WHAT PREREQUISITE IS MISSING?
WHAT SHOULD BE REVIEWED?
```

Determine whether recommendations are:

```text
deterministic
explainable
mastery-aware
prerequisite-aware
difficulty-aware
```

Do not implement adaptive learning.

Only identify the gap.

---

# 13. PRACTICE SYSTEM AUDIT

Audit the current exercise/practice system.

Classify exercises:

```text
knowledge
calculation
interpretation
decision
debugging
system navigation
build
explain
defend
```

Determine whether the current architecture supports more than multiple-choice exercises.

Inspect:

```text
question
answer
solution
scoring
feedback
attempt
retry
difficulty
mastery impact
```

Determine what is required for a serious Practice Lab.

---

# 14. LEARNING PATH AUDIT

Determine whether Learning Paths are:

```text
static
dynamic
prerequisite-aware
mastery-aware
versioned
personalized
```

Determine whether the system can represent:

```text
Java
 ↓
Spring
 ↓
Database
```

or:

```text
Investment Basics
 ↓
Fundamental Analysis
 ↓
Valuation
 ↓
Portfolio
 ↓
Risk
```

without hardcoding relationships everywhere.

---

# 15. KNOWLEDGE GRAPH READINESS

Do NOT build the Knowledge Graph.

Instead determine whether the current content model can evolve toward:

```text
Domain
Topic
Concept
Lesson
Exercise
Assessment
Project
Skill
Prerequisite
```

with relationships:

```text
REQUIRES
TEACHES
PRACTICES
ASSESSES
APPLIES
RELATED_TO
```

Determine:

```text
what already exists
what can be reused
what would require redesign
```

---

# 16. PROJECT LEARNING READINESS

Do NOT implement projects.

Determine whether the current architecture can support:

```text
Project
Project Step
Submission
Evaluation
Evidence
Review
Mastery Impact
```

Projects must remain isolated from:

```text
real trading
real execution
real portfolio mutation
```

Determine the required sandbox boundary.

---

# 17. ASSESSMENT / CERTIFICATION READINESS

Do NOT implement certification.

Determine whether the current architecture can distinguish:

```text
Lesson Completion
Practice Completion
Understanding
Mastery
Assessment
Project
Certification
```

A certification must eventually have:

```text
identity
version
criteria
evidence
score
issuer
date
audit trail
```

Document the gap.

---

# 18. AI TUTOR READINESS

Do NOT implement AI Tutor.

Determine whether the current Learning architecture can eventually provide an AI Tutor with:

```text
current lesson
learning path
user mastery
exercise history
knowledge graph
system documentation
verified evidence
provenance
```

AI must never become the financial source of truth.

Required boundary:

```text
VERIFIED SYSTEM KNOWLEDGE
        ↓
LEARNING CONTEXT
        ↓
AI EXPLANATION
```

Document missing interfaces.

---

# 19. SYSTEM KNOWLEDGE INTEGRATION

This is especially important for VN-STOCK-AI-PRO.

Determine how Learning currently links to real system capabilities.

For example:

```text
Valuation lesson
      ↓
Valuation engine
      ↓
Real evidence
```

or:

```text
Portfolio lesson
      ↓
Portfolio Intelligence
      ↓
Educational explanation
```

Audit existing:

```text
systemLinks
engine references
documentation references
domain references
```

Ensure Learning does not duplicate financial logic.

Learning should teach/use verified system capabilities.

It must not become a second financial engine.

---

# 20. REAL DATA VS EDUCATIONAL DATA

Audit every Learning data path.

Classify data as:

```text
REAL MARKET DATA
REAL SYSTEM OUTPUT
EDUCATIONAL EXAMPLE
SYNTHETIC TEST FIXTURE
MOCK
```

Determine whether the classification is explicit.

Critical requirement:

> Educational examples must never silently enter production financial calculations.

No fabricated numbers.

No silent mocks.

---

# 21. API / SERVICE BOUNDARY

Audit:

```text
LearningService
schemas
routes
controllers
API contracts
```

Determine whether the current service layer is:

```text
pure orchestration
business logic
persistence logic
frontend adapter
```

Identify architectural violations.

Target:

```text
src/lib/learning/
    deterministic engines

src/services/learning/
    orchestration

src/lib/db/
    repositories

API
    transport

UI
    presentation
```

---

# 22. DATABASE READINESS

Inspect:

```text
Drizzle schema
migrations
repositories
existing user tables
existing authentication tables
```

Determine what Learning entities eventually require persistence.

Candidate entities:

```text
LearningContent
LearningContentVersion
LearningPath
LearningEnrollment
LearningProgress
ExerciseAttempt
MasteryState
Assessment
AssessmentAttempt
Project
ProjectSubmission
Certification
CertificationEvidence
LearningProfile
```

Do NOT create these tables.

Only determine which are necessary.

---

# 23. SECURITY AUDIT

Determine risks involving:

```text
user progress
assessment results
certification
projects
private notes
AI context
learning history
```

Audit:

```text
IDOR
cross-user access
client-side trust
tampering
localStorage manipulation
role escalation
content modification
assessment cheating
```

Do not fix them now.

Document them.

---

# 24. PERFORMANCE / SCALE

Assess the architecture for:

```text
1 learner
100 learners
10,000 learners
100,000 learners
```

Consider:

```text
progress reads
mastery calculations
recommendations
exercise attempts
content retrieval
AI context
analytics
```

Determine where caching or precomputation may eventually be needed.

Do not implement infrastructure.

---

# 25. TESTING AUDIT

Audit existing Learning tests.

Determine coverage for:

```text
content
scoring
mastery
recommendations
progress
persistence
determinism
versioning
authorization
user isolation
failure states
```

Classify:

```text
CERTIFIED
COVERED
PARTIAL
MISSING
```

Define what tests are mandatory before the next phase.

---

# 26. FAILURE / FAIL-CLOSED AUDIT

Learning must not silently produce incorrect state.

Determine behavior for:

```text
missing content
invalid exercise
missing mastery data
invalid user
missing prerequisite
corrupt progress
unknown score
unavailable system data
AI unavailable
database unavailable
```

Expected behavior must be explicit.

No silent fallback.

---

# 27. PRODUCT MATURITY AUDIT

Separate Learning into:

## CORE

Required for a serious Learning Platform:

```text
content
paths
practice
progress
mastery
recommendation
projects
assessment
knowledge relationships
```

## ADVANCED

```text
AI Tutor
Instructor Studio
advanced analytics
personalization
```

## BUSINESS

```text
customer training
organization
community
marketplace
paid courses
B2B
```

Do not allow business features to drive premature architecture.

---

# 28. DETERMINE THE NEXT PHASE

After the audit, determine which of these is actually correct:

```text
OPTION A
Foundation is sufficient
→ LEARNING-09 Adaptive Learning

OPTION B
Foundation has gaps
→ Foundation Remediation
→ then LEARNING-09

OPTION C
Persistence / multi-user architecture is missing
→ Learning Platform Foundation
→ then LEARNING-09

OPTION D
Multiple architecture problems exist
→ create a prioritized Learning Foundation sequence
→ then continue
```

Do NOT choose A automatically.

Choose based on repository evidence.

---

# 29. PRIORITIZATION

Every identified gap must be classified:

```text
P0 BLOCKER
P1 REQUIRED
P2 IMPORTANT
P3 OPTIONAL
P4 FUTURE BUSINESS
```

P0/P1 must be addressed before dependent Learning phases.

---

# 30. REQUIRED DOCUMENT

Create exactly:

```text
docs/LEARNING_FOUNDATION_AUDIT.md
```

The document must contain:

```text
# LEARNING FOUNDATION AUDIT

## Executive Summary

## Repository Baseline

## Current MVP Certification Evidence

## Current Learning Architecture

## Content Model Audit

## Content Versioning

## User / Authentication Audit

## Authorization / Ownership

## Progress Persistence

## Mastery Engine

## Recommendation Engine

## Practice System

## Learning Paths

## Knowledge Graph Readiness

## Project Learning Readiness

## Assessment Readiness

## Certification Readiness

## AI Tutor Readiness

## System Knowledge Integration

## Real vs Educational Data

## API / Service Boundary

## Database Readiness

## Security

## Performance

## Testing

## Failure Semantics

## Product Maturity

## Gap Matrix

## P0 Blockers

## P1 Required

## P2 Important

## P3 Optional

## Recommended Next Phase

## Dependencies

## Acceptance Criteria

## GO / NO-GO
```

---

# 31. OPTIONAL ARCHITECTURE DOCUMENT

If the audit identifies substantial architectural changes required before LEARNING-09, also create:

```text
docs/LEARNING_FOUNDATION_ARCHITECTURE.md
```

Only create it if genuinely needed.

Do not create documents just to increase phase count.

---

# 32. GIT SAFETY

This task must NOT disturb unrelated work.

Never use:

```text
git reset --hard
git clean
git restore .
git checkout -- .
git stash
git add .
git add -A
```

Do not stage unrelated files.

Do not commit:

```text
Phase 27
Phase 28
Phase 29
Phase 30
Learning implementation
UI unrelated to Learning
Core financial systems
```

Only the explicitly created Learning audit documents may be considered for commit.

---

# 33. VERIFICATION

Because this is an audit:

Do not claim:

```text
PASS
```

unless evidence exists.

Where evidence is missing write:

```text
UNKNOWN
```

Where implementation is partial:

```text
PARTIAL
```

Where architecture is unsafe:

```text
BLOCKED
```

Do not hide uncertainty.

---

# 34. FINAL REPORT

Return exactly:

```text
LEARNING FOUNDATION AUDIT
=========================

STATUS:

Current MVP:
LEARNING-01 → 08

Foundation:
READY / PARTIAL / BLOCKED

P0:
...

P1:
...

P2:
...

P3:
...

Current persistence:
...

Multi-user readiness:
...

Mastery readiness:
...

Knowledge Graph readiness:
...

Project readiness:
...

Assessment readiness:
...

Certification readiness:
...

AI Tutor readiness:
...

System integration readiness:
...

Recommended next phase:
...

Why:

Dependencies:

GO / NO-GO:

Documents:
- docs/LEARNING_FOUNDATION_AUDIT.md
- docs/LEARNING_FOUNDATION_ARCHITECTURE.md (if created)

IMPLEMENTATION:
NOT STARTED
```

---

# 35. STOP

After completing the audit and documentation:

**STOP.**

Do not implement the next Learning phase.

Do not create migrations.

Do not modify production code.

Do not redesign the UI.

Wait for the next authorization.

# END