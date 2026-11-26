package com.homeflix.library.index;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Mp4DurationTests {

	@TempDir Path dir;

	private static byte[] box(String type, byte[]... children) {
		int length = 8;
		for (byte[] child : children) {
			length += child.length;
		}
		ByteBuffer buffer = ByteBuffer.allocate(length).putInt(length).put(type.getBytes(StandardCharsets.ISO_8859_1));
		for (byte[] child : children) {
			buffer.put(child);
		}
		return buffer.array();
	}

	private static byte[] mvhdV0(int timescale, int duration) {
		return box("mvhd", ByteBuffer.allocate(100).putInt(12, timescale).putInt(16, duration).array());
	}

	private Path file(String name, byte[]... boxes) throws Exception {
		ByteBuffer buffer = ByteBuffer.allocate(java.util.Arrays.stream(boxes).mapToInt(b -> b.length).sum());
		java.util.Arrays.stream(boxes).forEach(buffer::put);
		return Files.write(dir.resolve(name), buffer.array());
	}

	@Test
	void readsTheDurationEvenWhenMoovFollowsTheVideoData() throws Exception {
		Path file = file("film.mp4", box("ftyp", new byte[8]), box("mdat", new byte[5000]),
				box("moov", mvhdV0(1000, 596_400)));

		assertThat(Mp4Duration.read(file)).isEqualTo(596);
	}

	@Test
	void readsA64BitDuration() throws Exception {
		byte[] fields = ByteBuffer.allocate(112).put(0, (byte) 1).putInt(20, 600).putLong(24, 600L * 7200).array();

		assertThat(Mp4Duration.read(file("film.m4v", box("moov", box("mvhd", fields))))).isEqualTo(7200);
	}

	@Test
	void otherFormatsAndBrokenFilesHaveNoDuration() throws Exception {
		assertThat(Mp4Duration.read(file("film.mkv", box("moov", mvhdV0(1000, 5000))))).isNull();
		assertThat(Mp4Duration.read(file("vide.mp4"))).isNull();
		assertThat(Mp4Duration.read(file("texte.mp4", "pas une vidéo du tout".getBytes(StandardCharsets.UTF_8)))).isNull();
		assertThat(Mp4Duration.read(file("tronque.mp4", box("moov", box("mvhd", new byte[4]))))).isNull();
		assertThat(Mp4Duration.read(file("nul.mp4", box("moov", mvhdV0(0, 5000))))).isNull();
		assertThat(Mp4Duration.read(dir.resolve("absent.mp4"))).isNull();
	}
}
