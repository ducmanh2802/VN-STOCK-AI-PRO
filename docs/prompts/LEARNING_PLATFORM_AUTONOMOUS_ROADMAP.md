# VN-STOCK-AI-PRO
# AUTONOMOUS LEARNING & TRAINING HUB
## Knowledge → Learning → Practice → Assessment → Certification → Community → Customer Training

Repository:

`VN-STOCK-AI-PRO`

---

# 0. MISSION

Build a first-class **Learning & Training Platform** inside VN-STOCK-AI-PRO.

The purpose is NOT merely to add a "Help" page.

The objective is to create a scalable learning system that allows:

1. The owner/developer to learn every important concept represented by VN-STOCK-AI-PRO.
2. A learner to progress from beginner → intermediate → advanced → expert.
3. The system to automatically generate/sequence learning paths from the capabilities actually implemented in the platform.
4. Learners to practice through exercises and realistic system tasks.
5. Learners to receive immediate feedback.
6. Learners to track progress and mastery.
7. The system to eventually support certifications.
8. The architecture to later support a community.
9. The architecture to later support customer onboarding and professional training.
10. The same knowledge base to power documentation, education, onboarding and customer training.

The final vision is:

```text
VN-STOCK-AI-PRO
        │
        ├── Trading / Intelligence Platform
        │
        └── Learning & Training Platform
                │
                ├── Knowledge Base
                ├── Learning Paths
                ├── Courses
                ├── Lessons
                ├── Practice Labs
                ├── Exercises
                ├── Quizzes
                ├── Projects
                ├── Assessments
                ├── Progress & Mastery
                ├── Certifications
                ├── Community
                └── Customer Training
```

---

# 1. CORE PRINCIPLE

The Learning Hub must teach the knowledge that actually exists inside the system.

Do NOT build a generic financial education website disconnected from VN-STOCK-AI-PRO.

Every important system capability should eventually have:

```text
CONCEPT
  ↓
WHY IT MATTERS
  ↓
HOW IT WORKS
  ↓
HOW VN-STOCK-AI-PRO IMPLEMENTS IT
  ↓
HOW TO USE IT
  ↓
PRACTICE
  ↓
ASSESSMENT
  ↓
REAL-WORLD APPLICATION
```

Example:

```text
Covariance
    ↓
Correlation
    ↓
Portfolio diversification
    ↓
Covariance Engine
    ↓
Portfolio Intelligence
    ↓
Practice Portfolio
    ↓
Interpretation Exercise
    ↓
Allocation Exercise
    ↓
Advanced Portfolio Project
```

Another example:

```text
Earnings
    ↓
Revenue / EPS / Margin
    ↓
TTM
    ↓
Restatement
    ↓
Data lineage
    ↓
Earnings Intelligence
    ↓
Analyze a company
    ↓
Detect bad/incomplete data
    ↓
Explain the conclusion
```

---

# 2. IMPORTANT SAFETY BOUNDARY

This is a financial education and product-training system.

It must NOT turn educational content into personalized financial advice.

Educational exercises may use:

- historical data;
- simulated portfolios;
- clearly labelled paper trading;
- hypothetical scenarios;
- real market data where appropriate.

Never present an exercise scenario as a guaranteed investment outcome.

Never fabricate real-world financial information.

Never use synthetic data while presenting it as real market data.

When using simulated data:

explicitly label it:

`SIMULATED`

When using historical data:

explicitly label:

`HISTORICAL`

When using current real data:

show:

- source;
- timestamp/as-of date;
- freshness;
- data status.

---

# 3. FIRST TASK — COMPLETE SYSTEM DISCOVERY

Before implementing anything, inspect the entire repository.

Discover:

- existing modules;
- architecture;
- database;
- APIs;
- frontend;
- authentication;
- user model;
- current documentation;
- `.clinerules`;
- existing educational/help content;
- all certified phases;
- current roadmap;
- system capabilities;
- financial engines;
- portfolio intelligence;
- strategy engine;
- macro intelligence;
- earnings intelligence;
- derivatives;
- ETFs;
- corporate actions;
- risk engine;
- paper trading;
- market data;
- APIs;
- existing tests.

Build an internal capability inventory.

The Learning Hub must be derived from this inventory.

Do NOT assume capabilities that do not exist.

---

# 4. KNOWLEDGE ARCHITECTURE

