package com.homeflix.library.viewing;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FavouriteRepository extends JpaRepository<Favourite, FavouriteId> {

    List<Favourite> findByIdProfileId(UUID profileId);
}
