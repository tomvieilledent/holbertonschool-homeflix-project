package com.homeflix.library.index;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;

class VideoFilesTests {

	@Test
	void recognisesMp4MkvAndWebmWhateverTheCase() {
		assertThat(VideoFiles.isVideo(Path.of("/m/a.mp4"))).isTrue();
		assertThat(VideoFiles.isVideo(Path.of("/m/a.MKV"))).isTrue();
		assertThat(VideoFiles.isVideo(Path.of("/m/a.webm"))).isTrue();
	}

	@Test
	void ignoresOtherFilesHiddenFilesAndNamesWithoutExtension() {
		assertThat(VideoFiles.isVideo(Path.of("/m/notes.txt"))).isFalse();
		assertThat(VideoFiles.isVideo(Path.of("/m/film.mp4.part"))).isFalse();
		assertThat(VideoFiles.isVideo(Path.of("/m/._film.mp4"))).isFalse();
		assertThat(VideoFiles.isVideo(Path.of("/m/.mp4"))).isFalse();
		assertThat(VideoFiles.isVideo(Path.of("/m/mp4"))).isFalse();
	}

	@Test
	void derivesTheTitleFromTheFileNameOnly() {
		assertThat(VideoFiles.titleFrom("films/2020/big_buck_bunny.2008.mp4")).isEqualTo("big buck bunny 2008");
		assertThat(VideoFiles.titleFrom("Sintel.mkv")).isEqualTo("Sintel");
		assertThat(VideoFiles.titleFrom("a__b  c.webm")).isEqualTo("a b c");
	}

	@Test
	void keepsTheTitleWithinTheDatabaseLimit() {
		assertThat(VideoFiles.titleFrom("x".repeat(300) + ".mp4")).hasSize(200);
	}
}
