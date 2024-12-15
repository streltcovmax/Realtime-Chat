package com.mkstr.chat.data;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.NonNull;
import lombok.RequiredArgsConstructor;

import java.util.List;

@Data
@Entity
@Table(name="Chats")
public class Chat {
    @Id
    @GeneratedValue
    private Long chatId;
    private String lastMessage;

//    @OneToMany
//    private List<ChatParticipants> participantsList;
}
