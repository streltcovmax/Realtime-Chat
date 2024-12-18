package com.mkstr.chat.services;

import com.mkstr.chat.data.Chat;
import com.mkstr.chat.data.ChatParticipant;
import com.mkstr.chat.data.ChatParticipantId;
import com.mkstr.chat.data.User;
import com.mkstr.chat.repositories.ChatParticipantRepository;
import com.mkstr.chat.repositories.ChatRepository;
import com.mkstr.chat.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@Slf4j
@RequiredArgsConstructor
public class ChatService {
    private final ChatParticipantRepository participantRepository;
    private final ChatRepository chatRepository;
    private final UserRepository userRepository;

    public Chat getOrCreateChat(String sender, String recipient){
        List<ChatParticipant> senderChatsList = participantRepository.findAllByUserUsername(sender);
        List<ChatParticipant> recipientChatsList = participantRepository.findAllByUserUsername(recipient);

        Chat chat;

        Set<Long> senderChatsSet = new HashSet<>();
        for(ChatParticipant participant: senderChatsList)
            senderChatsSet.add(participant.getChat().getChatId());
        for(ChatParticipant participant: recipientChatsList){
            chat = participant.getChat();
            Long chatId = chat.getChatId();
            if(senderChatsSet.contains(chatId)){
                return chat;
            }
        }
        chat = new Chat();
        chatRepository.save(chat);

        ChatParticipantId participant1 = new ChatParticipantId(sender, chat.getChatId());
        ChatParticipantId participant2 = new ChatParticipantId(recipient, chat.getChatId());

        User user1 = userRepository.findByUsername(sender);
        User user2 = userRepository.findByUsername(recipient);

        participantRepository.saveAll(Arrays.asList(
                new ChatParticipant(participant1, user1, chat),
                new ChatParticipant(participant2, user2, chat))
        );
        return chat;
    }

    public void saveLastMessage(Chat chat, String messageText){
        chat.setLastMessage(messageText);
        chatRepository.save(chat);
    }

    public List<Long> findUserChatsIds(String username){
        List<ChatParticipant> chatPart = participantRepository.findAllByUserUsername(username);
        List<Long> chatsIds = new ArrayList<>();
        for(ChatParticipant chat: chatPart){
            chatsIds.add(chat.getChat().getChatId());
        }
        return chatsIds;
    }

    public List<User> findContacts(String username){
        List<Long> userChats = findUserChatsIds(username);
        Set<ChatParticipant> participants = new HashSet<>();
        for(Long id: userChats){
            participants.addAll(participantRepository.findAllByChatChatId(id));
        }
        List<User> users = new ArrayList<>();
        for(ChatParticipant part: participants){
            User user = userRepository.findByUsername(part.getUser().getUsername());
            if(!Objects.equals(user.getUsername(), username))
                users.add(user);
        }
        return users;
    }

}