Create a formal knowledge model.

At minimum support:

```text
KnowledgeDomain
    ↓
Topic
    ↓
Concept
    ↓
Lesson
    ↓
Example
    ↓
Exercise
    ↓
Assessment
    ↓
Project
```

A concept should be reusable across multiple courses.

For example:

`TTM`

may appear in:

- Fundamental Analysis;
- Earnings Intelligence;
- Financial Statement Analysis;
- Valuation;
- Portfolio Analysis.

Do NOT duplicate the underlying knowledge object.

---

# 5. KNOWLEDGE DOMAINS

Build a knowledge taxonomy based on the actual VN-STOCK-AI-PRO system.

The initial taxonomy should include, where supported:

## LEVEL 0 — SYSTEM ORIENTATION

- What is VN-STOCK-AI-PRO?
- How the system works
- Market data
- Watchlist
- Market overview
- Stock analysis
- Portfolio
- Risk
- Strategies
- Paper trading
- AI intelligence
- Data freshness
- Confidence
- Provenance

---

# 6. LEVEL 1 — FINANCIAL MARKET FOUNDATIONS

Teach beginners:

- stocks;
- shares;
- market capitalization;
- price;
- volume;
- liquidity;
- bid/ask;
- market orders;
- limit orders;
- trading sessions;
- HOSE;
- HNX;
- UPCOM;
- VN-Index;
- VN30;
- sectors;
- ETFs;
- derivatives;
- corporate actions.

Each topic should include:

```text
Definition
Why it matters
Simple example
VN-STOCK-AI-PRO usage
Common mistakes
Mini exercise
```

---

# 7. LEVEL 2 — FUNDAMENTAL ANALYSIS

Teach:

- revenue;
- gross profit;
- operating profit;
- EBITDA where applicable;
- net income;
- EPS;
- margins;
- balance sheet;
- cash flow;
- debt;
- assets;
- liabilities;
- equity;
- ROE;
- ROA;
- growth;
- TTM;
- YoY;
- QoQ;
- financial quality;
- earnings quality;
- restatements;
- financial statement relationships.

Connect these directly to:

`Phase 24 — Earnings & Event Intelligence`

---

# 8. LEVEL 3 — VALUATION

Where supported by the system, teach:

- P/E;
- P/B;
- EV/EBITDA;
- DCF;
- FCF;
- earnings-based valuation;
- book-value valuation;
- fair value;
- margin of safety;
- valuation ranges;
- assumptions;
- sensitivity analysis.

Every valuation lesson must clearly separate:

```text
FACT
ASSUMPTION
ESTIMATE
MODEL OUTPUT
```

Never teach a model output as an objective fact.

---

# 9. LEVEL 4 — TECHNICAL / MARKET INTELLIGENCE

Where supported:

- price trends;
- volume;
- momentum;
- support/resistance;
- volatility;
- relative strength;
- market breadth;
- sector strength;
- market regime;
- liquidity;
- correlation.

Connect to:

- Market Intelligence;
- Macro Regime;
- Portfolio Intelligence.

---

# 10. LEVEL 5 — RISK MANAGEMENT

This must be a major learning track.

Teach:

- position sizing;
- diversification;
- concentration;
- volatility;
- drawdown;
- VaR;
- stress testing;
- stop loss;
- risk/reward;
- portfolio exposure;
- sector exposure;
- liquidity risk;
- data risk;
- model risk;
- lookahead bias;
- survivorship bias;
- stale data;
- invalid data;
- fail-closed systems.

Directly connect lessons to:

- RiskGuard;
- RiskManager;
- PositionSizer;
- PortfolioRiskMetrics;
- MarketDataIntegrityGuard;
- TradingDataValidator;
- FinancialConservation.

---

# 11. LEVEL 6 — PORTFOLIO INTELLIGENCE

When Phase 28 exists, teach:

- correlation;
- covariance;
- covariance matrix;
- portfolio variance;
- portfolio volatility;
- diversification;
- factor exposure;
- portfolio beta;
- concentration;
- allocation;
- optimization;
- constraints;
- transaction costs;
- liquidity;
- sector limits;
- top-3 concentration;
- FOL;
- lot size;
- T+2.5.

Exercises should allow learners to construct a hypothetical portfolio and understand WHY the system produces a particular risk/allocation result.

---

