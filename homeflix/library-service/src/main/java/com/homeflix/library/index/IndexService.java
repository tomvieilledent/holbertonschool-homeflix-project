package com.homeflix.library.index;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.homeflix.library.api.ApiException;

@Service
public class IndexService {

    private static final Logger log = LoggerFactory.getLogger(IndexService.class);

    private final IndexScanner scanner;
    private final Executor executor;
    private final AtomicReference<IndexJob> current = new AtomicReference<>();

    public IndexService(IndexScanner scanner, @Qualifier("indexExecutor") Executor executor) {
        this.scanner = scanner;
        this.executor = executor;
    }

    /** Démarre un scan asynchrone ; refuse s'il y en a déjà un en cours. */
    public IndexStatus start() {
        IndexJob job = new IndexJob();
        // Compare-and-set : si deux requêtes arrivent ensemble, une seule installe son job.
        IndexJob previous;
        do {
            previous = current.get();
            if (previous != null && previous.isRunning()) {
                throw new ApiException(HttpStatus.CONFLICT, "INDEX_ALREADY_RUNNING", "Indexation en cours",
                        "Une indexation est déjà en cours. Consultez /admin/index/status.");
            }
        } while (!current.compareAndSet(previous, job));

        try {
            executor.execute(() -> run(job));
        } catch (RuntimeException e) {
            job.fail();
            throw e;
        }
        return job.snapshot();
    }

    public IndexStatus status() {
        IndexJob job = current.get();
        return job == null ? IndexStatus.IDLE : job.snapshot();
    }

    private void run(IndexJob job) {
        try {
            scanner.scan(job);
            job.complete();
        } catch (RuntimeException e) {
            log.error("Indexation en échec", e);
            job.fail();
        }
    }
}
