package com.mkstr.chat.service;

import com.mkstr.chat.dto.ChatParticipantId;
import com.mkstr.chat.dto.ChatSummaryDto;
import com.mkstr.chat.model.Chat;
import com.mkstr.chat.model.ChatParticipant;
import com.mkstr.chat.model.User;
import com.mkstr.chat.repositories.ChatParticipantRepository;
import com.mkstr.chat.repositories.ChatRepository;
import com.mkstr.chat.repositories.MessageRepository;
import com.mkstr.chat.repositories.UserRepository;
import com.mkstr.chat.utlis.Constant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import static org.springframework.http.HttpStatus.*;

@Service
@Slf4j
@RequiredArgsConstructor
public class ChatService {
    public static final String GROUP_SELECTOR_PREFIX = "chat-";

    private static final ConcurrentHashMap<String, Object> chatPairLocks = new ConcurrentHashMap<>();

    private final ChatParticipantRepository participantRepository;
    private final ChatRepository chatRepository;
    private final UserRepository userRepository;
    private final MessageRepository messageRepository;

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
            if (!Boolean.TRUE.equals(chat.getGroupChat()) && senderChatsSet.contains(chatId)) {
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
            chat.setGroupChat(false);
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

    public List<ChatSummaryDto> findChatSummariesByUsername(String username) {
        List<ChatParticipant> chatParticipants = participantRepository.findAllByUserUsername(username);
        List<ChatSummaryDto> summaries = new ArrayList<>();

        for (ChatParticipant participant : chatParticipants) {
            Chat chat = participant.getChat();
            List<ChatParticipant> members = participantRepository.findAllByChatChatId(chat.getChatId());

            if (Boolean.TRUE.equals(chat.getGroupChat())) {
                summaries.add(new ChatSummaryDto(
                        chat.getChatId(),
                        "GROUP",
                        groupSelector(chat.getChatId()),
                        chat.getName(),
                        null,
                        chat.getName(),
                        null,
                        chat.getCreatedBy(),
                        members.size(),
                        chat.getLastMessage(),
                        chat.getLastMessageAt()
                ));
                continue;
            }

            User other = members.stream()
                    .map(ChatParticipant::getUser)
                    .filter(user -> user != null && !Objects.equals(user.getUsername(), username))
                    .findFirst()
                    .orElse(null);
            if (other != null) {
                summaries.add(new ChatSummaryDto(
                        chat.getChatId(),
                        "DIRECT",
                        other.getUsername(),
                        other.getFullname(),
                        other.getUsername(),
                        other.getFullname(),
                        other.getStatus(),
                        chat.getCreatedBy(),
                        members.size(),
                        chat.getLastMessage(),
                        chat.getLastMessageAt()
                ));
            }
        }

        summaries.sort(Comparator.comparing(ChatSummaryDto::lastMessageAt, Comparator.nullsLast(Collections.reverseOrder())));
        return summaries;
    }

    public Optional<ChatSummaryDto> findChatSummaryByUsernameAndChatId(String username, Long chatId) {
        return findChatSummariesByUsername(username).stream()
                .filter(summary -> Objects.equals(summary.chatId(), chatId))
                .findFirst();
    }

    @Transactional
    public Chat createGroup(String creatorUsername, String name, Collection<String> usernames) {
        String normalizedName = name == null ? "" : name.trim();
        if (normalizedName.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "group name required");
        }

        LinkedHashSet<String> memberNames = new LinkedHashSet<>();
        memberNames.add(creatorUsername);
        if (usernames != null) {
            usernames.stream()
                    .filter(Objects::nonNull)
                    .map(String::trim)
                    .filter(s -> !s.isBlank())
                    .forEach(memberNames::add);
        }

        Chat chat = new Chat();
        chat.setName(normalizedName);
        chat.setGroupChat(true);
        chat.setCreatedBy(creatorUsername);
        chatRepository.save(chat);

        saveParticipants(chat, memberNames);
        return chat;
    }

    @Transactional
    public boolean addUserToGroup(Long chatId, String actorUsername, String usernameToAdd) {
        Chat chat = requireGroupCreator(chatId, actorUsername);
        String target = requireUsername(usernameToAdd);
        if (participantRepository.existsByUserUsernameAndChatChatId(target, chatId)) {
            return false;
        }
        saveParticipant(chat, target);
        return true;
    }

