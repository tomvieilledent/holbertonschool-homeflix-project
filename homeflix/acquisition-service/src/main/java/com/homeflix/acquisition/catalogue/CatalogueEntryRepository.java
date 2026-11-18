package com.homeflix.acquisition.catalogue;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CatalogueEntryRepository extends JpaRepository<CatalogueEntry, UUID> {
}
