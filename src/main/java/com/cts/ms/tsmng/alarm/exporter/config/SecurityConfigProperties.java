package com.cts.ms.tsmng.alarm.exporter.config;

import lombok.Data;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "security")
@Getter
@Setter
public class SecurityConfigProperties {

    private Cors cors = new Cors();

    @Data
    public static class Cors {
        private String[] allowedOrigins;
        private String[] allowedMethods;
        private String[] allowedHeaders;
        private String[] exposedHeaders;
        private boolean allowCredentials = false;
        private long maxAge = 3600;
    }
}
