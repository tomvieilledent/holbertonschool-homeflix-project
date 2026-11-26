package com.homeflix.acquisition.download;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.homeflix.acquisition.catalogue.CatalogueEntryRepository;
import com.homeflix.acquisition.library.LibraryClient;
import com.homeflix.acquisition.library.LibraryRejectedException;
import com.homeflix.acquisition.library.LibraryUnavailableException;
import com.homeflix.acquisition.torrent.TorrentClient;
import com.homeflix.acquisition.torrent.TorrentClientUnavailableException;
import com.homeflix.acquisition.torrent.TorrentStatus;

class DownloadSyncServiceTests {

	private final DownloadRepository downloads = mock(DownloadRepository.class);
	private final CatalogueEntryRepository entries = mock(CatalogueEntryRepository.class);
	private final TorrentClient torrent = mock(TorrentClient.class);
	private final LibraryClient library = mock(LibraryClient.class);
	private Download download;
	private DownloadSyncService sync;

	@BeforeEach
	void setUp() {
		download = new Download(UUID.randomUUID(), UUID.randomUUID());
		download.setState(DownloadState.DOWNLOADING);
		download.setTorrentId("abc");
		when(downloads.findByStateIn(DownloadState.ACTIVE)).thenReturn(List.of(download));
		when(downloads.findById(download.getId())).thenReturn(Optional.of(download));
		when(entries.findById(any())).thenReturn(Optional.empty());
		sync = new DownloadSyncService(downloads, entries, torrent, library, Duration.ofMinutes(15), 2);
	}

	private void torrentIs(TorrentStatus.State state, int progress, String error, String... files) {
		when(torrent.status("abc")).thenReturn(Optional.of(new TorrentStatus(state, progress, error, List.of(files))));
	}

	@Test
	void progressIsCopiedWhileDownloading() {
		torrentIs(TorrentStatus.State.DOWNLOADING, 42, null);
		sync.sync();
		assertThat(download.getProgressPercent()).isEqualTo(42);
		assertThat(download.getState()).isEqualTo(DownloadState.DOWNLOADING);
	}

	@Test
	void anActiveTorrentWithoutAnyPeerFailsAfterTheDelay() throws Exception {
		DownloadSyncService impatient = new DownloadSyncService(downloads, entries, torrent, library, Duration.ZERO, 2);
		when(torrent.status("abc")).thenReturn(Optional.of(
				new TorrentStatus(TorrentStatus.State.DOWNLOADING, 12, null, List.of(), Instant.EPOCH)));
		Thread.sleep(5);

		impatient.sync();

		verify(torrent).cancel("abc");
		assertThat(download.getState()).isEqualTo(DownloadState.FAILED);
		assertThat(download.getErrorCode()).isEqualTo("NO_PEERS");
	}

	@Test
	void anActiveTorrentKeepsRunningWhileItHasPeersOrWasRecentlyActive() {
		torrentIs(TorrentStatus.State.DOWNLOADING, 10, null);
		sync.sync();
		when(torrent.status("abc")).thenReturn(Optional.of(
				new TorrentStatus(TorrentStatus.State.DOWNLOADING, 11, null, List.of(), Instant.EPOCH)));
		sync.sync(); // sans pair, mais le téléchargement vient d'être créé : le délai n'est pas écoulé

		assertThat(download.getState()).isEqualTo(DownloadState.DOWNLOADING);
		assertThat(download.getProgressPercent()).isEqualTo(11);
	}

	@Test
	void theFileBeingDownloadedIsAnnouncedOnceThenReleasedIfItFails() {
		torrentIs(TorrentStatus.State.DOWNLOADING, 5, null, "complete/a.mp4");
		sync.sync();
		sync.sync();
		verify(library).registerDownloading("complete/a.mp4", null);

		torrentIs(TorrentStatus.State.FAILED, 5, "DISK_FULL");
		sync.sync();

		verify(library).registerFailed("complete/a.mp4");
	}

	@Test
	void anAnnouncementThatFailsIsRetriedWithoutFailingTheDownload() {
		doThrow(new LibraryUnavailableException()).doNothing().when(library).registerDownloading(anyString(), any());
		torrentIs(TorrentStatus.State.DOWNLOADING, 5, null, "complete/a.mp4");
		sync.sync();
		assertThat(download.getFileRelativePath()).isNull();
		sync.sync();

		assertThat(download.getState()).isEqualTo(DownloadState.DOWNLOADING);
		assertThat(download.getFileRelativePath()).isEqualTo("complete/a.mp4");
	}

	@Test
	void aCompletedTorrentIsDeclaredToLibraryAndCompleted() {
		torrentIs(TorrentStatus.State.COMPLETED, 100, null, "Sintel/sintel.mkv");
		sync.sync();
		verify(library).registerCompleted(anyString(), any());
		assertThat(download.getState()).isEqualTo(DownloadState.COMPLETED);
		assertThat(download.getFileRelativePath()).isEqualTo("Sintel/sintel.mkv");
		assertThat(download.getFinishedAt()).isNotNull();
	}

