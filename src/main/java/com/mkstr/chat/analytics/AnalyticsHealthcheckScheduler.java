package com.mkstr.chat.analytics;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AnalyticsHealthcheckScheduler {

    private final AnalyticsService analyticsService;

    @Scheduled(
            initialDelayString = "${analytics.clickhouse.healthcheck-initial-delay-ms:15000}",
            fixedDelayString = "${analytics.clickhouse.healthcheck-interval-ms:60000}"
    )
    public void emitHealthcheck() {
        analyticsService.healthcheck();
    }
}
