package com.mkstr.chat.controllers;

import com.mkstr.chat.model.Chat;
import com.mkstr.chat.model.Message;
import com.mkstr.chat.service.ChatService;
import com.mkstr.chat.service.MessageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.security.Principal;
import java.util.List;

import static com.mkstr.chat.utlis.Constant.MAX_MESSAGE_LENGTH;

@Slf4j
@Controller
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageService messageService;
    private final CurrentUserProvider currentUserProvider;

    @GetMapping("/")
    public String index(Model model, HttpServletRequest request) {
        model.addAttribute("maxMessageLength", MAX_MESSAGE_LENGTH);
        CsrfToken csrf = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        if (csrf == null) {
            Object attr = request.getAttribute("_csrf");
            if (attr instanceof CsrfToken ct) {
                csrf = ct;
            }
        }
        String tokenValue = "";
        String headerValue = "X-XSRF-TOKEN";
        if (csrf != null) {
            tokenValue = csrf.getToken();
            headerValue = csrf.getHeaderName();
        }
        model.addAttribute("csrfToken", tokenValue);
        model.addAttribute("csrfHeaderName", headerValue);
        return "index";
    }

    @MessageMapping("/chat")
    public void processMessage(@Payload Message message, Principal principal) {
        if (principal == null) {
            log.warn("chat message rejected: no principal");
            return;
        }
        String senderId = principal.getName();
        String recipientId = message.getRecipientId();
        String content = message.getContent();

        if (recipientId == null || recipientId.isBlank()) {
            log.warn("chat message rejected: empty recipient");
            return;
        }
        if (recipientId.equals(senderId)) {
            log.warn("chat message rejected: self-recipient");
            return;
        }
        if (content == null || content.isBlank()) {
            return;
        }
        if (content.length() > MAX_MESSAGE_LENGTH) {
            log.warn("chat message rejected: content too long from {}", senderId);
            return;
        }

        message.setSenderId(senderId);
        Chat chat = chatService.getOrCreateChat(senderId, recipientId);
        chatService.saveLastMessage(chat, content, message.getDateCreated());
        Long chatId = chat.getChatId();
        message.setChatId(chatId);
        messageService.save(message);
        messagingTemplate.convertAndSend("/user/" + recipientId + "/messages", message);
    }

    @GetMapping("/messages/all/{username}/{selectedChat}")
    public ResponseEntity<List<Message>> findChatMessages(@PathVariable String username,
                                                          @PathVariable String selectedChat) {
        assertPathUsernameMatchesSession(username);
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
        assertPathUsernameMatchesSession(username);
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
        assertPathUsernameMatchesSession(username);
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
        assertPathUsernameMatchesSession(username);
        Chat chat = chatService.findExistingChat(username, selectedChat);
        if (chat == null) {
            return ResponseEntity.noContent().build();
        }
        Long chatId = chat.getChatId();
        Integer count = messageService.countByChatIdAndRecipientIdAndReadIsFalse(chatId, username);
        return ResponseEntity.ok(count);
    }

    @PutMapping("/messages/read/{messageId}")
    @ResponseBody
    public ResponseEntity<Void> markOneMessageRead(@PathVariable long messageId) {
        messageService.markReadForRecipient(messageId, currentUserProvider.requireCurrentUsername());
        return ResponseEntity.noContent().build();
    }

    private void assertPathUsernameMatchesSession(String pathUsername) {
        String sessionUser = currentUserProvider.requireCurrentUsername();
        if (!sessionUser.equals(pathUsername)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }
}
