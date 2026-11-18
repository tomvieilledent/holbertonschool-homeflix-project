package com.homeflix.acquisition.catalogue;

import java.util.List;

/** Page du catalogue (voir « Pagination » dans docs/api/CONVENTIONS.md). */
public record CataloguePageResponse(List<CatalogueEntryResponse> items, int page, int size, long total, int totalPages) {
}
