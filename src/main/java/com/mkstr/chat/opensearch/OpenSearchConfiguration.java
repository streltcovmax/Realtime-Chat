package com.mkstr.chat.opensearch;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(OpenSearchProperties.class)
public class OpenSearchConfiguration {
}
