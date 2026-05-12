package com.mkstr.chat.controllers;

import com.mkstr.chat.analytics.AnalyticsService;
import com.mkstr.chat.model.Status;
import com.mkstr.chat.model.User;
import com.mkstr.chat.service.ChatService;
import com.mkstr.chat.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;

@RestController
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final CurrentUserProvider currentUserProvider;
    private final AnalyticsService analyticsService;

    @GetMapping("/user.getCurrent")
    public ResponseEntity<User> getCurrentUser() {
        User user = currentUserProvider.getCurrentUser();
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(user);
    }

    @PostMapping("/user.addUser")
    @ResponseBody
    public ResponseEntity<User> addUser(@RequestBody(required = false) User clientHints) {
        User current = currentUserProvider.getCurrentUser();
        if (current == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        Status status = clientHints != null && clientHints.getStatus() != null
                ? clientHints.getStatus()
                : current.getStatus();
        User toSave = new User(current.getUsername(), current.getFullname(), status);
        log.info("User connected: {}", toSave.getUsername());
        boolean isNewUser = !userService.existsByUsername(toSave.getUsername());
        userService.save(toSave);
        if (isNewUser) {
            analyticsService.userRegistered(toSave, userService.countUsers());
        }
        analyticsService.userStatusChanged(toSave, userService.countOnlineUsers());
        messagingTemplate.convertAndSend("/user/public/", toSave);
        return ResponseEntity.ok(toSave);
    }

    @MessageMapping("/user.disconnectUser")
    @SendTo("/user/public/")
    public User disconnectUser(Principal principal) {
        if (principal == null) {
            log.warn("disconnectUser without principal");
            analyticsService.websocketRejected("disconnect_without_principal", "", null);
            return null;
        }
        String username = principal.getName();
        log.info("disconnected {}", username);
        User user = userService.disconnect(username);
        analyticsService.userStatusChanged(user, userService.countOnlineUsers());
        return user;
    }

    @MessageMapping("/user.findUsers")
    public void findUsers(
            @Payload String targetUsername,
            Principal principal
    ) {
        if (principal == null) {
            log.warn("findUsers called without authenticated principal");
            analyticsService.websocketRejected("find_users_without_principal", "", null);
            return;
        }
        String currentUsername = principal.getName();
        List<User> foundUsers = userService.findAllByUsername(targetUsername);

        log.info("Found users {}", foundUsers);
        log.info("Request came from {}", currentUsername);

        messagingTemplate.convertAndSend("/user/" + currentUsername + "/usersSearch", foundUsers);
    }

    @GetMapping("/chats")
    public ResponseEntity<List<User>> getChats() {
        User current = currentUserProvider.getCurrentUser();
        if (current == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        List<User> chats = chatService.findChatsByUsername(current.getUsername());
        return ResponseEntity.ok(chats);
    }

    @GetMapping("/users/{targetUsername}")
    public ResponseEntity<User> getUser(@PathVariable String targetUsername) {
        return ResponseEntity.ok(userService.findByUsername(targetUsername));
    }
}

//TODO: профили юзеров