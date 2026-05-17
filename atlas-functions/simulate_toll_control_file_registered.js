A/**
 * simulate_toll_control_file_registered
 * ----------------------------------------------------------------------------
 * Atlas Database Trigger handler for new toll-control file registrations:
 *   PL7093 — new toll-control file registered
 *
 * Receives an INSERT `changeEvent` from the trigger, extracts the new
 * document's identity fields, HMAC-SHA256 signs the payload, and POSTs to
 * the TSMNG alarm exporter's webhook endpoint.
 *
 * Trigger configuration (Atlas UI → Triggers → Add Trigger)
 * ---------------------------------------------------------
 *   Operation Type:            Insert
 *   Collection:                toll_control_files
 *   Full Document:             updateLookup
 *   Match Expression:          (none — fire on every insert)
 *   Function:                  simulate_toll_control_file_registered
 *
 * fullDocumentBeforeChange is NOT required — there is no prior state for
 * an insert. The trigger only needs Full Document = updateLookup.
 *
 * Test configuration (hardcoded — see CONFIG block below)
 * -------------------------------------------------------
 * For the testing phase the three settings the function needs are inlined
 * at the top of this file instead of being read from Atlas Values & Secrets.
 * Replace each <PLACEHOLDER> below with the value for your test target.
 * Move to a proper secret store before production deployment.
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
//     exporter (no APIM in the path). Required when APIM gates the call.
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
  // Guard 2: only act on inserts. PL7093 semantics: a *new* file just     //
  // appeared. Updates / deletes / replaces are out of scope.              //
  // --------------------------------------------------------------------- //
  if (changeEvent.operationType !== "insert") {
    console.log(`skipping operationType=${changeEvent.operationType} — only "insert" is in scope`);
    return { skipped: "non-insert", operationType: changeEvent.operationType };
  }

  const doc = changeEvent.fullDocument || {};

  // --------------------------------------------------------------------- //
  // Guard 3: required fields. The exporter's DTO rejects blank/missing    //
  // concession or fileId with 400 (@NotBlank); skip here with a clearer   //
  // log so the trigger record shows *why* the event was dropped.          //
  // --------------------------------------------------------------------- //
  if (!doc.concession || !doc.fileId) {
    console.warn(
      `skipping — inserted doc missing required field(s) ` +
      `(concession=${doc.concession}, fileId=${doc.fileId})`
    );
    return { skipped: "missing-required-fields", concession: doc.concession, fileId: doc.fileId };
  }

  // --------------------------------------------------------------------- //
  // Build the payload. The exporter expects:                              //
  //   eventId       string   — used for idempotency (resume-token based)  //
  //   concession    string                                                //
  //   fileId        string                                                //
  //   occurredAt    ISO-8601 string with offset (parsed as ZonedDateTime) //
  // --------------------------------------------------------------------- //
  const payload = {
    // changeEvent._id is the resume token; ._data is its stable string form.
    eventId:    String(changeEvent._id && (changeEvent._id._data || changeEvent._id)),
    concession: doc.concession,
    fileId:     doc.fileId,
    occurredAt: (doc.createdAt && doc.createdAt.toISOString())
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
    url: `${EXPORTER_BASE_URL}/internal/events/v1/toll-control-file-registered`,
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
    `toll-control-file-registered: ${payload.concession}/${payload.fileId} ` +
    `→ exporter ${status} (eventId=${payload.eventId})`
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
