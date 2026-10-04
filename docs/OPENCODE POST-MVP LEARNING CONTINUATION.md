# OPENCODE — LEARNING HUB POST-MVP CONTINUATION

The Learning Hub MVP has been completed and certified.

Current certified result:

```text
LEARNING-01 → LEARNING-08
LEARNING_PLATFORM_STATUS: CERTIFIED
CUSTOMER_TRAINING_FOUNDATION: READY
```

Evidence already reported:

```text
TypeScript: PASS
Vitest: 1590/1590 PASS
Build: PASS
Learning tests: 14/14 PASS
Acceptance criteria: PASS
```

The MVP is intentionally limited.

Do NOT claim that the following are complete:

```text
AI Tutor
Instructor Studio
Community
Customer Training
Advanced Certification
Knowledge Graph
Backend Learning Persistence
```

They are deferred according to the roadmap.

---

# 1. MISSION

Continue the Learning roadmap beyond the certified MVP.

Target:

```text
LEARNING-09
→ LEARNING-10
→ LEARNING-11
→ LEARNING-12
→ LEARNING-13
→ LEARNING-14
→ LEARNING-15
```

However:

**DO NOT IMPLEMENT IMMEDIATELY.**

First perform a complete POST-MVP DISCOVERY AND ARCHITECTURE RE-AUDIT.

---

# 2. PARALLEL DEVELOPMENT

CodeGPT is independently developing:

```text
PHASE-28 Portfolio Intelligence
→ PHASE-29 Full Multi-Asset Quant Platform Integration
```

OpenCode remains the Learning/Product lane.

You must continue working independently.

Never modify CodeGPT's worktree.

Never modify Phase 28/29 implementation merely because an integration opportunity exists.

Never cherry-pick CodeGPT work.

Never merge branches.

---

# 3. POST-MVP AUDIT

Inspect the actual implementation created by LEARNING-01 → LEARNING-08.

Verify:

```text
Learning domain model
Topic model
Concept model
Lesson model
Exercise model
Learning path
Practice Lab
ProgressStore
MasteryEngine
RecommendationEngine
systemLinks
LearningService
learningSchema
frontend routing
navigation
system links
test architecture
```

Determine:

```text
what is production-ready
what is MVP-only
what is client-only
what requires backend persistence
what requires authentication
what requires authorization
what requires database schema
what requires new API contracts
what requires external AI
what can remain deterministic
```

---

# 4. NEXT-PHASE ARCHITECTURE

Before implementation, create or update:

```text
docs/LEARNING_PLATFORM_POST_MVP_ARCHITECTURE_AUDIT.md
```

The document must explicitly define the architecture for:

```text
LEARNING-09 Adaptive Learning
LEARNING-10 Project Learning
LEARNING-11 Certification
LEARNING-12 Knowledge Graph
LEARNING-13 AI Tutor
LEARNING-14 Instructor/Admin Studio
LEARNING-15 Customer Training / Community Foundation
```

For every phase identify:

```text
Objective
Current capability
Missing capability
Data model
API requirements
Frontend requirements
Persistence requirements
Authentication requirements
Authorization requirements
Dependencies
Acceptance criteria
Testing strategy
Security concerns
Privacy concerns
Failure modes
```

---

# 5. CRITICAL ARCHITECTURE DECISION

Determine whether the Learning Hub should remain:

```text
client-only
```

or transition to:

```text
client + backend + database
```

for each phase.

Do not migrate to backend merely because it looks more professional.

Use evidence.

Persistence should be introduced when required by:

```text
multi-device progress
user identity
certification
instructor management
customer training
analytics
community
AI tutor memory
```

---

# 6. AUTHENTICATION

Inspect the existing Firebase authentication architecture.

Determine:

```text
what identity information is currently available
which routes are authenticated
whether Learning needs authenticated persistence
what authorization model is required
```

Do not broaden authentication unnecessarily.

Do not expose Learning data across users.

---

# 7. MULTI-USER DATA ISOLATION

If Learning persistence is introduced, establish strict ownership:

```text
user
  ↓
learning profile
  ↓
progress
  ↓
attempts
  ↓
mastery
  ↓
certifications
```

A user must never be able to read or modify another user's private Learning state.

Add tests for this.

---

# 8. AI TUTOR

LEARNING-13 must NOT simply become:

```text
send everything to an LLM
```

Design the AI Tutor around:

