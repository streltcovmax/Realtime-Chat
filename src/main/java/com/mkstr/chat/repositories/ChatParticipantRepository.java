package com.mkstr.chat.repositories;

import com.mkstr.chat.data.ChatParticipant;
import com.mkstr.chat.data.ChatParticipantId;
import org.springframework.data.repository.CrudRepository;

import java.util.List;

public interface ChatParticipantRepository extends CrudRepository<ChatParticipant, ChatParticipantId> {
    List<ChatParticipant> findAllByUserUsername(String username);
    List<ChatParticipant> findAllByChatChatId(Long chatId);
}
