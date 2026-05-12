package com.mkstr.chat.controllers;

import com.mkstr.chat.analytics.AnalyticsService;
import com.mkstr.chat.dto.MessageSearchHitDto;
import com.mkstr.chat.model.Chat;
import com.mkstr.chat.opensearch.MessageOpenSearchService;
import com.mkstr.chat.opensearch.OpenSearchProperties;
import com.mkstr.chat.service.ChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequiredArgsConstructor
public class MessageSearchController {

    private final OpenSearchProperties openSearchProperties;
    private final MessageOpenSearchService messageOpenSearchService;
    private final ChatService chatService;
    private final CurrentUserProvider currentUserProvider;
    private final AnalyticsService analyticsService;


//peer - username собеседника
//q - поисковая строка
//limit - максимум результатов (1..50)

    @GetMapping("/messages/search")
    public ResponseEntity<List<MessageSearchHitDto>> searchMessages(
            @RequestParam String peer,
            @RequestParam String q,
            @RequestParam(defaultValue = "20") int limit
    ) throws Exception {
        if (!openSearchProperties.isEnabled()) {
            return ResponseEntity.status(NOT_FOUND).build();
        }
        String me = currentUserProvider.requireCurrentUsername();
        if (peer == null || peer.isBlank() || q == null || q.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "peer and q required");
        }
        if (peer.equals(me)) {
            throw new ResponseStatusException(BAD_REQUEST, "invalid peer");
        }

        Chat chat = chatService.findExistingChat(me, peer);
        if (chat == null) {
            return ResponseEntity.ok(List.of());
        }

        String query = q.trim();
        List<MessageSearchHitDto> hits;
        try {
            hits = messageOpenSearchService.search(chat.getChatId(), query, limit);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            analyticsService.opensearchSearchFailed(chat.getChatId(), query, e);
            return ResponseEntity.ok(List.of());
        } catch (Exception e) {
            analyticsService.opensearchSearchFailed(chat.getChatId(), query, e);
            return ResponseEntity.ok(List.of());
        }
        analyticsService.messageSearch(me, peer, chat.getChatId(), query, hits.size());
        return ResponseEntity.ok(hits);
    }
}
