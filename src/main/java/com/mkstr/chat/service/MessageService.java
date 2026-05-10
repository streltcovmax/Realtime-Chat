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

    public Integer countByChatIdAndRecipientIdAndReadIsFalse(Long chatId, String recipientId) {
        return messageRepository.countByChatIdAndRecipientIdAndReadIsFalse(chatId, recipientId);
    }

    public void readPage(Page<Message> messages) {
        messages.forEach(message -> message.setRead(true));
        messageRepository.saveAll(messages);
    }

    @Transactional
    public void markReadForRecipient(long messageId, String recipientUsername) {
        Message m = messageRepository.findById(messageId).orElse(null);
        if (m == null) {
            return;
        }
        if (!recipientUsername.equals(m.getRecipientId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        if (Boolean.TRUE.equals(m.getRead())) {
            return;
        }
        m.setRead(true);
        messageRepository.save(m);
    }
}
