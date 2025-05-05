package com.mkstr.chat.repositories;

import com.mkstr.chat.model.ChatParticipant;
import com.mkstr.chat.model.ChatParticipantId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatParticipantRepository extends JpaRepository<ChatParticipant, ChatParticipantId> {
    List<ChatParticipant> findAllByUserUsername(String username);
    List<ChatParticipant> findAllByChatChatId(Long chatId);
}
