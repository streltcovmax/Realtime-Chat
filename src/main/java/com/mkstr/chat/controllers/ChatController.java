package com.mkstr.chat.controllers;

import com.mkstr.chat.model.Chat;
import com.mkstr.chat.model.Message;
import com.mkstr.chat.service.ChatService;
import com.mkstr.chat.service.MessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

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
        Chat chat = chatService.findExistingChat(username, selectedChat);
        if (chat == null) {
            return ResponseEntity.ok(List.of());
        }
        Long chatId = chat.getChatId();
        return ResponseEntity.ok(messageService.findAllByChatId(chatId));
    }

    @GetMapping("/messages/page/{username}/{selectedChat}")
    public ResponseEntity<Page<Message>> findAndReadChatMessagesPage(@PathVariable String username,
                                                                     @PathVariable String selectedChat,
                                                                     @RequestParam(defaultValue = "0") int page,
                                                                     @RequestParam(defaultValue = "5") int size) {
        Chat chat = chatService.findExistingChat(username, selectedChat);
        if (chat == null) {
            Pageable emptyPageable = PageRequest.of(page, size);
            return ResponseEntity.ok(Page.empty(emptyPageable));
        }
        Long chatId = chat.getChatId();
        Pageable pageable = PageRequest.of(page, size);
        Page<Message> messagePage = messageService.findByChatId(chatId, pageable);
        messageService.readPage(messagePage);
        return ResponseEntity.ok(messagePage);
    }

    @GetMapping("/messages/last/{username}/{selectedChat}")
    public ResponseEntity<Message> findLastMessageByChat(@PathVariable String username,
                                                         @PathVariable String selectedChat) {
        Chat chat = chatService.findExistingChat(username, selectedChat);
        if (chat == null) {
            return ResponseEntity.noContent().build();
        }
        Long chatId = chat.getChatId();
        Message message = messageService.findTopByChatIdOrderByDateCreatedDesc(chatId);
        return ResponseEntity.ok(message);
    }

    @GetMapping("/messages/{username}/{selectedChat}/count-unread")
    public ResponseEntity<Integer> getUnreadMessagesCount(@PathVariable String username,
                                                          @PathVariable String selectedChat) {
        Chat chat = chatService.findExistingChat(username, selectedChat);
        if (chat == null) {
            return ResponseEntity.noContent().build();
        }
        Long chatId = chat.getChatId();
        Integer count = messageService.countByChatIdAndRecipientIdAndReadIsFalse(chatId, username);
        return ResponseEntity.ok(count);
    }
}
