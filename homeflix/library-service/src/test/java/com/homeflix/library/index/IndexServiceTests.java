package com.homeflix.library.index;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.homeflix.library.api.ApiException;

/** Règles de lancement : un seul scan à la fois, états du statut. Le scan lui-même est mocké. */
class IndexServiceTests {

	/** Exécuteur manuel : la tâche ne démarre que quand le test le décide. */
	static class ManualExecutor implements Executor {
		final List<Runnable> tasks = new ArrayList<>();
		@Override public void execute(Runnable task) { tasks.add(task); }
		void runAll() { tasks.forEach(Runnable::run); tasks.clear(); }
	}

	IndexScanner scanner = mock(IndexScanner.class);
	ManualExecutor executor = new ManualExecutor();
	IndexService service = new IndexService(scanner, executor);

	@Test
	void statusIsIdleBeforeAnyScan() {
		assertThat(service.status().state()).isEqualTo(IndexState.IDLE);
	}

	@Test
	void secondStartWhileRunningIsRefusedWith409() {
		service.start();

		assertThatThrownBy(service::start)
				.isInstanceOfSatisfying(ApiException.class, e -> {
					assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
					assertThat(e.getCode()).isEqualTo("INDEX_ALREADY_RUNNING");
				});
		assertThat(executor.tasks).hasSize(1);
	}

	@Test
	void canStartAgainOnceTheScanIsFinished() {
		IndexStatus first = service.start();
		assertThat(first.state()).isEqualTo(IndexState.RUNNING);
		executor.runAll();
		assertThat(service.status().state()).isEqualTo(IndexState.COMPLETED);
		assertThat(service.status().finishedAt()).isNotNull();

		IndexStatus second = service.start();
		assertThat(second.jobId()).isNotEqualTo(first.jobId());
	}

	@Test
	void aCrashingScanEndsInFailedAndDoesNotBlockTheNextOne() {
		doThrow(new IllegalStateException("boom")).when(scanner).scan(org.mockito.ArgumentMatchers.any());
		service.start();
		executor.runAll();

		assertThat(service.status().state()).isEqualTo(IndexState.FAILED);
		service.start();
	}
}
