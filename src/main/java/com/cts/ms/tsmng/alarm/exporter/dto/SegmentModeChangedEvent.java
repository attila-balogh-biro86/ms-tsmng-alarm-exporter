package com.cts.ms.tsmng.alarm.exporter.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.ZonedDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SegmentModeChangedEvent {

    /** Atlas change-stream resume token; used for idempotency. */
    @NotBlank
    private String eventId;

    @NotBlank
    private String concession;

    @NotBlank
    private String segment;

    @NotBlank
    private String oldMode;

    @NotBlank
    private String newMode;

    @NotNull
    private ZonedDateTime occurredAt;
}
