# VN-STOCK-AI-PRO
# MASTER FULL PROJECT AUDIT
## FULL REPOSITORY → ARCHITECTURE → DATA → DECISION → TRADING → AI → UI → TEST → PRODUCTION → CERTIFICATION

---

# 0. MISSION

Bạn đang làm việc trực tiếp trên repository hiện tại:

**VN-STOCK-AI-PRO**

Mục tiêu:

> **Audit toàn bộ dự án từ đầu đến cuối để xác định chính xác: dự án đã thực sự hoàn thành đến đâu, phần nào PASS thật, phần nào chỉ “claimed PASS”, phần nào còn thiếu, phần nào dead code, phần nào chưa được test, phần nào nguy hiểm, và phần nào phải tiếp tục triển khai.**

Đây là:

**FULL PROJECT AUDIT + GAP DISCOVERY + SAFE AUTO-FIX + RE-AUDIT**

Không phải chỉ:

```text
npm test
npm run build
```

và không phải chỉ kiểm tra UI.

---

# 1. ABSOLUTE RULES

## 1.1 Không tin documentation một cách mù quáng

Các file:

```text
README
CURRENT
ROADMAP
PHASE*
STATUS*
CHANGELOG
docs/*
.ai/*
```

chỉ là CLAIMS.

Mọi claim phải được đối chiếu với:

```text
SOURCE CODE
TESTS
RUNTIME
DATABASE
REAL DATA PROVIDERS
BUILD OUTPUT
ACTUAL ROUTES
ACTUAL API
ACTUAL EXECUTION
```

---

# 1.2 Không fake PASS

Không được đánh:

```text
PASS
```

nếu:

- chưa test
- chỉ có code nhưng chưa có execution path
- chỉ có UI nhưng backend chưa hoạt động
- chỉ có mock
- chỉ có placeholder
- chỉ có documentation
- test tồn tại nhưng không chạy
- test chạy nhưng không kiểm tra behavior thực
- feature unreachable
- feature chỉ hoạt động với synthetic data

---

# 1.3 Không fake market data

TUYỆT ĐỐI KHÔNG:

- synthetic price
- fake OHLCV
- fake fundamentals
- fake index
- fake liquidity
- fake orderbook
- fake broker response
- fake portfolio
- fake P&L
- fake AI signal
- fake trading execution

Nếu real provider unavailable:

```text
DATA_UNAVAILABLE
```

hoặc trạng thái tương ứng.

Không silently fallback sang mock.

---

# 1.4 Không phá kiến trúc đã PASS

Bảo vệ:

```text
KBS
VPS
VNDIRECT fallback
MarketDataUnavailableError
DATA_UNAVAILABLE
Freshness lifecycle
RiskGuard
RiskManager
TradingEngine
PaperBroker
providers
Decision Engine
existing tests
existing contracts
```

Không rewrite chỉ để “đẹp code”.

---

# 1.5 Không destructive Git

TUYỆT ĐỐI KHÔNG:

```text
git reset --hard
git clean -fd
git clean -fdx
git restore .
force push
```

Không xóa thay đổi của người dùng.

---

# 2. FIRST TASK — REPOSITORY FORENSIC INVENTORY

Quét toàn bộ repository.

Xác định:

```text
package.json
src/
server/
api/
routes/
components/
pages/
hooks/
services/
providers/
adapters/
database/
drizzle/
migrations/
tests/
e2e/
scripts/
docs/
.ai/
.github/
Docker*
k8s/
terraform/
```

Nếu path khác:

→ tự discover.

Tạo inventory:

```text
FILE
TYPE
PURPOSE
REFERENCED?
EXECUTED?
TESTED?
DEAD?
RISK?
```

---

# 3. PROJECT STRUCTURE AUDIT

Map architecture:

```text
UI
 ↓
Application
 ↓
Domain
 ↓
Decision
 ↓
Risk
 ↓
Trading
 ↓
Data
 ↓
Providers
 ↓
Database
```

Xác định:

- dependency direction
- circular dependencies
- business logic leakage
- UI financial calculations
- server/client boundary violations
- duplicated business logic
- duplicated provider logic
- hidden global state
- unsafe mutable state

---

# 4. ROADMAP / PHASE AUDIT

Tìm toàn bộ references tới:

```text
Phase
PR-
P0
P1
P2
P3
...
M1
M2
...
UI-
DATA
DECISION
TRADING
RESEARCH
BACKTEST
PLATFORM
BUSINESS
INFRA
```

Xây dựng:

