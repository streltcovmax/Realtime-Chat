package com.mkstr.chat.controllers;

import com.mkstr.chat.model.User;
import com.mkstr.chat.services.ChatService;
import com.mkstr.chat.services.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Controller
@RequiredArgsConstructor
@Slf4j
public class UserController {

    private final UserService userService;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private User user;


    @PostMapping("/user.addUser")
    @ResponseBody
    public User addUser(@RequestBody User user){
        this.user = user;
        log.info("User connected: " + user);
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
            @Payload String targetUsername
    ){
        log.info(targetUsername);
        List<User> foundUsers = userService.findAllByUsername(targetUsername);
        messagingTemplate.convertAndSend("/user/" + user.getUsername() + "/usersSearch", foundUsers);
    }

    @PreAuthorize("hasRole('user')")
    @GetMapping("/chats")
    public ResponseEntity<List<User>> getContacts(){
        List<User> contacts = chatService.findContacts(user.getUsername());
        return ResponseEntity.ok(contacts);
    }


    @GetMapping("/users/{targetUsername}")
    public ResponseEntity<User> getUser(@PathVariable String targetUsername){
        return ResponseEntity.ok(userService.findByUsername(targetUsername));
    }

//    @GetMapping("/")


}

//TODO как организовать получение данных с бека на фронт, если я не хочу чтобы юзер мог написать url /chats и получить список чатов на пустой странице

//TODO 26.04.25 в постмане работает авторизация по токену, надо сделать чтобы оно через интерфейс было https://youtu.be/vmEWywGzWbA?si=4CY_UNA_wvVQ4ZL5&t=2660