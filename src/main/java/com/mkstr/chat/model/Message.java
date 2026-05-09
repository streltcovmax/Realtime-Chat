package com.mkstr.chat.model;

import jakarta.persistence.*;
import lombok.Data;

import java.util.Date;
import static com.mkstr.chat.utlis.Constant.MAX_MESSAGE_LENGTH;

@Data
@Entity
@Table(name = "Messages")
public class Message {
    @Id
    @GeneratedValue
    private Long message_id;
    @Column(length = MAX_MESSAGE_LENGTH)
    private String content;
    private String senderId;
    private String recipientId;
    private Long chatId;
    private Date dateCreated;
    private Boolean read;
}
