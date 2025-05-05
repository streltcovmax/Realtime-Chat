package com.mkstr.chat.model;

import jakarta.persistence.*;
import lombok.Data;

import java.util.Date;

@Data
@Entity
@Table(name="UsersInfo")
public class UserInfo {
    @Id
    @OneToOne
    @JoinColumn(name = "username", referencedColumnName = "username")
    private User user;
    private String lastName;
    private String bio;
    private Date birthday;
}
