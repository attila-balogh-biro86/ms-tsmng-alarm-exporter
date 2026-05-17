package com.cts.ms.tsmng.alarm.exporter.persistence;

import com.cts.ms.tsmng.alarm.exporter.domain.InboxSeen;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface InboxSeenRepository extends MongoRepository<InboxSeen, String> {

    boolean existsByEventId(String eventId);
}
