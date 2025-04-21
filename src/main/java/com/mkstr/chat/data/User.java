package com.mkstr.chat.data;

import jakarta.persistence.*;
import lombok.Data;

import java.util.List;

@Data
@Entity
@Table(name = "Users")
public class User {
    @Id
    private String username;
    private String fullname;
    private Status status;
}
