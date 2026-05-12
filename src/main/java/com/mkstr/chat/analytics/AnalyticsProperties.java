package com.mkstr.chat.analytics;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "analytics.clickhouse")
public class AnalyticsProperties {

    private boolean enabled = false;

    private String baseUrl = "http://clickhouse:8123";

    private String database = "chat_analytics";

    private String table = "events";

    private String username = "default";

    private String password = "";

    public void setBaseUrl(String baseUrl) {
        if (baseUrl != null && baseUrl.endsWith("/")) {
            this.baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        } else {
            this.baseUrl = baseUrl;
        }
    }
}