```text
MASTER PHASE MATRIX
```

Mỗi phase:

```text
PHASE
CLAIMED STATUS
ACTUAL STATUS
SOURCE EVIDENCE
TEST EVIDENCE
RUNTIME EVIDENCE
GAPS
REGRESSIONS
CERTIFICATION
```

Phân loại:

```text
REAL PASS
PARTIAL
NOT IMPLEMENTED
IMPLEMENTED BUT UNTESTED
DEAD CODE
PLACEHOLDER
BROKEN
REGRESSED
BLOCKED
FALSE PASS
```

---

# 5. BUILD / TYPECHECK / TEST BASELINE

Chạy thực tế:

```text
npm install
typecheck
lint
unit tests
integration tests
e2e tests
build
```

Chỉ chạy commands thực sự tồn tại.

Không invent scripts.

Ghi:

```text
COMMAND
RESULT
DURATION
FAILURE
ROOT CAUSE
```

---

# 6. RUNTIME AUDIT

Start application.

Kiểm tra:

```text
frontend
backend
API
database
```

Xác minh:

```text
HTTP health
API health
database connectivity
frontend loading
server startup
```

Không chỉ kiểm tra compilation.

---

# 7. DATA FOUNDATION AUDIT

Đây là P0.

Audit toàn bộ market-data pipeline.

## Required source hierarchy

Kiểm tra implementation thực tế của:

```text
KBS
VPS
VNDIRECT fallback
```

Xác minh:

```text
quote
OHLCV
history
fundamentals
index
market breadth
```

---

# 8. REAL DATA / FAIL-CLOSED AUDIT

Tìm:

```text
mock
fixture
fake
demo
sample
seed
synthetic
fallback
random
Math.random
hardcoded price
hardcoded market data
```

Phân biệt:

```text
TEST FIXTURE
DEMO
PRODUCTION DATA
```

Không được để fixture đi vào production runtime.

---

# 9. FRESHNESS AUDIT

Xác minh implementation thật của:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
```

Kiểm tra TTL:

```text
quote ≈ 15s
history ≈ 60s
risk guard ≈ 120s
fundamentals ≈ 300s
```

Nếu repository có giá trị khác:

→ đối chiếu với source of truth hiện tại và documentation.

Không tự ý đổi chỉ vì prompt này.

---

# 10. PROVIDER FAILOVER AUDIT

Test:

```text
primary provider available
primary unavailable
primary timeout
primary malformed
secondary available
all providers unavailable
```

Expected:

```text
real fallback
```

hoặc:

```text
DATA_UNAVAILABLE
```

Không:

```text
fake fallback
```

---

# 11. DATA CONTRACT AUDIT

Kiểm tra schema:

```text
symbol
price
volume
timestamp
source
freshness
currency
exchange
```

Không để:

```text
undefined
NaN
negative invalid values
future timestamps
wrong units
wrong exchange
```

lọt xuống decision layer.

---

# 12. MARKET / INDEX AUDIT

Kiểm tra:

```text
VN-INDEX
VN30
HNX
UPCOM
```

Xác minh:

- source
- timestamp
- freshness
- calculation
- display
- fallback
- unavailable behavior

---

# 13. ETF / DERIVATIVES SCOPE AUDIT

Đối chiếu roadmap hiện tại.

Đặc biệt kiểm tra những phần đã từng có:

```text
E1VFVN30
FUEVFVND
FUESSVFL
```

và derivatives.

Kiểm tra:

```text
contract multiplier
tick size
lot size
unit conversion
```

Không hardcode assumptions sai thị trường Việt Nam.

---

# 14. FUNDAMENTALS AUDIT

Audit:

```text
P/E
P/B
ROE
ROA
EPS
revenue
profit
cash flow
debt
FCF
```

Kiểm tra:

- source
- date
- period
- unit
- normalization
- missing data
- stale data

Không để UI tự tính financial metrics nếu architecture đã quy định server/domain calculation.

---

# 15. VALUATION ENGINE AUDIT

Audit:

```text
DCF
fair value
margin of safety
valuation multiples
scenario analysis
```

Kiểm tra:

```text
inputs
assumptions
formula
units
period
terminal value
discount rate
sensitivity
```

Test edge cases.

Không cho:

```text
NaN
Infinity
negative nonsense
```

đi vào recommendation.

---

# 16. TECHNICAL / CYCLE ENGINE AUDIT

Kiểm tra architecture hiện tại cho:

```text
trend
momentum
volume
relative strength
market regime
gold
Bitcoin
DXY
oil
Fed
rates
```

Không biến dashboard thành daily-candle noise nếu roadmap đã xác định cycle-based analysis.

Mọi external macro data phải có:

```text
source
timestamp
freshness
```

---

# 17. DECISION ENGINE AUDIT

Audit chain:

```text
DATA
 ↓
