package com.mkstr.chat.repositories;

import com.mkstr.chat.data.Chat;
import org.springframework.data.repository.CrudRepository;

public interface ChatRepository extends CrudRepository<Chat, Long> {

}