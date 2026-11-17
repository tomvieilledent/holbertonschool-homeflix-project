package com.homeflix.library.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** Le résolveur ne doit jamais renvoyer un chemin hors de la racine, quelle que soit l'entrée. */
class SafePathResolverTests {

	private final SafePathResolver resolver = new SafePathResolver();

	@TempDir Path sandbox;
	Path root;
	Path outside;

	@BeforeEach
	void setUp() throws IOException {
		root = Files.createDirectories(sandbox.resolve("media"));
		outside = Files.createDirectories(sandbox.resolve("secret"));
		Files.writeString(outside.resolve("passwd"), "secret");
		Files.createDirectories(root.resolve("films/2020"));
		Files.writeString(root.resolve("films/a.mp4"), "video");
		Files.writeString(root.resolve("films/2020/b.mp4"), "video");
	}

	@Test
	void resolvesAFileInsideTheRoot() throws IOException {
		assertThat(resolver.resolveInside(root, "films/a.mp4")).isEqualTo(root.toRealPath().resolve("films/a.mp4"));
	}

	@Test
	void resolvesANestedFile() throws IOException {
		assertThat(resolver.resolveInside(root, "films/2020/b.mp4")).isRegularFile();
	}

	@Test
	void acceptsRedundantCurrentDirectorySegments() throws IOException {
		assertThat(resolver.resolveInside(root, "./films/./a.mp4")).isEqualTo(root.toRealPath().resolve("films/a.mp4"));
	}

	@Test
	void acceptsADoubleDotInsideAFileName() throws IOException {
		Files.writeString(root.resolve("films/a..b.mp4"), "video");
		assertThat(resolver.resolveInside(root, "films/a..b.mp4")).isRegularFile();
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"../secret/passwd",
			"../../etc/passwd",
			"films/../../secret/passwd",
			"films/..",
			"..",
			"..\\secret\\passwd",
			"films\\..\\..\\secret\\passwd",
	})
	void refusesPathTraversal(String relative) {
		assertThatThrownBy(() -> resolver.resolveInside(root, relative)).isInstanceOf(UnsafePathException.class);
	}

	@ParameterizedTest
	@ValueSource(strings = { "/etc/passwd", "/", "\\windows\\system32" })
	void refusesAbsolutePaths(String relative) {
		assertThatThrownBy(() -> resolver.resolveInside(root, relative)).isInstanceOf(UnsafePathException.class);
	}

	@Test
	void refusesEmptyAndBlankPaths() {
		assertThatThrownBy(() -> resolver.resolveInside(root, "")).isInstanceOf(UnsafePathException.class);
		assertThatThrownBy(() -> resolver.resolveInside(root, "   ")).isInstanceOf(UnsafePathException.class);
		assertThatThrownBy(() -> resolver.resolveInside(root, null)).isInstanceOf(UnsafePathException.class);
	}

	@Test
	void refusesANulByte() {
		assertThatThrownBy(() -> resolver.resolveInside(root, "films/a.mp4\0.jpg")).isInstanceOf(UnsafePathException.class);
	}

	@Test
	void followsASymlinkThatStaysInsideTheRoot() throws IOException {
		Files.createSymbolicLink(root.resolve("raccourci.mp4"), root.resolve("films/a.mp4"));
		assertThat(resolver.resolveInside(root, "raccourci.mp4")).isEqualTo(root.toRealPath().resolve("films/a.mp4"));
	}

	@Test
	void refusesASymlinkToAFileOutsideTheRoot() throws IOException {
		Files.createSymbolicLink(root.resolve("evasion"), outside.resolve("passwd"));
		assertThatThrownBy(() -> resolver.resolveInside(root, "evasion")).isInstanceOf(UnsafePathException.class);
	}

	@Test
	void refusesAFileReachedThroughASymlinkedDirectoryOutsideTheRoot() throws IOException {
		Files.createSymbolicLink(root.resolve("dossier-evade"), outside);
		assertThatThrownBy(() -> resolver.resolveInside(root, "dossier-evade/passwd")).isInstanceOf(UnsafePathException.class);
	}

	@Test
	void refusesASiblingDirectorySharingTheRootNamePrefix() throws IOException {
		// /…/media-evil commence par « /…/media » en texte, mais n'est pas sous la racine.
		Path evil = Files.createDirectories(sandbox.resolve("media-evil"));
		Files.writeString(evil.resolve("f.mp4"), "x");
		Files.createSymbolicLink(root.resolve("prefixe"), evil.resolve("f.mp4"));
		assertThatThrownBy(() -> resolver.resolveInside(root, "prefixe")).isInstanceOf(UnsafePathException.class);
	}

	@Test
	void reportsAMissingFileAsNotFoundNotAsUnsafe() {
		assertThatThrownBy(() -> resolver.resolveInside(root, "films/absent.mp4")).isInstanceOf(NoSuchFileException.class);
	}
}
