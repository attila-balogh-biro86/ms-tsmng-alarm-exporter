/**
 * simulate_segment_mode_changed
 * ----------------------------------------------------------------------------
 * Atlas Database Trigger handler for segment toll-mode transitions:
 *   PL7055 — REGULAR   → MANDATORY  (gantries entered Mandatory Mode)
 *   PL7087 — MANDATORY → REGULAR    (Mandatory Mode ended)
 *
 * Receives a `changeEvent` from the trigger, builds the domain payload from
 * `fullDocumentBeforeChange` + `fullDocument`, HMAC-SHA256 signs it, and
 * POSTs to the TSMNG alarm exporter's webhook endpoint.
 *
 * Trigger configuration (Atlas UI → Triggers → Add Trigger)
 * ---------------------------------------------------------
 *   Operation Type:            Update
 *   Collection:                segments
 *   Full Document:             updateLookup
 *   Full Document Before:      whenAvailable
 *   Match Expression:          { "updateDescription.updatedFields.tollMode": { "$exists": true } }
 *   Function:                  simulate_segment_mode_changed
 *
 * The Match Expression restricts firing to actual tollMode updates; the
 * in-function guards below are defense in depth.
 *
 * Test configuration (hardcoded — see CONFIG block below)
 * -------------------------------------------------------
 * For the testing phase the three settings the function needs
 * (exporter base URL, APIM subscription key, HMAC shared secret) are
 * inlined at the top of this file instead of being read from Atlas
 * Values & Secrets. Replace each <PLACEHOLDER> below with the value
 * for your test target. Move to a proper secret store before any
 * production deployment.
 *
 * Retry semantics
 * ---------------
 * Throwing from this function causes Atlas to retry the invocation (up to
 * its configured retry policy). We deliberately throw on any non-2xx
 * response so transient exporter unavailability is replayed. The exporter's
 * IdempotencyService dedupes by `eventId`, so retries are safe.
 */

// =========================================================================
// TEST CONFIG (hardcoded). Do NOT commit real secrets.
// =========================================================================
//   EXPORTER_BASE_URL
//     Where the function POSTs the event. Examples:
//       - Tunneled local exporter:   https://abcd-1234.ngrok-free.app
//       - Behind APIM (production):  https://apim-eu-d-tsmng-01.azure-api.net/tsmng.cts.int/config/ms-tsmng-alarm-exporter
//   APIM_SUBSCRIPTION_KEY
//     Ocp-Apim-Subscription-Key header. Ignored by a directly-reached
//     exporter (no APIM in the path), so any non-empty placeholder works
//     for direct-to-tunnel testing. Required when APIM gates the call.
//   HMAC_SHARED_SECRET
//     Must match what the exporter resolves as ExporterProperties.hmac.sharedSecret.
//     The default below matches application.yml's local fallback so a
//     locally-running exporter accepts the signature without further setup.
// =========================================================================
const EXPORTER_BASE_URL     = "<PASTE EXPORTER BASE URL HERE>";
const APIM_SUBSCRIPTION_KEY = "<PASTE APIM SUBSCRIPTION KEY HERE>";
const HMAC_SHARED_SECRET    = "change-me-local-only";

exports = async function (changeEvent) {

  // --------------------------------------------------------------------- //
  // Guard 1: Database Triggers always pass a changeEvent. If invoked from //
  // "Run" without one, exit cleanly.                                      //
  // --------------------------------------------------------------------- //
  if (!changeEvent) {
    console.log("no changeEvent supplied (manual Run?) — skipping");
    return { skipped: "no-change-event" };
  }

  // --------------------------------------------------------------------- //
  // Guard 2: only act on updates. Inserts/deletes/replaces on `segments`  //
  // are not mode transitions and would produce garbage events.            //
  // --------------------------------------------------------------------- //
  if (changeEvent.operationType !== "update") {
    console.log(`skipping operationType=${changeEvent.operationType} — only "update" is in scope`);
    return { skipped: "non-update", operationType: changeEvent.operationType };
  }

  const doc     = changeEvent.fullDocument            || {};
  const prevDoc = changeEvent.fullDocumentBeforeChange || {};

  // --------------------------------------------------------------------- //
  // Guard 3: the trigger must have "Full Document Before Change =         //
  // whenAvailable". Without it we can't tell oldMode → newMode apart.     //
  // --------------------------------------------------------------------- //
  if (!prevDoc.tollMode) {
    console.warn("fullDocumentBeforeChange missing tollMode — enable 'Full Document Before Change' on the trigger");
    return { skipped: "missing-previous-document" };
  }

  // --------------------------------------------------------------------- //
  // Guard 4: ignore updates that touched other fields but left tollMode   //
  // unchanged. The Match Expression on the trigger should cover this,    //
  // but better cheap and explicit than relying on the trigger config.    //
  // --------------------------------------------------------------------- //
  if (prevDoc.tollMode === doc.tollMode) {
    console.log(`skipping — tollMode unchanged (${doc.tollMode})`);
    return { skipped: "no-mode-transition", tollMode: doc.tollMode };
  }

  // --------------------------------------------------------------------- //
  // Build the payload. The exporter expects:                              //
  //   eventId       string   — used for idempotency (resume-token based)  //
  //   concession    string                                                //
  //   segment       string                                                //
  //   oldMode       string                                                //
  //   newMode       string                                                //
  //   occurredAt    ISO-8601 string with offset (parsed as ZonedDateTime) //
  // --------------------------------------------------------------------- //
  const payload = {
    // changeEvent._id is the resume token; ._data is its stable string form.
    eventId:    String(changeEvent._id && (changeEvent._id._data || changeEvent._id)),
    concession: doc.concession,
    segment:    doc.segmentId,
    oldMode:    prevDoc.tollMode,
    newMode:    doc.tollMode,
    occurredAt: (doc.modifiedAt && doc.modifiedAt.toISOString())
                || new Date().toISOString()
  };

  // --------------------------------------------------------------------- //
  // Sign + POST.                                                          //
  // The body string MUST be exactly the bytes we HMAC — JSON.stringify    //
  // (NOT EJSON), and reuse the same `body` variable in both calls.        //
  // --------------------------------------------------------------------- //
  const body      = JSON.stringify(payload);
  const signature = utils.crypto.hmac(body, HMAC_SHARED_SECRET, "sha256", "hex");

  const response = await context.http.post({
    url: `${EXPORTER_BASE_URL}/internal/events/v1/segment-mode-changed`,
    headers: {
      "Content-Type":              ["application/json"],
      "X-Tsmng-Signature":         [signature],
      "Ocp-Apim-Subscription-Key": [APIM_SUBSCRIPTION_KEY],
      "X-Correlation-Id":          [payload.eventId]
    },
    body: body
  });

  const status = response.statusCode;
  console.log(
    `segment-mode-changed: ${payload.concession}/${payload.segment} ` +
    `${payload.oldMode}→${payload.newMode} → exporter ${status} ` +
    `(eventId=${payload.eventId})`
  );

  if (status >= 400) {
    const responseBody = response.body ? response.body.text() : "";
    console.error(`exporter rejected: ${status} ${responseBody}`);
    // Throwing makes Atlas retry per its trigger retry policy.
    // Safe — the exporter dedupes by eventId.
    throw new Error(`exporter responded ${status}`);
  }

  return { statusCode: status, eventId: payload.eventId, payload: payload };
};