FRESHNESS
 ↓
MARKET INTELLIGENCE
 ↓
AI SCORE
 ↓
RECOMMENDATION
 ↓
RISK
 ↓
POSITION SIZING
```

Không được có shortcut:

```text
UI → BUY
```

hoặc:

```text
API → PaperBroker
```

bỏ qua risk controls.

---

# 18. AI SCORE AUDIT

Kiểm tra:

```text
AI score
feature inputs
weights
normalization
missing data
confidence
explanation
```

AI không được:

- invent data
- override unavailable data
- bypass risk
- create fake confidence
- output BUY from incomplete critical inputs

---

# 19. RECOMMENDATION ENGINE

Kiểm tra:

```text
BUY
WATCH
HOLD
AVOID
SELL
```

và các thresholds thực tế trong source.

Đặc biệt audit:

```text
BUY 65
SHORT 60
MEDIUM 60
LONG 55
R:R >= 2
```

Nếu các thresholds đã thay đổi trong code:

→ ghi nhận actual implementation.

Không tự động thay đổi chỉ để khớp documentation.

---

# 20. RISK ENGINE — P0

Audit:

```text
RiskGuard
RiskManager
position sizing
stop loss
take profit
max position
portfolio exposure
cash
drawdown
R:R
```

Kiểm tra:

```text
invalid order
oversized order
stale price
missing price
DATA_UNAVAILABLE
market closed
symbol invalid
```

Expected:

```text
BLOCK
```

khi safety condition fail.

---

# 21. TRADING CHAIN — CRITICAL

Trace actual execution path:

```text
POST /api/trading/order
        ↓
TradingApiRouter
        ↓
RiskGuard
        ↓
RiskManager
        ↓
TradingEngine
        ↓
PaperBroker
        ↓
Portfolio
        ↓
Persistence
```

Không chấp nhận shortcut:

```text
TradingApiRouter
        ↓
