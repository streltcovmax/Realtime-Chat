package com.mkstr.chat.model;

import jakarta.persistence.*;
import lombok.Data;

import java.util.Date;

import static com.mkstr.chat.utlis.Constant.CHAT_LAST_MESSAGE_MAX_LENGTH;

@Data
@Entity
@Table(name = "chats")
public class Chat {
    @Id
    @GeneratedValue
    private Long chatId;
    @Column(length = CHAT_LAST_MESSAGE_MAX_LENGTH)
    private String lastMessage;
    @Temporal(TemporalType.TIMESTAMP)
    private Date lastMessageAt;
    private String name;
}