# 12. LEVEL 7 — STRATEGY ENGINEERING

Teach:

- strategy concepts;
- signal;
- entry;
- exit;
- position sizing;
- backtesting;
- transaction costs;
- slippage;
- benchmark;
- alpha;
- beta;
- drawdown;
- Sharpe;
- Sortino;
- win rate;
- expectancy;
- regime adaptation;
- strategy validation;
- overfitting;
- lookahead bias.

Connect to:

`Phase 25 — Strategy Factory`

---

# 13. LEVEL 8 — MACRO & ECONOMIC CYCLES

Teach:

- inflation;
- interest rates;
- monetary policy;
- fiscal policy;
- GDP;
- liquidity;
- DXY;
- gold;
- oil;
- credit;
- economic cycles;
- market regimes;
- risk-on/risk-off;
- policy transmission.

Connect to:

`Phase 27 — Macro Regime & Economic Cycle Intelligence`

---

# 14. LEVEL 9 — ADVANCED QUANTITATIVE FINANCE

Where the system supports it:

- probability;
- statistics;
- distributions;
- expected return;
- variance;
- covariance;
- correlation;
- regression;
- beta;
- factor models;
- portfolio optimization;
- risk models;
- scenario analysis;
- Monte Carlo where legitimately implemented;
- time series;
- stationarity;
- estimation error;
- model uncertainty.

Do not add mathematical topics merely for academic completeness.

Prioritize concepts actually used by the platform.

---

# 15. LEVEL 10 — SYSTEM / QUANT ENGINEERING

For advanced learners and internal training:

Teach how VN-STOCK-AI-PRO itself works.

Topics may include:

- data providers;
- provider fallback;
- freshness lifecycle;
- fail-closed architecture;
- repositories;
- services;
- pure engines;
- dependency injection;
- caching;
- provenance;
- as-of semantics;
- lookahead guards;
- financial conservation;
- risk controls;
- strategy orchestration;
- portfolio orchestration;
- schema/migration design;
- testing;
- certification.

This creates a unique internal training capability:

> Learn both finance AND how the financial intelligence system is engineered.

---

# 16. LEARNING PATHS

Create structured learning paths.

Initial paths:

## PATH A — Complete Beginner

```text
Market Basics
→ Stocks
→ Price/Volume
→ Indexes
→ Sectors
→ Financial Statements
→ Risk
→ Using VN-STOCK-AI-PRO
```

## PATH B — Fundamental Investor

```text
Financial Statements
→ Earnings
→ Growth
→ Margins
→ Cash Flow
→ Valuation
→ Margin of Safety
→ Risk
→ Portfolio
```

## PATH C — Quant Investor

```text
Statistics
→ Returns
→ Volatility
→ Correlation
→ Covariance
→ Factors
→ Portfolio Risk
→ Optimization
→ Backtesting
```

## PATH D — System Power User

```text
Market Intelligence
→ Earnings Intelligence
→ Macro Regime
→ Strategy Factory
→ Portfolio Intelligence
→ Risk
→ Paper Trading
→ Advanced Workflows
```

## PATH E — Quant Engineer

```text
Architecture
→ Data Providers
→ Data Integrity
→ Financial Engines
→ Strategy Engines
→ Portfolio Engines
→ Risk Architecture
→ Testing
→ Certification
```

## PATH F — Customer Training

Future path:

```text
Getting Started
→ Dashboard
→ Watchlist
→ Stock Analysis
→ Fundamental Analysis
→ Risk
→ Portfolio
→ Strategy
→ Paper Trading
→ Advanced Features
```

---

# 17. ADAPTIVE LEARNING

The system should eventually understand:

```text
What does the learner know?
What does the learner not know?
What should they learn next?
```

Track:

- lesson completion;
- quiz scores;
- exercise performance;
- attempts;
- mistakes;
- mastery;
- confidence;
- review schedule.

Build a mastery model.

Possible state:

```text
NOT_STARTED
LEARNING
PRACTICING
UNDERSTANDING
MASTERED
REVIEW_REQUIRED
```

Do NOT falsely claim mastery merely because a lesson was opened.

---

# 18. AUTOMATIC LEARNING ENGINE

Create an engine that can recommend:

```text
NEXT LESSON
NEXT EXERCISE
REVIEW
CHALLENGE
PROJECT
```

Recommendation should consider:

