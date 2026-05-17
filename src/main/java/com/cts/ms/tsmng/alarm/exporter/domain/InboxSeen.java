package com.cts.ms.tsmng.alarm.exporter.domain;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Cross-restart durable dedupe record. The IdempotencyService keeps a small
 * in-memory LRU for the hot path; this collection is the source of truth
 * across pod restarts. Documents expire automatically via a TTL index.
 */
@Document("_inbox_seen")
@Data
public class InboxSeen {

    @Id
    private String id;

    @Indexed(unique = true)
    private String eventId;

    /** TTL — Mongo will purge after the configured retention (default 7 days). */
    @Indexed(expireAfterSeconds = 604_800)
    private Instant seenAt;
}
