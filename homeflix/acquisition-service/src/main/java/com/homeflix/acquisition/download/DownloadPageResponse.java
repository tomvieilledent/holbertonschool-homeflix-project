package com.homeflix.acquisition.download;

import java.util.List;

public record DownloadPageResponse(List<DownloadResponse> items, int page, int size, long total, int totalPages) {
}
