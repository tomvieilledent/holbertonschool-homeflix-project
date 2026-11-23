package com.homeflix.library.viewing;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.homeflix.library.security.CurrentProfile;

/** Accueil et « continuer à regarder » du profil actif. Le profil vient du jeton (409 s'il n'est pas sélectionné). */
@RestController
@RequestMapping("/api/v1")
public class HomeController {

    private final CurrentProfile current;
    private final HomeService service;

    public HomeController(CurrentProfile current, HomeService service) {
        this.current = current;
        this.service = service;
    }

    @GetMapping("/home")
    public HomeResponse home() {
        return service.home(current.profileId());
    }

    @GetMapping("/me/continue-watching")
    public List<HomeResponse.ContinueWatchingItem> continueWatching() {
        return service.continueWatching(current.profileId());
    }
}
