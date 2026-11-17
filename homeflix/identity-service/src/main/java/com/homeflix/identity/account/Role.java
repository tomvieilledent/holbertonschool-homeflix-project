package com.homeflix.identity.account;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "roles")
public class Role {

    public static final String USER = "USER";
    public static final String ADMIN = "ADMIN";

    @Id
    private String name;

    protected Role() {
    }

    public Role(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}
