package com.mkstr.chat.dto;

public record GroupChatEventDto(String action, Long chatId, ChatSummaryDto chat) {
}
