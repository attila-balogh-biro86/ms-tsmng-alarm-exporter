package com.cts.ms.tsmng.alarm.exporter.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(classes = SecurityConfigProperties.class)
@EnableConfigurationProperties(SecurityConfigProperties.class)
@TestPropertySource(properties = {
    "security.cors.allowed-origins=http://localhost,http://example.com",
    "security.cors.allowed-methods=GET,POST",
    "security.cors.allowed-headers=Authorization,Content-Type",
    "security.cors.exposed-headers=X-Custom-Header",
    "security.cors.allow-credentials=true",
    "security.cors.max-age=1800"
})
class SecurityConfigPropertiesTest {

    @Autowired
    private SecurityConfigProperties securityConfigProperties;

    @Test
    void testCorsPropertiesBinding() {
        SecurityConfigProperties.Cors cors = securityConfigProperties.getCors();

        assertThat(cors.getAllowedOrigins()).containsExactly("http://localhost", "http://example.com");
        assertThat(cors.getAllowedMethods()).containsExactly("GET", "POST");
        assertThat(cors.getAllowedHeaders()).containsExactly("Authorization", "Content-Type");
        assertThat(cors.getExposedHeaders()).containsExactly("X-Custom-Header");
        assertThat(cors.isAllowCredentials()).isTrue();
        assertThat(cors.getMaxAge()).isEqualTo(1800);
    }
}
