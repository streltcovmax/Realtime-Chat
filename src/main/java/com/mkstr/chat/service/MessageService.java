package com.mkstr.chat.service;

import com.mkstr.chat.model.Message;
import com.mkstr.chat.repositories.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class MessageService {
    private final MessageRepository messageRepository;

    public void save(Message message) {
        messageRepository.save(message);
    }

    public Message findTopByChatIdOrderByDateCreatedDesc(Long chatId) {
        return messageRepository.findTopByChatIdOrderByDateCreatedDesc(chatId);
    }

    public List<Message> findAllByChatId(Long chatId) {
        return messageRepository.findAllByChatId(chatId);
    }

    public Page<Message> findByChatId(Long chatId, Pageable pageable) {
        return messageRepository.findByChatIdOrderByDateCreatedDesc(chatId, pageable);
    }
}