PaperBroker.submitOrder()
```

nếu bypass risk controls.

Đây là **P0 security/capital-safety gate**.

---

# 22. PAPER TRADING AUDIT

Audit:

```text
order
fill
position
cash
P&L
fees
slippage
portfolio
trade history
```

Không fake fills.

Không fake prices.

Kiểm tra idempotency.

---

# 23. PAPER REPLAY / LIVE SIMULATION

Nếu đã implement:

kiểm tra:

```text
deterministic replay
event ordering
market data sequence
fills
portfolio evolution
```

Nếu chưa:

→ ghi chính xác.

Không tuyên bố PASS chỉ vì có test fixture.

---

# 24. BACKTEST / RESEARCH AUDIT

Audit:

```text
data leakage
look-ahead bias
survivorship bias
transaction costs
slippage
fees
position sizing
entry/exit
benchmark
metrics
```

Kiểm tra:

```text
CAGR
Sharpe
Max Drawdown
Win Rate
Profit Factor
Turnover
```

Không claim performance nếu chưa chạy trên dữ liệu thật.

---

# 25. PORTFOLIO AUDIT

Kiểm tra:

```text
positions
average cost
market value
unrealized P&L
realized P&L
cash
exposure
allocation
drawdown
```

Đơn vị phải thống nhất:

```text
VND
shares
lot
contract
```

---

# 26. ORDER / EXECUTION AUDIT

Kiểm tra:

```text
market order
limit order
buy
sell
cancel
reject
partial fill
duplicate order
invalid quantity
invalid price
```

Nếu feature chưa support:

→ NOT IMPLEMENTED.

Không fake.

---

# 27. UI / UX FULL AUDIT

Audit toàn bộ routes.

Tìm:

```text
PagePlaceholder
TODO
Coming Soon
Lorem
mock
demo
hardcoded
empty state
broken route
```

Mỗi route phải phân loại:

```text
REAL
PARTIAL
PLACEHOLDER
BROKEN
UNREACHABLE
```

---

# 28. UI DATA INTEGRITY

Kiểm tra mọi number hiển thị:

```text
price
volume
P/E
P/B
fair value
AI score
P&L
portfolio
risk
```

Nguồn phải truy ngược được:

```text
UI
→ API
→ service
→ provider/database
```

Không hardcode production values.

---

# 29. UI DESIGN AUDIT

Đối chiếu target:

**Premium Institutional / TradingView-inspired professional terminal**

Kiểm tra:

- density
- hierarchy
- dark navy/charcoal
- green/red market movement
- cyan/orange accents
- compact financial terminal
- responsive
- loading
- error
- stale
- unavailable
- empty states

Không biến thành generic AI landing page.

---

# 30. RESPONSIVE AUDIT

Test:

```text
desktop
laptop
tablet
mobile
```

Đặc biệt:

```text
charts
tables
heatmap
watchlist
market ribbon
order panel
portfolio
AI analysis
```

---

# 31. ERROR STATE AUDIT

Mọi data-dependent UI phải xử lý:

```text
CURRENT
STALE
UNAVAILABLE
INVALID
LOADING
ERROR
EMPTY
```

Không hiển thị stale value như live value.

---

# 32. SECURITY AUDIT

Search:

```text
API keys
password
tokens
JWT secrets
database credentials
private keys
.env exposure
CORS
auth bypass
SQL injection
XSS
CSRF
unsafe eval
unsafe HTML
```

Kiểm tra server authorization.

---

# 33. DATABASE AUDIT

Kiểm tra:

```text
schema
migrations
indexes
constraints
foreign keys
transactions
idempotency
nullability
timestamps
```

Tìm:

```text
orphan records
duplicate records
missing indexes
unsafe migrations
```

---

# 34. API AUDIT

Inventory all API routes.

For each:

```text
METHOD
PATH
AUTH
INPUT
OUTPUT
ERROR
VALIDATION
DB
EXTERNAL PROVIDER
TEST
```

Tìm:

```text
dead route
duplicate route
unprotected route
wrong response contract
silent error
```

---

# 35. TEST QUALITY AUDIT

Không chỉ đếm số test.

Đánh giá:

```text
unit
integration
contract
provider
risk
trading
database
E2E
UI
failure modes
```

Tìm test:

```text
assert(true)
snapshot-only
weak assertion
mock everything
never reaches production code
```

Xác định:

```text
REAL COVERAGE
CRITICAL PATH COVERAGE
```

---

# 36. CRITICAL TESTS

Phải có tests cho:

```text
DATA_UNAVAILABLE
STALE DATA
INVALID DATA
provider timeout
provider malformed response
risk rejection
oversized order
duplicate order
paper fill
portfolio update
persistence
```

---

# 37. DEAD CODE / PLACEHOLDER AUDIT

Tìm:

```text
unused components
unused services
unused providers
dead routes
orphan engines
unreachable curriculum
```

Nếu feature có engine nhưng không có UI:

```text
PARTIAL / UNREACHABLE
```

Nếu UI có nhưng backend không:

```text
PARTIAL / BROKEN
```

---

# 38. DOCUMENTATION TRUTH AUDIT

Đối chiếu:

```text
README
CURRENT
ROADMAP
CHANGELOG
docs
phase reports
```

Tìm:

```text
claimed PASS but actually incomplete
claimed feature but dead code
claimed tests but no test
claimed production but not deployable
```

Sửa documentation để phản ánh reality.

---

# 39. DEPLOYMENT AUDIT

Kiểm tra:

```text
production build
environment configuration
database migration
health check
logging
error handling
observability
backup
rollback
```

Không triển khai Kubernetes/cloud nếu chưa thuộc goal hiện tại.

Nếu infrastructure chưa nằm trong scope:

```text
OUT OF CURRENT SCOPE
```

---

# 40. GOOGLE AI STUDIO COMPATIBILITY

Kiểm tra:

```text
fresh environment
npm install
build
runtime
environment variables
filesystem assumptions
server startup
```

Không được yêu cầu hidden local dependencies.

Nếu Google AI Studio compatibility là roadmap requirement:

→ đây là release gate.

---

# 41. PERFORMANCE AUDIT

Kiểm tra:

```text
bundle size
initial load
route lazy loading
API latency
database queries
N+1
large payload
render loops
polling
cache
```

Không tối ưu bằng cách phá correctness.

---

# 42. OBSERVABILITY

Kiểm tra:

```text
structured logs
error IDs
request IDs
provider failures
data freshness
trading errors
risk blocks
```

Không log secrets.

---

# 43. FULL USER JOURNEYS

Thực hiện E2E:

## Journey 1 — Market

```text
Open app
→ Market
→ VNINDEX
→ VN30
→ sectors
→ ticker
→ quote
→ chart
```

## Journey 2 — Stock Research

```text
Search ticker
→ fundamentals
→ valuation
→ AI score
→ recommendation
→ risk
```

## Journey 3 — Paper Trading

```text
Ticker
→ order
→ risk validation
→ paper execution
→ position
→ P&L
→ portfolio
```

## Journey 4 — Risk Block

```text
bad/stale/unavailable data
→ order
→ RiskGuard
→ BLOCK
```

## Journey 5 — Persistence

```text
change state
→ reload
→ verify
```

---

# 44. AUTOMATIC SAFE FIX LOOP

Nếu phát hiện lỗi có thể sửa an toàn:

```text
DISCOVER
→ ROOT CAUSE
→ MINIMAL PATCH
→ TYPECHECK
→ TEST
→ BUILD
→ RUNTIME
→ RE-AUDIT
```

Không dừng ở:

```text
"Found 17 issues"
```

nếu những issue đó có thể tự sửa.

---

# 45. DO NOT AUTO-FIX HIGH-RISK FINANCIAL LOGIC BLINDLY

Nếu phát hiện vấn đề liên quan:

```text
valuation
risk
position sizing
order execution
portfolio accounting
provider source
financial calculation
```

phải:

1. trace dependency;
2. write regression test;
3. patch minimal;
4. run affected tests;
5. rerun full critical suite.

Không “refactor cho đẹp” mà không có proof.

---

# 46. COMPLETION SCORE

Không dùng một con số phần trăm giả.

Tạo:

```text
FUNCTIONAL COMPLETION
DATA COMPLETION
DECISION COMPLETION
TRADING COMPLETION
RISK COMPLETION
UI COMPLETION
TEST COMPLETION
SECURITY COMPLETION
PRODUCTION COMPLETION
DOCUMENTATION COMPLETION
```

Mỗi category:

```text
PASS
PARTIAL
FAIL
BLOCKED
OUT OF SCOPE
```

Nếu muốn percentage:

→ chỉ tính từ evidence-backed checklist.

---

# 47. FINAL CERTIFICATION MATRIX

Tạo bảng:

```text
DOMAIN                  STATUS
-----------------------------------------
Repository              PASS/PARTIAL
Architecture            PASS/PARTIAL
Data Foundation         PASS/PARTIAL
Providers               PASS/PARTIAL
Freshness               PASS/PARTIAL
Market Intelligence     PASS/PARTIAL
Fundamentals            PASS/PARTIAL
Valuation               PASS/PARTIAL
Decision Engine          PASS/PARTIAL
AI Score                 PASS/PARTIAL
Risk Engine              PASS/PARTIAL
Trading Engine           PASS/PARTIAL
Paper Trading            PASS/PARTIAL
Portfolio                PASS/PARTIAL
Backtest                 PASS/PARTIAL
Research                 PASS/PARTIAL
UI/UX                    PASS/PARTIAL
Testing                  PASS/PARTIAL
Security                 PASS/PARTIAL
Database                 PASS/PARTIAL
API                      PASS/PARTIAL
Performance              PASS/PARTIAL
Observability            PASS/PARTIAL
Google AI Studio         PASS/PARTIAL
Documentation            PASS/PARTIAL
Production Readiness     PASS/PARTIAL
```

---

# 48. CRITICAL BLOCKER CLASSIFICATION

Mỗi issue phải có:

```text
ID
SEVERITY
DOMAIN
FILE
LINE
ROOT CAUSE
CURRENT BEHAVIOR
EXPECTED BEHAVIOR
RISK
FIX
TEST
STATUS
```

Severity:

```text
P0 = capital/safety/data integrity/security/release blocker
P1 = major feature broken
P2 = significant quality issue
P3 = polish/documentation
```

---

# 49. FINAL STATE DEFINITIONS

## COMPLETE

Chỉ khi:

```text
all in-scope P0 = PASS
all critical user journeys = PASS
no known critical regression
real data path verified
risk/trading chain verified
build PASS
tests PASS
runtime PASS
```

## NOT COMPLETE

Nếu còn:

```text
P0
critical feature
critical path
unsafe trading bypass
fake data path
broken provider chain
```

## BLOCKED

Nếu environment ngăn verification.

Không biến BLOCKED thành PASS.

---

# 50. FINAL OUTPUT

Cuối cùng báo cáo theo format:

```text
==========================================================
VN-STOCK-AI-PRO
MASTER FULL PROJECT AUDIT
==========================================================

