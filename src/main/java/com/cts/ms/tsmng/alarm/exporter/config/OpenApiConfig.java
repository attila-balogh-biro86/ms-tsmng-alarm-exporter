package com.cts.ms.tsmng.alarm.exporter.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
            .info(new Info()
                .title("TSMNG Alarm Exporter API")
                .description("Webhook receivers for Atlas Database Trigger events and internal alarm pipeline endpoints.")
                .version("v1")
            );
    }
}
