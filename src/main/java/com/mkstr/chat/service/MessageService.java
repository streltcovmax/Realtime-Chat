package com.mkstr.chat.service;

import com.mkstr.chat.model.Message;
import com.mkstr.chat.repositories.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static com.mkstr.chat.service.ChatService.GROUP_SELECTOR_PREFIX;

@Service
@RequiredArgsConstructor
public class MessageService {
    private final MessageRepository messageRepository;

    public void save(Message message) {
        messageRepository.save(message);
    }

    public Message findTopByChatIdOrderByDateCreatedDesc(Long chatId) {
        Page<Message> page = messageRepository.findByChatIdOrderByDateCreatedDesc(
                chatId, PageRequest.of(0, 1));
        return page.hasContent() ? page.getContent().getFirst() : null;
    }

    public List<Message> findAllByChatId(Long chatId) {
        return messageRepository.findAllByChatId(chatId);
    }

    public Page<Message> findByChatId(Long chatId, Pageable pageable) {
        return messageRepository.findByChatIdOrderByDateCreatedDesc(chatId, pageable);
    }

    public Page<Message> findPageContainingMessage(Long chatId, long messageId, int size) {
        Message target = messageRepository.findById(messageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!chatId.equals(target.getChatId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        }
        long newerCount = messageRepository.countNewerMessagesInChat(
                chatId,
                target.getDateCreated(),
                target.getMessage_id()
        );
        int safeSize = Math.max(size, 1);
        int page = Math.toIntExact(newerCount / safeSize);
        return messageRepository.findByChatIdOrderByDateCreatedDesc(chatId, PageRequest.of(page, safeSize));
    }

    public Integer countByChatIdAndRecipientIdAndReadIsFalse(Long chatId, String recipientId) {
        return messageRepository.countByChatIdAndRecipientIdAndReadIsFalse(chatId, recipientId);
    }

    public Integer countGroupUnread(Long chatId, String username) {
        return messageRepository.countByChatIdAndSenderIdNotAndReadIsFalse(chatId, username);
    }

    public List<Message> readPageForUser(Page<Message> messages, String username) {
        List<Message> messagesToRead = messages.stream()
                .filter(message -> shouldMarkReadForUser(message, username))
                .toList();
        if (!messagesToRead.isEmpty()) {
            messagesToRead.forEach(message -> message.setRead(true));
            return messageRepository.saveAll(messagesToRead);
        }
        return List.of();
    }

    private boolean shouldMarkReadForUser(Message message, String username) {
        if (Boolean.TRUE.equals(message.getRead())) {
            return false;
        }
        String recipientId = message.getRecipientId();
        if (username.equals(recipientId)) {
            return true;
        }
        return recipientId != null
                && recipientId.startsWith(GROUP_SELECTOR_PREFIX)
                && !username.equals(message.getSenderId());
    }

    @Transactional
    public Message markReadForRecipient(long messageId, String recipientUsername) {
        Message m = messageRepository.findById(messageId).orElse(null);
        if (m == null) {
            return null;
        }
        if (!recipientUsername.equals(m.getRecipientId()) && !String.valueOf(m.getRecipientId()).startsWith(GROUP_SELECTOR_PREFIX)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (Boolean.TRUE.equals(m.getRead())) {
            return null;
        }
        m.setRead(true);
        return messageRepository.save(m);
    }
}
