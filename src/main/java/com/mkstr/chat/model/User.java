package com.mkstr.chat.model;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "users")
public class User {
    @Id
    private String username;
    private String firstName;
    private Status status = Status.OFFLINE;
}
