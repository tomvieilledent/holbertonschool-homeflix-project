package com.homeflix.acquisition.catalogue;

import java.util.UUID;

/** Ce que le service est autorisé à télécharger pour une entrée du catalogue : lu en base, jamais fourni par un client. */
public record DownloadSource(UUID entryId, String title, String magnetUri, String infohash) {
}
