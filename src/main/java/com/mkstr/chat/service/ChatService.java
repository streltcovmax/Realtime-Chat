package com.mkstr.chat.service;

import com.mkstr.chat.dto.ChatParticipantId;
import com.mkstr.chat.model.Chat;
import com.mkstr.chat.model.ChatParticipant;
import com.mkstr.chat.model.User;
import com.mkstr.chat.repositories.ChatParticipantRepository;
import com.mkstr.chat.repositories.ChatRepository;
import com.mkstr.chat.repositories.UserRepository;
import com.mkstr.chat.utlis.Constant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
@RequiredArgsConstructor
public class ChatService {
    private static final ConcurrentHashMap<String, Object> chatPairLocks = new ConcurrentHashMap<>();

    private final ChatParticipantRepository participantRepository;
    private final ChatRepository chatRepository;
    private final UserRepository userRepository;

    private static Object getLockForPair(String user1, String user2) {
        String key = user1.compareTo(user2) < 0 ? user1 + "|" + user2 : user2 + "|" + user1;
        return chatPairLocks.computeIfAbsent(key, k -> new Object());
    }

    public Chat findExistingChat(String sender, String recipient) {
        List<ChatParticipant> senderChatsList = participantRepository.findAllByUserUsername(sender);
        List<ChatParticipant> recipientChatsList = participantRepository.findAllByUserUsername(recipient);

        Set<Long> senderChatsSet = new HashSet<>();
        for (ChatParticipant participant : senderChatsList) {
            senderChatsSet.add(participant.getChat().getChatId());
        }
        for (ChatParticipant participant : recipientChatsList) {
            Chat chat = participant.getChat();
            Long chatId = chat.getChatId();
            if (senderChatsSet.contains(chatId)) {
                return chat;
            }
        }
        return null;
    }

    public Chat getOrCreateChat(String sender, String recipient) {
        synchronized (getLockForPair(sender, recipient)) {
            Chat existing = findExistingChat(sender, recipient);
            if (existing != null) {
                return existing;
            }

            Chat chat = new Chat();
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
    }

    public void saveLastMessage(Chat chat, String messageText, Date sentAt) {
        chat.setLastMessage(truncateToLastMessagePreview(messageText));
        chat.setLastMessageAt(sentAt != null ? sentAt : new Date());
        chatRepository.save(chat);
    }

    private static String truncateToLastMessagePreview(String text) {
        if (text == null) return null;
        int max = Constant.CHAT_LAST_MESSAGE_MAX_LENGTH;
        if (text.codePointCount(0, text.length()) <= max) {
            return text;
        }
        int end = text.offsetByCodePoints(0, max);
        return text.substring(0, end);
    }

    public List<Long> findUserChatsIds(String username) {
        List<ChatParticipant> chatParticipants = participantRepository.findAllByUserUsername(username);
        log.info(username + " participates in " + chatParticipants.toString());
        List<Long> chatsIds = new ArrayList<>();
        for (ChatParticipant chat : chatParticipants) {
            chatsIds.add(chat.getChat().getChatId());
        }
        return chatsIds;
    }

    public List<User> findChatsByUsername(String username) {
        List<Long> chatIds = findUserChatsIds(username);
        log.info("user chats ids: {}", chatIds);

        List<AbstractMap.SimpleImmutableEntry<User, Date>> paired = new ArrayList<>();
        for (Long chatId : chatIds) {
            Chat chat = chatRepository.findById(chatId).orElse(null);
            Date lastAt = chat != null ? chat.getLastMessageAt() : null;

            for (ChatParticipant cp : participantRepository.findAllByChatChatId(chatId)) {
                User other = userRepository.findByUsername(cp.getUser().getUsername());
                if (other != null && !Objects.equals(other.getUsername(), username)) {
                    paired.add(new AbstractMap.SimpleImmutableEntry<>(other, lastAt));
                    break;
                }
            }
        }

        Comparator<Date> byNewestFirst = Comparator.nullsLast(Collections.reverseOrder());
        paired.sort(Map.Entry.<User, Date>comparingByValue(byNewestFirst));

        Map<String, User> orderedUnique = new LinkedHashMap<>();
        for (Map.Entry<User, Date> e : paired) {
            orderedUnique.putIfAbsent(e.getKey().getUsername(), e.getKey());
        }
        return new ArrayList<>(orderedUnique.values());
    }
}



