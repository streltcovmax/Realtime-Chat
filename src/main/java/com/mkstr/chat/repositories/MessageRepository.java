package com.mkstr.chat.repositories;

import com.mkstr.chat.data.Message;
import org.springframework.data.repository.CrudRepository;

import java.util.List;

public interface MessageRepository extends CrudRepository<Message, Long> {
    //List<ChatMessage> findByChatId(String chatId);
}
