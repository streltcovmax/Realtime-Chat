package com.mkstr.chat.controllers;

import com.mkstr.chat.data.ChatParticipant;
import com.mkstr.chat.data.User;
import com.mkstr.chat.repositories.ChatParticipantRepository;
import com.mkstr.chat.services.ChatService;
import com.mkstr.chat.services.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.ArrayList;
import java.util.List;

@Controller
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private String username;


    @MessageMapping("/user.addUser")
    @SendTo("/user/public/")
    public User addUser(
            @Payload User user,
            StompHeaderAccessor headerAccessor
    ){
        username = user.getUsername();
        headerAccessor.getSessionAttributes().put("username", username);
        log.info("___Added this in WS session" + user);
        userService.save(user);
        return user;

    }

    @MessageMapping("/user.disconnectUser")
    @SendTo("/user/public/")
    public User disconnectUser(
            @Payload User user
    ){
        log.info("___Disconnected {}", user);
        userService.disconnect(user.getUsername());
        return user;
    }

    @MessageMapping("/user.findUsers")
    public void findUsers(
            @Payload String targetUsername,
            StompHeaderAccessor headerAccessor
    ){
        String username = (String) headerAccessor.getSessionAttributes().get("username");
        log.info(targetUsername);
        log.info(username);
        List<User> foundUsers = userService.findAllByUsername(targetUsername);
        messagingTemplate.convertAndSend("/user/" + username + "/usersSearch", foundUsers);
    }

    @GetMapping("/users")
    public ResponseEntity<List<User>> getContacts(){
        log.info(username + " " + chatService.findContacts(username).toString());
        return ResponseEntity.ok(chatService.findContacts(username));
    }

    @GetMapping("/users/{targetUsername}")
    public ResponseEntity<User> getUser(@PathVariable String targetUsername){
        return ResponseEntity.ok(userService.findByUsername(targetUsername));
    }
//    @GetMapping("/users")
//    public ResponseEntity<List<User>> getContacts(){
//        log.info(chatService.findContacts("alex").toString());
//        return ResponseEntity.ok(userService.findUsers());
//    }
}
