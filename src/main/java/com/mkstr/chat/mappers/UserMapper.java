package com.mkstr.chat.mappers;

import com.mkstr.chat.model.User;
import org.mapstruct.Mapper;

import java.security.Principal;

@Mapper
public interface UserMapper {
    User eventToUser(Principal principal);
}
