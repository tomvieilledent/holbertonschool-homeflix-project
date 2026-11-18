package com.homeflix.library.index;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import com.homeflix.library.files.SafePathResolver;
import com.homeflix.library.media.MediaRoot;
import com.homeflix.library.media.MediaRootRepository;

/** Le scanner seul, avec un écrivain simulé : on y provoque l'échec d'écriture d'un fichier présent. */
class IndexScannerTests {

	@TempDir Path dir;

	@Test
	void aFileWhoseWriteFailedIsPassedToMarkMissingSoItStaysAvailable() throws Exception {
		Files.writeString(dir.resolve("a.mp4"), "1");
		Files.writeString(dir.resolve("b.mp4"), "2");
		MediaRoot root = new MediaRoot(dir.toRealPath().toString(), "test");
		MediaRootRepository roots = mock(MediaRootRepository.class);
		when(roots.findByRemovedFalseOrderByCreatedAtAsc()).thenReturn(List.of(root));
		IndexWriter writer = mock(IndexWriter.class);
		UUID bId = UUID.randomUUID();
		when(writer.upsert(any(), eq("a.mp4"), anyLong(), any())).thenThrow(new IllegalStateException("écriture impossible"));
		when(writer.upsert(any(), eq("b.mp4"), anyLong(), any())).thenReturn(new IndexWriter.Outcome(IndexWriter.Result.UNCHANGED, bId));
		IndexJob job = new IndexJob();

		new IndexScanner(roots, writer, new SafePathResolver()).scan(job);

		@SuppressWarnings("unchecked")
		ArgumentCaptor<Set<String>> failed = ArgumentCaptor.forClass(Set.class);
		verify(writer).markMissing(eq(root.getId()), eq(Set.of(bId)), failed.capture());
		assertThat(failed.getValue()).containsExactly("a.mp4");
		assertThat(job.snapshot().errors()).isEqualTo(1);
		assertThat(job.snapshot().scanned()).isEqualTo(2);
	}
}
