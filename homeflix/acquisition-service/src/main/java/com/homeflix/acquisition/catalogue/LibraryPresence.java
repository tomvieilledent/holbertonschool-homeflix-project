package com.homeflix.acquisition.catalogue;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.homeflix.acquisition.download.Download;
import com.homeflix.acquisition.download.DownloadRepository;
import com.homeflix.acquisition.library.LibraryClient;
import com.homeflix.acquisition.library.LibraryUnavailableException;

/** Entrées du catalogue dont le film est déjà dans la bibliothèque, après un téléchargement fait par HomeFlix. */
@Component
public class LibraryPresence {

    private final DownloadRepository downloads;
    private final LibraryClient library;

    public LibraryPresence(DownloadRepository downloads, LibraryClient library) {
        this.downloads = downloads;
        this.library = library;
    }

    /**
     * Identifiant du média dans Library, par entrée. Library est consultée : un film retiré ou disparu peut être
     * retéléchargé. Si elle ne répond pas, on s'en tient à ce qu'Acquisition a enregistré.
     */
    public Map<UUID, UUID> mediaByEntry(Collection<UUID> entryIds) {
        Map<UUID, UUID> known = new LinkedHashMap<>();
        if (!entryIds.isEmpty()) {
            for (Download d : downloads.findByEntryIdInAndLibraryMediaIdIsNotNullOrderByCreatedAtDesc(entryIds)) {
                known.putIfAbsent(d.getEntryId(), d.getLibraryMediaId());
            }
        }
        if (known.isEmpty()) {
            return known;
        }
        try {
            Set<UUID> present = library.present(known.values());
            known.values().removeIf(mediaId -> !present.contains(mediaId));
        } catch (LibraryUnavailableException e) {
            // état enregistré conservé
        }
        return known;
    }
}
