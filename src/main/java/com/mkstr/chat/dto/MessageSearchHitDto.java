package com.mkstr.chat.dto;

import java.util.Date;


//Элемент результата поиска по сообщениям
public record MessageSearchHitDto(
        long messageId,
        long chatId,
        String content,
        String senderId,
        String recipientId,
        Date dateCreated
) {}
