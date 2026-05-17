package com.cts.ms.tsmng.alarm.exporter.polling;

import com.cts.ms.tsmng.alarm.exporter.config.ExporterProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Pattern A — freshness gauges. Placeholder runner illustrating the structure
 * for alarms PL7053, PL7070, PL7710, PL7717, and similar absence-of-event
 * gauges where the metric is "minutes since last X".
 *
 * Replace the per-concession TODO with an aggregation pipeline against the
 * relevant Atlas collection and emit a `tsmng.<entity>.minutes_since_last_*`
 * gauge via the AlarmMetricsEmitter.
 */
@Component
@Slf4j
@ConditionalOnProperty(prefix = "exporter.polling", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FreshnessAlarmRunner extends AbstractAlarmRunner {

    public FreshnessAlarmRunner(ExporterProperties properties) {
        super(properties);
    }

    @Override
    public String name() {
        return "freshness-pattern-a";
    }

    @Scheduled(fixedDelayString = "${exporter.polling.cadence.freshness:PT10M}")
    public void schedule() {
        runForAllConcessions();
    }

    @Override
    protected void runForConcession(String concession) {
        // TODO: implement PL7053 (TSM no MVD), PL7070, PL7710, PL7717 per concession.
        //       Query Atlas, compute `now - max(timestamp)` in minutes per segment,
        //       emit `tsmng.mvd.minutes_since_last` gauge with concession+segment dimensions.
        log.debug("Freshness runner placeholder — concession={}", concession);
    }
}
