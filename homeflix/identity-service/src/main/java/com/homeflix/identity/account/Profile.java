package com.homeflix.identity.account;

import java.time.Instant;
import java.util.UUID;

import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "profiles")
public class Profile {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Account account;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String avatar;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Profile() {
    }

    public Profile(Account account, String name, String avatar) {
        this.id = UUID.randomUUID();
        this.account = account;
        this.name = name;
        this.avatar = avatar;
    }

    public UUID getId() { return id; }
    public Account getAccount() { return account; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getAvatar() { return avatar; }
    public void setAvatar(String avatar) { this.avatar = avatar; }
    public Instant getCreatedAt() { return createdAt; }
}
