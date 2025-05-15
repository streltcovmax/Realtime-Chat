package com.mkstr.chat.controllers;

import com.mkstr.chat.model.Chat;
import com.mkstr.chat.model.Message;
import com.mkstr.chat.repositories.MessageRepository;
import com.mkstr.chat.services.ChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

import java.util.List;

@Slf4j
@Controller
@RequiredArgsConstructor
public class ChatController {

    private final MessageRepository messageRepository;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat")
    public void processMessage(@Payload Message message){
        //Здесь js идет json message
        Chat chat = chatService.getOrCreateChat(message.getSenderId(), message.getRecipientId());
        chatService.saveLastMessage(chat, message.getContent());
        Long chatId = chat.getChatId();
        message.setChatId(chatId);
        messageRepository.save(message);
        messagingTemplate.convertAndSend("/user/" + message.getRecipientId() + "/messages", message);
    }



    @GetMapping("/messages/all/{username}/{selectedChat}")
    public ResponseEntity<List<Message>> findChatMessages(
            @PathVariable String username,
            @PathVariable String selectedChat)
    {
        Long chatId = chatService.getOrCreateChat(username, selectedChat).getChatId();
        return ResponseEntity.ok(messageRepository.findAllByChatId(chatId));
    }

    @GetMapping("/messages/last/{username}/{selectedChat}")
    public ResponseEntity<Message> findLastMessageByChat(
            @PathVariable String username,
            @PathVariable String selectedChat)
    {
        Long chatId = chatService.getOrCreateChat(username, selectedChat).getChatId();
        Message message = messageRepository.findTopByChatIdOrderByDateCreatedDesc(chatId);
        if(message != null) return ResponseEntity.ok(message);
        else return ResponseEntity.internalServerError().body(null);
    }
}
