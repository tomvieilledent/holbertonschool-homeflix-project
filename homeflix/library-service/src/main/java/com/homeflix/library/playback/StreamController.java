package com.homeflix.library.playback;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.api.ApiException;

/**
 * Lecture d'un média avec prise en charge de {@code Range} (le lecteur peut avancer sans tout télécharger).
 * L'accès est protégé par le ticket de streaming (#51), pas par l'en-tête Authorization. Le fichier est retrouvé
 * par {@link PlaybackService} (SafePathResolver) : le chemin disque n'apparaît jamais dans une réponse.
 */
@RestController
@RequestMapping("/api/v1/stream")
public class StreamController {

    /** Taille maximale d'une réponse partielle : évite de lire un gros fichier d'un seul bloc. */
    private static final long CHUNK = 4L * 1024 * 1024;

    private final StreamTicketService tickets;
    private final PlaybackService playback;

    public StreamController(StreamTicketService tickets, PlaybackService playback) {
        this.tickets = tickets;
        this.playback = playback;
    }

    @GetMapping("/{mediaId}")
    public ResponseEntity<ResourceRegion> stream(@PathVariable UUID mediaId,
            @RequestParam(name = "t", required = false) String ticket,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader) throws IOException {
        tickets.verify(ticket, mediaId);
        Path file = playback.locate(mediaId);
        long size = Files.size(file);
        FileSystemResource resource = new FileSystemResource(file);
        MediaType type = contentType(file);

        ResponseEntity.BodyBuilder response;
        ResourceRegion region;
        if (rangeHeader == null || rangeHeader.isBlank()) {
            response = ResponseEntity.status(HttpStatus.OK);
            region = new ResourceRegion(resource, 0, size);
        } else {
            long[] bounds = parse(rangeHeader, size);
            long start = bounds[0];
            long length = Math.min(bounds[1] - start + 1, CHUNK);
            response = ResponseEntity.status(HttpStatus.PARTIAL_CONTENT);
            region = new ResourceRegion(resource, start, length);
        }
        return response
            .header(HttpHeaders.ACCEPT_RANGES, "bytes")
            .contentType(type)
            .cacheControl(CacheControl.noStore().cachePrivate())
            .body(region);
    }

    /** @return {début, fin} inclusifs ; 416 si la plage est invalide, hors du fichier ou multiple. */
    private static long[] parse(String header, long size) {
        List<HttpRange> ranges;
        try {
            ranges = HttpRange.parseRanges(header);
        } catch (IllegalArgumentException e) {
            throw unsatisfiable(size);
        }
        if (ranges.size() != 1 || size == 0) {
            throw unsatisfiable(size);
        }
        HttpRange range = ranges.get(0);
        long start;
        long end;
        try {
            start = range.getRangeStart(size);
            end = range.getRangeEnd(size);
        } catch (IllegalArgumentException e) {
            throw unsatisfiable(size);
        }
        if (start >= size || end < start) {
            throw unsatisfiable(size);
        }
        return new long[] {start, Math.min(end, size - 1)};
    }

    private static ApiException unsatisfiable(long size) {
        return new ApiException(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, "RANGE_NOT_SATISFIABLE",
            "Plage invalide", "La plage demandée est invalide ou hors du fichier.")
            .withHeader(HttpHeaders.CONTENT_RANGE, "bytes */" + size);
    }

    private static MediaType contentType(Path file) {
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        if (name.endsWith(".mp4") || name.endsWith(".m4v")) {
            return MediaType.parseMediaType("video/mp4");
        }
        if (name.endsWith(".webm")) {
            return MediaType.parseMediaType("video/webm");
        }
        if (name.endsWith(".mkv")) {
            return MediaType.parseMediaType("video/x-matroska");
        }
        return MediaType.APPLICATION_OCTET_STREAM;
    }
}
