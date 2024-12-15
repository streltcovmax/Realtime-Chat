package com.mkstr.chat.controllers;

import com.mkstr.chat.data.ChatParticipant;
import com.mkstr.chat.data.ChatParticipantId;
import com.mkstr.chat.data.Message;
import com.mkstr.chat.data.User;
import com.mkstr.chat.repositories.ChatParticipantRepository;
import com.mkstr.chat.repositories.ChatRepository;
import com.mkstr.chat.services.ChatService;
import com.mkstr.chat.services.MessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Controller
@RequiredArgsConstructor
public class ChatController {

    private final MessageService messageService;
    private final ChatParticipantRepository participantRepository;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/chat")
    public void processMessage(@Payload Message message){
        //Здесь у нас из js идет json message
        Long chatId = chatService.getOrCreateChat(message.getSenderId(), message.getRecipientId(), message.getContent());
        message.setChatId(chatId);
        messageService.save(message);
        messagingTemplate.convertAndSend("/user/" + message.getRecipientId() + "/messages", message);
    }



//    @GetMapping("/messages/{senderId}/{recipientId}")
//    public ResponseEntity<List<Message>> findChatMessages(@PathVariable String senderId,
//                                                              @PathVariable String recipientId) {
//        return ResponseEntity
//                .ok(chatMessageService.findChatMessages(senderId, recipientId));
//    }
}
