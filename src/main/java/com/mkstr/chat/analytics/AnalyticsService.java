package com.mkstr.chat.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mkstr.chat.model.Message;
import com.mkstr.chat.model.Status;
import com.mkstr.chat.model.User;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalyticsService {

    private static final DateTimeFormatter CLICKHOUSE_TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS").withZone(ZoneOffset.UTC);

    private final AnalyticsProperties props;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean schemaReady = new AtomicBoolean(false);

    public void messageSent(Message message) {
        if (message == null) {
            return;
        }
        ObjectNode event = baseEvent("message_sent", message.getSenderId(), message.getRecipientId());
        putNullableLong(event, "chat_id", message.getChatId());
        putNullableLong(event, "message_id", message.getMessage_id());
        putNullableInt(event, "message_length", message.getContent() != null ? message.getContent().length() : null);
        putNullableInt(event, "query_length", null);
        putNullableInt(event, "result_count", null);
        event.put("status", "");
        event.put("query", "");
        event.put("metadata", "");
        emit(event);
    }

    public void messageRead(Message message, String readerUsername) {
        if (message == null) {
            return;
        }
        ObjectNode event = baseEvent("message_read", readerUsername, message.getSenderId());
        putNullableLong(event, "chat_id", message.getChatId());
        putNullableLong(event, "message_id", message.getMessage_id());
        putNullableInt(event, "message_length", null);
        putNullableInt(event, "query_length", null);
        putNullableInt(event, "result_count", null);
        event.put("status", "");
        event.put("query", "");
        event.put("metadata", "");
        emit(event);
    }

    public void messageSearch(String userId, String peerId, Long chatId, String query, int resultCount) {
        ObjectNode event = baseEvent("message_search", userId, peerId);
        putNullableLong(event, "chat_id", chatId);
        putNullableLong(event, "message_id", null);
        putNullableInt(event, "message_length", null);
        putNullableInt(event, "query_length", query != null ? query.length() : null);
        putNullableInt(event, "result_count", resultCount);
        event.put("status", "");
        event.put("query", "");
        event.put("metadata", "");
        emit(event);
    }

    public void userStatusChanged(User user, long onlineUsers) {
        if (user == null) {
            return;
        }
        userStatusChanged(user.getUsername(), user.getStatus(), onlineUsers);
    }

    public void userStatusChanged(String username, Status status, long onlineUsers) {
        if (username == null || username.isBlank() || status == null) {
            return;
        }
        ObjectNode event = baseEvent("user_status_changed", username, "");
        putNullableLong(event, "chat_id", null);
        putNullableLong(event, "message_id", null);
        putNullableInt(event, "message_length", null);
        putNullableInt(event, "query_length", null);
        putNullableInt(event, "result_count", Math.toIntExact(Math.max(0, onlineUsers)));
        event.put("status", status.name());
        event.put("query", "");
        event.put("metadata", "");
        emit(event);
    }

    public void userRegistered(User user, long totalUsers) {
        if (user == null || user.getUsername() == null || user.getUsername().isBlank()) {
            return;
        }
        ObjectNode event = baseEvent("user_registered", user.getUsername(), "");
        putNullableLong(event, "chat_id", null);
        putNullableLong(event, "message_id", null);
        putNullableInt(event, "message_length", null);
        putNullableInt(event, "query_length", null);
        putNullableInt(event, "result_count", Math.toIntExact(Math.max(0, totalUsers)));
        event.put("status", "");
        event.put("query", "");
        event.put("metadata", "");
        emit(event);
    }

    public void opensearchIndexFailed(Message message, int statusCode, String responseBody) {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("component", "opensearch");
        metadata.put("operation", "index_message");
        metadata.put("http_status", statusCode);
        metadata.put("response", truncate(responseBody, 500));
        technicalEvent(
                "opensearch_index_failed",
                message != null ? message.getSenderId() : "",
                message != null ? message.getRecipientId() : "",
                message != null ? message.getChatId() : null,
                message != null ? message.getMessage_id() : null,
                "HTTP_" + statusCode,
                statusCode,
                metadata
        );
    }

    public void opensearchIndexFailed(Message message, Exception exception) {
        ObjectNode metadata = exceptionMetadata("opensearch", "index_message", exception);
        technicalEvent(
                "opensearch_index_failed",
                message != null ? message.getSenderId() : "",
                message != null ? message.getRecipientId() : "",
                message != null ? message.getChatId() : null,
                message != null ? message.getMessage_id() : null,
                exceptionStatus(exception),
                null,
                metadata
        );
    }

    public void opensearchSearchFailed(Long chatId, String query, int statusCode, String responseBody) {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("component", "opensearch");
        metadata.put("operation", "search_messages");
        metadata.put("http_status", statusCode);
        metadata.put("response", truncate(responseBody, 500));
        technicalEvent(
                "opensearch_search_failed",
                "",
                "",
                chatId,
                null,
                "HTTP_" + statusCode,
                statusCode,
                query != null ? query.length() : null,
                metadata
        );
    }

    public void opensearchSearchFailed(Long chatId, String query, Exception exception) {
        ObjectNode metadata = exceptionMetadata("opensearch", "search_messages", exception);
        technicalEvent(
                "opensearch_search_failed",
                "",
                "",
                chatId,
                null,
                exceptionStatus(exception),
                null,
                query != null ? query.length() : null,
                metadata
        );
    }

    public void messageRejected(String reason, String senderId, String recipientId, Integer messageLength) {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("component", "chat");
        metadata.put("operation", "send_message");
        metadata.put("reason", safe(reason));
        technicalEvent("message_rejected", senderId, recipientId, null, null, safe(reason), null, messageLength, null, metadata);
    }

    public void websocketRejected(String reason, String username, String sessionId) {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("component", "websocket");
        metadata.put("operation", "stomp");
        metadata.put("reason", safe(reason));
        metadata.put("session_id", safe(sessionId));
        technicalEvent("websocket_rejected", username, "", null, null, safe(reason), null, metadata);
    }

    public void backendError(String component, String operation, String userId, Exception exception) {
        ObjectNode metadata = exceptionMetadata(component, operation, exception);
        technicalEvent("backend_error", userId, "", null, null, exceptionStatus(exception), null, metadata);
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }

    private ObjectNode baseEvent(String eventType, String userId, String peerId) {
        ObjectNode event = objectMapper.createObjectNode();
        event.put("event_time", CLICKHOUSE_TIME_FORMAT.format(Instant.now()));
        event.put("event_type", eventType);
        event.put("user_id", userId != null ? userId : "");
        event.put("peer_id", peerId != null ? peerId : "");
        return event;
    }

    private void technicalEvent(
            String eventType,
            String userId,
            String peerId,
            Long chatId,
            Long messageId,
            String status,
            Integer resultCount,
            ObjectNode metadata
    ) {
        technicalEvent(eventType, userId, peerId, chatId, messageId, status, resultCount, null, null, metadata);
    }

    private void technicalEvent(
            String eventType,
            String userId,
            String peerId,
            Long chatId,
            Long messageId,
            String status,
            Integer resultCount,
            Integer messageLength,
            ObjectNode metadata
    ) {
        technicalEvent(eventType, userId, peerId, chatId, messageId, status, resultCount, messageLength, null, metadata);
    }

    private void technicalEvent(
            String eventType,
            String userId,
            String peerId,
            Long chatId,
            Long messageId,
            String status,
            Integer resultCount,
            Integer messageLength,
            Integer queryLength,
            ObjectNode metadata
    ) {
        ObjectNode event = baseEvent(eventType, userId, peerId);
        putNullableLong(event, "chat_id", chatId);
        putNullableLong(event, "message_id", messageId);
        putNullableInt(event, "message_length", messageLength);
        putNullableInt(event, "query_length", queryLength);
        putNullableInt(event, "result_count", resultCount);
        event.put("status", status != null ? status : "");
        event.put("query", "");
        event.put("metadata", metadataString(metadata));
        emit(event);
    }

    private ObjectNode exceptionMetadata(String component, String operation, Exception exception) {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("component", safe(component));
        metadata.put("operation", safe(operation));
        metadata.put("error_type", exception != null ? exception.getClass().getSimpleName() : "");
        metadata.put("error_message", exception != null ? truncate(safeMessage(exception), 500) : "");
        return metadata;
    }

    private void emit(ObjectNode event) {
        if (!props.isEnabled()) {
            return;
        }
        executor.submit(() -> {
            try {
                ensureSchema();
                insertEvent(event);
            } catch (Exception e) {
                log.warn("ClickHouse analytics event skipped: {}: {}", e.getClass().getSimpleName(), safeMessage(e), e);
            }
        });
    }

    private void ensureSchema() throws IOException, InterruptedException {
        if (schemaReady.get()) {
            return;
        }
        synchronized (schemaReady) {
            if (schemaReady.get()) {
                return;
            }
            String database = identifier(props.getDatabase());
            String table = identifier(props.getTable());
            executeQuery("CREATE DATABASE IF NOT EXISTS " + database);
            executeQuery("""
                    CREATE TABLE IF NOT EXISTS %s.%s
                    (
                        event_time DateTime64(3, 'UTC'),
                        event_type LowCardinality(String),
                        user_id String,
                        peer_id String,
                        chat_id Nullable(UInt64),
                        message_id Nullable(UInt64),
                        query String,
                        result_count Nullable(UInt32),
                        message_length Nullable(UInt32),
                        query_length Nullable(UInt32),
                        status LowCardinality(String),
                        metadata String
                    )
                    ENGINE = MergeTree
                    PARTITION BY toYYYYMM(event_time)
                    ORDER BY (event_type, event_time, user_id)
                    """.formatted(database, table));
            executeQuery("ALTER TABLE " + database + "." + table + " ADD COLUMN IF NOT EXISTS query_length Nullable(UInt32)");
            executeQuery("ALTER TABLE " + database + "." + table + " ADD COLUMN IF NOT EXISTS status LowCardinality(String)");
            executeQuery("ALTER TABLE " + database + "." + table + " UPDATE query = '' WHERE event_type = 'message_search' AND query != ''");
            schemaReady.set(true);
        }
    }

    private void insertEvent(ObjectNode event) throws IOException, InterruptedException {
        String query = "INSERT INTO " + identifier(props.getDatabase()) + "." + identifier(props.getTable())
                + " FORMAT JSONEachRow";
        HttpRequest.Builder builder = requestBuilder()
                .POST(HttpRequest.BodyPublishers.ofString(
                        query + "\n" + objectMapper.writeValueAsString(event) + "\n",
                        StandardCharsets.UTF_8
                ));
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IOException("insert failed: " + response.statusCode() + " " + truncate(response.body(), 300));
        }
    }

    private void executeQuery(String query) throws IOException, InterruptedException {
        HttpRequest request = requestBuilder()
                .POST(HttpRequest.BodyPublishers.ofString(query, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            throw new IOException("query failed: " + response.statusCode() + " " + truncate(response.body(), 300));
        }
    }

    private HttpRequest.Builder requestBuilder() {
        HttpRequest.Builder builder = HttpRequest.newBuilder(clickHouseUri())
                .timeout(Duration.ofSeconds(5))
                .header("Content-Type", "text/plain; charset=utf-8");
        String username = props.getUsername();
        String password = props.getPassword();
        if (username != null && !username.isBlank()) {
            builder.header("X-ClickHouse-User", username);
        }
        if (password != null && !password.isBlank()) {
            builder.header("X-ClickHouse-Key", password);
        }
        return builder;
    }

    private URI clickHouseUri() {
        return URI.create(props.getBaseUrl() + "/");
    }

    private static void putNullableLong(ObjectNode node, String name, Long value) {
        if (value == null) {
            node.putNull(name);
        } else {
            node.put(name, value);
        }
    }

    private static void putNullableInt(ObjectNode node, String name, Integer value) {
        if (value == null) {
            node.putNull(name);
        } else {
            node.put(name, value);
        }
    }

    private static String identifier(String value) {
        if (value == null || !value.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            throw new IllegalArgumentException("invalid ClickHouse identifier");
        }
        return value;
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String safeMessage(Exception e) {
        String message = e.getMessage();
        return message != null ? message : "no message";
    }

    private static String exceptionStatus(Exception e) {
        return e != null ? e.getClass().getSimpleName() : "Exception";
    }

    private static String safe(String value) {
        return value != null ? value : "";
    }

    private String metadataString(ObjectNode metadata) {
        if (metadata == null) {
            return "";
        }
        try {
            return objectMapper.writeValueAsString(metadata);
        } catch (Exception e) {
            return "";
        }
    }
}