AUDIT DATE:
COMMIT:
BRANCH:

BUILD:
TYPECHECK:
LINT:
UNIT:
INTEGRATION:
E2E:
RUNTIME:

----------------------------------------------------------
PROJECT COMPLETION
----------------------------------------------------------

ARCHITECTURE:
DATA:
PROVIDERS:
FRESHNESS:
MARKET:
FUNDAMENTALS:
VALUATION:
DECISION:
AI:
RISK:
TRADING:
PAPER TRADING:
PORTFOLIO:
BACKTEST:
RESEARCH:
UI/UX:
DATABASE:
API:
SECURITY:
PERFORMANCE:
OBSERVABILITY:
GOOGLE AI STUDIO:
DOCUMENTATION:
PRODUCTION:

----------------------------------------------------------
CRITICAL PATH
----------------------------------------------------------

MARKET DATA:
PASS / FAIL

DATA → MI → AI → RECOMMENDATION:
PASS / FAIL

RECOMMENDATION → RISK:
PASS / FAIL

RISK → TRADING:
PASS / FAIL

TRADING → PAPER BROKER:
PASS / FAIL

PAPER BROKER → PORTFOLIO:
PASS / FAIL

PERSISTENCE:
PASS / FAIL

----------------------------------------------------------
P0 BLOCKERS
----------------------------------------------------------

