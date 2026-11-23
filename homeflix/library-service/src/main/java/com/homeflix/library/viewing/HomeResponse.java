package com.homeflix.library.viewing;

import java.util.List;

import com.homeflix.library.catalogue.MediaView;

/** Page d'accueil d'un profil (contrat `Home`) : les quatre sections sont toujours présentes, éventuellement vides. */
public record HomeResponse(List<ContinueWatchingItem> continueWatching, List<MediaView> recentlyAdded,
        List<GenreSection> categories, List<MediaView> favourites) {

    public record ContinueWatchingItem(MediaView media, ProgressView progress) {
    }

    public record GenreSection(String genre, List<MediaView> items) {
    }
}
