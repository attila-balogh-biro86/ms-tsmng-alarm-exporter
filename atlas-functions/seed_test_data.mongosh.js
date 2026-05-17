// =============================================================================
// Seed test data for the TSMNG alarm exporter pipeline.
// =============================================================================
//
// Purpose
// -------
// Initialize an empty MongoDB Atlas cluster with the collections + sample
// documents that the Atlas Database Triggers (and the future polling runners)
// will act on. After running this you can:
//   * fire the simulate_segment_mode_changed function via a real Database
//     Trigger by updating a `segments` doc;
//   * fire the simulate_toll_control_file_registered function by inserting
//     into the `toll_control_files` collection;
//   * write the first polling runner against `mvd_events` for PL7053.
//
// How to run
// ----------
// Option A — Atlas UI:
//   1. In the cluster, click "Connect" → "MongoDB Shell" and copy the URI.
//   2. Run:   mongosh "<uri>" --file seed_test_data.mongosh.js
//
// Option B — Atlas UI shell panel:
//   1. Open the cluster → Collections → click the small terminal icon to
//      open the MongoDB Shell pane.
//   2. Paste this file's contents and press Enter.
//
// Option C — MongoDB Compass:
//   1. Open Compass → connect to the cluster → MONGOSH tab.
//   2. Paste this file's contents.
//
// Notes
// -----
// * The database name is "tsmng-test" by default — change DB_NAME below to
//   whatever your team uses (in prod, one database per concession is common).
// * The script is idempotent: each collection is dropped and re-seeded.
//   DO NOT run against a database that already has real data.
// * Field names (e.g. `segmentId`, `tollMode`) are placeholders to be
//   reconciled with the actual TSMNG schema before wiring the real triggers.
// =============================================================================

const DB_NAME = "tsmng-test";
const tsmng = db.getSiblingDB(DB_NAME);

print(`\n--- seeding database '${DB_NAME}' ---\n`);

// -----------------------------------------------------------------------------
// 1. segments  — toll-mode state per (concession, segmentId)
//
// Used by:
//   * PL7055 (Trigger on UPDATE of tollMode: REGULAR → MANDATORY)
//   * PL7087 (Trigger on UPDATE of tollMode: MANDATORY → REGULAR)
//
// Trigger configuration (Atlas UI → Triggers → Add Trigger):
//   Operation Type:         Update
//   Collection:             segments
//   Full Document:          updateLookup
//   Full Document Before:   whenAvailable
//   Match Expression:       { "updateDescription.updatedFields.tollMode": { "$exists": true } }
//   Function:               simulate_segment_mode_changed
// -----------------------------------------------------------------------------
tsmng.segments.drop();
tsmng.segments.createIndex({ concession: 1, segmentId: 1 }, { unique: true });
tsmng.segments.createIndex({ concession: 1, tollMode: 1 });
tsmng.segments.insertMany([
  { concession: "DFW", segmentId: "S001", tollMode: "REGULAR",   modifiedAt: new Date(), modifiedBy: "seed" },
  { concession: "DFW", segmentId: "S002", tollMode: "REGULAR",   modifiedAt: new Date(), modifiedBy: "seed" },
  { concession: "DFW", segmentId: "S003", tollMode: "MANDATORY", modifiedAt: new Date(), modifiedBy: "seed" },
  { concession: "I77", segmentId: "S010", tollMode: "REGULAR",   modifiedAt: new Date(), modifiedBy: "seed" },
  { concession: "I77", segmentId: "S011", tollMode: "REGULAR",   modifiedAt: new Date(), modifiedBy: "seed" },
  { concession: "I66", segmentId: "S020", tollMode: "REGULAR",   modifiedAt: new Date(), modifiedBy: "seed" },
  { concession: "I66", segmentId: "S021", tollMode: "REGULAR",   modifiedAt: new Date(), modifiedBy: "seed" }
]);
print(`✓ segments                          : ${tsmng.segments.countDocuments()} docs`);

// -----------------------------------------------------------------------------
// 2. toll_control_files  — registry of TC / TSA file uploads
//
// Used by:
//   * PL7093 (Trigger on INSERT)
//   * PL7061 / PL_new (polling — "are weekend/week TC+TSA files configured?")
//
// Trigger configuration:
//   Operation Type:         Insert
//   Collection:             toll_control_files
//   Full Document:          updateLookup (insert always gives the full doc)
//   Function:               simulate_toll_control_file_registered
// -----------------------------------------------------------------------------
tsmng.toll_control_files.drop();
tsmng.toll_control_files.createIndex({ concession: 1, fileId: 1 }, { unique: true });
tsmng.toll_control_files.createIndex({ concession: 1, fileType: 1, effectiveFrom: 1 });

// A small initial population so polling alarms (PL7061) have something to look at.
// The simulate function reads `_id._data` as the eventId so we don't need to add
// anything special here — just realistic-looking starter docs.
const today = new Date();
const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
const weekEnd   = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);

tsmng.toll_control_files.insertMany([
  { concession: "DFW", fileId: "TC-2026-05-15-001",  fileType: "TC",  effectiveFrom: weekStart, effectiveTo: weekEnd, isDefault: true,  createdAt: new Date() },
  { concession: "DFW", fileId: "TSA-2026-05-15-001", fileType: "TSA", effectiveFrom: weekStart, effectiveTo: weekEnd, isDefault: true,  createdAt: new Date() },
  { concession: "I77", fileId: "TC-2026-05-15-001",  fileType: "TC",  effectiveFrom: weekStart, effectiveTo: weekEnd, isDefault: true,  createdAt: new Date() },
  { concession: "I66", fileId: "TC-2026-05-15-001",  fileType: "TC",  effectiveFrom: weekStart, effectiveTo: weekEnd, isDefault: false, createdAt: new Date() }
]);
print(`✓ toll_control_files                : ${tsmng.toll_control_files.countDocuments()} docs`);

