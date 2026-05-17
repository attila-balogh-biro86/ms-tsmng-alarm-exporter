/**
 * simulate_segment_mode_changed
 * ----------------------------------------------------------------------------
 * Sends a synthetic PL7055 / PL7087 event to the TSMNG alarm exporter,
 * signed with the same HMAC scheme the real Atlas Database Trigger will use.
 *
 * Modes of invocation
 * -------------------
 *   1. Manual "Run" from the Atlas Functions UI — pass an arg object via the
 *      Console panel or leave it empty and dummy values will be generated.
 *        > exports({ concession: "I77", segment: "S42", newMode: "MANDATORY" })
 *
 *   2. Scheduled Trigger — no argument is passed; the function generates
 *      randomized synthetic data and POSTs it. Use this to load-test the
 *      receiver, exercise the outbox, or verify alert routing.
 *
 *   3. Database Trigger — the trigger passes a `changeEvent` argument.
 *      Replace `buildSyntheticPayload(arg)` below with
 *      `buildPayloadFromChangeEvent(arg)` (the example helper at the bottom
 *      of this file) and the same body/HMAC/POST machinery applies.
 *
 * Required Atlas Values (App Services → Values & Secrets)
 * -------------------------------------------------------
 *   exporterBaseUrl         e.g. https://apim-eu-d-tsmng-01.azure-api.net/tsmng.cts.int/config/ms-tsmng-alarm-exporter
 *   apimSubscriptionKey     APIM subscription key for the exporter product
 *
 * Required Atlas Secret
 * ---------------------
 *   hmacSharedSecret        same value the exporter resolves into
 *                           ExporterProperties.hmac.sharedSecret (Vault-backed)
 */
exports = async function (arg) {
  const baseUrl = context.values.get("exporterBaseUrl");
  const apimKey = context.values.get("apimSubscriptionKey");
  const hmacKey = context.values.get("hmacSharedSecret");

  const payload = buildSyntheticPayload(arg);
A
  // The body string we send MUST be the exact same bytes we HMAC.
  // Use JSON.stringify (not EJSON) — the exporter expects plain JSON
  // and parses ISO-8601 strings into ZonedDateTime via Jackson.
  const body = JSON.stringify(payload);
  const signature = utils.crypto.hmac(body, hmacKey, "sha256", "hex");

  const response = await context.http.post({
    url: `${baseUrl}/internal/events/v1/segment-mode-changed`,
    headers: {
      "Content-Type":              ["application/json"],
      "X-Tsmng-Signature":         [signature],
      "Ocp-Apim-Subscription-Key": [apimKey],
      "X-Correlation-Id":          [payload.eventId]
    },
    body: body
  });

  const status = response.statusCode;
  console.log(`segment-mode-changed → exporter responded ${status} (eventId=${payload.eventId})`);

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
  const modes = ["REGULAR", "MANDATORY"];

  const newMode = a.newMode || pick(modes);
  // Pick an old mode that is *different* from the new mode so the event
  // semantically represents a real transition.
  const oldMode = a.oldMode || (newMode === "MANDATORY" ? "REGULAR" : "MANDATORY");

  return {
    eventId:    a.eventId    || `sim-${BSON.UUID().toString()}`,
    concession: a.concession || pick(concessions),
    segment:    a.segment    || `S${randomInt(1, 99)}`,
    oldMode:    oldMode,
    newMode:    newMode,
    occurredAt: new Date().toISOString()
  };
}

function pick(arr)            { return arr[Math.floor(Math.random() * arr.length)]; }
function randomInt(min, max)  { return Math.floor(Math.random() * (max - min + 1)) + min; }

/* ------------------------------------------------------------------------- */
/* Example shape for a real Database Trigger handler.                         */
/* When wiring this function to a Database Trigger configured with            */
/*   fullDocument          = updateLookup                                     */
/*   fullDocumentBeforeChange = whenAvailable                                 */
/* you receive a `changeEvent`. Replace buildSyntheticPayload(arg) above with */
/* buildPayloadFromChangeEvent(arg) to derive the payload from the real doc. */
/* ------------------------------------------------------------------------- */
// eslint-disable-next-line no-unused-vars
function buildPayloadFromChangeEvent(changeEvent) {
  const doc     = changeEvent.fullDocument            || {};
  const prevDoc = changeEvent.fullDocumentBeforeChange || {};
  return {
    eventId:    changeEvent._id._data, // Atlas resume token — unique per oplog entry
    concession: doc.concession,
    segment:    doc.segmentId,
    oldMode:    prevDoc.tollMode,
    newMode:    doc.tollMode,
    occurredAt: doc.modifiedAt ? doc.modifiedAt.toISOString() : new Date().toISOString()
  };
}
