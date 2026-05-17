package com.cts.ms.tsmng.alarm.exporter.controller;

import com.cts.architecture.exceptionhandler.application.GlobalExceptionHandler;
import com.cts.ms.tsmng.alarm.exporter.config.ExporterProperties;
import com.cts.ms.tsmng.alarm.exporter.dto.SegmentModeChangedEvent;
import com.cts.ms.tsmng.alarm.exporter.dto.TollControlFileRegisteredEvent;
import com.cts.ms.tsmng.alarm.exporter.service.EventProcessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.opentelemetry.api.OpenTelemetry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.ZonedDateTime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(EventsController.class)
@AutoConfigureMockMvc(addFilters = false) // HMAC filter is exercised in its own integration test
@Import({GlobalExceptionHandler.class, EventsControllerTest.TestConfig.class})
class EventsControllerTest {

    static class TestConfig {
        @Bean
        public OpenTelemetry openTelemetry() {
            return OpenTelemetry.noop();
        }

        // HmacSignatureFilter is a @Component picked up by the WebMvc slice, so its
        // ExporterProperties dependency must be satisfied even though addFilters=false
        // means the filter never actually runs.
        @Bean
        public ExporterProperties exporterProperties() {
            ExporterProperties props = new ExporterProperties();
            props.getHmac().setSharedSecret("test-only-secret");
            return props;
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EventProcessor processor;

    private final ObjectMapper objectMapper = new ObjectMapper()
        .registerModule(new JavaTimeModule())
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @Test
    void shouldAcceptSegmentModeChanged() throws Exception {
        SegmentModeChangedEvent event = SegmentModeChangedEvent.builder()
            .eventId("evt-1")
            .concession("I77")
            .segment("S42")
            .oldMode("REGULAR")
            .newMode("MANDATORY")
            .occurredAt(ZonedDateTime.now().minusSeconds(1))
            .build();

        mockMvc.perform(post("/internal/events/v1/segment-mode-changed")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(event)))
            .andExpect(status().isAccepted());

        verify(processor).processSegmentModeChanged(any(SegmentModeChangedEvent.class));
    }

    @Test
    void shouldAcceptTollControlFileRegistered() throws Exception {
        TollControlFileRegisteredEvent event = TollControlFileRegisteredEvent.builder()
            .eventId("evt-2")
            .concession("DFW")
            .fileId("TC-2026-05-13-001")
            .occurredAt(ZonedDateTime.now().minusSeconds(1))
            .build();

        mockMvc.perform(post("/internal/events/v1/toll-control-file-registered")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(event)))
            .andExpect(status().isAccepted());

        verify(processor).processTollControlFileRegistered(any(TollControlFileRegisteredEvent.class));
    }
}
