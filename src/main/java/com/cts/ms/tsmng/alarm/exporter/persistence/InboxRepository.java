package com.cts.ms.tsmng.alarm.exporter.persistence;

import com.cts.ms.tsmng.alarm.exporter.domain.InboxEntry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface InboxRepository extends MongoRepository<InboxEntry, String> {

    List<InboxEntry> findByProcessedFalseOrderByEnqueuedAtAsc(Pageable pageable);
}