1.
2.
3.

----------------------------------------------------------
P1 GAPS
----------------------------------------------------------

1.
2.
3.

----------------------------------------------------------
DEAD / UNREACHABLE FEATURES
----------------------------------------------------------

1.
2.

----------------------------------------------------------
FALSE / UNSUPPORTED CLAIMS
----------------------------------------------------------

1.
2.

----------------------------------------------------------
AUTO-FIXED
----------------------------------------------------------

1.
2.

----------------------------------------------------------
REMAINING WORK
----------------------------------------------------------

1.
2.
3.

----------------------------------------------------------
FINAL STATUS
----------------------------------------------------------

VN-STOCK-AI-PRO:

[ COMPLETE ]
[ NOT COMPLETE ]
[ BLOCKED ]

CERTIFICATION:
NOT CERTIFIED / PARTIALLY CERTIFIED / FULLY CERTIFIED
==========================================================
```

---

# 51. CONTINUOUS EXECUTION DIRECTIVE

**Không chỉ audit rồi dừng.**

Thực hiện:

```text
AUDIT
↓
DISCOVER GAPS
↓
CLASSIFY
↓
SAFE AUTO-FIX
↓
TEST
↓
BUILD
↓
RUNTIME
↓
RE-AUDIT
↓
UPDATE CERTIFICATION
```

Lặp lại cho đến khi:

```text
NO P0
NO CRITICAL BROKEN PATH
NO FAKE PASS
NO UNKNOWN CRITICAL GAP
```

hoặc bị chặn bởi environment/external dependency.

---

# 52. FINAL RULE

Không được tuyên bố:

```text
VN-STOCK-AI-PRO COMPLETE
```

chỉ vì:

```text
npm run build = PASS
```

Không được tuyên bố:

```text
Trading = PASS
```

chỉ vì PaperBroker có thể nhận order.

Không được tuyên bố:

```text
Data = PASS
```

chỉ vì provider code tồn tại.

Không được tuyên bố:

```text
UI = PASS
```

chỉ vì routes render.

Không được tuyên bố:

```text
Production Ready
```

nếu critical runtime paths chưa được chứng minh.

---

# 53. EXECUTE NOW

**Bắt đầu audit ngay trên repository hiện tại.**

Không hỏi user xác nhận từng bước.

Không tạo roadmap mới thay thế roadmap hiện tại.

Không reset project.

Không xóa implementation đang có.

Tự discover toàn bộ phase/feature hiện hữu.

Tự đối chiếu:

```text
CLAIM
vs
SOURCE
vs
TEST
vs
RUNTIME
```

Tự sửa những lỗi an toàn có thể sửa.

Sau mỗi nhóm sửa:

```text
TEST
→ BUILD
→ RUNTIME
→ RE-AUDIT
```

Cuối cùng đưa ra **một certification matrix duy nhất** cho toàn bộ VN-STOCK-AI-PRO và xác định rõ:

> **ĐÃ HOÀN THÀNH HẾT / CHƯA HOÀN THÀNH / BỊ BLOCKED — và chính xác còn thiếu gì.**

**Không được dùng cảm tính. Không được dùng “có vẻ hoàn thành”. Chỉ evidence mới được tính.**