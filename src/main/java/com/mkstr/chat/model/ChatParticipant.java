package com.mkstr.chat.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Data
@Table(name="chat_participants")
@NoArgsConstructor
@AllArgsConstructor
public class ChatParticipant {
    @EmbeddedId
    private ChatParticipantId id; 

    @ManyToOne
    @MapsId("userId")
    @JoinColumn(name = "username", referencedColumnName = "username")
    private User user;

    @ManyToOne
    @MapsId("chatId")
    @JoinColumn(name = "chat_id", referencedColumnName = "chatId")
    private Chat chat;
}
