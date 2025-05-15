package com.mkstr.chat.controllers;

import com.mkstr.chat.model.Status;
import com.mkstr.chat.model.User;
import com.mkstr.chat.services.ChatService;
import com.mkstr.chat.services.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final CurrentUserProvider currentUserProvider;

    @GetMapping("/api/me")
    public User getCurrentUser() {
        return currentUserProvider.getCurrentUser();
    }


    @PostMapping("/user.addUser")
    @ResponseBody
    public User addUser(@RequestBody User user){
        log.info("User connected: {}", user);
        userService.save(user);
        messagingTemplate.convertAndSend("/user/public/", user);
        return user;
    }

    @MessageMapping("/user.disconnectUser")
    @SendTo("/user/public/")
    public User disconnectUser(
            @Payload User user
    ){
        log.info("disconnected {}", user);
        userService.disconnect(user.getUsername());
        return user;
    }

//    @MessageMapping("/user.findUsers")
//    public void findUsers(
//            @Payload String targetUsername
//    ){
//        log.info(targetUsername);
//        List<User> foundUsers = userService.findAllByUsername(targetUsername);
//        messagingTemplate.convertAndSend("/user/" + user.getUsername() + "/usersSearch", foundUsers);
//    }

    @GetMapping("/chats")
    public ResponseEntity<List<User>> getContacts(){
        List<User> contacts = chatService.findContacts(currentUserProvider.getCurrentUser().getUsername());
        return ResponseEntity.ok(contacts);
    }


    @GetMapping("/users/{targetUsername}")
    public ResponseEntity<User> getUser(@PathVariable String targetUsername){
        return ResponseEntity.ok(userService.findByUsername(targetUsername));
    }

    @GetMapping("/logout")
    public String logout(HttpServletRequest request, HttpServletResponse response) {
        String keycloakLogoutUrl = "http://localhost:8080/realms/chat_realm/protocol/openid-connect/logout?redirect_uri=http://localhost:8081";
        return "redirect:" + keycloakLogoutUrl;
    }

//    @GetMapping("/")
//    public ResponseEntity<User> getUserInfo(@AuthenticationPrincipal OidcUser user) {
//        return ResponseEntity.ok(new User(user.getPreferredUsername(), user.getFullName(), Status.ONLINE));
//    }


}

//TODO СКОРО фикс поиска
//TODO СКОРО фикс добавления нового пользователя когда он тебе написал
//TODO профили юзеров
//TODO ПОТОМ шаблон предзагрузки на фронте