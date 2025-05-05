package com.mkstr.chat.services;

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

    public void save(User user){
        userRepository.save(user);
    }

    public void disconnect(String username){
        var storedUser = userRepository.findById(username).orElse(null);
        if(storedUser != null){
            storedUser.setStatus(Status.OFFLINE);
            userRepository.save(storedUser);
        }
    }

    public List<User> findAllByUsername(String username){
        return userRepository.findAllByUsernameContains(username);
    }

    public User findByUsername(String username){
        return userRepository.findByUsername(username);
    }


}
