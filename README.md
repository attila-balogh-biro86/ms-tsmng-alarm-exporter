# ms-tsmng-alarm-exporter

Java exporter service that emits custom business metrics derived from MongoDB
Atlas state into Azure Monitor via the central OpenTelemetry collector. It is
the **single egress point** to Azure Monitor for the TSMNG alarm pipeline.

The service has two complementary responsibilities:

| Responsibility | Mechanism |
|---|---|
| Translate event-driven Atlas Database Trigger calls into OTel metrics (`PL7055`, `PL7087`, `PL7093`) | HMAC-signed webhook endpoints under `/internal/events/v1/**` |
| Run scheduled polling queries against Atlas for freshness / windowed-count / threshold / config alarms (~28 alarms) | In-process `@Scheduled` runners under `polling/` |

Both paths share the same OTel emission code, the same dimensions, and the
same dead-man's switch (`tsmng.exporter.heartbeat`).

> Full architecture rationale, per-alarm mechanism mapping, and risk register
> live alongside this project in `alarm_architecture_decision.md`.

---

## Prerequisites

- **JDK 21** — JDK 24 is currently incompatible with the Lombok version in
  use (compile fails with `TypeTag :: UNKNOWN`). Point `JAVA_HOME` at a 21
  install before building.
- **Maven 3.9+** (or use your IDE's bundled Maven).
- Access to the **CTS-TSMNG-feed** Maven repository (configured in `pom.xml`).
  Make sure your `~/.m2/settings.xml` has credentials for it.
- For running locally: a MongoDB instance reachable at
  `mongodb://localhost:27017` (or override via `spring.data.mongodb.uri`).
- For the end-to-end webhook path: access to a MongoDB Atlas project with
  App Services / Triggers enabled.

---

## Build

```bash
# Verify JDK
java -version            # → 21.x

# Compile, run unit tests, run JaCoCo coverage gate, package the jar
mvn clean install
```

Artefact produced: `target/ms-tsmng-alarm-exporter-<version>.jar`.

The JaCoCo gate enforces **80 % line coverage at the BUNDLE level** (see
`pom.xml` — `<unit.testing.limit.minimum>`). The build fails if coverage
drops below the threshold.

### Build the Docker image

```bash
mvn clean package docker:build
```

Uses `docker/Dockerfile` (OpenJDK 21 slim base, non-root `java` user, port 8080).
Image tagged `containerRegistry.azurecr.io/ms-tsmng-alarm-exporter:<version>`.

---

## Test

```bash
# Fast loop — unit tests only
mvn test

# Full lifecycle, includes spring-boot:start during pre-integration-test
# (requires a reachable MongoDB)
mvn verify
```

Current test layout under `src/test/java`:

| Test | What it covers |
|---|---|
| `MsTsmngAlarmExporterApplicationTest` | Full Spring context loads with `application-test.yml` (Vault disabled, outbox + polling disabled, OTel SDK absent). |
| `config/SecurityConfigPropertiesTest` | `@ConfigurationProperties` binding for the `security.cors.*` keys. |
| `controller/EventsControllerTest` | Webhook contract — both `/internal/events/v1/**` endpoints accept valid bodies and return 202; HMAC filter is bypassed via `addFilters = false` because it is exercised separately. |

To check coverage locally without enforcing the gate:

```bash
mvn test jacoco:report
# Open target/site/jacoco-unit-test-coverage-report/index.html
```

---

## Run locally

```bash
# Required: HMAC secret the exporter uses to verify webhook signatures.
export EXPORTER_HMAC_SECRET="local-only-secret-change-me"

# Optional: override the Mongo URI if not 127.0.0.1:27017
export SPRING_DATA_MONGODB_URI="mongodb://localhost:27017/tsmng-local"

mvn spring-boot:run
```

The service starts on port **8080**. Useful endpoints:

| | |
|---|---|
| Health | `GET http://localhost:8080/actuator/health` |
| Prometheus scrape | `GET http://localhost:8080/actuator/prometheus` |
| Swagger UI | `http://localhost:8080/swagger-ui.html` |
| Webhook (signed) | `POST http://localhost:8080/internal/events/v1/segment-mode-changed` |

> The OpenTelemetry SDK is **not** initialized locally. `GlobalOpenTelemetry.get()`
> returns the no-op instance, so counter increments are silently dropped. In
> AKS the Java agent (injected via the OTel Operator's `inject-java`
> annotation) installs the real SDK at runtime — no code change required.

---

## Initialize MongoDB Atlas (test data)

If your Atlas cluster is empty, run the seed script before wiring the Atlas
Triggers. It creates the collections the triggers act on plus a couple of
collections useful for polling-alarm development.

### Script

`atlas-functions/seed_test_data.mongosh.js`

Creates (database `tsmng-test`; rename inside the script if needed):

| Collection | Purpose | Sample docs |
|---|---|---|
| `segments` | Toll-mode state per `(concession, segmentId)`. Database-Trigger target for **PL7055 / PL7087**. | 7 docs across DFW / I77 / I66 |
| `toll_control_files` | TC / TSA file registry. Database-Trigger target for **PL7093**. | 4 docs (TC + TSA, default-active for the current week) |
| `mvd_events` | Sample MVDs spread across the last 15 minutes. Polling-runner target for **PL7053 / PL7070 / PL7074 / PL7709 / PL7717**. | 6 docs (one deliberately > 10 min stale to breach PL7053 once wired) |
| `master-metrics_dra_retraining` | Re-training event log — name verbatim from `TSMNG Alarms.xlsx`. Polling target for **PL_new** retraining staleness. | 3 docs (one already > 2 days old) |

Indexes are created on each collection so the eventual polling queries are
`IXSCAN` from day one.

### How to run

Pick one of the three options below.

**Option A — `mongosh` from your machine:**

```bash
# Grab the URI from Atlas → Connect → MongoDB Shell
mongosh "mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/" \
  --file atlas-functions/seed_test_data.mongosh.js
```

**Option B — Atlas UI's MongoDB Shell pane:**

1. Open the cluster → Collections → click the terminal icon to open the shell.
2. Paste the contents of `atlas-functions/seed_test_data.mongosh.js`.

**Option C — MongoDB Compass:**

1. Connect to the cluster.
2. Switch to the **MONGOSH** tab.
3. Paste the script contents.

Expected output:

```
--- seeding database 'tsmng-test' ---

✓ segments                          : 7 docs
✓ toll_control_files                : 4 docs
✓ mvd_events                        : 6 docs
✓ master-metrics_dra_retraining     : 3 docs

--- done. ---
```

The script is **idempotent** (each collection is dropped and re-seeded).
Do not run against a database that holds real data.

### Firing the triggers once seeded

The seed script's footer has copy-paste commands. Short version:

```javascript
use tsmng-test

// PL7055 — REGULAR → MANDATORY
db.segments.updateOne(
  { concession: "DFW", segmentId: "S001" },
  { $set: { tollMode: "MANDATORY", modifiedAt: new Date(), modifiedBy: "manual-test" } }
)

// PL7087 — MANDATORY → REGULAR
db.segments.updateOne(
  { concession: "DFW", segmentId: "S003" },
  { $set: { tollMode: "REGULAR", modifiedAt: new Date(), modifiedBy: "manual-test" } }
)

// PL7093 — new toll-control file
db.toll_control_files.insertOne({
  concession: "DFW",
  fileId: "TC-" + new Date().toISOString().slice(0,10) + "-999",
  fileType: "TC",
  effectiveFrom: new Date(),
  effectiveTo: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  isDefault: false,
  createdAt: new Date()
})
```

---

## Atlas Functions

The two scripts under `atlas-functions/` are deployed inside MongoDB Atlas
App Services. They are the only components that bridge between Atlas and
the exporter; everything else flows on the exporter side.

| File | Purpose | Wired to |
|---|---|---|
| `atlas-functions/simulate_segment_mode_changed.js` | Sends a synthetic (or change-stream-derived) **PL7055 / PL7087** event to `POST /internal/events/v1/segment-mode-changed`. HMAC-signs the body with `utils.crypto.hmac`. Includes a `buildPayloadFromChangeEvent` helper for switching from manual / scheduled invocation to a real Database Trigger handler. | Database Trigger on `segments` (update of `tollMode`) **or** a Scheduled Trigger for load testing. |
| `atlas-functions/simulate_toll_control_file_registered.js` | Sends a synthetic (or change-stream-derived) **PL7093** event to `POST /internal/events/v1/toll-control-file-registered`. Same HMAC scheme. Includes the equivalent change-event helper. | Database Trigger on `toll_control_files` (insert) **or** Scheduled Trigger. |

Both functions can be invoked three ways:

1. **Manual `Run` from the Atlas Functions UI** — pass an `arg` object or
   leave it empty (synthetic values are generated). Good for one-off
   smoke tests against the deployed exporter.
2. **Scheduled Trigger** — no argument; the function generates randomized
   synthetic data. Good for load-ramping the receiver or exercising the
   outbox path.
3. **Database Trigger** — pass the `changeEvent`. In each file, swap
   `buildSyntheticPayload(arg)` for the `buildPayloadFromChangeEvent(arg)`
   helper at the bottom and configure the trigger as shown in the seed
   script's comments.

### Configuration required in Atlas

Set up these in **App Services → Values & Secrets** before running either
function:

| Name | Kind | Example / meaning |
|---|---|---|
| `exporterBaseUrl` | Value | `https://apim-eu-d-tsmng-01.azure-api.net/tsmng.cts.int/config/ms-tsmng-alarm-exporter` |
| `apimSubscriptionKey` | Value | APIM subscription key for the exporter product |
| `hmacSharedSecret` | Secret | The same string the exporter resolves into `ExporterProperties.hmac.sharedSecret` (Vault-backed in prod, `EXPORTER_HMAC_SECRET` env var locally) |

### Wiring real Database Triggers

| Trigger name | Collection | Op | Match expression |
|---|---|---|---|
| `pl7055_pl7087_segment_mode_changed` | `segments` | Update | `{ "updateDescription.updatedFields.tollMode": { "$exists": true } }` |
| `pl7093_toll_control_file_registered` | `toll_control_files` | Insert | *(none — fire on every insert)* |

For the **Update** trigger also set:
- **Full Document** = `updateLookup`
- **Full Document Before Change** = `whenAvailable`

…so the function can compare old and new `tollMode`.

---

## Configuration reference

All keys are under the `exporter.*` prefix in `application.yml`. Standard
Spring relaxed binding applies, so any of them can be overridden with
environment variables (`EXPORTER_HMAC_SHARED_SECRET`, `EXPORTER_CONCESSIONS_0`,
etc.).

| Key | Default | Description |
|---|---|---|
| `exporter.concessions` | `[DFW, I77, I66]` | Tenant codes the polling runners iterate over. |
| `exporter.hmac.shared-secret` | `${EXPORTER_HMAC_SECRET:change-me-local-only}` | HMAC-SHA256 secret used to verify `X-Tsmng-Signature` on `/internal/events/**`. Vault-backed in prod. |
| `exporter.hmac.header-name` | `X-Tsmng-Signature` | Header the filter reads. |
| `exporter.outbox.enabled` | `true` | If `false`, `OutboxWorker` is not loaded. Tests set this to `false`. |
| `exporter.outbox.batch-size` | `100` | Max rows drained per cycle. |
| `exporter.outbox.drain-interval` | `PT5S` | Cadence of `OutboxWorker.drain()`. |
| `exporter.outbox.retention` | `P7D` | Forensic-replay window for processed outbox rows. |
| `exporter.polling.enabled` | `true` | If `false`, none of the `@ConditionalOnProperty`-gated runners load. |
| `exporter.polling.cadence.freshness` | `PT10M` | `FreshnessAlarmRunner.schedule()` fixed delay. |
| `exporter.polling.cadence.heartbeat` | `PT1M` | `HeartbeatRunner.emit()` fixed delay. |

OpenTelemetry-side configuration (`OTEL_EXPORTER_OTLP_ENDPOINT`,
`OTEL_RESOURCE_ATTRIBUTES`, sampler, etc.) is injected by the OTel Operator
in AKS and does not live in this repo.

---

## Repository layout

```
.
├── README.md                                 (this file)
├── pom.xml                                   Spring Boot 3.3.1, Java 21, CTS arc-* starters, JaCoCo 80% gate
├── .gitignore
├── ci/azure-pipelines.yml                    Pipeline trigger / template extension
├── docker/Dockerfile                         OpenJDK 21 slim, non-root java user
├── atlas-functions/
│   ├── seed_test_data.mongosh.js             One-shot Atlas bootstrap (collections + sample docs)
│   ├── simulate_segment_mode_changed.js      Atlas Function for PL7055 / PL7087
│   └── simulate_toll_control_file_registered.js  Atlas Function for PL7093
└── src/
    ├── main/java/com/cts/ms/tsmng/alarm/exporter/
    │   ├── MsTsmngAlarmExporterApplication.java   @SpringBootApplication + @EnableScheduling
    │   ├── config/                                ExporterProperties, MongoConfig, OpenTelemetryConfig, SecurityConfig(+Properties), WebConfig, OpenApiConfig
    │   ├── controller/
    │   │   ├── EventsController.java              Webhook endpoints — POST /internal/events/v1/{segment-mode-changed,toll-control-file-registered}
    │   │   └── filter/
    │   │       ├── CorrelationIdFilter.java       X-Correlation-Id propagation into MDC + active span
    │   │       └── HmacSignatureFilter.java       HMAC-SHA256 verification + cached-body wrapper
    │   ├── dto/                                   Inbound webhook DTOs
    │   ├── domain/                                _inbox (outbox) and _inbox_seen (dedupe) documents
    │   ├── persistence/                           Spring Data Mongo repositories
    │   ├── service/
    │   │   ├── EventProcessor.java                Dispatch: dedupe check → outbox enqueue
    │   │   ├── idempotency/IdempotencyService.java  LRU + durable _inbox_seen lookup
    │   │   ├── outbox/                            OutboxService (enqueue) + OutboxWorker (@Scheduled drain)
    │   │   └── metrics/AlarmMetricsEmitter.java   OTel counter emission per event type
    │   └── polling/
    │       ├── AbstractAlarmRunner.java           Base for scheduled runners (iterates concessions)
    │       ├── FreshnessAlarmRunner.java          Pattern A placeholder — PL7053 stub
    │       └── HeartbeatRunner.java               tsmng.exporter.heartbeat dead-man's switch
    │   └── resources/
    │       ├── application.yml                    Default config (Spring, security, springdoc, actuator, exporter.*)
    │       └── logback-spring.xml                 JSON encoder, MDC trace_id/span_id, com.cts DEBUG only on dev profile
    └── test/
        ├── java/com/cts/ms/tsmng/alarm/exporter/  Application + config + controller tests
        └── resources/application-test.yml         Vault off, outbox off, polling off, Mongo points at localhost
```

---

## Health-check after a fresh deploy

Once the exporter is running in AKS and the OTel agent is injected, sanity
check the full chain:

1. **Webhook contract** — fire a manual `Run` of `simulate_segment_mode_changed`
   from the Atlas Functions UI. Expect a `202` in the function log.
2. **Outbox** — query `tsmng-test._inbox` in Atlas; the new event should
   appear with `processed: false`, then flip to `processed: true` within
   ~5 s once `OutboxWorker.drain()` runs.
3. **Metric emission** — search Azure Monitor / App Insights for the
   `tsmng.mm.entered_total` counter; it should increment for the concession
   the event carried.
4. **Heartbeat** — the `tsmng.exporter.heartbeat` counter should advance
   every minute. Configure a metric alert on **"no data" ≥ 2 cycles** as
   the dead-man's switch.
