package com.mkstr.chat.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.util.Date;

@Data
@Entity
@Table(name = "Messages")
public class Message {
    @Id
    @GeneratedValue
    private Long message_id;
    private String content;
    private String senderId;
    private String recipientId;
    private Long chatId;
    private Date dateCreated;
    private Boolean read;
}
