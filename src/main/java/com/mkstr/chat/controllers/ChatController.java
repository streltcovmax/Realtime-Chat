package com.mkstr.chat.controllers;

import com.mkstr.chat.model.Chat;
import com.mkstr.chat.model.Message;
import com.mkstr.chat.services.ChatService;
import com.mkstr.chat.services.MessageService;
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

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageService messageService;

    @MessageMapping("/chat")
    public ResponseEntity<Message> processMessage(@Payload Message message) {
        Chat chat = chatService.getOrCreateChat(message.getSenderId(), message.getRecipientId());
        chatService.saveLastMessage(chat, message.getContent());
        Long chatId = chat.getChatId();
        message.setChatId(chatId);
        messageService.save(message);
        messagingTemplate.convertAndSend("/user/" + message.getRecipientId() + "/messages", message);
        return ResponseEntity.ok(message);
    }

    @GetMapping("/messages/all/{username}/{selectedChat}")
    public ResponseEntity<List<Message>> findChatMessages(@PathVariable String username,
                                                          @PathVariable String selectedChat) {
        Long chatId = chatService.getOrCreateChat(username, selectedChat).getChatId();
        return ResponseEntity.ok(messageService.findAllByChatId(chatId));
    }

    @GetMapping("/messages/last/{username}/{selectedChat}")
    public ResponseEntity<Message> findLastMessageByChat(@PathVariable String username,
                                                         @PathVariable String selectedChat) {
        Long chatId = chatService.getOrCreateChat(username, selectedChat).getChatId();
        Message message = messageService.findTopByChatIdOrderByDateCreatedDesc(chatId);
        return ResponseEntity.ok(message);
    }
}
