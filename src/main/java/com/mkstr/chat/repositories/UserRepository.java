package com.mkstr.chat.repositories;

import com.mkstr.chat.data.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface UserRepository extends JpaRepository<User, String> {
    List<User> findAllByUsername(String username);
    User findByUsername(String username);
}
