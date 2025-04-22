package com.mkstr.chat.data;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NonNull;
import org.antlr.v4.runtime.misc.NotNull;

import java.util.List;

@Data
@Entity
@Table(name = "Users")
public class User {
    @Id
    private String username;
    private String firstName;
    private Status status = Status.OFFLINE;
}