// -----------------------------------------------------------------------------
// 3. mvd_events  — incoming MVDs from gantries (sample shape)
//
// Used by future polling runners (no Trigger):
//   * PL7053  — minutes since last MVD per (concession, segmentId)
//   * PL7070  — MVD delayed (receivedAt − timestamp > threshold)
//   * PL7074  — MVD speed too high / too low
//   * PL7709  — MVD volume < 30 % expected per segment
//   * PL7717  — MVD future-dated
//
// Sample timestamps are spread across the last few minutes so the freshness
// queries return non-trivial values immediately.
// -----------------------------------------------------------------------------
tsmng.mvd_events.drop();
tsmng.mvd_events.createIndex({ concession: 1, segmentId: 1, timestamp: -1 });
tsmng.mvd_events.createIndex({ receivedAt: -1 });

const now = Date.now();
const ago = (sec) => new Date(now - sec * 1000);
tsmng.mvd_events.insertMany([
  { concession: "DFW", segmentId: "S001", timestamp: ago(45),  receivedAt: ago(44),  speed: 65, volume: 12 },
  { concession: "DFW", segmentId: "S002", timestamp: ago(120), receivedAt: ago(119), speed: 58, volume:  9 },
  { concession: "DFW", segmentId: "S003", timestamp: ago(900), receivedAt: ago(899), speed: 70, volume:  8 }, // > 10 min — would breach PL7053 default
  { concession: "I77", segmentId: "S010", timestamp: ago(30),  receivedAt: ago(29),  speed: 72, volume: 14 },
  { concession: "I77", segmentId: "S011", timestamp: ago(75),  receivedAt: ago(74),  speed: 60, volume: 11 },
  { concession: "I66", segmentId: "S020", timestamp: ago(60),  receivedAt: ago(59),  speed: 68, volume: 10 }
]);
print(`✓ mvd_events                        : ${tsmng.mvd_events.countDocuments()} docs`);

// -----------------------------------------------------------------------------
// 4. master-metrics_dra_retraining  — explicit collection name from
//                                     TSMNG Alarms.xlsx (PL_new "re-training event stale")
//
// Used by future polling runners (no Trigger):
//   * PL_new — `nowUtc − max(insert_time)` in days; alert > 2 days.
// -----------------------------------------------------------------------------
tsmng["master-metrics_dra_retraining"].drop();
tsmng["master-metrics_dra_retraining"].createIndex({ concession: 1, insert_time: -1 });
tsmng["master-metrics_dra_retraining"].insertMany([
  { concession: "DFW", insert_time: ago(24 * 3600 * 1),   status: "OK" }, // 1 day ago
  { concession: "I77", insert_time: ago(24 * 3600 * 2),   status: "OK" }, // 2 days ago
  { concession: "I66", insert_time: ago(24 * 3600 * 3.5), status: "OK" }  // 3.5 days — would breach
]);
print(`✓ master-metrics_dra_retraining     : ${tsmng["master-metrics_dra_retraining"].countDocuments()} docs`);

print(`\n--- done. ---\n`);

// =============================================================================
// How to fire each trigger after seeding
// =============================================================================
//
// Run these one at a time from mongosh (or paste into the Atlas Shell panel)
// after the Database Triggers are wired to your Atlas Function.
//
// -----------------------------------------------------------------------------
// PL7055 — segment enters Mandatory Mode  (simulate_segment_mode_changed)
// -----------------------------------------------------------------------------
//
//   use tsmng-test
//   db.segments.updateOne(
//     { concession: "DFW", segmentId: "S001" },
//     { $set: { tollMode: "MANDATORY", modifiedAt: new Date(), modifiedBy: "manual-test" } }
//   )
//
// -----------------------------------------------------------------------------
// PL7087 — segment exits Mandatory Mode   (simulate_segment_mode_changed)
// -----------------------------------------------------------------------------
//
//   db.segments.updateOne(
//     { concession: "DFW", segmentId: "S003" },
//     { $set: { tollMode: "REGULAR", modifiedAt: new Date(), modifiedBy: "manual-test" } }
//   )
//
// -----------------------------------------------------------------------------
// PL7093 — new toll-control file registered  (simulate_toll_control_file_registered)
// -----------------------------------------------------------------------------
//
//   db.toll_control_files.insertOne({
//     concession:    "DFW",
//     fileId:        "TC-" + new Date().toISOString().slice(0,10) + "-999",
//     fileType:      "TC",
//     effectiveFrom: new Date(),
//     effectiveTo:   new Date(Date.now() + 7 * 24 * 3600 * 1000),
//     isDefault:     false,
//     createdAt:     new Date()
//   })
//
// In each case you should see:
//   * the Trigger fire in Atlas (App Services → Logs → Triggers),
//   * the Function POST succeed with status 202,
//   * the exporter create an _inbox row, then drain it via OutboxWorker,
//   * the OTel counter (tsmng.mm.*_total or tsmng.tollcontrol.registered_total)
//     increment for that concession.
// =============================================================================
