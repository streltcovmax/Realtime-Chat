package com.mkstr.chat.controllers;

import com.mkstr.chat.model.User;
import com.mkstr.chat.service.ChatService;
import com.mkstr.chat.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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

    @GetMapping("/user.getCurrent")
    public User getCurrentUser() {
        return currentUserProvider.getCurrentUser();
    }

    @PostMapping("/user.addUser")
    @ResponseBody
    public User addUser(@RequestBody User user) {
        log.info("User connected: {}", user);
        userService.save(user);
        messagingTemplate.convertAndSend("/user/public/", user);
        return user;
    }

    @MessageMapping("/user.disconnectUser")
    @SendTo("/user/public/")
    public User disconnectUser(
            @Payload User user
    ) {
        log.info("disconnected {}", user);
        userService.disconnect(user.getUsername());
        return user;
    }

    @MessageMapping("/user.findUsers")
    public void findUsers(
            @Payload String targetUsername,
            Principal principal
    ) {
        if (principal == null) {
            log.warn("findUsers called without authenticated principal");
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
        List<User> chats = chatService.findChatsByUsername(currentUserProvider.getCurrentUser().getUsername());
        return ResponseEntity.ok(chats);
    }

    @GetMapping("/users/{targetUsername}")
    public ResponseEntity<User> getUser(@PathVariable String targetUsername) {
        return ResponseEntity.ok(userService.findByUsername(targetUsername));
    }
}

//TODO: фикс поиска
//TODO: фикс добавления нового пользователя когда он тебе написал
//TODO: профили юзеров
//TODO: ПОТОМ шаблон предзагрузки на фронте