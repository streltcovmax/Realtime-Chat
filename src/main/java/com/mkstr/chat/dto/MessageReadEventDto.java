package com.mkstr.chat.dto;

public record MessageReadEventDto(
        Long messageId,
        Long chatId,
        String readBy
) {
}
