package com.mkstr.chat.config;

import com.mkstr.chat.services.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketEventListener {

    private final UserService userService;
    private final SimpMessagingTemplate messagingTemplate;

    @EventListener
    public void handleWebSocketDisconnectListener(
            SessionDisconnectEvent event
    ){
        StompHeaderAccessor headerAccessor = StompHeaderAccessor.wrap(event.getMessage());
        String username = (String)headerAccessor.getSessionAttributes().get("username");
        if(username != null) {
            log.info("The username disconnected : {}", username);
            userService.disconnect(username);
            messagingTemplate.convertAndSend("/user/public/", userService.findByUsername(username));

        }
        else{
            log.error("USERNAME IS NULL COULDN'T UPDATE USER STATUS");
        }
    }
}