	@Test
	void anUnsafeOrNonVideoFileFailsTheDownloadWithoutCallingLibrary() {
		torrentIs(TorrentStatus.State.COMPLETED, 100, null, "../etc/passwd.mkv", "/abs/a.mkv", "notes.txt");
		sync.sync();
		verify(library, never()).registerCompleted(anyString(), any());
		assertThat(download.getState()).isEqualTo(DownloadState.FAILED);
		assertThat(download.getErrorCode()).isEqualTo("INVALID_FILE");
	}

	@Test
	void libraryDownMakesTheDownloadFailedWithAReadableCode() {
		torrentIs(TorrentStatus.State.COMPLETED, 100, null, "a.mp4");
		doThrow(new LibraryUnavailableException()).when(library).registerCompleted(anyString(), any());
		sync.sync();
		assertThat(download.getState()).isEqualTo(DownloadState.FAILED);
		assertThat(download.getErrorCode()).isEqualTo("LIBRARY_UNAVAILABLE");
		assertThat(DownloadService.messageFor("LIBRARY_UNAVAILABLE")).isNotBlank();
	}

	@Test
	void aRefusalFromLibraryIsNotReportedAsAnOutage() {
		torrentIs(TorrentStatus.State.COMPLETED, 100, null, "a.mp4");
		doThrow(new LibraryRejectedException()).when(library).registerCompleted(anyString(), any());
		sync.sync();
		assertThat(download.getState()).isEqualTo(DownloadState.FAILED);
		assertThat(download.getErrorCode()).isEqualTo("LIBRARY_REJECTED");
		assertThat(DownloadService.messageFor("LIBRARY_REJECTED")).contains("refusé");
	}

	@Test
	void onlyTheVideoFormatsAcceptedByLibraryAreHandedOver() {
		assertThat(DownloadSyncService.videoFile(List.of("a.avi", "a.mov", "a.m4v", "a.mp4"))).contains("a.mp4");
		assertThat(DownloadSyncService.videoFile(List.of("a.avi"))).isEmpty();
	}

	@Test
	void aClientDownIsToleratedThenFailsAfterTheConfiguredTicks() {
		when(torrent.status("abc")).thenThrow(new TorrentClientUnavailableException());
		sync.sync();
		assertThat(download.getState()).isEqualTo(DownloadState.DOWNLOADING);
		sync.sync();
		assertThat(download.getState()).isEqualTo(DownloadState.FAILED);
		assertThat(download.getErrorCode()).isEqualTo("TORRENT_CLIENT_UNAVAILABLE");
	}

	@Test
	void aTorrentFailureKeepsTheClientErrorCode() {
		torrentIs(TorrentStatus.State.FAILED, 10, "DISK_FULL");
		sync.sync();
		assertThat(download.getErrorCode()).isEqualTo("DISK_FULL");
	}

	@Test
	void aCancelledDownloadIsNeverRewritten() {
		download.setState(DownloadState.CANCELLED);
		when(downloads.findByStateIn(DownloadState.ACTIVE)).thenReturn(List.of(download));
		torrentIs(TorrentStatus.State.DOWNLOADING, 50, null);
		sync.sync();
		assertThat(download.getState()).isEqualTo(DownloadState.CANCELLED);
		assertThat(download.getProgressPercent()).isZero();
	}

	@Test
	void aTorrentAbandonedByAClientOutageIsRemovedOnceTheClientIsBack() {
		download.setState(DownloadState.FAILED);
		download.setErrorCode("TORRENT_CLIENT_UNAVAILABLE");
		when(downloads.findByStateAndErrorCodeAndTorrentIdIsNotNull(DownloadState.FAILED, "TORRENT_CLIENT_UNAVAILABLE"))
				.thenReturn(List.of(download));
		when(downloads.findByStateIn(DownloadState.ACTIVE)).thenReturn(List.of());
		doThrow(new TorrentClientUnavailableException()).when(torrent).cancel("abc");
		sync.sync();
		assertThat(download.getTorrentId()).isEqualTo("abc"); // toujours injoignable : on réessaie plus tard
		org.mockito.Mockito.doNothing().when(torrent).cancel("abc");
		sync.sync();
		verify(torrent, org.mockito.Mockito.times(2)).cancel("abc");
		assertThat(download.getTorrentId()).isNull();
		assertThat(download.getState()).isEqualTo(DownloadState.FAILED);
	}

	@Test
	void pathChecks() {
		assertThat(DownloadSyncService.isSafeVideoPath("a/b.MP4")).isTrue();
		assertThat(DownloadSyncService.isSafeVideoPath("a/../b.mp4")).isFalse();
		assertThat(DownloadSyncService.isSafeVideoPath("a\\b.mp4")).isFalse();
		assertThat(DownloadSyncService.isSafeVideoPath("b.exe")).isFalse();
	}
}
