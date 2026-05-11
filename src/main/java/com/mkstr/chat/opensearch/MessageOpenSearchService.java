package com.mkstr.chat.opensearch;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mkstr.chat.dto.MessageSearchHitDto;
import com.mkstr.chat.model.Message;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.util.Base64;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class MessageOpenSearchService {

    private final OpenSearchProperties props;
    private final ObjectMapper objectMapper;

    private HttpClient httpClient;

    private final Object indexInitLock = new Object();
    private volatile boolean indexReady = false;

    @PostConstruct
    void initHttpClient() {
        this.httpClient = OpenSearchHttpClientFactory.create(props);
    }

    public void indexMessage(Message message) {
        if (!props.isEnabled() || message.getMessage_id() == null || message.getChatId() == null) {
            return;
        }
        try {
            ensureIndexOnce();
            ObjectNode doc = objectMapper.createObjectNode();
            doc.put("message_id", message.getMessage_id());
            doc.put("chat_id", message.getChatId());
            doc.put("content", message.getContent() != null ? message.getContent() : "");
            doc.put("sender_id", message.getSenderId() != null ? message.getSenderId() : "");
            doc.put("recipient_id", message.getRecipientId() != null ? message.getRecipientId() : "");
            if (message.getDateCreated() != null) {
                doc.put("date_created", message.getDateCreated().getTime());
            }

            URI uri = URI.create(props.getBaseUrl() + "/" + props.getIndexMessages() + "/_doc/" + message.getMessage_id());
            HttpRequest.Builder rb = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json");
            addOpenSearchAuth(rb);
            HttpRequest req = rb
                    .PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(doc), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() / 100 != 2) {
                log.warn("OpenSearch index failed: {} body: {}", resp.statusCode(), truncate(resp.body(), 500));
            }
        } catch (Exception e) {
            log.warn(
                    "OpenSearch index error for message_id={}, baseUrl={}: {} — при «empty reply» на http:// "
                            + "сервер обычно ждёт HTTPS: задайте base-url https://127.0.0.1:9200 и insecure-ssl=true. "
                            + "С security plugin нужен пароль admin (OPENSEARCH_PASSWORD = пароль из контейнера).",
                    message.getMessage_id(),
                    props.getBaseUrl(),
                    e.getMessage()
            );
        }
    }

    public List<MessageSearchHitDto> search(long chatId, String query, int size) throws IOException, InterruptedException {
        if (!props.isEnabled()) {
            return List.of();
        }
        ensureIndexOnce();
        int safeSize = Math.min(Math.max(size, 1), 50);

        ObjectNode root = objectMapper.createObjectNode();
        root.put("size", safeSize);
        ObjectNode bool = root.putObject("query").putObject("bool");
        ArrayNode filter = bool.putArray("filter");
        filter.addObject().putObject("term").putObject("chat_id").put("value", chatId);
        ArrayNode should = bool.putArray("should");
        bool.put("minimum_should_match", 1);

        ObjectNode exact = objectMapper.createObjectNode();
        exact.put("query", query);
        exact.put("type", "best_fields");
        exact.put("operator", "and");
        exact.put("boost", 3.0);
        exact.putArray("fields").add("content");
        should.addObject().set("multi_match", exact);

        ObjectNode prefix = objectMapper.createObjectNode();
        prefix.put("query", query);
        prefix.put("slop", 2);
        prefix.put("max_expansions", 30);
        prefix.put("boost", 2.0);
        should.addObject().putObject("match_phrase_prefix").set("content", prefix);

        ObjectNode fuzzy = objectMapper.createObjectNode();
        fuzzy.put("query", query);
        fuzzy.put("operator", "and");
        fuzzy.put("fuzziness", "AUTO");
        fuzzy.put("prefix_length", 1);
        fuzzy.put("max_expansions", 30);
        fuzzy.put("boost", 1.0);
        should.addObject().putObject("match").set("content", fuzzy);

        ArrayNode sort = root.putArray("sort");
        sort.addObject().putObject("_score").put("order", "desc");
        sort.addObject().putObject("date_created").put("order", "desc");

        URI uri = URI.create(props.getBaseUrl() + "/" + props.getIndexMessages() + "/_search");
        HttpRequest.Builder sb = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json");
        addOpenSearchAuth(sb);
        HttpRequest req = sb
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(root), StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() / 100 != 2) {
            log.warn("OpenSearch search failed: {} {}", resp.statusCode(), truncate(resp.body(), 500));
            return List.of();
        }
        return parseHits(resp.body());
    }

    private List<MessageSearchHitDto> parseHits(String json) throws IOException {
        List<MessageSearchHitDto> out = new ArrayList<>();
        JsonNode root = objectMapper.readTree(json);
        JsonNode hits = root.path("hits").path("hits");
        if (!hits.isArray()) {
            return out;
        }
        for (JsonNode h : hits) {
            JsonNode src = h.path("_source");
            long mid = src.path("message_id").asLong(0);
            long cid = src.path("chat_id").asLong(0);
            String content = src.path("content").asText("");
            String sender = src.path("sender_id").asText("");
            String recipient = src.path("recipient_id").asText("");
            long ts = src.path("date_created").asLong(0);
            out.add(new MessageSearchHitDto(mid, cid, content, sender, recipient, new Date(ts)));
        }
        return out;
    }

    private void ensureIndexOnce() throws IOException, InterruptedException {
        if (!props.isEnabled()) {
            return;
        }
        if (indexReady) {
            return;
        }
        synchronized (indexInitLock) {
            if (indexReady) {
                return;
            }
            try {
                URI headUri = URI.create(props.getBaseUrl() + "/" + props.getIndexMessages());
                HttpRequest.Builder hb = HttpRequest.newBuilder(headUri)
                        .timeout(Duration.ofSeconds(5));
                addOpenSearchAuth(hb);
                HttpRequest head = hb.method("HEAD", HttpRequest.BodyPublishers.noBody()).build();
                HttpResponse<Void> headResp = httpClient.send(head, HttpResponse.BodyHandlers.discarding());
                if (headResp.statusCode() == 200) {
                    indexReady = true;
                    return;
                }
            } catch (Exception e) {
                log.debug("OpenSearch HEAD index: {}", e.getMessage());
            }

            ObjectNode mappings = objectMapper.createObjectNode();
            ObjectNode propsNode = mappings.putObject("mappings").putObject("properties");
            propsNode.putObject("message_id").put("type", "long");
            propsNode.putObject("chat_id").put("type", "long");
            propsNode.putObject("content").put("type", "text");
            propsNode.putObject("sender_id").put("type", "keyword");
            propsNode.putObject("recipient_id").put("type", "keyword");
            propsNode.putObject("date_created").put("type", "date").put("format", "epoch_millis");

            URI putUri = URI.create(props.getBaseUrl() + "/" + props.getIndexMessages());
            HttpRequest.Builder pb = HttpRequest.newBuilder(putUri)
                    .timeout(Duration.ofSeconds(15))
                    .header("Content-Type", "application/json");
            addOpenSearchAuth(pb);
            HttpRequest put = pb
                    .PUT(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(mappings), StandardCharsets.UTF_8))
                    .build();
            HttpResponse<String> putResp = httpClient.send(put, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int code = putResp.statusCode();
            if (code / 100 == 2 || code == 400) {
                indexReady = true;
            } else {
                log.warn("OpenSearch create index failed: {} {}", code, truncate(putResp.body(), 500));
            }
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }

    private void addOpenSearchAuth(HttpRequest.Builder builder) {
        String u = props.getUsername();
        String p = props.getPassword();
        if (u == null || u.isBlank() || p == null || p.isBlank()) {
            return;
        }
        String raw = u + ":" + p;
        String token = Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
        builder.header("Authorization", "Basic " + token);
    }
}
