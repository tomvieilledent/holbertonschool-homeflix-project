package com.homeflix.library.viewing;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.homeflix.library.api.ApiException;
import com.homeflix.library.catalogue.MediaCatalogueRepository;
import com.homeflix.library.catalogue.MediaPage;
import com.homeflix.library.catalogue.MediaView;

/** « Ma liste » : favoris d'un profil. Le profil vient toujours du jeton, jamais de la requête. */
@Service
public class FavouriteService {

    static final int MAX_SIZE = 50;

    private final FavouriteRepository favourites;
    private final MediaCatalogueRepository catalogue;

    public FavouriteService(FavouriteRepository favourites, MediaCatalogueRepository catalogue) {
        this.favourites = favourites;
        this.catalogue = catalogue;
    }

    @Transactional(readOnly = true)
    public MediaPage list(UUID profileId, int page, int size) {
        if (page < 0) {
            throw ApiException.validation("page", "La page doit être positive ou nulle.");
        }
        if (size < 1 || size > MAX_SIZE) {
            throw ApiException.validation("size", "La taille doit être comprise entre 1 et " + MAX_SIZE + ".");
        }
        long total = catalogue.countFavourites(profileId);
        List<MediaView> items = catalogue.findFavourites(profileId, size, (long) page * size);
        return new MediaPage(items, page, size, total, (int) ((total + size - 1) / size));
    }

    @Transactional
    public void add(UUID accountId, UUID profileId, UUID mediaId) {
        catalogue.findById(mediaId).orElseThrow(() -> ApiException.notFound("Ce média est introuvable."));
        favourites.addIfAbsent(accountId, profileId, mediaId);
    }

    @Transactional
    public void remove(UUID profileId, UUID mediaId) {
        favourites.remove(profileId, mediaId);
    }
}
