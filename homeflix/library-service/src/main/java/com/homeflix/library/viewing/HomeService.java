package com.homeflix.library.viewing;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.catalogue.MediaCatalogueRepository;
import com.homeflix.library.catalogue.MediaView;

/**
 * Accueil d'un profil en une requête (un seul instantané de la base). Les sections personnelles (« continuer à
 * regarder », « Ma liste ») dépendent uniquement du profil du jeton ; « récemment ajoutés » et les catégories sont
 * communes à tous les profils.
 */
@Service
public class HomeService {

    static final int SECTION_SIZE = 20;
    static final int PER_GENRE = 10;

    private final MediaCatalogueRepository catalogue;

    public HomeService(MediaCatalogueRepository catalogue) {
        this.catalogue = catalogue;
    }

    @Transactional(readOnly = true)
    public HomeResponse home(UUID profileId) {
        Map<String, List<MediaView>> byGenre = new LinkedHashMap<>();
        catalogue.findByGenre(PER_GENRE).forEach(e -> byGenre.computeIfAbsent(e.genre(), g -> new ArrayList<>()).add(e.media()));
        List<HomeResponse.GenreSection> categories = byGenre.entrySet().stream()
            .map(e -> new HomeResponse.GenreSection(e.getKey(), e.getValue())).toList();
        return new HomeResponse(continueWatching(profileId), catalogue.findRecentlyAdded(SECTION_SIZE), categories,
            catalogue.findFavourites(profileId, SECTION_SIZE, 0));
    }

    @Transactional(readOnly = true)
    public List<HomeResponse.ContinueWatchingItem> continueWatching(UUID profileId) {
        return catalogue.findContinueWatching(profileId, SECTION_SIZE).stream()
            .map(c -> new HomeResponse.ContinueWatchingItem(c.media(), new ProgressView(c.media().id(), c.positionSeconds(),
                c.durationSeconds(), ProgressState.valueOf(c.state()), c.updatedAt())))
            .toList();
    }
}
