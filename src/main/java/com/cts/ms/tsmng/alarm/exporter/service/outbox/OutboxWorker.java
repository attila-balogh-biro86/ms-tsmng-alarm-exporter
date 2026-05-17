package com.cts.ms.tsmng.alarm.exporter.service.outbox;

import com.cts.ms.tsmng.alarm.exporter.config.ExporterProperties;
import com.cts.ms.tsmng.alarm.exporter.domain.InboxEntry;
import com.cts.ms.tsmng.alarm.exporter.persistence.InboxRepository;
import com.cts.ms.tsmng.alarm.exporter.service.idempotency.IdempotencyService;
import com.cts.ms.tsmng.alarm.exporter.service.metrics.AlarmMetricsEmitter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(prefix = "exporter.outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
public class OutboxWorker {

    private final InboxRepository repository;
    private final IdempotencyService idempotency;
    private final AlarmMetricsEmitter emitter;
    private final ExporterProperties properties;

    @Scheduled(fixedDelayString = "${exporter.outbox.drain-interval:PT5S}")
    public void drain() {
        List<InboxEntry> batch = repository.findByProcessedFalseOrderByEnqueuedAtAsc(
            PageRequest.of(0, properties.getOutbox().getBatchSize()));

        for (InboxEntry entry : batch) {
            try {
                emitter.emit(entry);
                idempotency.markProcessed(entry.getEventId());
                entry.setProcessed(true);
                entry.setProcessedAt(Instant.now());
                repository.save(entry);
            } catch (Exception ex) {
                log.warn("Failed to emit outbox entry {} — will retry next drain", entry.getEventId(), ex);
            }
        }
    }
}