- prerequisites;
- previous scores;
- failed exercises;
- mastery;
- difficulty;
- learning path;
- recent activity.

Avoid random lesson selection.

The learning engine must be deterministic for the same learner state.

---

# 19. PRACTICE ENGINE

This is a core feature.

Every major concept should eventually have exercises.

Exercise types:

### TYPE 1 — KNOWLEDGE

Multiple choice.

### TYPE 2 — CALCULATION

Calculate:

- return;
- P/E;
- margin;
- growth;
- volatility;
- correlation;
- covariance;
- position size.

### TYPE 3 — INTERPRETATION

Show a real or historical dataset.

Ask:

> What does this tell you?

### TYPE 4 — SYSTEM NAVIGATION

Ask the learner to find a specific signal/data point in VN-STOCK-AI-PRO.

### TYPE 5 — DECISION

Give a scenario.

Ask:

> What would you investigate next?

Do not force a buy/sell recommendation.

### TYPE 6 — DEBUGGING

Give incorrect data or reasoning.

Ask learner to identify the error.

Examples:

- lookahead bias;
- stale data;
- wrong TTM;
- wrong ticker;
- wrong denominator;
- survivorship bias;
- invalid covariance.

### TYPE 7 — BUILD

Ask learner to construct:

- analysis;
- portfolio;
- strategy;
- risk plan;
- investigation.

### TYPE 8 — DEFEND

Learner must explain WHY the conclusion is valid.

This is important for advanced training.

---

# 20. PRACTICE LAB

Build an interactive Practice Lab.

Example:

```text
┌─────────────────────────────────────┐
│ PRACTICE LAB                         │
├─────────────────────────────────────┤
│ Topic: Portfolio Diversification    │
│ Difficulty: Intermediate             │
│                                     │
│ Portfolio: ACB / FPT / HPG / VCB   │
│                                     │
│ Question:                            │
│ Which risk is most visible?          │
│                                     │
│ [Analyze]                            │
│                                     │
│ Evidence required:                  │
│ ☑ Correlation                        │
│ ☑ Sector exposure                   │
│ ☑ Position size                     │
└─────────────────────────────────────┘
```

The learner should interact with the system, not merely read text.

---

# 21. EXERCISE FEEDBACK

Feedback should explain:

```text
YOUR ANSWER
CORRECT / INCORRECT
WHY
EXPECTED REASONING
RELEVANT CONCEPT
SYSTEM FEATURE
NEXT RECOMMENDED LESSON
```

Never simply say:

`Correct!`

Teach through the feedback.

---

# 22. REAL DATA VS SIMULATION

Exercises must clearly indicate:

```text
REAL
HISTORICAL
SIMULATED
EDUCATIONAL
```

For real data:

display:

- source;
- date;
- timestamp;
- freshness.

For simulations:

display:

`SIMULATED EDUCATIONAL DATA`

Never mix them invisibly.

---

# 23. PROJECT-BASED LEARNING

Create progressively harder projects.

### Beginner

Analyze one company.

### Intermediate

Compare two companies.

### Advanced

Analyze:

- fundamentals;
- valuation;
- trend;
- risk;
- sector;
- macro regime.

### Quant

Construct a portfolio.

### Expert

Build and defend an investment thesis using system evidence.

### Engineer

Design or debug a financial intelligence pipeline.

---

# 24. CERTIFICATION

Eventually support:

```text
LEVEL 1 — MARKET FOUNDATIONS
LEVEL 2 — INVESTOR
LEVEL 3 — ADVANCED INVESTOR
LEVEL 4 — QUANT
LEVEL 5 — SYSTEM POWER USER
LEVEL 6 — QUANT ENGINEER
```

Certification must require actual evidence.

Example:

```text
Lessons completed
+
Quiz score
+
Practice score
+
Capstone project
+
Final assessment
```

Do not award certification based only on lesson completion.

---

# 25. KNOWLEDGE GRAPH

Create relationships:

```text
CONCEPT A
   ↓ prerequisite
CONCEPT B
   ↓ used by
SYSTEM FEATURE
   ↓ practiced by
EXERCISE
   ↓ assessed by
ASSESSMENT
```

Example:

```text
Revenue
 ↓
Growth
 ↓
Earnings Quality
 ↓
Earnings Intelligence
 ↓
Stock Analysis
 ↓
Portfolio Decision
```

