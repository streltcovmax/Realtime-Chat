package com.mkstr.chat.service;

import com.mkstr.chat.model.Status;
import com.mkstr.chat.model.User;
import com.mkstr.chat.repositories.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;

    public void save(User user) {
        userRepository.save(user);
    }

    public boolean existsByUsername(String username) {
        return userRepository.existsById(username);
    }

    public User disconnect(String username) {
        var storedUser = userRepository.findById(username).orElse(null);
        if (storedUser != null) {
            storedUser.setStatus(Status.OFFLINE);
            return userRepository.save(storedUser);
        }
        return null;
    }

    public List<User> findAllByUsername(String username) {
        return userRepository.findAllByUsernameContains(username);
    }

    public User findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    public long countOnlineUsers() {
        return userRepository.countByStatus(Status.ONLINE);
    }

    public long countUsers() {
        return userRepository.count();
    }
}