    @Transactional
    public boolean removeUserFromGroup(Long chatId, String actorUsername, String usernameToRemove) {
        Chat chat = requireGroupCreator(chatId, actorUsername);
        String target = requireUsername(usernameToRemove);
        if (Objects.equals(target, chat.getCreatedBy())) {
            throw new ResponseStatusException(BAD_REQUEST, "creator cannot be removed");
        }
        if (!participantRepository.existsByUserUsernameAndChatChatId(target, chatId)) {
            return false;
        }
        participantRepository.deleteById(new ChatParticipantId(target, chatId));
        return true;
    }

    @Transactional
    public void leaveGroup(Long chatId, String username) {
        Chat chat = requireGroupForUser(chatId, username);
        if (Objects.equals(username, chat.getCreatedBy())) {
            throw new ResponseStatusException(BAD_REQUEST, "creator cannot leave own group");
        }
        participantRepository.deleteById(new ChatParticipantId(username, chatId));
    }

    @Transactional
    public List<String> deleteGroupAsCreator(Long chatId, String creatorUsername) {
        requireGroupCreator(chatId, creatorUsername);
        List<String> participantUsernames = participantRepository.findAllByChatChatId(chatId).stream()
                .map(participant -> participant.getUser().getUsername())
                .toList();
        messageRepository.deleteByChatId(chatId);
        participantRepository.deleteAll(participantRepository.findAllByChatChatId(chatId));
        chatRepository.deleteById(chatId);
        return participantUsernames;
    }

    public boolean isGroupCreator(Long chatId, String username) {
        Chat chat = requireGroupForUser(chatId, username);
        return Objects.equals(username, chat.getCreatedBy());
    }

    public List<User> findGroupUsers(Long chatId, String requesterUsername) {
        requireGroupForUser(chatId, requesterUsername);
        return participantRepository.findAllByChatChatId(chatId).stream()
                .map(ChatParticipant::getUser)
                .filter(Objects::nonNull)
                .toList();
    }

    public Chat resolveChatForUser(String username, String selector) {
        if (selector != null && selector.startsWith(GROUP_SELECTOR_PREFIX)) {
            Long chatId = parseGroupSelector(selector);
            return requireGroupForUser(chatId, username);
        }
        Chat chat = findExistingChat(username, selector);
        if (chat == null) {
            throw new ResponseStatusException(NOT_FOUND);
        }
        return chat;
    }

    public Chat requireGroupForUser(Long chatId, String username) {
        Chat chat = chatRepository.findById(chatId)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND));
        if (!Boolean.TRUE.equals(chat.getGroupChat())) {
            throw new ResponseStatusException(BAD_REQUEST, "not a group chat");
        }
        if (!participantRepository.existsByUserUsernameAndChatChatId(username, chatId)) {
            throw new ResponseStatusException(FORBIDDEN);
        }
        return chat;
    }

    public List<ChatParticipant> findParticipants(Long chatId) {
        return participantRepository.findAllByChatChatId(chatId);
    }

    public boolean isGroupSelector(String selector) {
        return selector != null && selector.startsWith(GROUP_SELECTOR_PREFIX);
    }

    public static String groupSelector(Long chatId) {
        return GROUP_SELECTOR_PREFIX + chatId;
    }

    private Chat requireGroupCreator(Long chatId, String actorUsername) {
        Chat chat = requireGroupForUser(chatId, actorUsername);
        if (!Objects.equals(actorUsername, chat.getCreatedBy())) {
            throw new ResponseStatusException(FORBIDDEN);
        }
        return chat;
    }

    private void saveParticipants(Chat chat, Collection<String> usernames) {
        usernames.forEach(username -> saveParticipant(chat, username));
    }

    private void saveParticipant(Chat chat, String username) {
        User user = userRepository.findByUsername(username);
        if (user == null) {
            throw new ResponseStatusException(NOT_FOUND, "user not found: " + username);
        }
        ChatParticipantId participantId = new ChatParticipantId(username, chat.getChatId());
        participantRepository.save(new ChatParticipant(participantId, user, chat));
    }

    private String requireUsername(String username) {
        String normalized = username == null ? "" : username.trim();
        if (normalized.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "username required");
        }
        return normalized;
    }

    private Long parseGroupSelector(String selector) {
        try {
            return Long.parseLong(selector.substring(GROUP_SELECTOR_PREFIX.length()));
        } catch (RuntimeException e) {
            throw new ResponseStatusException(BAD_REQUEST, "invalid group selector");
        }
    }
}
