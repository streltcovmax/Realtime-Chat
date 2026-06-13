package com.mkstr.chat.dto;

import java.util.List;

public record GroupCreateRequest(String name, List<String> usernames) {
}
