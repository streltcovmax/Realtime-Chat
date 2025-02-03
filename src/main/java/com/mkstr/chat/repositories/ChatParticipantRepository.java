package com.mkstr.chat.repositories;

import com.mkstr.chat.data.ChatParticipant;
import com.mkstr.chat.data.ChatParticipantId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatParticipantRepository extends JpaRepository<ChatParticipant, ChatParticipantId> {
    List<ChatParticipant> findAllByUserUsername(String username);
    List<ChatParticipant> findAllByChatChatId(Long chatId);
}
