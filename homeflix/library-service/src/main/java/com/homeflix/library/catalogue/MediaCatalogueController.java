package com.homeflix.library.catalogue;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class MediaCatalogueController {

    private final MediaCatalogueService catalogue;

    public MediaCatalogueController(MediaCatalogueService catalogue) {
        this.catalogue = catalogue;
    }

    @GetMapping("/media")
    public MediaPage list(@RequestParam(required = false) String q,
            @RequestParam(required = false) String genre,
            @RequestParam(required = false) String availability,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return catalogue.list(q, genre, availability, sort, page, size);
    }

    @GetMapping("/media/{mediaId}")
    public MediaView get(@PathVariable UUID mediaId) {
        return catalogue.get(mediaId);
    }

    @GetMapping("/genres")
    public List<String> genres() {
        return catalogue.genres();
    }
}
