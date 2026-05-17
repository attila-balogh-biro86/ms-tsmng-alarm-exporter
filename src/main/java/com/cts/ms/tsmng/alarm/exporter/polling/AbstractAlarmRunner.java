package com.cts.ms.tsmng.alarm.exporter.polling;

import com.cts.ms.tsmng.alarm.exporter.config.ExporterProperties;
import lombok.extern.slf4j.Slf4j;

/**
 * Base for scheduled alarm runners. Subclasses:
 *  - annotate their dispatch method with @Scheduled,
 *  - implement runForConcession(...) with the alarm logic,
 *  - emit metrics via AlarmMetricsEmitter.
 *
 * Each concession is processed independently — one failure does not abort the cycle.
 */
@Slf4j
public abstract class AbstractAlarmRunner {

    protected final ExporterProperties properties;

    protected AbstractAlarmRunner(ExporterProperties properties) {
        this.properties = properties;
    }

    /** Logical runner name (used in logs and self-monitoring metrics). */
    public abstract String name();

    /** Per-concession alarm logic. */
    protected abstract void runForConcession(String concession);

    protected final void runForAllConcessions() {
        for (String concession : properties.getConcessions()) {
            try {
                runForConcession(concession);
            } catch (Exception ex) {
                // TODO: increment tsmng.exporter.run_errors {runner=name(), concession=concession}
                log.warn("Runner {} failed for concession {}", name(), concession, ex);
            }
        }
    }
}
