package com.cts.ms.tsmng.alarm.exporter.service.idempotency;

import com.cts.ms.tsmng.alarm.exporter.domain.InboxSeen;
import com.cts.ms.tsmng.alarm.exporter.persistence.InboxSeenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Two-tier dedupe:
 *  - Hot path: bounded in-memory LRU. Survives within a single pod process.
 *  - Durable: _inbox_seen collection in Atlas with a TTL index. Survives restarts.
 *
 * Atlas Triggers retry on failure, so the same eventId may arrive several times.
 */
@Service
@RequiredArgsConstructor
public class IdempotencyService {

    private static final int LRU_CAPACITY = 10_000;

    private final InboxSeenRepository repository;

    private final Map<String, Boolean> lru = Collections.synchronizedMap(
        new LinkedHashMap<>(LRU_CAPACITY, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Boolean> eldest) {
                return size() > LRU_CAPACITY;
            }
        });

    public boolean alreadyProcessed(String eventId) {
        if (lru.containsKey(eventId)) {
            return true;
        }
        if (repository.existsByEventId(eventId)) {
            lru.put(eventId, Boolean.TRUE);
            return true;
        }
        return false;
    }

    public void markProcessed(String eventId) {
        lru.put(eventId, Boolean.TRUE);
        InboxSeen record = new InboxSeen();
        record.setEventId(eventId);
        record.setSeenAt(Instant.now());
        try {
            repository.save(record);
        } catch (DuplicateKeyException ignored) {
            // Concurrent marker insert — fine, the eventId is already tracked.
        }
    }
}
