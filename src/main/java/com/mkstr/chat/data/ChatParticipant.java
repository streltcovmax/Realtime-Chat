package com.mkstr.chat.data;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Data
@Table(name="ChatParticipants")
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
    @JoinColumn(name = "chatId", referencedColumnName = "chatId")
    private Chat chat;
}