This graph should allow future automatic generation of learning paths.

---

# 26. CONTENT MODEL

Design content so that lessons are data-driven rather than hardcoded into giant React components.

Potential entities:

```text
learning_domains
learning_topics
learning_concepts
learning_lessons
learning_sections
learning_examples
learning_exercises
learning_questions
learning_answers
learning_projects
learning_paths
learning_path_items
learning_prerequisites
learning_progress
learning_mastery
learning_attempts
learning_certifications
```

Do not create all tables blindly.

First inspect existing architecture.

Use the smallest schema that supports the MVP.

---

# 27. USER MODEL

Design for future roles:

```text
OWNER
ADMIN
INSTRUCTOR
MENTOR
CUSTOMER
LEARNER
COMMUNITY_MODERATOR
```

For the first implementation, do not overbuild authorization if the existing system does not support it.

However, avoid architectural decisions that make future roles impossible.

---

# 28. FUTURE COMMUNITY

The architecture must eventually support:

- learner profiles;
- discussion;
- comments;
- questions;
- answers;
- peer review;
- mentor feedback;
- study groups;
- leaderboards;
- achievements;
- shared projects.

Do NOT build the full social network in the first MVP.

Prepare extension points.

---

# 29. FUTURE CUSTOMER TRAINING

Design the platform so a future customer can have:

```text
Customer
  ↓
Organization
  ↓
Training Program
  ↓
Course
  ↓
Lessons
  ↓
Exercises
  ↓
Assessment
  ↓
Certificate
```

Potential future training programs:

- VN-STOCK-AI-PRO Beginner
- VN-STOCK-AI-PRO Professional
- Fundamental Analysis
- Portfolio Risk
- Quant Investing
- Strategy Factory
- Advanced System Training

The same underlying knowledge should serve both:

```text
SELF-LEARNING
```

and:

```text
CUSTOMER TRAINING
```

---

# 30. INSTRUCTOR MODE

Future instructor capabilities:

- assign course;
- assign exercise;
- see progress;
- review answers;
- comment;
- grade projects;
- issue certificates;
- monitor weak concepts.

Do not implement all of this in MVP.

Design the domain model so it can be added later.

---

# 31. ADMIN CONTENT STUDIO

Eventually provide an internal content management interface.

Features:

- create lesson;
- edit lesson;
- create exercise;
- define prerequisites;
- define difficulty;
- attach system feature;
- attach data example;
- publish;
- unpublish;
- version content.

Content should have:

```text
DRAFT
REVIEW
PUBLISHED
ARCHIVED
```

Do not allow unfinished educational content to appear as published.

---

# 32. AI TUTOR

Eventually introduce an AI tutor.

The AI tutor should:

- explain concepts;
- ask Socratic questions;
- generate practice;
- explain mistakes;
- recommend next lessons;
- help learners navigate the system.

IMPORTANT:

The AI tutor must ground explanations in the platform's approved knowledge base.

It must not invent system capabilities.

It must not fabricate financial data.

It must distinguish:

```text
SYSTEM FACT
EDUCATIONAL EXPLANATION
MODEL ASSUMPTION
SIMULATION
```

---

# 33. AI-GENERATED CONTENT SAFETY

AI may assist content creation, but:

AI-generated lessons must NOT automatically become authoritative.

Recommended lifecycle:

```text
AI DRAFT
 ↓
HUMAN REVIEW
 ↓
VALIDATION
 ↓
PUBLISHED
```

For financial content, require stronger validation.

---

# 34. UI / UX

The Learning Hub should feel like part of the same professional product.

Maintain the existing:

**Premium Institutional / TradingView-inspired professional terminal**

language where appropriate.

But learning screens may be more educational and spacious.

Do NOT turn the trading terminal into a generic education website.

Suggested information architecture:

```text
LEARN
├── Dashboard
├── My Learning
├── Learning Paths
├── Courses
├── Practice Lab
├── Projects
├── Knowledge Base
├── Progress
├── Achievements
└── Certifications
```

---

# 35. LEARNING DASHBOARD

The dashboard should answer:

```text
Where am I?
What am I learning?
What should I do next?
What am I weak at?
What have I mastered?
What should I review?
```

Example:

```text
YOUR LEARNING

Progress                         42%

Current Path
Quant Investor

Continue
→ Correlation & Covariance

Needs Review
→ TTM
→ Portfolio Concentration

Practice
→ 3 exercises available

Next Milestone
→ Portfolio Risk Level 2
```

