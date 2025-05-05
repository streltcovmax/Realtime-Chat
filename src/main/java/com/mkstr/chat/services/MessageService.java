package com.mkstr.chat.services;

import com.mkstr.chat.model.Message;
import com.mkstr.chat.repositories.MessageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MessageService {
    private final MessageRepository messageRep;

    public void save(Message message){
        messageRep.save(message);
    }
}
