package com.mkstr.chat.data;

import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ChatParticipantId implements Serializable {
    private String userId;
    private Long chatId;
}