---

# 36. SYSTEM-INTEGRATED LEARNING

When a user is inside a system feature, provide contextual learning.

Example:

On Portfolio Risk:

`Learn this`

opens:

```text
Why diversification matters
↓
Correlation
↓
Covariance
↓
Portfolio volatility
↓
Practice
```

On Earnings:

`Learn`

opens the relevant lesson.

This creates:

```text
USE SYSTEM
     ↕
LEARN CONCEPT
     ↕
PRACTICE
     ↕
USE SYSTEM AGAIN
```

---

# 37. SEARCH

Learning search should eventually support:

- concept;
- lesson;
- system feature;
- exercise;
- difficulty;
- learning path.

Example:

Search:

`TTM`

returns:

```text
TTM — Concept
TTM — Earnings Lesson
TTM — Exercise
TTM — Financial Analysis Path
TTM — Related System Feature
```

---

# 38. ANALYTICS

Track learning analytics.

Examples:

- completion;
- mastery;
- exercise accuracy;
- average attempts;
- most difficult concepts;
- common mistakes;
- lesson drop-off;
- path completion.

For future instructors:

aggregate by:

- organization;
- course;
- cohort;
- learner.

Respect privacy and authorization.

---

# 39. DATABASE PRINCIPLES

If persistence is needed:

- additive migrations;
- no fake seed data;
- clear foreign keys;
- appropriate indexes;
- timestamps;
- versioning;
- status fields;
- auditability.

Do not create a massive schema before validating the MVP.

---

# 40. BACKEND ARCHITECTURE

Prefer:

```text
src/lib/learning/
src/services/learning/
src/lib/db/LearningRepository.ts
```

or repository conventions already established by the project.

Pure learning engines should remain deterministic.

Services handle:

- orchestration;
- persistence;
- progress;
- recommendations;
- access control;
- caching.

Do not put business logic inside React components.

---

# 41. API

Potential future endpoints:

```text
GET  /api/learning
GET  /api/learning/paths
GET  /api/learning/courses
GET  /api/learning/lessons/:id
GET  /api/learning/exercises/:id
POST /api/learning/exercises/:id/attempt
GET  /api/learning/progress
GET  /api/learning/mastery
GET  /api/learning/recommendations
GET  /api/learning/projects
POST /api/learning/projects/:id/submit
GET  /api/learning/certifications
```

Do not implement every endpoint unless needed.

Start with the smallest coherent vertical slice.

---

# 42. MVP PRIORITY

Do NOT attempt to build the entire future community/training platform immediately.

Implement in stages.

## MVP — PERSONAL LEARNING HUB

Must include:

1. Knowledge domains
2. Learning paths
3. Lessons
4. Exercises
5. Quiz/assessment
6. Progress
7. Mastery
8. Recommended next lesson
9. Practice Lab
10. System-linked learning

This is the first production milestone.

---

# 43. PHASED ROADMAP

Create a formal roadmap.

Recommended:

### LEARNING-01
Knowledge Architecture Discovery

### LEARNING-02
Learning Domain & Content Model

### LEARNING-03
Learning Hub MVP

### LEARNING-04
Learning Path Engine

### LEARNING-05
Practice & Exercise Engine

### LEARNING-06
Assessment & Mastery Engine

### LEARNING-07
System-Integrated Learning

### LEARNING-08
Project-Based Learning

### LEARNING-09
Certification

### LEARNING-10
AI Tutor

### LEARNING-11
Instructor / Admin Training Studio

### LEARNING-12
Community Foundation

### LEARNING-13
Customer Training Platform

### LEARNING-14
Learning Analytics

### LEARNING-15
Production Hardening & Certification

Do NOT blindly implement all phases.

First perform discovery and architecture audit.

Merge phases if the repository does not justify separation.

Split phases when complexity requires it.

---

# 44. AUTONOMOUS EXECUTION

After the roadmap is established:

execute automatically:

```text
DISCOVERY
→ ARCHITECTURE
→ ACCEPTANCE CRITERIA
→ IMPLEMENTATION
→ TEST
→ EVIDENCE AUDIT
→ REMEDIATION
→ CERTIFICATION
→ NEXT LEARNING PHASE
```

Do not require a new user prompt after every phase.

