package com.mkstr.chat.controllers;

import com.mkstr.chat.analytics.AnalyticsService;
import com.mkstr.chat.dto.GroupChatEventDto;
import com.mkstr.chat.dto.GroupCreateRequest;
import com.mkstr.chat.dto.GroupMemberRequest;
import com.mkstr.chat.model.Chat;
import com.mkstr.chat.model.ChatParticipant;
import com.mkstr.chat.model.Message;
import com.mkstr.chat.model.User;
import com.mkstr.chat.opensearch.MessageOpenSearchService;
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
import java.util.Objects;

import static com.mkstr.chat.utlis.Constant.MAX_MESSAGE_LENGTH;

@Slf4j
@Controller
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final MessageService messageService;
    private final CurrentUserProvider currentUserProvider;
    private final MessageOpenSearchService messageOpenSearchService;
    private final AnalyticsService analyticsService;

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
            analyticsService.messageRejected("no_principal", "", null, messageLength(message));
            return;
        }
        String senderId = principal.getName();
        if (message == null) {
            analyticsService.messageRejected("empty_payload", senderId, null, null);
            return;
        }
        String recipientId = message.getRecipientId();
        String content = message.getContent();

        if (recipientId == null || recipientId.isBlank()) {
            log.warn("chat message rejected: empty recipient");
            analyticsService.messageRejected("empty_recipient", senderId, recipientId, messageLength(message));
            return;
        }
        boolean groupMessage = chatService.isGroupSelector(recipientId);
        if (!groupMessage && recipientId.equals(senderId)) {
            log.warn("chat message rejected: self-recipient");
            analyticsService.messageRejected("self_recipient", senderId, recipientId, messageLength(message));
            return;
        }
        if (content == null || content.isBlank()) {
            analyticsService.messageRejected("blank_content", senderId, recipientId, messageLength(message));
            return;
        }
        if (content.length() > MAX_MESSAGE_LENGTH) {
            log.warn("chat message rejected: content too long from {}", senderId);
            analyticsService.messageRejected("content_too_long", senderId, recipientId, content.length());
            return;
        }

        message.setSenderId(senderId);
        Chat chat = groupMessage
                ? chatService.resolveChatForUser(senderId, recipientId)
                : chatService.getOrCreateChat(senderId, recipientId);
        chatService.saveLastMessage(chat, content, message.getDateCreated());
        Long chatId = chat.getChatId();
        message.setChatId(chatId);
        if (groupMessage) {
            message.setRecipientId(ChatService.groupSelector(chatId));
        }
        messageService.save(message);
        analyticsService.messageSent(message);
        messageOpenSearchService.indexMessage(message);
        if (groupMessage) {
            for (ChatParticipant participant : chatService.findParticipants(chatId)) {
                String username = participant.getUser().getUsername();
                if (!Objects.equals(username, senderId)) {
                    messagingTemplate.convertAndSend("/user/" + username + "/messages", message);
                }
            }
        } else {
            messagingTemplate.convertAndSend("/user/" + recipientId + "/messages", message);
        }
    }

    @GetMapping("/messages/all/{username}/{selectedChat}")
    public ResponseEntity<List<Message>> findChatMessages(@PathVariable String username,
                                                          @PathVariable String selectedChat) {
        assertPathUsernameMatchesSession(username);
        Chat chat = findExistingChatForSelector(username, selectedChat);
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
        Chat chat = findExistingChatForSelector(username, selectedChat);
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

    @GetMapping("/messages/page-around/{username}/{selectedChat}/{messageId}")
    public ResponseEntity<Page<Message>> findAndReadChatMessagesPageAround(
            @PathVariable String username,
            @PathVariable String selectedChat,
            @PathVariable long messageId,
            @RequestParam(defaultValue = "50") int size
    ) {
        assertPathUsernameMatchesSession(username);
        Chat chat = findExistingChatForSelector(username, selectedChat);
        if (chat == null) {
            Pageable emptyPageable = PageRequest.of(0, size);
            return ResponseEntity.ok(Page.empty(emptyPageable));
        }
        Page<Message> messagePage = messageService.findPageContainingMessage(chat.getChatId(), messageId, size);
        messageService.readPage(messagePage);
        return ResponseEntity.ok(messagePage);
    }

    @GetMapping("/messages/last/{username}/{selectedChat}")
    public ResponseEntity<Message> findLastMessageByChat(@PathVariable String username,
                                                         @PathVariable String selectedChat) {
        assertPathUsernameMatchesSession(username);
        Chat chat = findExistingChatForSelector(username, selectedChat);
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
        Chat chat = findExistingChatForSelector(username, selectedChat);
        if (chat == null) {
            return ResponseEntity.noContent().build();
        }
        Long chatId = chat.getChatId();
        Integer count = Boolean.TRUE.equals(chat.getGroupChat())
                ? messageService.countGroupUnread(chatId, username)
                : messageService.countByChatIdAndRecipientIdAndReadIsFalse(chatId, username);
        return ResponseEntity.ok(count);
    }

    @PostMapping("/groups")
    @ResponseBody
    public ResponseEntity<?> createGroup(@RequestBody GroupCreateRequest request) {
        String currentUsername = currentUserProvider.requireCurrentUsername();
        Chat chat = chatService.createGroup(
                currentUsername,
                request == null ? null : request.name(),
                request == null ? List.<String>of() : request.usernames()
        );
        notifyGroupParticipants(chat.getChatId());
        return ResponseEntity.ok(chatService.findChatSummariesByUsername(currentUsername).stream()
                .filter(summary -> Objects.equals(summary.chatId(), chat.getChatId()))
                .findFirst()
                .orElse(null));
    }

    @PostMapping("/groups/{chatId}/members")
    @ResponseBody
    public ResponseEntity<Boolean> addGroupMember(@PathVariable Long chatId, @RequestBody GroupMemberRequest request) {
        String currentUsername = currentUserProvider.requireCurrentUsername();
        boolean changed = chatService.addUserToGroup(chatId, currentUsername, request == null ? null : request.username());
        if (changed) {
            notifyGroupParticipants(chatId);
        }
        return ResponseEntity.ok(changed);
    }

    @DeleteMapping("/groups/{chatId}/members/{username}")
    @ResponseBody
    public ResponseEntity<Boolean> removeGroupMember(@PathVariable Long chatId, @PathVariable String username) {
        String currentUsername = currentUserProvider.requireCurrentUsername();
        boolean changed = chatService.removeUserFromGroup(chatId, currentUsername, username);
        if (changed) {
            notifyGroupRemoved(username, chatId);
            notifyGroupParticipants(chatId);
        }
        return ResponseEntity.ok(changed);
    }

    @DeleteMapping("/groups/{chatId}/leave")
    @ResponseBody
    public ResponseEntity<Void> leaveGroup(@PathVariable Long chatId) {
        String currentUsername = currentUserProvider.requireCurrentUsername();
        if (chatService.isGroupCreator(chatId, currentUsername)) {
            List<String> participants = chatService.deleteGroupAsCreator(chatId, currentUsername);
            participants.forEach(username -> notifyGroupRemoved(username, chatId));
            return ResponseEntity.noContent().build();
        }
        chatService.leaveGroup(chatId, currentUsername);
        notifyGroupRemoved(currentUsername, chatId);
        notifyGroupParticipants(chatId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/groups/{chatId}/members")
    @ResponseBody
    public ResponseEntity<List<User>> getGroupMembers(@PathVariable Long chatId) {
        String currentUsername = currentUserProvider.requireCurrentUsername();
        return ResponseEntity.ok(chatService.findGroupUsers(chatId, currentUsername));
    }

    @PutMapping("/messages/read/{messageId}")
    @ResponseBody
    public ResponseEntity<Void> markOneMessageRead(@PathVariable long messageId) {
        String currentUsername = currentUserProvider.requireCurrentUsername();
        Message message = messageService.markReadForRecipient(messageId, currentUsername);
        analyticsService.messageRead(message, currentUsername);
        return ResponseEntity.noContent().build();
    }

    private void assertPathUsernameMatchesSession(String pathUsername) {
        String sessionUser = currentUserProvider.requireCurrentUsername();
        if (!sessionUser.equals(pathUsername)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    private Chat findExistingChatForSelector(String username, String selectedChat) {
        if (chatService.isGroupSelector(selectedChat)) {
            return chatService.resolveChatForUser(username, selectedChat);
        }
        return chatService.findExistingChat(username, selectedChat);
    }

    private void notifyGroupParticipants(Long chatId) {
        for (ChatParticipant participant : chatService.findParticipants(chatId)) {
            String username = participant.getUser().getUsername();
            chatService.findChatSummaryByUsernameAndChatId(username, chatId)
                    .ifPresent(summary -> messagingTemplate.convertAndSend(
                            "/user/" + username + "/groupUpdates",
                            new GroupChatEventDto("UPSERT", chatId, summary)
                    ));
        }
    }

    private void notifyGroupRemoved(String username, Long chatId) {
        messagingTemplate.convertAndSend(
                "/user/" + username + "/groupUpdates",
                new GroupChatEventDto("REMOVE", chatId, null)
        );
    }

    private static Integer messageLength(Message message) {
        if (message == null || message.getContent() == null) {
            return null;
        }
        return message.getContent().length();
    }
}
