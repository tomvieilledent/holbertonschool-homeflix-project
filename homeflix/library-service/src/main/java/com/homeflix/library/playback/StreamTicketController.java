package com.homeflix.library.playback;

import java.util.UUID;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.security.CurrentProfile;

@RestController
@RequestMapping("/api/v1/media/{mediaId}/stream-ticket")
public class StreamTicketController {

    private final CurrentProfile currentProfile;
    private final PlaybackService playback;
    private final StreamTicketService tickets;

    public StreamTicketController(CurrentProfile currentProfile, PlaybackService playback, StreamTicketService tickets) {
        this.currentProfile = currentProfile;
        this.playback = playback;
        this.tickets = tickets;
    }

    /** Profil actif exigé (409 PROFILE_NOT_SELECTED), média lisible exigé (404 / 409), puis ticket de 2 h. */
    @PostMapping
    public StreamTicketResponse create(@PathVariable UUID mediaId) {
        UUID profileId = currentProfile.profileId();
        UUID accountId = currentProfile.accountId();
        playback.locate(mediaId);
        StreamTicketService.Ticket ticket = tickets.issue(accountId, profileId, mediaId);
        return new StreamTicketResponse("/api/library/v1/stream/" + mediaId + "?t=" + ticket.token(), ticket.expiresAt());
    }
}
