package com.mkstr.chat.repositories;

import com.mkstr.chat.model.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {
    List<Message> findAllByChatId(Long chatId);

    Message findTopByChatIdOrderByDateCreatedDesc(Long chatId);

    Page<Message> findByChatIdOrderByDateCreatedDesc(Long chatId, Pageable pageable);

    Integer countByChatIdAndRecipientIdAndReadIsFalse(Long chatId, String recipientId);
}
