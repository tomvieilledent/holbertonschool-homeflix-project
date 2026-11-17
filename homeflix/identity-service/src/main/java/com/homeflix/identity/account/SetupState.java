package com.homeflix.identity.account;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** État de la configuration initiale : une seule ligne (`singleton` toujours vrai). */
@Entity
@Table(name = "setup_state")
public class SetupState {

    @Id
    private Boolean singleton = Boolean.TRUE;

    @Column(name = "token_hash")
    private String tokenHash;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected SetupState() {
    }

    public SetupState(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public String getTokenHash() { return tokenHash; }
    public Instant getCompletedAt() { return completedAt; }
    public boolean isCompleted() { return completedAt != null; }

    /** Le jeton de setup n'est plus valide une fois la configuration terminée. */
    public void complete(Instant when) {
        this.completedAt = when;
        this.tokenHash = null;
    }
}
