package com.mkstr.chat.model;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name="chats")
public class Chat {
    @Id
    @GeneratedValue
    private Long chatId;
    private String lastMessage;
}
