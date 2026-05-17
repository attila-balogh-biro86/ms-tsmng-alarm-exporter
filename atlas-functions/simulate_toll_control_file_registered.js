/**
 * simulate_toll_control_file_registered
 * ----------------------------------------------------------------------------
 * Sends a synthetic PL7093 event ("new toll-control file registered") to the
 * TSMNG alarm exporter, signed with the same HMAC scheme the real Atlas
 * Database Trigger will use.
 *
 * Modes of invocation
 * -------------------
 *   1. Manual "Run" from the Atlas Functions UI — pass an arg object via the
 *      Console panel, or leave it empty and dummy values will be generated.
 *        > exports({ concession: "DFW", fileId: "TC-2026-05-18-001" })
 *
 *   2. Scheduled Trigger — no argument is passed; the function generates a
 *      randomized synthetic fileId and POSTs it. Useful for end-to-end tests.
 *
 *   3. Database Trigger (insert-only on the toll-control collection) — the
 *      trigger passes a `changeEvent`. Replace `buildSyntheticPayload(arg)`
 *      below with `buildPayloadFromChangeEvent(arg)` (helper at the bottom).
 *
 * Required Atlas Values
 * ---------------------
 *   exporterBaseUrl         e.g. https://apim-eu-d-tsmng-01.azure-api.net/tsmng.cts.int/config/ms-tsmng-alarm-exporter
 *   apimSubscriptionKey     APIM subscription key for the exporter product
 *
 * Required Atlas Secret
 * ---------------------
 *   hmacSharedSecret        same value the exporter resolves into
 *                           ExporterProperties.hmac.sharedSecret
 */
exports = async function (arg) {
  const baseUrl = context.values.get("exporterBaseUrl");
  const apimKey = context.values.get("apimSubscriptionKey");
  const hmacKey = context.values.get("hmacSharedSecret");

  const payload = buildSyntheticPayload(arg);

  const body = JSON.stringify(payload);
  const signature = utils.crypto.hmac(body, hmacKey, "sha256", "hex");

  const response = await context.http.post({
    url: `${baseUrl}/internal/events/v1/toll-control-file-registered`,
    headers: {
      "Content-Type":              ["application/json"],
      "X-Tsmng-Signature":         [signature],
      "Ocp-Apim-Subscription-Key": [apimKey],
      "X-Correlation-Id":          [payload.eventId]
    },
    body: body
  });

  const status = response.statusCode;
  console.log(`toll-control-file-registered → exporter responded ${status} (eventId=${payload.eventId}, fileId=${payload.fileId})`);

  if (status >= 400) {
    const responseBody = response.body ? response.body.text() : "";
    console.error(`exporter rejected: ${status} ${responseBody}`);
  }
  return { statusCode: status, eventId: payload.eventId, payload: payload };
};

/* ------------------------------------------------------------------------- */

function buildSyntheticPayload(arg) {
  const a = arg || {};
  const concessions = ["DFW", "I77", "I66"];
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return {
    eventId:    a.eventId    || `sim-${BSON.UUID().toString()}`,
    concession: a.concession || pick(concessions),
    fileId:     a.fileId     || `TC-${today}-${String(randomInt(1, 999)).padStart(3, "0")}`,
    occurredAt: new Date().toISOString()
  };
}

function pick(arr)            { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max)  { return Math.floor(Math.random() * (max - min + 1)) + min; }

/* ------------------------------------------------------------------------- */
/* Example shape for a real Database Trigger handler.                         */
/* For PL7093 the trigger should be configured for inserts on the toll-       */
/* control-file collection (no need for fullDocumentBeforeChange — there is   */
/* no prior state for an insert).                                             */
/* ------------------------------------------------------------------------- */
// eslint-disable-next-line no-unused-vars
function buildPayloadFromChangeEvent(changeEvent) {
  const doc = changeEvent.fullDocument || {};
  return {
    eventId:    changeEvent._id._data, // Atlas resume token — unique per oplog entry
    concession: doc.concession,
    fileId:     doc.fileId || (doc._id && doc._id.toString()),
    occurredAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString()
  };
}
