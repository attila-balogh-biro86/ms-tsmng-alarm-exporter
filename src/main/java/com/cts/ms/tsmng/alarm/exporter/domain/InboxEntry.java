package com.cts.ms.tsmng.alarm.exporter.domain;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Outbox row: an event accepted from an Atlas Trigger that the OutboxWorker
 * will forward to the OTel collector. Persisted in the same Atlas cluster as
 * the source data so durability is co-located.
 */
@Document("_inbox")
@Data
public class InboxEntry {

    @Id
    private String id;

    /** Atlas change-stream resume token; uniquely identifies the source event. */
    @Indexed(unique = true)
    private String eventId;

    /** Logical event type — matches the webhook path leaf, e.g. "segment-mode-changed". */
    private String eventType;

    private String concession;

    private Instant occurredAt;

    private Instant enqueuedAt;

    /** Serialized DTO; OutboxWorker decodes per eventType. */
    private String payload;

    private boolean processed;

    private Instant processedAt;
}