```text
Knowledge Graph
+
Learning Context
+
User Mastery
+
Current Lesson
+
Exercise History
+
System Evidence
+
Explicit Data Provenance
```

The tutor must distinguish:

```text
verified system knowledge
educational explanation
user-specific progress
financial data
AI-generated explanation
```

Never allow AI-generated financial claims to silently become authoritative system data.

---

# 9. KNOWLEDGE GRAPH

LEARNING-12 should define relationships such as:

```text
Domain
→ Topic
→ Concept
→ Lesson
→ Exercise
→ Skill
→ Prerequisite
→ Related Concept
→ System Capability
```

The graph must support:

```text
prerequisite traversal
mastery dependency
recommendation
learning path generation
explanation
```

Prefer deterministic graph traversal where possible.

---

# 10. ADAPTIVE LEARNING

LEARNING-09 should remain deterministic where practical.

Inputs may include:

```text
mastery
exercise results
attempt history
prerequisites
review age
difficulty
weak concepts
```

The recommendation engine must remain:

```text
explainable
deterministic
testable
reproducible
```

Do not introduce random recommendations.

---

# 11. CERTIFICATION

LEARNING-11 must distinguish:

```text
course completion
skill mastery
assessment pass
project completion
system certification
```

Do not equate:

```text
100% page completion
```

with:

```text
mastery
```

Certificates must have auditable evidence.

---

# 12. PROJECT LEARNING

LEARNING-10 should connect learning to actual system capabilities.

Potential model:

```text
Learn
→ Task
→ Build
→ Test
→ Explain
→ Defend
→ Review
```

Projects must not modify production trading execution merely as part of an educational exercise.

Prefer:

```text
sandbox
paper environment
isolated project environment
```

where appropriate.

---

# 13. INSTRUCTOR / CUSTOMER TRAINING

LEARNING-14 and LEARNING-15 require explicit multi-user architecture.

Audit:

```text
Instructor
Organization
Course
Cohort
Enrollment
Assignment
Assessment
Progress
Certification
Permissions
```

Do not implement a full SaaS platform unless the roadmap and architecture justify it.

---

# 14. COMMUNITY

Community must be treated as a separate product capability.

Do not automatically introduce:

```text
chat
comments
followers
social feed
```

without moderation, permissions, privacy, and abuse considerations.

Define the architecture first.

---

# 15. FINANCIAL SAFETY

The Learning system must never bypass:

```text
RiskGuard
TradingEngine
MarketDataIntegrityGuard
FinancialConservation
TradingDataValidator
```

Learning may explain system behavior.

Learning must not silently modify trading behavior.

---

# 16. SIMULATED DATA

Current Practice Lab uses clearly labelled simulated examples.

Preserve that safety boundary.

Never allow:

```text
SIMULATED
```

data to enter production financial calculations.

If real system data is introduced later:

```text
identify source
identify timestamp
identify freshness
identify provenance
identify user authorization
```

---

# 17. IMPLEMENTATION GATE

After the post-MVP audit:

If architecture is sound:

```text
IMPLEMENT LEARNING-09
```

Then continue:

```text
Test
→ Evidence Audit
→ Certification
→ LEARNING-10
```

Do not implement all remaining phases in one uncontrolled batch.

---

# 18. AUTONOMOUS CONTINUATION

After each phase is certified:

```text
do not ask for another prompt
```

Proceed to the next eligible Learning phase.

Stop only for:

```text
architecture contradiction
security/privacy risk
ownership conflict
migration collision
missing mandatory dependency
irreversible product decision
financial-integrity risk
```

---

# 19. FINAL REPORT

After the post-MVP audit report:

```text
POST_MVP_AUDIT_STATUS:
CURRENT_CERTIFIED_BASELINE:
NEXT_PHASE:
ARCHITECTURE_STATUS:
BACKEND_REQUIRED:
DATABASE_REQUIRED:
AUTH_REQUIRED:
AI_REQUIRED:
KNOWN_BLOCKERS:
RECOMMENDED_EXECUTION_ORDER:
```

Then continue autonomously if no blocker exists.

---

# 20. FINAL RULE

The MVP is already certified.

Do not rewrite it unnecessarily.

Treat:

```text
LEARNING-01 → LEARNING-08
```

as a stable foundation.

Build forward.

Do not destabilize the certified MVP merely to improve architecture aesthetics.

Proceed with evidence-driven post-MVP development.