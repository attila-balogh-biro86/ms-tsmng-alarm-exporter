package com.cts.ms.tsmng.alarm.exporter.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "exporter")
@Data
public class ExporterProperties {

    /** Concession codes (DFW, I77, I66, …) that this exporter iterates over for polling alarms. */
    private List<String> concessions = new ArrayList<>();

    private Hmac hmac = new Hmac();
    private Outbox outbox = new Outbox();
    private Polling polling = new Polling();

    @Data
    public static class Hmac {
        /** Shared secret for verifying X-Tsmng-Signature on /internal/events/**. Resolved from Vault in prod. */
        private String sharedSecret;
        private String headerName = "X-Tsmng-Signature";
    }

    @Data
    public static class Outbox {
        private boolean enabled = true;
        private Duration retention = Duration.ofDays(7);
        private int batchSize = 100;
        private Duration drainInterval = Duration.ofSeconds(5);
    }

    @Data
    public static class Polling {
        private boolean enabled = true;
        /** Default cadence; per-alarm runners can override via @Scheduled placeholder values. */
        private Duration defaultCadence = Duration.ofMinutes(10);
    }
}
