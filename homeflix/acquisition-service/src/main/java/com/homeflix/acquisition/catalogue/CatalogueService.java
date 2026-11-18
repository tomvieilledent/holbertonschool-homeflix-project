package com.homeflix.acquisition.catalogue;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.acquisition.download.Download;
import com.homeflix.acquisition.download.DownloadRepository;
import com.homeflix.acquisition.download.DownloadState;

@Service
public class CatalogueService {

    private final CatalogueEntryRepository entries;
    private final DownloadRepository downloads;

    public CatalogueService(CatalogueEntryRepository entries, DownloadRepository downloads) {
        this.entries = entries;
        this.downloads = downloads;
    }

    /** Une page du catalogue, triée par titre (puis par identifiant, pour un ordre stable entre deux appels). */
    @Transactional(readOnly = true)
    public CataloguePageResponse list(int page, int size) {
        Page<CatalogueEntry> result = entries.findAll(
                PageRequest.of(page, size, Sort.by("title").ascending().and(Sort.by("id").ascending())));

        List<UUID> ids = result.getContent().stream().map(CatalogueEntry::getId).toList();
        // Un seul téléchargement actif par entrée (garanti par un index unique en base) : la Map est sans doublon.
        Map<UUID, UUID> activeDownloadByEntry = ids.isEmpty() ? Map.of()
                : downloads.findByEntryIdInAndStateIn(ids, DownloadState.ACTIVE).stream()
                        .collect(Collectors.toMap(Download::getEntryId, Download::getId, (a, b) -> a));

        List<CatalogueEntryResponse> items = result.getContent().stream()
                .map(entry -> toResponse(entry, activeDownloadByEntry.get(entry.getId())))
                .toList();
        return new CataloguePageResponse(items, result.getNumber(), result.getSize(), result.getTotalElements(),
                result.getTotalPages());
    }

    private static CatalogueEntryResponse toResponse(CatalogueEntry entry, UUID activeDownloadId) {
        // inLibrary et libraryMediaId viendront de la synchronisation avec Library (issue #99) : aucun fichier
        // n'est encore remis à Library, donc aucune entrée n'est « déjà dans la bibliothèque ».
        return new CatalogueEntryResponse(entry.getId(), entry.getTitle(), entry.getSource(), entry.getLicense(),
                entry.getLicenseProofUrl(), entry.getSizeBytes(), false, null, activeDownloadId);
    }
}
