package com.homeflix.library.catalogue;

import java.util.List;

public record MediaPage(List<MediaView> items, int page, int size, long total, int totalPages) {
}