---

# 45. DO NOT BREAK THE FINANCIAL PLATFORM

The Learning Hub is an extension of VN-STOCK-AI-PRO.

It must never compromise:

- market data;
- RiskGuard;
- TradingEngine;
- PositionSizer;
- portfolio risk;
- financial engines;
- providers;
- freshness;
- fail-closed behavior;
- lookahead protection.

Learning features must be isolated from core trading/risk execution.

---

# 46. TESTING

Every learning module requires:

- unit tests;
- service tests;
- API tests;
- database tests where applicable;
- frontend tests;
- progress-state tests;
- assessment tests;
- authorization tests when applicable.

Important invariants:

- exercise scoring is deterministic;
- progress cannot be arbitrarily increased;
- mastery requires evidence;
- published content is valid;
- prerequisites work;
- unavailable content fails safely;
- learner cannot access unauthorized instructor/admin data.

---

# 47. ACCEPTANCE CRITERIA — MVP

MVP is complete when:

### Knowledge

At least one complete learning path exists.

### Lessons

Lessons can be opened, completed and revisited.

### Exercises

Learners can submit exercises.

### Feedback

Exercises provide meaningful explanations.

### Progress

Progress persists.

### Mastery

Mastery changes based on demonstrated performance.

### Recommendations

The system recommends a logical next activity.

### Practice

At least one interactive Practice Lab exists.

### Integration

At least several system features have contextual learning links.

### Data Integrity

No fabricated financial information is presented as real.

### Architecture

Learning code does not contaminate financial execution logic.

### Testing

All required tests pass.

### Build

Production build passes.

### Evidence

Independent audit passes.

---

# 48. FINAL VISION

The finished Learning Platform should evolve into:

```text
                  VN-STOCK-AI-PRO
                         │
          ┌──────────────┴──────────────┐
          │                             │
       PRODUCT                       LEARNING
          │                             │
   Market Intelligence            Knowledge Graph
   Stock Analysis                 Courses
   Portfolio                      Lessons
   Risk                            Practice
   Strategy                        Assessment
   Paper Trading                   Mastery
          │                         Projects
          │                         Certification
          │                             │
          └──────────────┬──────────────┘
                         │
                    COMMUNITY
                         │
                  Customer Training
                         │
                  Professional Academy
```

The long-term objective is not just:

> "Teach users how to use the application."

It is:

> **Teach users the knowledge required to understand the market, understand the analysis, understand the risks, understand the quantitative methods, and understand why VN-STOCK-AI-PRO produces its outputs.**

That becomes a durable competitive advantage.

---

# 49. FINAL AUTONOMOUS COMPLETION RULE

Continue implementing the Learning & Training roadmap until:

```text
LEARNING_PLATFORM_STATUS: CERTIFIED
```

Then perform a final architecture review.

If the system is ready for future community/customer training:

```text
CUSTOMER_TRAINING_FOUNDATION: READY
```

Do NOT claim the full community/customer platform exists unless it has actually been implemented and tested.

The correct progression is:

```text
PERSONAL LEARNING
        ↓
LEARNING HUB
        ↓
PRACTICE PLATFORM
        ↓
CERTIFICATION
        ↓
AI TUTOR
        ↓
INSTRUCTOR PLATFORM
        ↓
COMMUNITY
        ↓
CUSTOMER TRAINING
        ↓
PROFESSIONAL ACADEMY
```

---

# 50. FIRST ACTION

Do NOT immediately start coding.

First:

1. Inspect the complete VN-STOCK-AI-PRO architecture.
2. Inventory every implemented financial capability.
3. Map capabilities → concepts → lessons → exercises.
4. Audit existing user/auth/database architecture.
5. Determine where the Learning Hub belongs.
6. Produce:

`LEARNING_PLATFORM_DISCOVERY_REPORT.md`

7. Produce:

`LEARNING_PLATFORM_ROADMAP.md`

8. Define MVP acceptance criteria.
9. Only then begin implementation.

After each certified learning phase, automatically continue to the next eligible phase.

Do not wait for another prompt.

FINAL OBJECTIVE:

`VN-STOCK-AI-PRO + LEARNING HUB + PRACTICE + MASTERY + CERTIFICATION + CUSTOMER TRAINING FOUNDATION`

with:

`LEARNING_PLATFORM_STATUS: CERTIFIED`