package com.cts.ms.tsmng.alarm.exporter.polling;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Dead-man's switch. Azure Monitor metric alert configured to fire on
 * "no data" for ≥ 2 cycles. Increments on every cycle; if the exporter
 * is alive the counter advances, if it's dead the alert opens.
 */
@Component
@RequiredArgsConstructor
public class HeartbeatRunner {

    private static final String INSTRUMENTATION_NAME = "ms-tsmng-alarm-exporter";

    private final OpenTelemetry openTelemetry;
    private LongCounter heartbeat;

    @PostConstruct
    void init() {
        Meter meter = openTelemetry.meterBuilder(INSTRUMENTATION_NAME).build();
        heartbeat = meter.counterBuilder("tsmng.exporter.heartbeat")
            .setDescription("Exporter heartbeat — alert on no-data for liveness")
            .setUnit("1")
            .build();
    }

    @Scheduled(fixedDelayString = "${exporter.polling.cadence.heartbeat:PT1M}")
    public void emit() {
        heartbeat.add(1);
    }
}
