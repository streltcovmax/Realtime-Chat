package com.mkstr.chat.controllers;

import com.mkstr.chat.data.Chat;
import com.mkstr.chat.data.Message;
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



    @GetMapping("/messages/{username}/{selectedChat}")
    public ResponseEntity<List<Message>> findChatMessages(
            @PathVariable String username,
            @PathVariable String selectedChat)
    {
        Long chatId = chatService.getOrCreateChat(username, selectedChat).getChatId();
        return ResponseEntity.ok(messageRepository.findAllByChatId(chatId));
    }
}
