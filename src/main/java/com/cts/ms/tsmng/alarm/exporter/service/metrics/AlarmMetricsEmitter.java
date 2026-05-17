package com.cts.ms.tsmng.alarm.exporter.service.metrics;

import com.cts.ms.tsmng.alarm.exporter.domain.InboxEntry;
import com.cts.ms.tsmng.alarm.exporter.service.EventProcessor;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Translates outbox entries into OTel counter increments.
 *
 * The OTel SDK is installed at runtime by the Java agent injected via the
 * OTel Operator; locally GlobalOpenTelemetry returns the no-op instance so
 * tests/dev have no side effects.
 *
 * Polling runners use this same emitter — pass a synthetic InboxEntry or
 * inject this bean directly. Metric naming follows the conventions in the
 * architecture decision document.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AlarmMetricsEmitter {

    private static final String INSTRUMENTATION_NAME = "ms-tsmng-alarm-exporter";
    private static final AttributeKey<String> ATTR_CONCESSION = AttributeKey.stringKey("concession");
    private static final AttributeKey<String> ATTR_SEGMENT = AttributeKey.stringKey("segment");

    private final OpenTelemetry openTelemetry;

    private LongCounter mmEnteredTotal;
    private LongCounter mmExitedTotal;
    private LongCounter tcFileRegisteredTotal;

    @PostConstruct
    void init() {
        Meter meter = openTelemetry.meterBuilder(INSTRUMENTATION_NAME).build();
        mmEnteredTotal = meter.counterBuilder("tsmng.mm.entered_total")
            .setDescription("PL7055 — segment Mandatory Mode entries")
            .setUnit("1")
            .build();
        mmExitedTotal = meter.counterBuilder("tsmng.mm.exited_total")
            .setDescription("PL7087 — segment Mandatory Mode exits")
            .setUnit("1")
            .build();
        tcFileRegisteredTotal = meter.counterBuilder("tsmng.tollcontrol.registered_total")
            .setDescription("PL7093 — toll-control files registered")
            .setUnit("1")
            .build();
    }

    public void emit(InboxEntry entry) {
        Attributes baseAttrs = Attributes.of(ATTR_CONCESSION, entry.getConcession());

        switch (entry.getEventType()) {
            case EventProcessor.EVENT_TYPE_SEGMENT_MODE -> {
                // TODO: parse entry.getPayload() to SegmentModeChangedEvent, branch on
                //       oldMode/newMode, attach ATTR_SEGMENT, and increment the right counter.
                //       Left as a stub so the skeleton compiles without payload routing logic.
                log.debug("Segment mode change event {} routed (skeleton stub)", entry.getEventId());
                mmEnteredTotal.add(0, baseAttrs);
                mmExitedTotal.add(0, baseAttrs);
            }
            case EventProcessor.EVENT_TYPE_TOLL_CONTROL ->
                tcFileRegisteredTotal.add(1, baseAttrs);
            default ->
                throw new IllegalArgumentException("Unknown event type: " + entry.getEventType());
        }
    }
}
