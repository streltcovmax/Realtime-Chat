package com.mkstr.chat.repositories;

import com.mkstr.chat.model.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MessageRepository extends JpaRepository<Message, Long> {

    @Query("SELECT m FROM Message m WHERE m.chatId = :chatId ORDER BY m.dateCreated ASC, m.message_id ASC")
    List<Message> findAllByChatId(@Param("chatId") Long chatId);

    @Query("SELECT m FROM Message m WHERE m.chatId = :chatId ORDER BY m.dateCreated DESC, m.message_id DESC")
    Page<Message> findByChatIdOrderByDateCreatedDesc(@Param("chatId") Long chatId, Pageable pageable);

    Integer countByChatIdAndRecipientIdAndReadIsFalse(Long chatId, String recipientId);
}
