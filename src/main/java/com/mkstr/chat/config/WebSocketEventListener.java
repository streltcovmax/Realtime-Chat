package com.mkstr.chat.config;

import com.mkstr.chat.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final UserService userService;
    private final SimpMessagingTemplate messagingTemplate;
    private final ConcurrentMap<String, String> sessionToUser = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Integer> userSessionsCount = new ConcurrentHashMap<>();

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        Principal userPrincipal = headerAccessor.getUser();
        String sessionId = headerAccessor.getSessionId();

        if (userPrincipal == null || sessionId == null) {
            log.warn("Connect event without principal/sessionId. principal={}, sessionId={}", userPrincipal, sessionId);
            return;
        }

        String username = userPrincipal.getName();
        sessionToUser.put(sessionId, username);
        userSessionsCount.merge(username, 1, Integer::sum);
        log.info("WebSocket connected: username={}, sessionId={}, activeSessions={}",
                username, sessionId, userSessionsCount.get(username));
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String sessionId = headerAccessor.getSessionId();
        String username = null;

        if (sessionId != null) {
            username = sessionToUser.remove(sessionId);
        }

        if (username == null) {
            log.info("Ignoring disconnect for unknown session. sessionId={}", sessionId);
            return;
        }

        Integer updatedSessions = userSessionsCount.compute(username, (key, oldValue) -> {
            if (oldValue == null || oldValue <= 1) return null;
            return oldValue - 1;
        });
        int activeSessions = updatedSessions == null ? 0 : updatedSessions;

        if (activeSessions > 0) {
            log.info("Ignoring disconnect: username={}, sessionId={}, activeSessions={}",
                    username, sessionId, activeSessions);
            return;
        }

        log.info("User disconnected: username={}, sessionId={}", username, sessionId);
        userService.disconnect(username);
        messagingTemplate.convertAndSend("/user/public/", userService.findByUsername(username));
    }
}
