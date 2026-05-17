package com.cts.ms.tsmng.alarm.exporter.service.outbox;

import com.cts.ms.tsmng.alarm.exporter.domain.InboxEntry;
import com.cts.ms.tsmng.alarm.exporter.persistence.InboxRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZonedDateTime;

@Service
@RequiredArgsConstructor
public class OutboxService {

    private final InboxRepository repository;
    private final ObjectMapper objectMapper;

    /**
     * Persists an inbound event to the outbox before the controller acks Atlas.
     * The OutboxWorker drains the collection and is the only component that
     * emits OTel signals.
     */
    public void enqueue(String eventType,
                        String eventId,
                        String concession,
                        ZonedDateTime occurredAt,
                        Object payload) {
        InboxEntry entry = new InboxEntry();
        entry.setEventId(eventId);
        entry.setEventType(eventType);
        entry.setConcession(concession);
        entry.setOccurredAt(occurredAt.toInstant());
        entry.setEnqueuedAt(Instant.now());
        entry.setPayload(serialize(payload));
        entry.setProcessed(false);
        try {
            repository.save(entry);
        } catch (DuplicateKeyException ignored) {
            // Re-delivery of an already-enqueued event; safe to drop.
        }
    }

    private String serialize(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Cannot serialize event payload", ex);
        }
    }
}
