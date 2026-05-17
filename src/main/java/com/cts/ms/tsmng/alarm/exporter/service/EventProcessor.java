package com.cts.ms.tsmng.alarm.exporter.service;

import com.cts.ms.tsmng.alarm.exporter.dto.SegmentModeChangedEvent;
import com.cts.ms.tsmng.alarm.exporter.dto.TollControlFileRegisteredEvent;
import com.cts.ms.tsmng.alarm.exporter.service.idempotency.IdempotencyService;
import com.cts.ms.tsmng.alarm.exporter.service.outbox.OutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Dispatch point invoked by the webhook controller. Performs idempotency
 * check then hands off to the outbox; metric emission happens in the
 * OutboxWorker so the controller's response is fast and the path is
 * survivable across exporter restarts.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EventProcessor {

    public static final String EVENT_TYPE_SEGMENT_MODE = "segment-mode-changed";
    public static final String EVENT_TYPE_TOLL_CONTROL = "toll-control-file-registered";

    private final IdempotencyService idempotency;
    private final OutboxService outbox;

    public void processSegmentModeChanged(SegmentModeChangedEvent event) {
        if (idempotency.alreadyProcessed(event.getEventId())) {
            log.debug("Duplicate event ignored: {}", event.getEventId());
            return;
        }
        outbox.enqueue(EVENT_TYPE_SEGMENT_MODE,
                       event.getEventId(),
                       event.getConcession(),
                       event.getOccurredAt(),
                       event);
    }

    public void processTollControlFileRegistered(TollControlFileRegisteredEvent event) {
        if (idempotency.alreadyProcessed(event.getEventId())) {
            log.debug("Duplicate event ignored: {}", event.getEventId());
            return;
        }
        outbox.enqueue(EVENT_TYPE_TOLL_CONTROL,
                       event.getEventId(),
                       event.getConcession(),
                       event.getOccurredAt(),
                       event);
    }
}
