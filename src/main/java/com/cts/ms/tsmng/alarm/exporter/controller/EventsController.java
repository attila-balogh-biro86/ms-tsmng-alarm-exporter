package com.cts.ms.tsmng.alarm.exporter.controller;

import com.cts.ms.tsmng.alarm.exporter.dto.SegmentModeChangedEvent;
import com.cts.ms.tsmng.alarm.exporter.dto.TollControlFileRegisteredEvent;
import com.cts.ms.tsmng.alarm.exporter.service.EventProcessor;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/events/v1")
@RequiredArgsConstructor
@Tag(name = "Atlas event webhooks",
     description = "Receives change events forwarded from Atlas Database Triggers. " +
                   "Calls must pass the HMAC filter on /internal/events/**.")
public class EventsController {

    private final EventProcessor processor;

    @PostMapping("/segment-mode-changed")
    @Operation(summary = "PL7055 / PL7087 — segment toll mode transition")
    @ApiResponses({
        @ApiResponse(responseCode = "202", description = "Event accepted and enqueued to the outbox"),
        @ApiResponse(responseCode = "400", description = "Validation failed"),
        @ApiResponse(responseCode = "401", description = "Invalid or missing HMAC signature")
    })
    public ResponseEntity<Void> segmentModeChanged(@Valid @RequestBody SegmentModeChangedEvent event) {
        processor.processSegmentModeChanged(event);
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }

    @PostMapping("/toll-control-file-registered")
    @Operation(summary = "PL7093 — new toll-control file registered")
    @ApiResponses({
        @ApiResponse(responseCode = "202", description = "Event accepted and enqueued to the outbox"),
        @ApiResponse(responseCode = "400", description = "Validation failed"),
        @ApiResponse(responseCode = "401", description = "Invalid or missing HMAC signature")
    })
    public ResponseEntity<Void> tollControlFileRegistered(@Valid @RequestBody TollControlFileRegisteredEvent event) {
        processor.processTollControlFileRegistered(event);
        return ResponseEntity.status(HttpStatus.ACCEPTED).build();
    }
}
