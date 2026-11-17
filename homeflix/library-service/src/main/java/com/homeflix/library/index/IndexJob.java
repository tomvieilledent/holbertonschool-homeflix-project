package com.homeflix.library.index;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Une exécution de l'indexation. Les compteurs sont atomiques : le scan les incrémente dans son
 * thread pendant qu'une requête HTTP lit l'état.
 */
public class IndexJob {

    private final UUID id = UUID.randomUUID();
    private final Instant startedAt = Instant.now();
    private final AtomicInteger scanned = new AtomicInteger();
    private final AtomicInteger added = new AtomicInteger();
    private final AtomicInteger updated = new AtomicInteger();
    private final AtomicInteger markedUnavailable = new AtomicInteger();
    private final AtomicInteger duplicates = new AtomicInteger();
    private final AtomicInteger errors = new AtomicInteger();
    private volatile IndexState state = IndexState.RUNNING;
    private volatile Instant finishedAt;

    public void scanned() { scanned.incrementAndGet(); }
    public void added() { added.incrementAndGet(); }
    public void updated() { updated.incrementAndGet(); }
    public void markedUnavailable(int n) { markedUnavailable.addAndGet(n); }
    public void duplicate() { duplicates.incrementAndGet(); }
    public void error() { errors.incrementAndGet(); }

    public void complete() { finish(IndexState.COMPLETED); }
    public void fail() { finish(IndexState.FAILED); }

    private void finish(IndexState finalState) {
        this.finishedAt = Instant.now();
        this.state = finalState;
    }

    public boolean isRunning() {
        return state == IndexState.RUNNING;
    }

    public IndexStatus snapshot() {
        return new IndexStatus(id, state, scanned.get(), added.get(), updated.get(), markedUnavailable.get(),
                duplicates.get(), errors.get(), startedAt, finishedAt);
    }
}
