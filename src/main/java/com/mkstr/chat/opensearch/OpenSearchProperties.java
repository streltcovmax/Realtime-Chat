package com.mkstr.chat.opensearch;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "opensearch")
public class OpenSearchProperties {

    private boolean enabled = false;

    private String baseUrl = "https://127.0.0.1:9200";

    private String indexMessages = "chat-messages";

    private boolean insecureSsl = true;

    private String username = "admin";

    private String password = "";

    public void setBaseUrl(String baseUrl) {
        if (baseUrl != null && baseUrl.endsWith("/")) {
            this.baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        } else {
            this.baseUrl = baseUrl;
        }
    }
}
