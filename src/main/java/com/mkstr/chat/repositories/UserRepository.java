package com.mkstr.chat.repositories;

import com.mkstr.chat.data.Status;
import com.mkstr.chat.data.User;
import org.springframework.data.repository.CrudRepository;

import java.util.List;

public interface UserRepository extends CrudRepository<User, String> {

    List<User> findAllByStatus(Status status);
    List<User> findAllByUsernameContains(String username);
    User findByUsername(String username);

//    List<User> findAll();

}
