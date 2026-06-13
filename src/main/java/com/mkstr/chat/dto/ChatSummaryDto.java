package com.mkstr.chat.dto;

import com.mkstr.chat.model.Status;

import java.util.Date;

public record ChatSummaryDto(
        Long chatId,
        String type,
        String selector,
        String name,
        String username,
        String fullname,
        Status status,
        String createdBy,
        int memberCount,
        String lastMessage,
        Date lastMessageAt
) {
}
